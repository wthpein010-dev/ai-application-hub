import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as staticApi from "../projects/paws-level-editor/static-api-client.mjs";
import {
  parseLevelDocument,
  serializeLevelDocument,
} from "../projects/paws-level-editor/core/level-adapter.mjs";

const { createApiClient } = staticApi;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const levelsPath = join(root, "projects", "paws-level-editor", "levels");
const defaultFileName = "level_0021_r2_第二关模板12.json";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function createBoundaryFailingStorage() {
  const values = new Map();
  let failAfterSetKey = null;
  let failAfterRemoveKey = null;
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      values.set(key, String(value));
      if (key === failAfterSetKey) {
        failAfterSetKey = null;
        throw new Error(`Injected write failure for ${key}`);
      }
    },
    removeItem(key) {
      values.delete(key);
      if (key === failAfterRemoveKey) {
        failAfterRemoveKey = null;
        throw new Error(`Injected remove failure for ${key}`);
      }
    },
    failNextSetAfterMutation(key) { failAfterSetKey = key; },
    failNextRemoveAfterMutation(key) { failAfterRemoveKey = key; },
  };
}

async function createFetch() {
  const files = new Map([
    ["./levels/index.json", await readFile(join(levelsPath, "index.json"), "utf8")],
    [
      `./levels/${encodeURIComponent(defaultFileName)}`,
      await readFile(join(levelsPath, defaultFileName), "utf8"),
    ],
  ]);
  return async (url) => {
    const body = files.get(url);
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      async json() {
        if (body === undefined) throw new Error(`Unexpected URL: ${url}`);
        return JSON.parse(body);
      },
    };
  };
}

test("lists the catalog and loads the requested bundled default", async () => {
  const api = createApiClient({
    fetchImpl: await createFetch(),
    storage: createStorage(),
    now: () => "2026-07-20T00:00:00.000Z",
  });

  const catalog = await api.listLevelCatalog();
  assert.equal(catalog.defaultFileName, defaultFileName);
  assert.equal(catalog.levels.length, 22);
  assert.equal(catalog.levels.some(({ fileName }) => fileName === defaultFileName), true);
  assert.deepEqual(await api.listLevels(), catalog.levels);
  assert.equal((await api.loadLevel(defaultFileName)).value.name, "第二关模板12");
});

test("save survives a new client and reset restores the bundle", async () => {
  const storage = createStorage();
  const fetchImpl = await createFetch();
  const first = createApiClient({ fetchImpl, storage, now: () => "2026-07-20T00:00:00.000Z" });
  const loaded = await first.loadLevel(defaultFileName);
  loaded.value.name = "浏览器修改版";
  const saved = await first.saveLevel({
    fileName: defaultFileName,
    value: loaded.value,
    expectedVersion: loaded.version,
    saveAs: false,
  });
  const second = createApiClient({ fetchImpl, storage });

  assert.equal((await second.loadLevel(defaultFileName)).value.name, "浏览器修改版");
  assert.equal(
    (await second.listLevels()).find(({ fileName }) => fileName === defaultFileName).local,
    true,
  );
  await second.resetLevel(defaultFileName);
  assert.equal((await second.loadLevel(defaultFileName)).value.name, "第二关模板12");
  assert.notEqual(saved.version, loaded.version);
});

test("adapter save reload and serialize round-trip preserves string designerNote and unknown fields", async () => {
  const storage = createStorage();
  const fetchImpl = await createFetch();
  const api = createApiClient({ fetchImpl, storage, now: () => "2026-07-20T00:00:00.000Z" });
  const loaded = await api.loadLevel(defaultFileName);
  const document = parseLevelDocument(loaded.value, {
    fileName: loaded.fileName,
    version: loaded.version,
  });
  const firstSerialized = serializeLevelDocument(document);
  const saved = await api.saveLevel({
    fileName: loaded.fileName,
    value: firstSerialized,
    expectedVersion: loaded.version,
    saveAs: false,
  });

  assert.equal(typeof saved.value.designerNote, "string");
  assert.equal(JSON.parse(saved.value.designerNote).source, loaded.value.designerNote.source);
  assert.equal(Array.isArray(JSON.parse(saved.value.designerNote).levelData), false);

  const reloaded = await api.loadLevel(loaded.fileName);
  const secondSerialized = serializeLevelDocument(
    parseLevelDocument(reloaded.value, {
      fileName: reloaded.fileName,
      version: reloaded.version,
    }),
  );
  assert.deepEqual(JSON.parse(secondSerialized.designerNote), JSON.parse(firstSerialized.designerNote));
});

