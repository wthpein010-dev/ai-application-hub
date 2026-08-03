import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

function loadAppsWithStoredValue(stored) {
  const start = runtime.indexOf("function loadApps");
  const end = runtime.indexOf("function projectHref", start);
  const defaults = loadDefaultAppsFromRuntime(runtime);
  const storage = new Map([["test-storage", JSON.stringify(stored)]]);
  const context = {
    globalThis: { defaultApps: defaults },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
    },
  };
  const source = [
    'const STORAGE_KEY = "test-storage";',
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

function pageTitle(path) {
  const html = readFileSync(join(root, ...path.split("/")), "utf8");
  return /<title>([^<]+)<\/title>/i.exec(html)?.[1].trim() || "";
}

test("legacy Planner metadata cannot move the training tool into games", () => {
  const defaults = loadDefaultAppsFromRuntime(runtime);
  const planner = defaults.find((app) => app.id === "planner-daily-quiz");
  const stored = {
    ...planner,
    category: "小游戏",
    status: "game",
    badge: "小游戏",
    brief: "保留我的题库说明",
  };

  const migrated = loadAppsWithStoredValue([stored]).find((app) => app.id === planner.id);

  assert.equal(migrated.category, planner.category);
  assert.equal(migrated.status, "training");
  assert.equal(migrated.badge, planner.badge);
  assert.equal(migrated.brief, "保留我的题库说明");
});
test("project page titles use their catalog names", () => {
  assert.equal(pageTitle("projects/icecream/index.html"), "吃了个冰");
  assert.equal(pageTitle("projects/clickflow/index.html"), "ClickFlow 鼠标自动化");
  assert.equal(pageTitle("projects/pureshrink/index.html"), "无损压缩工坊");
});

test("focused catalog copy describes the product users can actually open", () => {
  const hubBrief = /const HUB_BRIEF = "([^"]+)";/.exec(runtime)?.[1] || "";
  const reviewerStart = runtime.indexOf('id: "codex-reviewer"');
  const reviewerBlock = runtime.slice(reviewerStart, runtime.indexOf("\n  },", reviewerStart));

  assert.match(hubBrief, /应用|项目/);
  assert.match(hubBrief, /演示|视频|平台/);
  assert.doesNotMatch(hubBrief, /HyperFrames/);
  assert.match(reviewerBlock, /对话[^"\n]*评分/);
  assert.match(reviewerBlock, /建议/);
  assert.match(reviewerBlock, /Excel/);
});
