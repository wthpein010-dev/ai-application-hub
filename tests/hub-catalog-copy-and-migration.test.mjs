import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  let html;
  try {
    html = readFileSync(join(root, ...path.split("/")), "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const sparsePaths = execFileSync("git", ["sparse-checkout", "list"], { cwd: root, encoding: "utf8" });
    if (/^\/?projects\/?$/mu.test(sparsePaths)) throw error;
    html = execFileSync("git", ["show", `HEAD:${path}`], { cwd: root, encoding: "utf8" });
  }
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

test("PlanMap and SimuAI belong to the application collection", () => {
  const defaults = loadDefaultAppsFromRuntime(runtime);
  const planmap = defaults.find((app) => app.id === "planmap");
  const simuai = defaults.find((app) => app.id === "simuai");

  assert.equal(planmap.status, "assistant");
  assert.equal(planmap.name, "思维导图快捷工具");
  assert.equal(planmap.badge, "辅助工具");
  assert.equal(simuai.status, "assistant");
  assert.equal(simuai.badge, "辅助工具");
});

test("legacy engineering classification migrates without replacing custom project content", () => {
  const defaults = loadDefaultAppsFromRuntime(runtime);
  const planmap = defaults.find((app) => app.id === "planmap");
  const simuai = defaults.find((app) => app.id === "simuai");
  const storedPlanmap = {
    ...planmap,
    status: "engineering",
    brief: "我在线修改过的 PlanMap 简介",
    entry: "./custom-planmap/index.html",
  };
  const storedSimuai = {
    ...simuai,
    status: "engineering",
    badge: "工程体验",
    brief: "我在线修改过的 SimuAI 简介",
    video: "./custom-simuai/video.html",
  };

  const migrated = loadAppsWithStoredValue([storedPlanmap, storedSimuai]);
  const migratedPlanmap = migrated.find((app) => app.id === "planmap");
  const migratedSimuai = migrated.find((app) => app.id === "simuai");

  assert.equal(migratedPlanmap.status, "assistant");
  assert.equal(migratedPlanmap.badge, "辅助工具");
  assert.equal(migratedPlanmap.brief, storedPlanmap.brief);
  assert.equal(migratedPlanmap.entry, storedPlanmap.entry);
  assert.equal(migratedSimuai.status, "assistant");
  assert.equal(migratedSimuai.badge, "辅助工具");
  assert.equal(migratedSimuai.brief, storedSimuai.brief);
  assert.equal(migratedSimuai.video, storedSimuai.video);
});

test("stored GameSpec Relay cards migrate to the Chinese 需求接力站 release", () => {
  const defaults = loadDefaultAppsFromRuntime(runtime);
  const relay = defaults.find((app) => app.id === "gamespec-relay");
  const stored = {
    ...relay,
    name: "GameSpec Relay",
    badge: "游戏研发 Agent",
    brief: "把群聊、会议纪要和策划文档转换为决定、阻塞问题、跨职能任务、验收标准、测试与变更影响。",
    problem: "游戏需求在讨论后仍需人工整理、拆分和补验收口径，信息遗漏会导致跨职能返工。",
    aiUse: "AI 参与游戏语义分析、证据追溯、任务拆分、质量门禁、变更影响和 Codex 上下文导出；完整示例可离线运行。",
    package: "https://github.com/wthpein010-dev/ai-application-hub/releases/tag/gamespec-relay-v1.0.0",
    platforms: {
      web: { href: relay.entry, label: "演示" },
      windows: { href: "https://example.com/old-windows.zip", label: "Wins下载" },
      mac: { href: "https://example.com/old-macos.zip", label: "Mac下载" },
    },
  };

  const migrated = loadAppsWithStoredValue([stored]).find((app) => app.id === relay.id);

  assert.equal(migrated.name, relay.name);
  assert.equal(migrated.badge, relay.badge);
  assert.equal(migrated.brief, relay.brief);
  assert.equal(migrated.package, relay.package);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.platforms)), JSON.parse(JSON.stringify(relay.platforms)));
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.tags)), JSON.parse(JSON.stringify(relay.tags)));
});

test("stored visual paths preserve trimmed relative or HTTPS values and drop unsafe schemes", () => {
  const defaults = loadDefaultAppsFromRuntime(runtime);
  const base = defaults.find((app) => app.id === "travel-generator");

  for (const [visual, expected] of [
    ["  ./assets/custom.webp  ", "./assets/custom.webp"],
    [" https://cdn.example.com/custom.webp ", "https://cdn.example.com/custom.webp"],
    ["javascript:alert(1)", undefined],
    ["data:image/png;base64,AAAA", undefined],
    ["", undefined],
  ]) {
    const migrated = loadAppsWithStoredValue([{ ...base, visual }]).find((app) => app.id === base.id);
    assert.equal(migrated.visual, expected);
  }
});