test("lists and loads a locally saved copy that is absent from the bundled index", async () => {
  const storage = createStorage();
  const fetchImpl = await createFetch();
  const api = createApiClient({ fetchImpl, storage, now: () => "2026-07-20T00:00:00.000Z" });

  await api.saveLevel({
    fileName: "showcase_copy.json",
    value: {
      id: 73501,
      name: "浏览器副本",
      tiles: [
        { x: 0, y: 0, layer: 1, type: 1 },
        { x: 8, y: 0, layer: 1, type: 1 },
      ],
    },
    saveAs: true,
  });
  const refreshed = createApiClient({ fetchImpl, storage });
  const levels = await refreshed.listLevels();
  const summary = levels.find((level) => level.fileName === "showcase_copy.json");

  assert.deepEqual(
    {
      id: summary?.id,
      tileCount: summary?.tileCount,
      modifiedAt: summary?.modifiedAt,
      local: summary?.local,
    },
    {
      id: 73501,
      tileCount: 2,
      modifiedAt: "2026-07-20T00:00:00.000Z",
      local: true,
    },
  );
  assert.equal((await refreshed.loadLevel("showcase_copy.json")).value.name, "浏览器副本");
});

test("catalog exposes local source and live AI reference eligibility", async () => {
  const storage = createStorage();
  const api = createApiClient({
    fetchImpl: await createFetch(),
    storage,
    now: () => "2026-07-21T00:00:00.000Z",
  });

  await api.saveLevel({
    fileName: "import_reference.json",
    value: { id: 7501, name: "导入参考", tiles: [{ x: 0, y: 0, layer: 1, type: 1 }] },
    saveAs: true,
    source: "import",
  });
  await api.saveLevel({
    fileName: "ai_result.json",
    value: {
      id: 7502,
      name: "AI 结果",
      tiles: [{ x: 0, y: 0, layer: 1, type: 1 }],
      designerNote: { aiGeneration: { seed: 7 } },
    },
    saveAs: true,
    source: "ai",
  });

  const catalog = await api.listLevelCatalog();
  const bundled = catalog.levels.find(({ fileName }) => fileName === defaultFileName);
  const imported = catalog.levels.find(({ fileName }) => fileName === "import_reference.json");
  const generated = catalog.levels.find(({ fileName }) => fileName === "ai_result.json");

  assert.deepEqual(
    { source: bundled?.source, eligible: bundled?.aiReferenceEligible },
    { source: "bundled", eligible: true },
  );
  assert.deepEqual(
    { source: imported?.source, eligible: imported?.aiReferenceEligible },
    { source: "import", eligible: true },
  );
  assert.deepEqual(
    { source: generated?.source, eligible: generated?.aiReferenceEligible },
    { source: "ai", eligible: false },
  );
  assert.equal((await api.loadLevel("import_reference.json")).source, "import");
  assert.equal((await api.loadLevel("ai_result.json")).source, "ai");
});

test("legacy local records infer AI source from designerNote", async () => {
  const storage = createStorage();
  storage.setItem("paws-level-editor-demo-v1:legacy_ai.json", JSON.stringify({
    fileName: "legacy_ai.json",
    value: {
      name: "历史 AI",
      tiles: [{ x: 0, y: 0, layer: 1, type: 1 }],
      designerNote: JSON.stringify({ aiGeneration: { seed: 8 } }),
    },
    version: "legacy-ai-v1",
    updatedAt: "2026-07-20T00:00:00.000Z",
    local: true,
    bundled: false,
  }));
  storage.setItem("paws-level-editor-demo-v1:legacy_manual.json", JSON.stringify({
    fileName: "legacy_manual.json",
    value: {
      name: "历史手工",
      tiles: [{ x: 0, y: 0, layer: 1, type: 1 }],
      designerNote: {},
    },
    version: "legacy-manual-v1",
    updatedAt: "2026-07-20T00:00:00.000Z",
    local: true,
    bundled: false,
  }));
  storage.setItem(
    "paws-level-editor-demo-v1:local-files",
    JSON.stringify(["legacy_ai.json", "legacy_manual.json"]),
  );
  const api = createApiClient({ fetchImpl: await createFetch(), storage });

  const levels = await api.listLevels();
  const legacyAi = levels.find(({ fileName }) => fileName === "legacy_ai.json");
  const legacyManual = levels.find(({ fileName }) => fileName === "legacy_manual.json");

  assert.deepEqual(
    { source: legacyAi?.source, eligible: legacyAi?.aiReferenceEligible },
    { source: "ai", eligible: false },
  );
  assert.deepEqual(
    { source: legacyManual?.source, eligible: legacyManual?.aiReferenceEligible },
    { source: "manual", eligible: true },
  );
});

