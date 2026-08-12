import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimePath = join(root, "app-20260706-restore-games.js");
const runtime = readFileSync(runtimePath, "utf8");
const project = (...parts) => join(root, "projects", "clickflow", ...parts);

function loadDefaultApps() {
  return loadDefaultAppsFromRuntime(runtime);
}

function loadAppsWithStoredValue(stored) {
  const start = runtime.indexOf("function loadApps");
  const end = runtime.indexOf("function projectHref", start);
  const storage = new Map([
    ["ai-competition-hub-v2-apps", JSON.stringify(stored)],
  ]);
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

function isApplication(app) {
  return !["game", "engineering", "ai"].includes(app.status);
}

test("ClickFlow stays immediately before PureShrink and exposes four publication actions", () => {
  const apps = loadDefaultApps();
  const clickFlow = apps.find((app) => app.id === "clickflow");
  const applicationIds = apps.filter(isApplication).map((app) => app.id);
  const clickFlowIndex = applicationIds.indexOf("clickflow");

  assert.ok(clickFlow, "ClickFlow should be registered");
  assert.notEqual(clickFlowIndex, -1);
  assert.equal(applicationIds[clickFlowIndex + 1], "pureshrink");
  assert.equal(clickFlow.name, "ClickFlow 鼠标自动化");
  assert.equal(clickFlow.category, "桌面自动化工具");
  assert.equal(clickFlow.status, "assistant");
  assert.equal(clickFlow.badge, "辅助工具");
  assert.equal(clickFlow.video, "./projects/clickflow/video/index.html");
  assert.equal(clickFlow.platforms.web, "./projects/clickflow/index.html");
  assert.deepEqual(
    JSON.parse(JSON.stringify(clickFlow.platforms.windows)),
    {
      href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/clickflow-v2.0.0/ClickFlow-Windows-x64.zip",
      label: "Wins下载",
    },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(clickFlow.platforms.mac)),
    {
      href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/clickflow-v2.0.0/ClickFlow-macOS.zip",
      label: "Mac下载",
    },
  );
});

test("legacy ClickFlow defaults migrate to the shorter auxiliary-tool card", () => {
  const current = loadDefaultApps().find((app) => app.id === "clickflow");
  const legacy = {
    ...current,
    name: "ClickFlow 鼠标自动化工作台",
    status: "desktop",
    badge: "Windows · macOS",
  };

  const migrated = loadAppsWithStoredValue([legacy]).find(
    (app) => app.id === "clickflow",
  );

  assert.equal(migrated.name, "ClickFlow 鼠标自动化");
  assert.equal(migrated.status, "assistant");
  assert.equal(migrated.badge, "辅助工具");
  assert.equal(migrated.category, "桌面自动化工具");
});

test("ClickFlow migration preserves a customized name", () => {
  const current = loadDefaultApps().find((app) => app.id === "clickflow");
  const customized = {
    ...current,
    name: "我的鼠标工具",
    status: "desktop",
    badge: "Windows · macOS",
  };

  const migrated = loadAppsWithStoredValue([customized]).find(
    (app) => app.id === "clickflow",
  );

  assert.equal(migrated.name, "我的鼠标工具");
  assert.equal(migrated.status, "assistant");
  assert.equal(migrated.badge, "辅助工具");
});

test("ClickFlow guide documents both modes, shortcuts, permissions, and cursor limits", () => {
  assert.equal(existsSync(project("index.html")), true);
  assert.equal(existsSync(project("styles.css")), true);
  assert.equal(existsSync(project("app.js")), true);
  assert.equal(existsSync(project("README.md")), true);

  const html = readFileSync(project("index.html"), "utf8");
  const guide = readFileSync(project("README.md"), "utf8");
  const script = readFileSync(project("app.js"), "utf8");

  assert.match(html, /返回主页/);
  assert.match(html, /定点点击/);
  assert.match(html, /录制回放/);
  assert.match(html, /data-mode="point"/);
  assert.match(html, /data-mode="sequence"/);
  assert.match(html, /data-action="record"/);
  assert.match(html, /data-action="add-step"/);
  assert.match(script, /downloadSequence/);
  assert.match(guide, /F6/);
  assert.match(guide, /F7/);
  assert.match(guide, /F8/);
  assert.match(guide, /F9/);
  assert.match(guide, /辅助功能/);
  assert.match(guide, /输入监控/);
  assert.match(guide, /点击瞬间/);
  assert.match(guide, /ClickFlow 自身窗口/);
  assert.doesNotMatch(html + script, /pynput|RobotJS|pyautogui/);
});

test("ClickFlow public files contain no local or source-only download targets", () => {
  const published = [
    readFileSync(runtimePath, "utf8"),
    readFileSync(project("index.html"), "utf8"),
    readFileSync(project("README.md"), "utf8"),
  ].join("\n");

  assert.doesNotMatch(published, /C:\\Users|localhost|127\.0\.0\.1/);
  assert.doesNotMatch(published, /ClickFlow-macOS-build\.zip/);
});

test("ClickFlow release manifest records the verified native packages", () => {
  const manifest = JSON.parse(readFileSync(project("release-manifest.json"), "utf8"));
  assert.deepEqual(manifest, {
    tag: "clickflow-v2.0.0",
    releaseUrl: "https://github.com/wthpein010-dev/ai-application-hub/releases/tag/clickflow-v2.0.0",
    assets: {
      windows: {
        name: "ClickFlow-Windows-x64.zip",
        bytes: 11553084,
        sha256: "c732d791651209e8eb67b929d9a5468f2a76083911a8a472a7498d353f8cb443",
        entry: "ClickFlow-Windows-x64/ClickFlow.exe",
      },
      mac: {
        name: "ClickFlow-macOS.zip",
        bytes: 24377657,
        sha256: "5378c5d4e957ba22b2db7f119803901bf6b85e4a94184892678ec42ca5778793",
        entries: [
          "arm64/ClickFlow.app/Contents/MacOS/ClickFlow",
          "x64/ClickFlow.app/Contents/MacOS/ClickFlow",
        ],
      },
    },
  });
});
