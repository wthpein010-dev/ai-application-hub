import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

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

test("old Windows-only workbench storage migrates to all four published entrances", () => {
  const defaults = loadDefaultApps();
  const workbench = defaults.find((app) => app.id === "codex-thread-workbench");
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

  const apps = loadAppsWithStoredValue([oldWindowsOnlyWorkbench]);
  const migrated = apps.find((app) => app.id === "codex-thread-workbench");
  const gamePulse = apps.find((app) => app.id === "gamepulse-mini-radar");

  assert.equal(migrated.name, "我的 Codex 工作台");
  assert.equal(migrated.brief, workbench.brief);
  assert.equal(migrated.aiUse, workbench.aiUse);
  assert.equal(migrated.tags.includes("macOS"), true);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.platforms.web)), JSON.parse(JSON.stringify(workbench.platforms.web)));
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.platforms.windows)), JSON.parse(JSON.stringify(workbench.platforms.windows)));
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.platforms.mac)), JSON.parse(JSON.stringify(workbench.platforms.mac)));
  assert.equal(migrated.video, workbench.video);
  assert.equal(gamePulse.name, "小游戏每日排行");
});
