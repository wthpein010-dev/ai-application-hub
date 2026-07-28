import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { syncPublishedLevels } from "../scripts/sync-paws-published-levels.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const editorRoot = join(repoRoot, "projects", "paws-level-editor");
const levelsRoot = join(editorRoot, "levels");
test("published catalog is empty and exposes no bundled level JSON", async () => {
  const catalog = JSON.parse(await readFile(join(levelsRoot, "index.json"), "utf8"));

  assert.deepEqual(catalog, { defaultFileName: "", levels: [] });
  const publishedFiles = (await readdir(levelsRoot))
    .filter((fileName) => fileName !== "index.json")
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  assert.deepEqual(publishedFiles, []);
});

test("all indexed project levels parse and contain no source path or credential keys", async () => {
  const catalog = JSON.parse(await readFile(join(levelsRoot, "index.json"), "utf8"));
  for (const entry of catalog.levels) {
    const raw = await readFile(join(levelsRoot, entry.fileName), "utf8");
    const value = JSON.parse(raw);
    assert.equal(value && typeof value === "object" && !Array.isArray(value), true);
    assert.equal(/[A-Za-z]:\\/.test(raw), false, entry.fileName);
    assert.equal(
      Object.keys(value).some((key) =>
        /token|password|secret|cookie|auth|path|email|phone/i.test(key)),
      false,
      entry.fileName,
    );
  }
});

test("sync script validates every source before publishing and emits deterministic summaries", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "paws-published-levels-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceDir = join(root, "source");
  const targetDir = join(root, "target");
  await mkdir(sourceDir);
  await mkdir(targetDir);
  await writeFile(join(targetDir, "level_stale.json"), "{}");
  const firstFile = "level_0001_第一关.json";
  const defaultFile = "level_0002_第二关.json";
  const makeLevel = (id, name, tiles) => ({
    id,
    name,
    difficulty: "Normal",
    gridUnit: "sheep_8x10_mini8",
    designerNote: JSON.stringify({
      widthNum: 8,
      heightNum: 10,
      levelData: Object.groupBy(tiles, ({ layer }) => String(layer)),
    }),
    tiles,
  });
  await writeFile(
    join(sourceDir, firstFile),
    JSON.stringify(makeLevel(1, "第一关", [
      { x: 0, y: 0, layer: 1, type: 1 },
      { x: 16, y: 0, layer: 1, type: 1 },
    ])),
  );
  await writeFile(
    join(sourceDir, defaultFile),
    JSON.stringify(makeLevel(2, "第二关", [
      { x: 0, y: 0, layer: 1, type: 1 },
      { x: 16, y: 0, layer: 1, type: 1 },
      { x: 4, y: 4, layer: 2, type: 2 },
      { x: 20, y: 4, layer: 2, type: 2 },
    ])),
  );

  const catalog = await syncPublishedLevels({
    sourceDir,
    targetDir,
    defaultFileName: defaultFile,
    modifiedAt: "2026-07-20T00:00:00.000Z",
  });

  assert.equal(catalog.defaultFileName, defaultFile);
  assert.deepEqual(
    catalog.levels.map(({ fileName, tileCount, layerCount }) => ({
      fileName,
      tileCount,
      layerCount,
    })),
    [
      { fileName: firstFile, tileCount: 2, layerCount: 1 },
      { fileName: defaultFile, tileCount: 4, layerCount: 2 },
    ],
  );
  assert.deepEqual(
    JSON.parse(await readFile(join(targetDir, "index.json"), "utf8")),
    catalog,
  );
  assert.deepEqual(
    JSON.parse(await readFile(join(targetDir, defaultFile), "utf8")),
    makeLevel(2, "第二关", [
      { x: 0, y: 0, layer: 1, type: 1 },
      { x: 16, y: 0, layer: 1, type: 1 },
      { x: 4, y: 4, layer: 2, type: 2 },
      { x: 20, y: 4, layer: 2, type: 2 },
    ]),
  );
  await assert.rejects(
    () => readFile(join(targetDir, "level_stale.json"), "utf8"),
    { code: "ENOENT" },
  );
});

test("sync script leaves the target untouched when a source JSON is invalid", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "paws-published-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceDir = join(root, "source");
  const targetDir = join(root, "target");
  await mkdir(sourceDir);
  await mkdir(targetDir);
  await writeFile(join(targetDir, "sentinel.txt"), "keep");
  await writeFile(join(sourceDir, "level_ok.json"), JSON.stringify({
    id: 1,
    name: "可解析",
    tiles: [{ x: 0, y: 0, layer: 1, type: 1 }],
  }));
  await writeFile(join(sourceDir, "level_bad.json"), "{");

  await assert.rejects(
    () => syncPublishedLevels({
      sourceDir,
      targetDir,
      defaultFileName: "level_ok.json",
    }),
    /level_bad\.json/,
  );
  assert.equal(await readFile(join(targetDir, "sentinel.txt"), "utf8"), "keep");
});
