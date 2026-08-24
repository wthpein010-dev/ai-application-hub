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

test("old Windows-only workbench storage migrates to all five published entrances", () => {
  const defaults = loadDefaultApps();
  const workbench = defaults.find((app) => app.id === "codex-thread-workbench");
  const gamePulseDefault = defaults.find((app) => app.id === "gamepulse-mini-radar");
  const oldWindowsOnlyWorkbench = {
    ...workbench,
    name: "我的 Codex 工作台",
    brief: "在同一个 Windows 一级界面中同时查看和操作多个真实 Codex 线程，直接输入、停止、审批，并清晰区分进行中与已完成任务。",
    aiUse: "工具通过本机 codex app-server 连接真实线程，不读取凭据；AI 参与协议接入、状态投影、多窗口会话交互和 Windows 发布验证。",
    video: "",
    tags: ["Codex", "多线程", "桌面工作台", "Windows"],
    platforms: {
      web: workbench.platforms.web,
      windows: workbench.platforms.windows,
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
  const migrated = apps.find((app) => app.id === "codex-thread-workbench");
  const gamePulse = apps.find((app) => app.id === "gamepulse-mini-radar");

  assert.equal(migrated.name, "我的 Codex 工作台");
  assert.equal(migrated.brief, workbench.brief);
  assert.equal(migrated.aiUse, workbench.aiUse);
  assert.equal(migrated.tags.includes("macOS"), true);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.platforms.web)), JSON.parse(JSON.stringify(workbench.platforms.web)));
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.platforms.windows)), JSON.parse(JSON.stringify(workbench.platforms.windows)));
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.platforms.mac)), JSON.parse(JSON.stringify(workbench.platforms.mac)));
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.platforms.ios)), JSON.parse(JSON.stringify(workbench.platforms.ios)));
  assert.equal(migrated.platforms.ios.href, "./projects/codex-thread-workbench/ios/index.html");
  assert.equal(migrated.video, workbench.video);
  assert.equal(gamePulse.name, gamePulseDefault.name);
  assert.equal(gamePulse.brief, gamePulseDefault.brief);
  assert.deepEqual(JSON.parse(JSON.stringify(gamePulse.tags)), JSON.parse(JSON.stringify(gamePulseDefault.tags)));
});

test("legacy default workbench name migrates while a custom name stays untouched", () => {
  const defaults = loadDefaultApps();
  const workbench = defaults.find((app) => app.id === "codex-thread-workbench");
  const legacy = {
    ...workbench,
    name: "Codex 多会话工作台",
    platforms: {
      ...workbench.platforms,
      ios: "",
    },
  };

  const migrated = loadAppsWithStoredValue([legacy]).find(
    (app) => app.id === "codex-thread-workbench",
  );

  assert.equal(migrated.name, "Codex 待确认悬浮助手");
  assert.equal(migrated.platforms.ios.href, "./projects/codex-thread-workbench/ios/index.html");
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