test("deletes a local-only level and removes it from the manifest", async () => {
  const storage = createStorage();
  const api = createApiClient({
    fetchImpl: await createFetch(),
    storage,
    now: () => "2026-07-21T00:00:00.000Z",
  });
  await api.saveLevel({
    fileName: "delete_me.json",
    value: { name: "删除我", tiles: [] },
    saveAs: true,
    source: "import",
  });

  const deleted = await api.deleteLevel("delete_me.json");

  assert.deepEqual(deleted, { fileName: "delete_me.json", deleted: true });
  assert.equal(storage.getItem("paws-level-editor-demo-v1:delete_me.json"), null);
  assert.deepEqual(JSON.parse(storage.getItem("paws-level-editor-demo-v1:local-files")), []);
  assert.equal((await api.listLevels()).some(({ fileName }) => fileName === "delete_me.json"), false);
});

test("delete rejects bundled and missing local levels without mutation", async () => {
  const storage = createStorage();
  const api = createApiClient({ fetchImpl: await createFetch(), storage });

  await assert.rejects(() => api.deleteLevel(defaultFileName), {
    status: 400,
    code: "cannot-delete-bundled",
  });
  await assert.rejects(() => api.deleteLevel("missing_local.json"), {
    status: 404,
    code: "local-level-not-found",
  });
  assert.equal(storage.getItem("paws-level-editor-demo-v1:local-files"), null);
});

test("delete restores the exact record and manifest when removal fails", async () => {
  const storage = createBoundaryFailingStorage();
  const api = createApiClient({
    fetchImpl: await createFetch(),
    storage,
    now: () => "2026-07-21T00:00:00.000Z",
  });
  await api.saveLevel({
    fileName: "rollback_delete.json",
    value: { name: "必须恢复", tiles: [] },
    saveAs: true,
  });
  const recordKey = "paws-level-editor-demo-v1:rollback_delete.json";
  const manifestKey = "paws-level-editor-demo-v1:local-files";
  const priorRecord = storage.getItem(recordKey);
  const priorManifest = storage.getItem(manifestKey);
  storage.failNextRemoveAfterMutation(recordKey);

  await assert.rejects(() => api.deleteLevel("rollback_delete.json"), {
    code: "local-storage-remove-failed",
  });

  assert.equal(storage.getItem(recordKey), priorRecord);
  assert.equal(storage.getItem(manifestKey), priorManifest);
});

test("delete restores the exact record and manifest when manifest write fails", async () => {
  const storage = createBoundaryFailingStorage();
  const api = createApiClient({
    fetchImpl: await createFetch(),
    storage,
    now: () => "2026-07-21T00:00:00.000Z",
  });
  await api.saveLevel({
    fileName: "rollback_manifest.json",
    value: { name: "清单失败必须恢复", tiles: [] },
    saveAs: true,
  });
  const recordKey = "paws-level-editor-demo-v1:rollback_manifest.json";
  const manifestKey = "paws-level-editor-demo-v1:local-files";
  const priorRecord = storage.getItem(recordKey);
  const priorManifest = storage.getItem(manifestKey);
  storage.failNextSetAfterMutation(manifestKey);

  await assert.rejects(() => api.deleteLevel("rollback_manifest.json"), {
    code: "local-storage-remove-failed",
  });

  assert.equal(storage.getItem(recordKey), priorRecord);
  assert.equal(storage.getItem(manifestKey), priorManifest);
});

