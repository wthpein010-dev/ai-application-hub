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

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

async function createFetch() {
  const files = new Map([
    ["./levels/index.json", await readFile(join(levelsPath, "index.json"), "utf8")],
    ["./levels/level_showcase.json", await readFile(join(levelsPath, "level_showcase.json"), "utf8")],
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

test("lists and loads the bundled showcase", async () => {
  const api = createApiClient({
    fetchImpl: await createFetch(),
    storage: createStorage(),
    now: () => "2026-07-20T00:00:00.000Z",
  });

  assert.equal((await api.listLevels())[0].fileName, "level_showcase.json");
  assert.equal((await api.loadLevel("level_showcase.json")).value.name, "3D层级展示关");
});

test("save survives a new client and reset restores the bundle", async () => {
  const storage = createStorage();
  const fetchImpl = await createFetch();
  const first = createApiClient({ fetchImpl, storage, now: () => "2026-07-20T00:00:00.000Z" });
  const loaded = await first.loadLevel("level_showcase.json");
  loaded.value.name = "浏览器修改版";
  const saved = await first.saveLevel({
    fileName: "level_showcase.json",
    value: loaded.value,
    expectedVersion: loaded.version,
    saveAs: false,
  });
  const second = createApiClient({ fetchImpl, storage });

  assert.equal((await second.loadLevel("level_showcase.json")).value.name, "浏览器修改版");
  assert.equal((await second.listLevels())[0].local, true);
  await second.resetLevel("level_showcase.json");
  assert.equal((await second.loadLevel("level_showcase.json")).value.name, "3D层级展示关");
  assert.notEqual(saved.version, loaded.version);
});

test("adapter save reload and serialize round-trip preserves string designerNote and unknown fields", async () => {
  const storage = createStorage();
  const fetchImpl = await createFetch();
  const api = createApiClient({ fetchImpl, storage, now: () => "2026-07-20T00:00:00.000Z" });
  const loaded = await api.loadLevel("level_showcase.json");
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
    value: { name: "浏览器副本", tiles: [] },
    saveAs: true,
  });
  const refreshed = createApiClient({ fetchImpl, storage });
  const levels = await refreshed.listLevels();

  assert.equal(levels.find((level) => level.fileName === "showcase_copy.json")?.local, true);
  assert.equal((await refreshed.loadLevel("showcase_copy.json")).value.name, "浏览器副本");
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
  storage.setItem("paws-level-editor-demo-v1:level_showcase.json", "{not valid JSON");
  const api = createApiClient({ fetchImpl: await createFetch(), storage });

  const levels = await api.listLevels();

  assert.equal(levels[0].fileName, "level_showcase.json");
  assert.equal(levels[0].bundled, true);
  assert.equal(levels[0].local, false);
  assert.equal(levels[0].localError, "invalid-local-record");
  await assert.rejects(() => api.loadLevel("level_showcase.json"), { code: "invalid-local-record" });
  assert.equal((await api.resetLevel("level_showcase.json")).value.name, "3D层级展示关");
});

test("rejects path traversal and stale versions", async () => {
  const api = createApiClient({ fetchImpl: await createFetch(), storage: createStorage() });

  await assert.rejects(() => api.loadLevel("../secret.json"), { code: "invalid-file-name" });
  await assert.rejects(
    () => api.saveLevel({ fileName: "level_showcase.json", value: {}, expectedVersion: "stale", saveAs: false }),
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
  const loaded = await api.loadLevel("level_showcase.json");
  loaded.value.name = "mutated only in the caller";

  assert.deepEqual(health, { online: true, authenticated: true, writable: true, staticDemo: true });
  assert.deepEqual(await api.login(), { authenticated: true });
  assert.deepEqual(await api.logout(), { authenticated: true });
  assert.equal(api.blockImageUrl("1001/bonus"), "./assets/blocks/block_1001%2Fbonus.png");
  assert.equal((await api.loadLevel("level_showcase.json")).value.name, "3D层级展示关");
});
