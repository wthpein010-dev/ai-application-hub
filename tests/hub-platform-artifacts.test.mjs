import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";
import { extractValidatedZip, readZipEntries, validateZipEntries } from "./helpers/zip-central-directory.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const apps = loadDefaultAppsFromRuntime(runtime);
const nativeIds = new Set(["codex-quota-bar", "codex-thread-workbench", "clickflow", "pureshrink", "gamespec-relay"]);
const extensionIds = new Set(["feishu-downloader"]);
const compatibilityMatrixPath = join(root, "docs", "audits", "2026-08-03-platform-compatibility.md");

function href(value) {
  return typeof value === "string" ? value : value?.href || "";
}

function actionTypes(app) {
  return [
    href(app.platforms?.web) || app.entry ? "web" : "",
    app.video ? "video" : "",
    href(app.platforms?.windows) ? "windows" : "",
    href(app.platforms?.mac) ? "mac" : "",
  ].filter(Boolean);
}

test("every card exposes actions that match its actual delivery type", () => {
  assert.equal(apps.length, 29);
  for (const app of apps) {
    const expected = nativeIds.has(app.id) || extensionIds.has(app.id)
      ? ["web", "video", "windows", "mac"]
      : ["web", "video"];
    assert.deepEqual(actionTypes(app), expected, `${app.id} has misleading platform actions`);
    if (!nativeIds.has(app.id) && !extensionIds.has(app.id)) {
      assert.equal(app.package || "", "", `${app.id} must not restore a fake Windows action through package fallback`);
    }
  }
});

test("the browser extension uses one tested package on Windows and macOS", () => {
  const extension = apps.find((app) => app.id === "feishu-downloader");
  const windows = href(extension.platforms.windows);
  const mac = href(extension.platforms.mac);

  assert.equal(windows, mac);
  assert.equal(windows, "./downloads/feishu-batch-downloader-extension.zip");
  assert.equal(existsSync(join(root, "downloads", "feishu-batch-downloader-extension.zip")), true);
});

test("invalid, wrong-project and placeholder archives are not publicly shipped", () => {
  const invalidArchives = [
    "ai-application-hub.zip",
    "codex-habit-tool-mac-source.zip",
    "codex-habit-tool-windows.zip",
    "codex-reviewer-mac-source.zip",
    "codex-reviewer-windows.zip",
    "icecream-unity-project.zip",
    "icecream-wechat-minigame.zip",
    "idea-library.zip",
    "interview-theater.zip",
    "minigame-project-simulator-windows.zip",
    "paws-home-client-webgl.zip",
    "travel-generator-mac-source.zip",
    "travel-generator-universal.zip",
    "vita-mahjong-webgl.zip",
    "wanhuatong.zip",
    "web-media-collector-desktop-source.zip",
  ];

  for (const archive of invalidArchives) {
    assert.equal(existsSync(join(root, "downloads", archive)), false, `${archive} should be removed`);
  }
});

test("obsolete root catalog snapshots and package verifiers are not published", () => {
  const obsoleteFiles = [
    "app.js",
    "app-20260626-card-select-title.js",
    "app-20260626-chuanhuatong-buttons.js",
    "app-20260626-fillwhat-video.js",
    "app-20260626-inline-edit.js",
    "app-20260626-inline-edit-clean.js",
    "app-20260626-metric-notes.js",
    "app-20260626-metrics-clean.js",
    "app-20260626-video-optimized.js",
    "app-20260706-training-tools.js",
    "tests/verify-minigame-package.ps1",
  ];

  for (const file of obsoleteFiles) {
    assert.equal(existsSync(join(root, ...file.split("/"))), false, `${file} should be removed`);
  }
});

test("orphan proposal projects are not published as finished products", () => {
  assert.equal(existsSync(join(root, "projects", "AI面试陪练小剧场")), false);
  assert.equal(existsSync(join(root, "projects", "备选应用工具创意库")), false);
});

test("entry pages do not keep links to removed source, project or WebGL archives", () => {
  const pages = [
    ["projects/codex-habit-tool/index.html", "codex-habit-tool-windows.zip"],
    ["projects/minigame-project-tool/index.html", "minigame-project-simulator-windows.zip"],
    ["projects/paws-home-client/index.html", "paws-home-client-webgl.zip"],
    ["projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/index.html", "web-media-collector-desktop-source.zip"],
  ];

  for (const [path, forbidden] of pages) {
    const html = readFileSync(join(root, ...path.split("/")), "utf8");
    assert.doesNotMatch(html, new RegExp(forbidden.replaceAll(".", "\\.")), `${path} still links ${forbidden}`);
  }
});

