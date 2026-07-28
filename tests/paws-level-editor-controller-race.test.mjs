import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

const threeUrl = new URL(
  "../projects/paws-level-editor/vendor/three.module.js",
  import.meta.url,
).href;
const loaderSource = `
  export async function resolve(specifier, context, nextResolve) {
    if (specifier === "three") {
      return { url: ${JSON.stringify(threeUrl)}, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
`;
register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

globalThis.matchMedia = () => ({ matches: false });
globalThis.confirm = () => true;

const { WorkbenchController } = await import(
  "../projects/paws-level-editor/ui/workbench-controller.mjs"
);
const { createPlaySession } = await import(
  "../projects/paws-level-editor/core/play-engine.mjs"
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function rawLevel(name, id) {
  return {
    id,
    name,
    difficulty: "Normal",
    gridUnit: "sheep_7x8_mini8",
    designerNote: JSON.stringify({
      widthNum: 7,
      heightNum: 8,
      levelKey: id,
      gameLevelOrder: 2,
      blockTypeCount: 4,
      fullRandomTypeMin: 1,
      fullRandomTypeMax: 4,
    }),
    tiles: [
      { x: 0, y: 0, layer: 1, type: 1, presetColorType: 1 },
      { x: 16, y: 0, layer: 1, type: 1, presetColorType: 1 },
    ],
  };
}

function levelResponse(fileName, id) {
  return {
    fileName,
    version: `version-${id}`,
    bundled: true,
    local: false,
    source: "bundled",
    value: rawLevel(fileName, id),
  };
}

function controllerHarness(api, options = {}) {
  const controller = new WorkbenchController({}, { api, ...options });
  const events = [];
  controller.elements = {
    emptyStage: { hidden: false },
    libraryPanel: { classList: { remove: (...values) => events.push(["library", ...values]) } },
    levelList: { innerHTML: "" },
  };
  controller.isDirty = () => false;
  controller.validate = () => [];
  controller.mountRenderer = () => events.push(["render", controller.document?.fileName]);
  controller.renderLevelList = () => events.push(["list", controller.levels.map(({ fileName }) => fileName)]);
  controller.updateUI = () => events.push(["ui", controller.document?.fileName]);
  controller.showToast = (message, type = "normal") => events.push(["toast", message, type]);
  controller.setConnection = (state, message) => events.push(["connection", state, message]);
  return { controller, events };
}

function atomicRestartDocument() {
  const tile = (uid, x, layer) => ({
    uid,
    x,
    y: 0,
    layer,
    type: 0,
    moldType: 1,
    metaType: 0,
    metaData: 0,
    presetColorType: 1,
  });
  return {
    fileName: "level_0099_r1_atomic_restart.json",
    gameplay: { gameLevelOrder: 1 },
    random: {
      blockTypeCount: 4,
      fullTypeMin: 1,
      fullTypeMax: 4,
      maxFirstRoundAttempts: 1,
    },
    tiles: [
      tile("lower-a", 0, 1),
      tile("lower-b", 16, 2),
      tile("upper-b", 16, 3),
      tile("upper-a", 0, 4),
    ],
  };
}

test("rerandomize preserves controller play state and reports a rejected seed", () => {
  const { controller, events } = controllerHarness({});
  controller.document = atomicRestartDocument();
  controller.seed = 2;
  controller.mode = "play";
  controller.playSession = createPlaySession(controller.document, controller.seed);
  controller.playSession.stash("upper-a", 0);
  controller.playSession.interact("upper-b");
  controller.playSnapshot = controller.playSession.getSnapshot();
  const before = structuredClone(controller.playSnapshot);
  const ownGetRandomValues = Object.getOwnPropertyDescriptor(
    globalThis.crypto,
    "getRandomValues",
  );
  Object.defineProperty(globalThis.crypto, "getRandomValues", {
    configurable: true,
    value(target) {
      target[0] = 3;
      return target;
    },
  });

  try {
    assert.doesNotThrow(() => controller.rerandomize());
  } finally {
    if (ownGetRandomValues) {
      Object.defineProperty(globalThis.crypto, "getRandomValues", ownGetRandomValues);
    } else {
      delete globalThis.crypto.getRandomValues;
    }
  }

  assert.equal(controller.seed, 2);
  assert.deepEqual(controller.playSnapshot, before);
  assert.deepEqual(controller.playSession.getSnapshot(), before);
  assert.equal(
    events.some(([type, message, level]) =>
      type === "toast"
      && level === "error"
      && /无法使用新种子 3/.test(message)
      && /solvable first round assignment/i.test(message)),
    true,
  );
});

test("the latest level-open request wins when an older request resolves last", async () => {
  const slow = deferred();
  const fast = deferred();
  const remembered = [];
  const { controller, events } = controllerHarness({
    loadLevel(fileName) {
      return fileName === "slow.json" ? slow.promise : fast.promise;
    },
  }, {
    lastOpenedLevels: {
      read: () => "",
      clear: () => {},
      write: (mode, fileName) => remembered.push([mode, fileName]),
    },
  });

  const slowOpen = controller.openLevel("slow.json", { discardDirty: true });
  const fastOpen = controller.openLevel("fast.json", { discardDirty: true });
  fast.resolve(levelResponse("fast.json", 2));
  await fastOpen;
  slow.resolve(levelResponse("slow.json", 1));
  await slowOpen;

  assert.equal(controller.document.fileName, "fast.json");
  assert.equal(
    events.some(([type, fileName]) => type === "render" && fileName === "slow.json"),
    false,
  );
  assert.equal(
    events.some(([type, message]) => type === "toast" && /已打开 slow\.json/.test(message)),
    false,
  );
  assert.deepEqual(remembered, [["static", "fast.json"]]);
});

test("initial refresh restores a present last-open level before the catalog default", async () => {
  const loads = [];
  const writes = [];
  const { controller } = controllerHarness({
    async listLevelCatalog() {
      return {
        defaultFileName: "default.json",
        levels: [
          { fileName: "default.json", name: "default" },
          { fileName: "remembered.json", name: "remembered" },
        ],
      };
    },
    async loadLevel(fileName) {
      loads.push(fileName);
      return levelResponse(fileName, fileName === "remembered.json" ? 2 : 1);
    },
  }, {
    lastOpenedLevels: {
      read: () => "remembered.json",
      clear: () => {},
      write: (mode, fileName) => writes.push([mode, fileName]),
    },
  });

  await controller.refreshLevels();

  assert.deepEqual(loads, ["remembered.json"]);
  assert.equal(controller.document?.fileName, "remembered.json");
  assert.deepEqual(writes, [["static", "remembered.json"]]);
});

test("missing last-open level is cleared and safely falls back to the catalog default", async () => {
  const loads = [];
  const clears = [];
  const { controller } = controllerHarness({
    async listLevelCatalog() {
      return {
        defaultFileName: "default.json",
        levels: [{ fileName: "default.json", name: "default" }],
      };
    },
    async loadLevel(fileName) {
      loads.push(fileName);
      return levelResponse(fileName, 1);
    },
  }, {
    lastOpenedLevels: {
      read: () => "deleted.json",
      clear: (mode) => clears.push(mode),
      write: () => {},
    },
  });

  await controller.refreshLevels();

  assert.deepEqual(clears, ["static"]);
  assert.deepEqual(loads, ["default.json"]);
  assert.equal(controller.document?.fileName, "default.json");
});

test("cancelling a recoverable open does not invalidate an in-flight open", async () => {
  const slow = deferred();
  let resetCalled = false;
  const { controller } = controllerHarness({
    loadLevel: () => slow.promise,
    async resetLevel() { resetCalled = true; },
  });
  const slowOpen = controller.openLevel("slow.json", { discardDirty: true });
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => false;
  try {
    await controller.openLevel("cancelled.json", {
      discardDirty: true,
      recoverable: true,
    });
  } finally {
    globalThis.confirm = originalConfirm;
  }
  slow.resolve(levelResponse("slow.json", 1));
  await slowOpen;

  assert.equal(resetCalled, false);
  assert.equal(controller.document?.fileName, "slow.json");
});

test("the latest catalog refresh wins when an older response resolves last", async () => {
  const oldCatalog = deferred();
  const newCatalog = deferred();
  let callCount = 0;
  const { controller } = controllerHarness({
    listLevelCatalog() {
      callCount += 1;
      return callCount === 1 ? oldCatalog.promise : newCatalog.promise;
    },
  });
  controller.document = { fileName: "already-open.json" };

  const oldRefresh = controller.refreshLevels();
  const newRefresh = controller.refreshLevels();
  newCatalog.resolve({
    defaultFileName: "new.json",
    levels: [{ fileName: "new.json", name: "new" }],
  });
  await newRefresh;
  oldCatalog.resolve({
    defaultFileName: "old.json",
    levels: [{ fileName: "old.json", name: "old" }],
  });
  await oldRefresh;

  assert.equal(controller.defaultFileName, "new.json");
  assert.deepEqual(controller.levels.map(({ fileName }) => fileName), ["new.json"]);
});

test("a default open owned by a stale refresh cannot commit across a newer refresh", async () => {
  const oldCatalog = deferred();
  const newCatalog = deferred();
  const oldLevel = deferred();
  const newLevel = deferred();
  const loadRequests = [];
  let catalogCallCount = 0;
  const { controller, events } = controllerHarness({
    listLevelCatalog() {
      catalogCallCount += 1;
      return catalogCallCount === 1 ? oldCatalog.promise : newCatalog.promise;
    },
    loadLevel(fileName) {
      loadRequests.push(fileName);
      return fileName === "old.json" ? oldLevel.promise : newLevel.promise;
    },
  });

  const oldRefresh = controller.refreshLevels();
  oldCatalog.resolve({
    defaultFileName: "old.json",
    levels: [{ fileName: "old.json", name: "old" }],
  });
  await Promise.resolve();
  assert.deepEqual(loadRequests, ["old.json"]);

  const newRefresh = controller.refreshLevels();
  oldLevel.resolve(levelResponse("old.json", 1));
  await oldRefresh;
  const documentAfterStaleOpen = controller.document?.fileName ?? null;

  newCatalog.resolve({
    defaultFileName: "new.json",
    levels: [{ fileName: "new.json", name: "new" }],
  });
  await Promise.resolve();
  newLevel.resolve(levelResponse("new.json", 2));
  await newRefresh;

  assert.equal(documentAfterStaleOpen, null);
  assert.equal(controller.defaultFileName, "new.json");
  assert.deepEqual(controller.levels.map(({ fileName }) => fileName), ["new.json"]);
  assert.deepEqual(loadRequests, ["old.json", "new.json"]);
  assert.equal(controller.document?.fileName, "new.json");
  assert.equal(
    events.some(([type, fileName]) => type === "render" && fileName === "old.json"),
    false,
  );
  assert.equal(
    events.some(([type, message]) => type === "toast" && /已打开 .*old\.json/.test(message)),
    false,
  );
});

test("a stale refresh-owned open error cannot leak a toast", async () => {
  const oldCatalog = deferred();
  const newCatalog = deferred();
  const oldLevel = deferred();
  const newLevel = deferred();
  let catalogCallCount = 0;
  const { controller, events } = controllerHarness({
    listLevelCatalog() {
      catalogCallCount += 1;
      return catalogCallCount === 1 ? oldCatalog.promise : newCatalog.promise;
    },
    loadLevel(fileName) {
      return fileName === "old.json" ? oldLevel.promise : newLevel.promise;
    },
  });

  const oldRefresh = controller.refreshLevels();
  oldCatalog.resolve({
    defaultFileName: "old.json",
    levels: [{ fileName: "old.json", name: "old" }],
  });
  await Promise.resolve();

  const newRefresh = controller.refreshLevels();
  oldLevel.reject(new Error("stale auto-open failure"));
  await oldRefresh;
  newCatalog.resolve({
    defaultFileName: "new.json",
    levels: [{ fileName: "new.json", name: "new" }],
  });
  await Promise.resolve();
  newLevel.resolve(levelResponse("new.json", 2));
  await newRefresh;

  assert.equal(controller.document?.fileName, "new.json");
  assert.equal(
    events.some(([type, message]) =>
      type === "toast" && message === "stale auto-open failure"),
    false,
  );
});

test("a refresh catalog cannot supersede an independent manual open that is still pending", async () => {
  const catalog = deferred();
  const manualLevel = deferred();
  const loadRequests = [];
  const { controller } = controllerHarness({
    listLevelCatalog: () => catalog.promise,
    loadLevel(fileName) {
      loadRequests.push(fileName);
      return fileName === "manual.json"
        ? manualLevel.promise
        : Promise.resolve(levelResponse(fileName, 4));
    },
  });

  const manualOpen = controller.openLevel("manual.json", { discardDirty: true });
  let manualSettled = false;
  manualOpen.then(() => { manualSettled = true; });
  const refresh = controller.refreshLevels();
  catalog.resolve({
    defaultFileName: "default.json",
    levels: [{ fileName: "default.json", name: "default" }],
  });
  await refresh;
  assert.equal(manualSettled, false);
  assert.deepEqual(loadRequests, ["manual.json"]);

  manualLevel.resolve(levelResponse("manual.json", 3));
  await manualOpen;
  assert.equal(controller.document?.fileName, "manual.json");
  assert.deepEqual(loadRequests, ["manual.json"]);
});

test("a stale refresh error cannot replace a newer online connection state", async () => {
  const oldCatalog = deferred();
  const newCatalog = deferred();
  let callCount = 0;
  const { controller, events } = controllerHarness({
    listLevelCatalog() {
      callCount += 1;
      return callCount === 1 ? oldCatalog.promise : newCatalog.promise;
    },
  });
  controller.document = { fileName: "already-open.json" };

  const oldRefresh = controller.refreshLevels();
  const newRefresh = controller.refreshLevels();
  newCatalog.resolve({
    defaultFileName: "new.json",
    levels: [{ fileName: "new.json", name: "new" }],
  });
  await newRefresh;
  oldCatalog.reject(new Error("stale failure"));
  await oldRefresh;

  const connections = events.filter(([type]) => type === "connection");
  assert.equal(connections.at(-1)[1], "online");
  assert.equal(events.some(([, , message]) => message === "stale failure"), false);
});