test("save-as checks the bundled index without requesting a missing level resource", async () => {
  const requestedUrls = [];
  const fetchImpl = await createFetch();
  const api = createApiClient({
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      return fetchImpl(url);
    },
    storage: createStorage(),
    now: () => "2026-07-20T00:00:00.000Z",
  });

  await api.saveLevel({
    fileName: "local_import.json",
    value: { name: "本地导入", tiles: [] },
    saveAs: true,
  });

  assert.deepEqual(requestedUrls, ["./levels/index.json"]);
});

test("save-as rejects a bundled file name without overwriting the bundle", async () => {
  const api = createApiClient({
    fetchImpl: await createFetch(),
    storage: createStorage(),
    now: () => "2026-07-20T00:00:00.000Z",
  });
  const original = await api.loadLevel(defaultFileName);

  await assert.rejects(
    () => api.saveLevel({
      fileName: defaultFileName,
      value: { id: 9999, name: "不得覆盖内置关卡", tiles: [] },
      saveAs: true,
    }),
    (error) => {
      assert.equal(error instanceof staticApi.WorkbenchApiError, true);
      assert.equal(error.status, 409);
      assert.equal(error.code, "file-exists");
      return true;
    },
  );

  assert.deepEqual(await api.loadLevel(defaultFileName), original);
});

test("save-as rejects a browser-local file name without overwriting its record", async () => {
  const api = createApiClient({
    fetchImpl: await createFetch(),
    storage: createStorage(),
    now: () => "2026-07-20T00:00:00.000Z",
  });
  await api.saveLevel({
    fileName: "existing_local.json",
    value: { id: 7001, name: "原始本地关卡", tiles: [] },
    saveAs: true,
  });
  const original = await api.loadLevel("existing_local.json");

  await assert.rejects(
    () => api.saveLevel({
      fileName: "existing_local.json",
      value: { id: 7002, name: "不得覆盖本地关卡", tiles: [] },
      saveAs: true,
    }),
    (error) => {
      assert.equal(error instanceof staticApi.WorkbenchApiError, true);
      assert.equal(error.status, 409);
      assert.equal(error.code, "file-exists");
      return true;
    },
  );

  assert.deepEqual(await api.loadLevel("existing_local.json"), original);
});

test("save restores the exact prior record and manifest when the record write fails", async () => {
  const storage = createBoundaryFailingStorage();
  const api = createApiClient({
    fetchImpl: await createFetch(),
    storage,
    now: () => "2026-07-20T00:00:00.000Z",
  });
  const saved = await api.saveLevel({
    fileName: "transactional_local.json",
    value: { id: 7301, name: "prior record", tiles: [] },
    saveAs: true,
  });
  const recordKey = "paws-level-editor-demo-v1:transactional_local.json";
  const manifestKey = "paws-level-editor-demo-v1:local-files";
  const priorRecord = storage.getItem(recordKey);
  const priorManifest = storage.getItem(manifestKey);
  storage.failNextSetAfterMutation(recordKey);

  await assert.rejects(
    () => api.saveLevel({
      fileName: "transactional_local.json",
      value: { id: 7302, name: "must roll back", tiles: [] },
      expectedVersion: saved.version,
    }),
    { code: "local-storage-write-failed" },
  );

  assert.equal(storage.getItem(recordKey), priorRecord);
  assert.equal(storage.getItem(manifestKey), priorManifest);
});

test("save restores the exact prior record and manifest when the manifest write fails", async () => {
  const storage = createBoundaryFailingStorage();
  const api = createApiClient({
    fetchImpl: await createFetch(),
    storage,
    now: () => "2026-07-20T00:00:00.000Z",
  });
  const recordKey = "paws-level-editor-demo-v1:new_import.json";
  const manifestKey = "paws-level-editor-demo-v1:local-files";
  storage.setItem(manifestKey, "[\"other.json\"]  ");
  const priorRecord = storage.getItem(recordKey);
  const priorManifest = storage.getItem(manifestKey);
  storage.failNextSetAfterMutation(manifestKey);

  await assert.rejects(
    () => api.saveLevel({
      fileName: "new_import.json",
      value: { id: 7402, name: "must roll back imported record", tiles: [] },
      saveAs: true,
    }),
    { code: "local-storage-write-failed" },
  );

  assert.equal(storage.getItem(recordKey), priorRecord);
  assert.equal(storage.getItem(manifestKey), priorManifest);
});

