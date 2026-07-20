import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createApiClient } from "../projects/paws-level-editor/static-api-client.mjs";

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

test("rejects path traversal and stale versions", async () => {
  const api = createApiClient({ fetchImpl: await createFetch(), storage: createStorage() });

  await assert.rejects(() => api.loadLevel("../secret.json"), { code: "invalid-file-name" });
  await assert.rejects(
    () => api.saveLevel({ fileName: "level_showcase.json", value: {}, expectedVersion: "stale", saveAs: false }),
    { status: 409, code: "version-conflict" },
  );
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
