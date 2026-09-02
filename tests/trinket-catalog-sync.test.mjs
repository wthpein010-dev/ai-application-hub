import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let syncApi = {};
try {
  syncApi = await import("../scripts/sync-trinket-market-assets.mjs");
} catch {
  // The first red run intentionally exercises the missing module as an empty API.
}

test("hand sync copies only matching PNGs and marks a new catalog item for naming", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "trinket-sync-"));
  const sourceRoot = join(fixtureRoot, "source");
  const projectRoot = join(fixtureRoot, "project");
  context.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  await mkdir(sourceRoot, { recursive: true });
  await mkdir(join(projectRoot, "assets", "items"), { recursive: true });
  await mkdir(join(projectRoot, "data"), { recursive: true });
  await writeFile(join(sourceRoot, "hand_1.png"), "one");
  await writeFile(join(sourceRoot, "hand_12.png"), "twelve");
  await writeFile(join(sourceRoot, "hand_bad.png"), "ignored");
  await writeFile(join(sourceRoot, "other_13.png"), "ignored");
  await writeFile(join(projectRoot, "data", "items.json"), JSON.stringify([{
    id: 1,
    name: "已有名字",
    pinyin: "existing",
    rarity: "常见",
    acquired: 3,
    value: 1,
    change: 0,
    image: "./assets/items/hand_1.png",
    ownedCount: 2,
  }], null, 2));

  const result = await syncApi.syncTrinketCatalog({ sourceRoot, projectRoot });
  const catalog = JSON.parse(await readFile(join(projectRoot, "data", "items.json"), "utf8"));
  const added = catalog.find((item) => item.id === 12);

  assert.deepEqual(result.addedIds, [12]);
  assert.equal(catalog.find((item) => item.id === 1).name, "已有名字");
  assert.equal(added.name, "随身小物 12");
  assert.equal(added.needsNaming, true);
  assert.equal(existsSync(join(projectRoot, "assets", "items", "hand_1.png")), true);
  assert.equal(existsSync(join(projectRoot, "assets", "items", "hand_12.png")), true);
  assert.equal(existsSync(join(projectRoot, "assets", "items", "hand_bad.png")), false);
});