test("reset rejects a local-only copy without deleting it", async () => {
  const storage = createStorage();
  const api = createApiClient({
    fetchImpl: await createFetch(),
    storage,
    now: () => "2026-07-20T00:00:00.000Z",
  });
  await api.saveLevel({
    fileName: "local_copy.json",
    value: { name: "必须保留", tiles: [] },
    saveAs: true,
  });

  await assert.rejects(() => api.resetLevel("local_copy.json"), {
    status: 400,
    code: "not-bundled-level",
  });
  assert.equal((await api.loadLevel("local_copy.json")).value.name, "必须保留");
});

test("lists the bundle when its local override is corrupt and reset recovers it", async () => {
  const storage = createStorage();
  storage.setItem(`paws-level-editor-demo-v1:${defaultFileName}`, "{not valid JSON");
  const api = createApiClient({ fetchImpl: await createFetch(), storage });

  const levels = await api.listLevels();

  const level = levels.find(({ fileName }) => fileName === defaultFileName);
  assert.equal(level.fileName, defaultFileName);
  assert.equal(level.bundled, true);
  assert.equal(level.local, false);
  assert.equal(level.localError, "invalid-local-record");
  await assert.rejects(() => api.loadLevel(defaultFileName), { code: "invalid-local-record" });
  assert.equal((await api.resetLevel(defaultFileName)).value.name, "第二关模板12");
});

test("rejects path traversal and stale versions", async () => {
  const api = createApiClient({ fetchImpl: await createFetch(), storage: createStorage() });

  await assert.rejects(() => api.loadLevel("../secret.json"), { code: "invalid-file-name" });
  await assert.rejects(
    () => api.saveLevel({ fileName: defaultFileName, value: {}, expectedVersion: "stale", saveAs: false }),
    { status: 409, code: "version-conflict" },
  );
});

test("shared file name validation accepts safe Unicode names and rejects paths", async () => {
  assert.equal(typeof staticApi.isValidLevelFileName, "function");
  assert.equal(staticApi.isValidLevelFileName("关卡副本.json"), true);
  assert.equal(staticApi.isValidLevelFileName("level copy.json"), true);
  assert.equal(staticApi.isValidLevelFileName("../secret.json"), false);
  assert.equal(staticApi.isValidLevelFileName("folder/关卡.json"), false);
  assert.equal(staticApi.isValidLevelFileName("关卡..json"), false);
  assert.equal(staticApi.isValidLevelFileName("关卡.json.bak"), false);

  const api = createApiClient({
    fetchImpl: await createFetch(),
    storage: createStorage(),
    now: () => "2026-07-20T00:00:00.000Z",
  });
  const saved = await api.saveLevel({
    fileName: "关卡副本.json",
    value: { name: "中文文件名", tiles: [] },
    saveAs: true,
  });
  assert.equal(saved.fileName, "关卡副本.json");
});

test("percent-encodes a bundled file name before fetching it", async () => {
  const requestedUrls = [];
  const api = createApiClient({
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      return {
        ok: true,
        status: 200,
        async json() {
          return { name: "特殊文件名", tiles: [] };
        },
      };
    },
    storage: createStorage(),
  });

  await api.loadLevel("关卡#50%.json");

  assert.deepEqual(requestedUrls, ["./levels/%E5%85%B3%E5%8D%A1%2350%25.json"]);
});

test("exposes the static demo support methods and returns detached values", async () => {
  const api = createApiClient({ fetchImpl: await createFetch(), storage: createStorage() });
  const health = await api.health();
  const loaded = await api.loadLevel(defaultFileName);
  loaded.value.name = "mutated only in the caller";

  assert.deepEqual(health, { online: true, authenticated: true, writable: true, staticDemo: true });
  assert.deepEqual(await api.login(), { authenticated: true });
  assert.deepEqual(await api.logout(), { authenticated: true });
  assert.equal(api.blockImageUrl("1001/bonus"), "./assets/blocks/block_1001%2Fbonus.png");
  assert.equal((await api.loadLevel(defaultFileName)).value.name, "第二关模板12");
});