test("Fill What keeps its Unity source download on the demo page only", () => {
  const app = apps.find((item) => item.id === "fill-what");
  const archivePath = join(root, "downloads", "fill-what-unity-project.zip");
  assert.deepEqual(actionTypes(app), ["web", "video"]);
  assert.equal(app.package || "", "");
  assert.equal(existsSync(archivePath), true);

  const entries = validateZipEntries(readZipEntries(archivePath));
  const normalizedEntries = entries.map((entry) => entry.normalizedPath);
  const forbiddenDirectories = new Set(["library", "temp", "logs", "obj", ".git"]);

  for (const entry of entries) {
    const normalized = entry.normalizedPath;
    assert.equal(
      normalized.split("/").some((segment) => forbiddenDirectories.has(segment.toLowerCase())),
      false,
      `generated directory in Unity source archive: ${entry.name}`,
    );
  }

  assert.ok(normalizedEntries.some((entry) => entry.startsWith("Assets/")), "Unity archive must contain Assets/");
  const manifest = entries.find((entry) => entry.normalizedPath === "Packages/manifest.json");
  const projectVersion = entries.find((entry) => entry.normalizedPath === "ProjectSettings/ProjectVersion.txt");
  assert.equal(manifest?.isDirectory, false, "Unity archive must contain a regular Packages/manifest.json");
  assert.equal(projectVersion?.isDirectory, false, "Unity archive must contain a regular ProjectSettings/ProjectVersion.txt");

  const extractionRoot = mkdtempSync(join(tmpdir(), "fill-what-unity-"));
  try {
    extractValidatedZip(archivePath, entries, extractionRoot);
    assert.equal(lstatSync(join(extractionRoot, "Assets")).isDirectory(), true);
    assert.equal(lstatSync(join(extractionRoot, "Packages", "manifest.json")).isFile(), true);
    assert.equal(lstatSync(join(extractionRoot, "ProjectSettings", "ProjectVersion.txt")).isFile(), true);
  } finally {
    rmSync(extractionRoot, { recursive: true, force: true, maxRetries: 3 });
  }

  const html = readFileSync(join(root, "projects", "fill-what", "index.html"), "utf8");
  assert.match(html, /href="\.\.\/\.\.\/downloads\/fill-what-unity-project\.zip"/);
  assert.match(html, /download>下载Unity工程<\/a>/);
});

test("Codex Reviewer and Feishu entry actions all point to published resources", () => {
  const reviewer = readFileSync(join(root, "projects", "Codex对话评分工具", "index.html"), "utf8");
  const feishu = readFileSync(join(root, "projects", "飞书文件批量下载插件", "index.html"), "utf8");

  assert.doesNotMatch(reviewer, /Windows发布包|run-review\.command|outputs\/codex_conversation_review/);
  assert.match(reviewer, /href="\.\/视频资源\/演示视频\.html"/);
  assert.match(feishu, /href="\.\.\/\.\.\/downloads\/feishu-batch-downloader-extension\.zip"/);
  assert.match(feishu, /href="\.\/视频资源\/演示视频\.html"/);
  assert.equal(existsSync(join(root, "projects", "飞书文件批量下载插件", "README.md")), true);
  assert.equal(existsSync(join(root, "projects", "飞书文件批量下载插件", "manifest.json")), true);
});

test("the compatibility matrix covers every public card and its delivery evidence", () => {
  assert.equal(existsSync(compatibilityMatrixPath), true);
  const matrix = readFileSync(compatibilityMatrixPath, "utf8");
  const rows = matrix.split(/\r?\n/).filter((line) => /^\| `[^`]+` \|/.test(line));
  const byId = new Map(rows.map((line) => [line.match(/^\| `([^`]+)` \|/)[1], line]));

  assert.match(matrix, new RegExp(`范围：主页当前 ${apps.length} 张公开项目卡片`));
  assert.match(matrix, new RegExp(`${apps.length} 个项目都可在 Windows 与 macOS`));
  assert.equal(rows.length, apps.length);
  assert.deepEqual([...byId.keys()].sort(), Array.from(apps, (app) => app.id).sort());

  for (const app of apps) {
    const row = byId.get(app.id);
    const expectedType = nativeIds.has(app.id)
      ? "原生双平台"
      : extensionIds.has(app.id)
        ? "浏览器扩展"
        : app.status === "game"
          ? "小游戏在线体验"
          : app.status === "ai" || app.status === "engineering"
            ? "工程在线体验"
            : "网页跨平台";

    if (app.id === "codex-thread-workbench") {
      assert.ok(row.includes(app.name), `${app.id} name`);
    }
    assert.match(row, new RegExp(`\\| ${expectedType} \\|`), `${app.id} delivery type`);
    assert.match(row, /Windows/, `${app.id} Windows statement`);
    assert.match(row, /macOS/, `${app.id} macOS statement`);
    assert.match(row, /https:\/\/wthpein010-dev\.github\.io\/ai-application-hub\//, `${app.id} public entry`);

    if (nativeIds.has(app.id)) {
      assert.ok(row.includes(app.platforms.windows.label), `${app.id} Windows label`);
      assert.ok(row.includes(app.platforms.mac.label), `${app.id} macOS label`);
      assert.ok(row.includes(href(app.platforms.windows)), `${app.id} Windows URL`);
      assert.ok(row.includes(href(app.platforms.mac)), `${app.id} macOS URL`);
    } else if (extensionIds.has(app.id)) {
      assert.match(row, /feishu-batch-downloader-extension\.zip/);
    } else {
      assert.match(row, /Windows[^|]*浏览器/);
      assert.match(row, /macOS[^|]*浏览器/);
    }
  }

  const evidence = {
    "codex-quota-bar": ["tests/codex-quota-bar-download.test.mjs"],
    "codex-thread-workbench": [
      "projects/codex-thread-workbench/download/manifest.json",
      "projects/codex-thread-workbench/download/mac/manifest-arm64.json",
      "projects/codex-thread-workbench/download/mac/manifest-x64.json",
    ],
    clickflow: ["projects/clickflow/release-manifest.json", ".github/workflows/build-clickflow-macos.yml"],
    pureshrink: ["projects/pureshrink/release-manifest.json"],
    "gamespec-relay": [
      ".github/workflows/build-gamespec-relay-release.yml",
      "docs/audits/evidence/2026-08-07-macos-download-manifest.json",
    ],
  };

  for (const [id, paths] of Object.entries(evidence)) {
    for (const path of paths) assert.ok(byId.get(id).includes(path), `${id} evidence: ${path}`);
  }
});
