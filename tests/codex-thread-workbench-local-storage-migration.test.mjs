import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

function loadDefaultApps() {
  return loadDefaultAppsFromRuntime(runtime);
}

function loadAppsWithStoredValue(stored) {
  const start = runtime.indexOf("function loadApps");
  const end = runtime.indexOf("function projectHref", start);
  const storage = new Map([["ai-competition-hub-v2-apps", JSON.stringify(stored)]]);
  const context = {
    globalThis: { defaultApps: loadDefaultApps() },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
    },
  };
  const source = [
    'const STORAGE_KEY = "ai-competition-hub-v2-apps";',
    "const statusLabel = { desktop: true, assistant: true };",
    'const OLD_HUB_BRIEF = "";',
    'const HUB_BRIEF = "";',
    "const defaultApps = globalThis.defaultApps;",
    runtime.slice(start, end),
    "globalThis.loadApps = loadApps;",
  ].join("\n");
  vm.runInNewContext(source, context);
  return context.globalThis.loadApps();
}

function loadSelectedIdWithStoredValue(storedSelectedId) {
  const stateStart = runtime.indexOf("const state = {");
  const stateEnd = runtime.indexOf("const nodes", stateStart);
  const stateSource = runtime.slice(stateStart, stateEnd);
  const selectedExpression = stateSource.match(/selectedId:\s*([^,\n]+)/)?.[1];
  assert.ok(selectedExpression, "selectedId initializer should exist");

  const helperStart = runtime.indexOf("function loadSelectedId");
  const helperEnd = helperStart >= 0 ? runtime.indexOf("\n}\n", helperStart) + 3 : 0;
  const helperSource = helperStart >= 0 ? runtime.slice(helperStart, helperEnd) : "";
  const storage = new Map([
    ["ai-competition-hub-v2-selected", storedSelectedId],
  ]);
  const context = {
    globalThis: {},
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  const source = [
    'const SELECTED_KEY = "ai-competition-hub-v2-selected";',
    helperSource,
    `globalThis.selectedId = ${selectedExpression};`,
  ].join("\n");
  vm.runInNewContext(source, context);
  return {
    selectedId: context.globalThis.selectedId,
    storedSelectedId: storage.get("ai-competition-hub-v2-selected"),
  };
}

test("legacy selected Workbench id migrates to and persists the confirmation bar id", () => {
  const result = loadSelectedIdWithStoredValue("codex-thread-workbench");

  assert.equal(result.selectedId, "codex-confirmation-bar");
  assert.equal(result.storedSelectedId, "codex-confirmation-bar");
});

test("legacy Workbench customization migrates to the confirmation bar id", () => {
  const defaults = loadDefaultApps();
  const confirmationBar = defaults.find((app) => app.id === "codex-confirmation-bar");
  const legacyCustomization = {
    id: "codex-thread-workbench",
    name: "我的悬浮栏",
    category: "我的桌面效率工具",
    status: "desktop",
    brief: "只提醒真正等待我确认的任务。",
    problem: "这是我自己写的问题说明。",
    aiUse: "这是我自己写的 AI 说明。",
    folder: "./projects/codex-thread-workbench/",
    entry: "./projects/codex-thread-workbench/index.html",
    video: "./projects/codex-thread-workbench/video/index.html",
    package: "https://example.invalid/legacy.zip",
    platforms: {
      web: { href: "./projects/codex-thread-workbench/index.html", label: "交互演示" },
      windows: { href: "https://example.invalid/windows.zip", label: "Windows下载" },
      mac: { href: "https://example.invalid/mac.zip", label: "Mac下载" },
    },
    tags: ["我的标签", "保持置顶"],
    speed: 1,
    impact: 2,
    risk: 3,
    polish: 4,
  };

  const apps = loadAppsWithStoredValue([legacyCustomization]);
  const migrated = apps.find((app) => app.id === "codex-confirmation-bar");

  assert.ok(migrated);
  assert.equal(apps.some((app) => app.id === "codex-thread-workbench"), false);
  assert.equal(migrated.name, "我的悬浮栏");
  assert.equal(migrated.category, "我的桌面效率工具");
  assert.equal(migrated.brief, "只提醒真正等待我确认的任务。");
  assert.equal(migrated.problem, "这是我自己写的问题说明。");
  assert.equal(migrated.aiUse, "这是我自己写的 AI 说明。");
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.tags)), ["我的标签", "保持置顶"]);
  assert.equal(migrated.folder, confirmationBar.folder);
  assert.equal(migrated.entry, confirmationBar.entry);
  assert.equal(migrated.video, confirmationBar.video);
  assert.equal(migrated.package, confirmationBar.package);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.platforms)), JSON.parse(JSON.stringify(confirmationBar.platforms)));
  assert.equal(migrated.speed, confirmationBar.speed);
  assert.equal(migrated.impact, confirmationBar.impact);
  assert.equal(migrated.risk, confirmationBar.risk);
  assert.equal(migrated.polish, confirmationBar.polish);
});

test("stored confirmation bar wins when both new and legacy ids are present", () => {
  const defaults = loadDefaultApps();
  const confirmationBar = defaults.find((app) => app.id === "codex-confirmation-bar");
  const apps = loadAppsWithStoredValue([
    { ...confirmationBar, id: "codex-thread-workbench", name: "旧 ID 的名称" },
    { ...confirmationBar, name: "新 ID 的名称" },
  ]);

  assert.equal(apps.find((app) => app.id === "codex-confirmation-bar")?.name, "新 ID 的名称");
});

