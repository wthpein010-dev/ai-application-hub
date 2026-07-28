import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const home = readFileSync(join(root, "index.html"), "utf8");

function catalogBlock(id) {
  const start = runtime.indexOf(`id: "${id}",`);
  assert.ok(start >= 0, `missing ${id} catalog entry`);
  return runtime.slice(start, runtime.indexOf("\n  },", start));
}

function loadDefaultApps() {
  const start = runtime.indexOf("const defaultApps = [");
  const closing = /\r?\n\];\r?\n\r?\nlet apps/.exec(runtime.slice(start));
  const source = runtime
    .slice(start, start + closing.index + 3)
    .replace("const defaultApps =", "globalThis.defaultApps =")
    .replace(/\bHUB_BRIEF\b/g, '""');
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  return context.globalThis.defaultApps;
}

function loadAppsWithStoredValue(stored) {
  const start = runtime.indexOf("function loadApps");
  const end = runtime.indexOf("function projectHref", start);
  const storage = new Map([["ai-applications-v1", JSON.stringify(stored)]]);
  const context = {
    globalThis: { defaultApps: loadDefaultApps() },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
    },
  };
  const source = [
    'const STORAGE_KEY = "ai-applications-v1";',
    "const statusLabel = { navigation: true, content: true, plugin: true, assistant: true, game: true, ai: true, engineering: true, life: true, training: true, idea: true, desktop: true };",
    'const OLD_HUB_BRIEF = "";',
    'const HUB_BRIEF = "";',
    "const defaultApps = globalThis.defaultApps;",
    runtime.slice(start, end),
    "globalThis.loadApps = loadApps;",
  ].join("\n");
  vm.runInNewContext(source, context);
  return context.globalThis.loadApps();
}

test("brick lighting card uses the orange art-reference badge and revised description", () => {
  const brick = catalogBlock("brick-light-motion-lab");

  assert.match(brick, /badge: "美术设计参考"/);
  assert.match(brick, /category: "美术设计参考"/);
  assert.match(brick, /brief: "[^"]*美术[^"]*参考[^"]*"/);
  assert.match(runtime, /app\.badge \|\| statusLabel\[app\.status\]/);
});

