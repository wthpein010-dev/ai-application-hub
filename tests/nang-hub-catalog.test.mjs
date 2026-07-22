import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

function catalogBlock(id) {
  const start = runtime.indexOf(`id: "${id}",`);
  assert.ok(start >= 0, `missing ${id} catalog entry`);
  return runtime.slice(start, runtime.indexOf("\n  },", start));
}

test("brick lighting card uses the orange art-reference badge and revised description", () => {
  const brick = catalogBlock("brick-light-motion-lab");

  assert.match(brick, /badge: "美术参考"/);
  assert.match(brick, /category: "美术参考"/);
  assert.match(brick, /brief: "[^"]*美术[^"]*参考[^"]*"/);
  assert.match(runtime, /app\.badge \|\| statusLabel\[app\.status\]/);
});

test("Nang game is a playable entry in the game collection with its own video", () => {
  const nang = catalogBlock("nang-keng-pai-pai-xiang");

  assert.match(nang, /name: "馕了个馕"/);
  assert.match(nang, /status: "game"/);
  assert.match(nang, /entry: "\.\/projects\/nang-keng-pai-pai-xiang\/index\.html"/);
  assert.match(nang, /video: "\.\/projects\/nang-keng-pai-pai-xiang\/video\/index\.html"/);
  assert.equal(existsSync(join(root, "projects", "nang-keng-pai-pai-xiang", "index.html")), true);
  assert.equal(existsSync(join(root, "projects", "nang-keng-pai-pai-xiang", "video", "index.html")), true);
  assert.equal(existsSync(join(root, "projects", "nang-keng-pai-pai-xiang", "video", "nang-keng-pai-pai-xiang-intro.mp4")), true);
  assert.ok(statSync(join(root, "projects", "nang-keng-pai-pai-xiang", "video", "nang-keng-pai-pai-xiang-intro.mp4")).size > 0);

  const preview = readFileSync(join(root, "projects", "nang-keng-pai-pai-xiang", "index.html"), "utf8");
  const video = readFileSync(join(root, "projects", "nang-keng-pai-pai-xiang", "video", "index.html"), "utf8");
  assert.match(preview, /href="\.\.\/\.\.\/index\.html#games"/);
  assert.match(video, /id="loadVideo"/);
  assert.match(video, /data-src="\.\/nang-keng-pai-pai-xiang-intro\.mp4"/);
  assert.match(video, /href="\.\.\/\.\.\/\.\.\/index\.html#games"/);
});

test("Nang WebGL build self-decompresses Gzip without server compression headers", () => {
  const projectRoot = join(root, "projects", "nang-keng-pai-pai-xiang");
  const preview = readFileSync(join(projectRoot, "index.html"), "utf8");

  assert.match(preview, /DecompressionStream\("gzip"\)/);
  assert.match(preview, /WebGL\.data\.gz/);
  assert.match(preview, /WebGL\.framework\.js\.gz/);
  assert.match(preview, /WebGL\.wasm\.gz/);
  assert.equal(existsSync(join(projectRoot, "Build", "WebGL.data.gz")), true);
  assert.equal(existsSync(join(projectRoot, "Build", "WebGL.framework.js.gz")), true);
  assert.equal(existsSync(join(projectRoot, "Build", "WebGL.wasm.gz")), true);
});

test("IceCream is named 吃了个冰 and ranks after every other mini-game", () => {
  const icecream = catalogBlock("icecream");
  const ranker = runtime.slice(runtime.indexOf("function gameDisplayRank"), runtime.indexOf("function handleAppCardClick"));

  assert.match(icecream, /name: "吃了个冰"/);
  assert.match(ranker, /if \(app\.id === "icecream"\) return Number\.MAX_SAFE_INTEGER/);
});