test("old Windows-only workbench storage migrates to all four published entrances", () => {
  const defaults = loadDefaultApps();
  const confirmationBar = defaults.find((app) => app.id === "codex-confirmation-bar");
  assert.ok(confirmationBar, "the new confirmation bar default should exist");
  const gamePulseDefault = defaults.find((app) => app.id === "gamepulse-mini-radar");
  const oldWindowsOnlyWorkbench = {
    ...confirmationBar,
    id: "codex-thread-workbench",
    name: "我的 Codex 工作台",
    brief: "在同一个 Windows 一级界面中同时查看和操作多个真实 Codex 线程，直接输入、停止、审批，并清晰区分进行中与已完成任务。",
    aiUse: "工具通过本机 codex app-server 连接真实线程，不读取凭据；AI 参与协议接入、状态投影、多窗口会话交互和 Windows 发布验证。",
    video: "",
    tags: ["Codex", "多线程", "桌面工作台", "Windows"],
    platforms: {
      web: { href: "./projects/codex-thread-workbench/index.html", label: "交互演示" },
      windows: { href: "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/", label: "Windows下载" },
      mac: "",
    },
  };
  const oldGamePulse = {
    ...gamePulseDefault,
    name: "GamePulse 小游雷达",
    brief: "把国内微信小游戏热门榜、畅销榜与海外 US iOS Casual Top 10 放在同一张开发者工作台上。",
    tags: ["小游戏排行", "微信小游戏", "iOS Casual", "产品洞察"],
  };

  const apps = loadAppsWithStoredValue([oldWindowsOnlyWorkbench, oldGamePulse]);
  const migrated = apps.find((app) => app.id === "codex-confirmation-bar");
  const gamePulse = apps.find((app) => app.id === "gamepulse-mini-radar");

  assert.equal(migrated.name, "我的 Codex 工作台");
  assert.equal(migrated.brief, confirmationBar.brief);
  assert.equal(migrated.aiUse, confirmationBar.aiUse);
  assert.equal(migrated.tags.includes("macOS"), true);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.platforms.web)), JSON.parse(JSON.stringify(confirmationBar.platforms.web)));
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.platforms.windows)), JSON.parse(JSON.stringify(confirmationBar.platforms.windows)));
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.platforms.mac)), JSON.parse(JSON.stringify(confirmationBar.platforms.mac)));
  assert.equal(migrated.video, confirmationBar.video);
  assert.equal(gamePulse.name, gamePulseDefault.name);
  assert.equal(gamePulse.brief, gamePulseDefault.brief);
  assert.deepEqual(JSON.parse(JSON.stringify(gamePulse.tags)), JSON.parse(JSON.stringify(gamePulseDefault.tags)));
});

test("GamePulse migration preserves user-customized text and tags", () => {
  const defaults = loadDefaultApps();
  const gamePulseDefault = defaults.find((app) => app.id === "gamepulse-mini-radar");
  const customizedGamePulse = {
    ...gamePulseDefault,
    name: "我的游戏雷达",
    brief: "我的自定义榜单说明",
    tags: ["我的标签", "保留这个"],
  };

  const apps = loadAppsWithStoredValue([customizedGamePulse]);
  const gamePulse = apps.find((app) => app.id === "gamepulse-mini-radar");

  assert.equal(gamePulse.name, customizedGamePulse.name);
  assert.equal(gamePulse.brief, customizedGamePulse.brief);
  assert.deepEqual(JSON.parse(JSON.stringify(gamePulse.tags)), customizedGamePulse.tags);
});

test("previous GamePulse defaults migrate to the current community metadata", () => {
  const defaults = loadDefaultApps();
  const gamePulseDefault = defaults.find((app) => app.id === "gamepulse-mini-radar");
  const expectedMetadata = {
    brief: "把国内与海外榜单、行业知识库、玩法拆解、发布合作和开放接口放在同一张开发者工作台上。",
    problem: "小游戏开发者既要扫描可信榜位，也要持续沉淀玩法案例、寻找合作机会，并把公开信息接入自己的工作流。",
    aiUse: "AI 参与榜单清洗、知识摘要、关联推荐和异常回退；投稿审核后公开，站点每天北京时间 07:10 后检查更新。",
    tags: ["小游戏排行", "行业知识库", "玩法拆解", "发布合作", "开放接口"],
  };
  const previousGamePulse = {
    ...gamePulseDefault,
    brief: "把国内微信小游戏热门榜、畅销榜与海外美国 iOS 休闲前十放在同一张开发者工作台上。",
    problem: "小游戏开发者需要快速发现国内轻休闲产品与海外休闲榜变化，同时保留可核验的原始名次和数据状态。",
    aiUse: "AI 参与榜单清洗、轻休闲筛选、产品信号整理和异常回退；站点每天北京时间 07:10 后检查更新。",
    tags: ["小游戏排行", "微信小游戏", "iOS 休闲榜", "产品洞察"],
  };

  const apps = loadAppsWithStoredValue([previousGamePulse]);
  const migrated = apps.find((app) => app.id === "gamepulse-mini-radar");

  assert.equal(migrated.brief, expectedMetadata.brief);
  assert.equal(migrated.problem, expectedMetadata.problem);
  assert.equal(migrated.aiUse, expectedMetadata.aiUse);
  assert.deepEqual(
    JSON.parse(JSON.stringify(migrated.tags)),
    expectedMetadata.tags,
  );
});
