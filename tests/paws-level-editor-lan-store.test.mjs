import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createLanLevelStore,
  originalNameFromTrashId,
} from "../tools/paws-level-editor-lan/level-store.mjs";

const FIXED_NOW = new Date("2026-07-23T01:02:03.000Z");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "paws-lan-store-"));
  const levelDir = path.join(root, "EditorLevels");
  const trashDir = path.join(levelDir, "_Trash");
  await mkdir(trashDir, { recursive: true });
  const fileName = "level_0021_r2_第二关模板12.json";
  const value = {
    id: 21,
    name: "第二关模板12",
    tiles: [
      { x: 0, y: 0, layer: 1, type: 1 },
      { x: 8, y: 0, layer: 1, type: 1 },
    ],
  };
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await writeFile(path.join(levelDir, fileName), bytes);
  await writeFile(path.join(levelDir, `${fileName}.meta`), "guid: keep-me\n", "utf8");
  await writeFile(
    path.join(trashDir, "level_0010_旧关卡_20260722_112233.json"),
    `${JSON.stringify({ id: 10, name: "旧关卡", tiles: [] })}\n`,
    "utf8",
  );
  return { root, levelDir, trashDir, fileName, value, version: sha256(bytes) };
}

function makeStore(data, overrides = {}) {
  return createLanLevelStore({
    levelDir: data.levelDir,
    now: () => FIXED_NOW,
    randomSuffix: () => "abcd1234",
    ...overrides,
  });
}

test("LAN store lists active levels and existing flat Unity trash entries", async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const store = makeStore(data);

  const catalog = await store.listLevelCatalog({ defaultFileName: data.fileName });
  const trash = await store.listTrash();

  assert.equal(catalog.defaultFileName, data.fileName);
  assert.deepEqual(catalog.levels.map(({ fileName }) => fileName), [data.fileName]);
  assert.equal(catalog.levels[0].bundled, true);
  assert.equal(catalog.levels[0].aiReferenceEligible, true);
  assert.equal(trash.length, 1);
  assert.equal(trash[0].trashId, "level_0010_旧关卡_20260722_112233.json");
  assert.equal(trash[0].fileName, "level_0010_旧关卡.json");
  assert.equal(trash[0].name, "旧关卡");
  assert.equal(trash[0].deletedAt, "2026-07-22T11:22:33.000Z");
});

test("delete moves JSON and Unity meta into _Trash and restore moves both back", async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const store = makeStore(data);

  const deleted = await store.deleteLevel({
    fileName: data.fileName,
    expectedVersion: data.version,
  });

  assert.equal(deleted.trashId, "level_0021_r2_第二关模板12_20260723_010203.json");
  assert.equal(deleted.fileName, data.fileName);
  assert.equal(await exists(path.join(data.levelDir, data.fileName)), false);
  assert.equal(await exists(path.join(data.levelDir, `${data.fileName}.meta`)), false);
  assert.equal(await exists(path.join(data.trashDir, deleted.trashId)), true);
  assert.equal(await exists(path.join(data.trashDir, `${deleted.trashId}.meta`)), true);
  assert.equal(await readFile(path.join(data.trashDir, `${deleted.trashId}.meta`), "utf8"), "guid: keep-me\n");

  const restored = await store.restoreLevel({ trashId: deleted.trashId });

  assert.equal(restored.fileName, data.fileName);
  assert.equal(restored.value.name, data.value.name);
  assert.equal(await exists(path.join(data.levelDir, data.fileName)), true);
  assert.equal(await exists(path.join(data.levelDir, `${data.fileName}.meta`)), true);
  assert.equal(await exists(path.join(data.trashDir, deleted.trashId)), false);
});

test("delete rejects stale versions without moving either file", async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const store = makeStore(data);

  await assert.rejects(
    () => store.deleteLevel({ fileName: data.fileName, expectedVersion: "stale" }),
    (error) => error.status === 409 && error.code === "version-conflict",
  );
  assert.equal(await exists(path.join(data.levelDir, data.fileName)), true);
  assert.equal(await exists(path.join(data.levelDir, `${data.fileName}.meta`)), true);
});

test("delete adds a numeric suffix when the timestamped trash name already exists", async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const occupied = "level_0021_r2_第二关模板12_20260723_010203.json";
  await writeFile(path.join(data.trashDir, occupied), "{}\n", "utf8");
  const store = makeStore(data);

  const deleted = await store.deleteLevel({
    fileName: data.fileName,
    expectedVersion: data.version,
  });

  assert.equal(deleted.trashId, "level_0021_r2_第二关模板12_20260723_010203_2.json");
  assert.equal(originalNameFromTrashId(deleted.trashId), data.fileName);
  assert.equal(await readFile(path.join(data.trashDir, occupied), "utf8"), "{}\n");
});

test("restore refuses to overwrite an active JSON or meta file", async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const store = makeStore(data);
  const deleted = await store.deleteLevel({
    fileName: data.fileName,
    expectedVersion: data.version,
  });
  await writeFile(path.join(data.levelDir, data.fileName), "{}\n", "utf8");

  await assert.rejects(
    () => store.restoreLevel({ trashId: deleted.trashId }),
    (error) => error.status === 409 && error.code === "restore-conflict",
  );
  assert.equal(await exists(path.join(data.trashDir, deleted.trashId)), true);
  assert.equal(await readFile(path.join(data.levelDir, data.fileName), "utf8"), "{}\n");
});

test("restore also rejects an orphan active meta before moving JSON", async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const store = makeStore(data);
  const deleted = await store.deleteLevel({
    fileName: data.fileName,
    expectedVersion: data.version,
  });
  await writeFile(path.join(data.levelDir, `${data.fileName}.meta`), "guid: occupied\n", "utf8");

  await assert.rejects(
    () => store.restoreLevel({ trashId: deleted.trashId }),
    (error) => error.status === 409 && error.code === "restore-conflict",
  );
  assert.equal(await exists(path.join(data.trashDir, deleted.trashId)), true);
  assert.equal(await readFile(path.join(data.levelDir, `${data.fileName}.meta`), "utf8"), "guid: occupied\n");
});

test("restoring a legacy trash JSON never adopts an unrelated active meta", async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const store = makeStore(data);
  const trashId = "level_0010_旧关卡_20260722_112233.json";
  await writeFile(path.join(data.levelDir, "level_0010_旧关卡.json.meta"), "guid: unrelated\n", "utf8");

  await assert.rejects(
    () => store.restoreLevel({ trashId }),
    (error) => error.status === 409 && error.code === "restore-conflict",
  );
  assert.equal(await exists(path.join(data.trashDir, trashId)), true);
  assert.equal(await exists(path.join(data.levelDir, "level_0010_旧关卡.json")), false);
});

test("a meta move failure rolls a deleted JSON back to its exact active path", async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  let renameCount = 0;
  const store = makeStore(data, {
    fsOps: {
      rename: async (from, to) => {
        renameCount += 1;
        if (renameCount === 2) {
          const error = new Error("injected meta failure");
          error.code = "EACCES";
          throw error;
        }
        await rename(from, to);
      },
    },
  });

  await assert.rejects(
    () => store.deleteLevel({ fileName: data.fileName, expectedVersion: data.version }),
    (error) => error.code === "trash-move-failed",
  );
  assert.equal(await exists(path.join(data.levelDir, data.fileName)), true);
  assert.equal(await exists(path.join(data.levelDir, `${data.fileName}.meta`)), true);
  assert.equal(
    await exists(path.join(data.trashDir, "level_0021_r2_第二关模板12_20260723_010203.json")),
    false,
  );
});
