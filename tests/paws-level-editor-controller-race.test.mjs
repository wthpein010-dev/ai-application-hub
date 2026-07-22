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

function controllerHarness(api) {
  const controller = new WorkbenchController({}, { api });
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

test("the latest level-open request wins when an older request resolves last", async () => {
  const slow = deferred();
  const fast = deferred();
  const { controller, events } = controllerHarness({
    loadLevel(fileName) {
      return fileName === "slow.json" ? slow.promise : fast.promise;
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