test("Nang mini-game is published in the games catalog with demo and video only", () => {
  const nang = catalogBlock("nang-keng-pai-pai-xiang");

  assert.match(nang, /name: "馕了个馕"/);
  assert.match(nang, /category: "Unity WebGL 小游戏"/);
  assert.match(nang, /status: "game"/);
  assert.match(nang, /badge: "小游戏"/);
  assert.match(nang, /entry: "\.\/projects\/nang-keng-pai-pai-xiang\/index\.html"/);
  assert.match(nang, /video: "\.\/projects\/nang-keng-pai-pai-xiang\/video\/index\.html"/);
  assert.match(nang, /package: ""/);
  assert.match(nang, /windows: ""/);
  assert.match(nang, /mac: ""/);
  assert.equal(existsSync(join(root, "projects", "nang-keng-pai-pai-xiang", "index.html")), true);
  assert.equal(existsSync(join(root, "projects", "nang-keng-pai-pai-xiang", "video", "index.html")), true);
  assert.equal(existsSync(join(root, "projects", "nang-keng-pai-pai-xiang", "video", "nang-keng-pai-pai-xiang-intro.mp4")), true);
  assert.ok(statSync(join(root, "projects", "nang-keng-pai-pai-xiang", "video", "nang-keng-pai-pai-xiang-intro.mp4")).size > 0);

  const preview = readFileSync(join(root, "projects", "nang-keng-pai-pai-xiang", "index.html"), "utf8");
  const video = readFileSync(join(root, "projects", "nang-keng-pai-pai-xiang", "video", "index.html"), "utf8");
  const captions = readFileSync(join(root, "projects", "nang-keng-pai-pai-xiang", "video", "nang-keng-pai-pai-xiang-intro.vtt"), "utf8");
  assert.match(preview, /href="\.\.\/\.\.\/index\.html#games"/);
  assert.doesNotMatch(preview, /index\.html#apps/);
  assert.match(video, /id="loadVideo"/);
  assert.match(video, /data-src="\.\/nang-keng-pai-pai-xiang-intro\.mp4"/);
  assert.match(video, /href="\.\.\/\.\.\/\.\.\/index\.html#games"/);
  assert.doesNotMatch(video, /index\.html#apps/);
  assert.match(captions, /从首页进入馕了个馕/);
  assert.doesNotMatch(captions, /馕坑排排香/);
});

test("stored Nang metadata migrates to the games catalog", () => {
  const defaults = loadDefaultApps();
  const current = defaults.find((app) => app.id === "nang-keng-pai-pai-xiang");
  const stored = {
    ...current,
    name: "馕饼拍拍响",
    category: "Unity WebGL 休闲体验",
    status: "content",
    badge: "休闲体验",
    package: "./downloads/should-not-remain.zip",
    platforms: {
      web: current.platforms.web,
      windows: "./downloads/should-not-remain.zip",
      mac: "./downloads/should-not-remain-mac.zip",
    },
  };

  const migrated = loadAppsWithStoredValue([stored]).find((app) => app.id === current.id);

  assert.equal(migrated.name, "馕了个馕");
  assert.equal(migrated.category, "Unity WebGL 小游戏");
  assert.equal(migrated.status, "game");
  assert.equal(migrated.badge, "小游戏");
  assert.equal(migrated.package, "");
  assert.equal(migrated.platforms.windows, "");
  assert.equal(migrated.platforms.mac, "");
});

test("homepage refreshes the Nang game catalog runtime for existing visitors", () => {
  assert.match(home, /app-20260706-restore-games\.js\?v=20260727-nang-game-catalog/);
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

test("Nang WebGL manifest cache-busts the exact published build sizes", () => {
  const projectRoot = join(root, "projects", "nang-keng-pai-pai-xiang");
  const preview = readFileSync(join(projectRoot, "index.html"), "utf8");
  const dataSize = statSync(join(projectRoot, "Build", "WebGL.data.gz")).size;
  const frameworkSize = statSync(join(projectRoot, "Build", "WebGL.framework.js.gz")).size;
  const wasmSize = statSync(join(projectRoot, "Build", "WebGL.wasm.gz")).size;

  assert.match(preview, /const buildVersion = '\?v=20260728-gameplay-v2';/);
  assert.match(preview, /WebGL\.loader\.js' \+ buildVersion/);
  assert.match(preview, /WebGL\.data\.gz' \+ buildVersion/);
  assert.match(preview, /WebGL\.framework\.js\.gz' \+ buildVersion/);
  assert.match(preview, /WebGL\.wasm\.gz' \+ buildVersion/);
  assert.match(preview, new RegExp(`WebGL\\.data\\.gz' \\+ buildVersion, size: ${dataSize}`));
  assert.match(preview, new RegExp(`WebGL\\.framework\\.js\\.gz' \\+ buildVersion, size: ${frameworkSize}`));
  assert.match(preview, new RegExp(`WebGL\\.wasm\\.gz' \\+ buildVersion, size: ${wasmSize}`));
});

test("Nang WebGL retries a transient ranged chunk body before failing", async () => {
  const projectRoot = join(root, "projects", "nang-keng-pai-pai-xiang");
  const preview = readFileSync(join(projectRoot, "index.html"), "utf8");
  const script = /<script>([\s\S]*?)<\/script>/.exec(preview)?.[1] ?? "";
  const start = script.indexOf("async function fetchAssetChunkWithRetry");
  const end = script.indexOf("async function decompressAsset", start);
  assert.ok(start >= 0, "missing ranged chunk retry helper");
  assert.ok(end > start, "ranged chunk helper must be defined before decompression");

  let attempts = 0;
  const context = {
    fetch: async () => {
      attempts += 1;
      return {
        ok: true,
        status: 206,
        arrayBuffer: async () => {
          if (attempts === 1) throw new TypeError("network error");
          return new Uint8Array([11, 22]).buffer;
        },
      };
    },
    setTimeout: (callback) => callback(),
    globalThis: {},
  };
  const source = [
    script.slice(start, end),
    "globalThis.fetchAssetChunkWithRetry = fetchAssetChunkWithRetry;",
  ].join("\n");
  vm.runInNewContext(source, context);

  const result = await context.globalThis.fetchAssetChunkWithRetry(
    { url: "Build/WebGL.data.gz?v=test", size: 2 },
    0,
    1,
  );
  assert.deepEqual(Array.from(result.bytes), [11, 22]);
  assert.equal(result.complete, false);
  assert.equal(attempts, 2);
});

test("IceCream is named 吃了个冰 and ranks after every other mini-game", () => {
  const icecream = catalogBlock("icecream");
  const ranker = runtime.slice(runtime.indexOf("function gameDisplayRank"), runtime.indexOf("function handleAppCardClick"));

  assert.match(icecream, /name: "吃了个冰"/);
  assert.match(ranker, /if \(app\.id === "icecream"\) return Number\.MAX_SAFE_INTEGER/);
});
