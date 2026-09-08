import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";
import { decodeMedia, inspectMedia } from "./media-inspect.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const apps = loadDefaultAppsFromRuntime(runtime);
const projectRoot = join(root, "projects", "v-curve-tool");
const releaseTag = "v-curve-tool-v1.5.0";
const windowsAsset = "V-Curve-Comparison-Tool-1.5.0-Windows-x64.zip";
const macAsset = "V-Curve-Comparison-Tool-1.5.0-macOS.zip";
const releaseBase = `https://github.com/wthpein010-dev/ai-application-hub/releases/download/${releaseTag}`;

function platformHref(value) {
  return typeof value === "string" ? value : value?.href || "";
}

function normalizeStoredProject(stored) {
  const start = runtime.indexOf("function normalizeApp");
  const end = runtime.indexOf("function projectHref", start);
  const context = { globalThis: {}, defaultApps: apps, statusLabel: { engineering: "工程体验" }, OLD_HUB_BRIEF: "", HUB_BRIEF: "" };
  vm.runInNewContext(`${runtime.slice(start, end)}\nglobalThis.normalizeApp = normalizeApp;`, context);
  return context.globalThis.normalizeApp(stored);
}

test("cached V curve cards update old release links without overwriting custom copy", () => {
  const current = apps.find((app) => app.id === "v-curve-tool");
  const stored = {
    ...current,
    brief: "我的关卡工作台说明",
    package: `${releaseBase.replace("1.5.0", "1.2.0")}/${windowsAsset.replace("1.5.0", "1.2.0")}`,
    platforms: {
      ...current.platforms,
      windows: { href: `${releaseBase.replace("1.5.0", "1.2.0")}/${windowsAsset.replace("1.5.0", "1.2.0")}`, label: "Wins下载" },
      mac: { href: `${releaseBase.replace("1.5.0", "1.2.0")}/${macAsset.replace("1.5.0", "1.2.0")}`, label: "Mac下载" },
    },
  };
  const migrated = normalizeStoredProject(stored);
  assert.equal(migrated.brief, "我的关卡工作台说明");
  assert.equal(migrated.package, `${releaseBase}/${windowsAsset}`);
  assert.equal(platformHref(migrated.platforms.windows), `${releaseBase}/${windowsAsset}`);
  assert.equal(platformHref(migrated.platforms.mac), `${releaseBase}/${macAsset}`);
  const oldBrief = "导入 Paws JSON 关卡，即可与固定的《羊了个羊》900121 结构并排生成连续 V 曲线、河道上下界与关键诊断。";
  assert.equal(normalizeStoredProject({ ...stored, brief: oldBrief }).brief, current.brief);
});

function cueSeconds(value) {
  const [hours, minutes, seconds] = value.split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function parseCues(source) {
  return source.trim().split(/\r?\n\r?\n/).slice(1).map((block) => {
    const [timing, ...lines] = block.split(/\r?\n/);
    const match = /^(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})$/u.exec(timing);
    assert.ok(match, `invalid cue timing: ${timing}`);
    return { start: cueSeconds(match[1]), end: cueSeconds(match[2]), lines };
  });
}

test("V curve is the final project-development card with four truthful actions", () => {
  assert.equal(apps.length, 34);
  const project = apps.find((app) => app.id === "v-curve-tool");
  assert.ok(project, "V curve catalog entry is missing");
  assert.equal(project.name, "V曲线对比工具");
  assert.equal(project.category, "项目开发");
  assert.equal(project.status, "engineering");
  assert.equal(project.entry, "./projects/v-curve-tool/index.html");
  assert.equal(project.video, "./projects/v-curve-tool/video/index.html");
  assert.equal(platformHref(project.platforms.web), project.entry);
  assert.equal(platformHref(project.platforms.windows), `${releaseBase}/${windowsAsset}`);
  assert.equal(platformHref(project.platforms.mac), `${releaseBase}/${macAsset}`);

  const engineering = apps.filter((app) => ["ai", "engineering"].includes(app.status));
  assert.equal(engineering.at(-1)?.id, "v-curve-tool");
});

test("the public demo is the real offline tool inside the shared engineering shell", () => {
  const html = readFileSync(join(projectRoot, "index.html"), "utf8");
  const appHtml = join(projectRoot, "app", "index.html");
  const trackedBuild = join(root, "build", "v-curve-tool", "dist", "V曲线对比工具.html");

  assert.match(html, /class="hub-home-link"/u);
  assert.match(html, /href="\.\.\/\.\.\/index\.html#engineering"/u);
  assert.match(html, /<iframe[^>]+src="\.\/app\/index\.html"/u);
  assert.match(html, /双侧关卡库/u);
  assert.ok(existsSync(appHtml));
  assert.ok(statSync(appHtml).size > 100_000, "the demo must contain the real bundled web app");
  const appSource = readFileSync(appHtml, "utf8");
  assert.match(appSource, /900121/u);
  assert.match(appSource, /model-select/u);
  assert.match(appSource, /load-reference-sample/u);
  const appBytes = readFileSync(appHtml);
  const trackedBuildBytes = readFileSync(trackedBuild);
  assert.equal(appBytes.includes(13), false, "the public demo must use repository-safe LF line endings");
  assert.equal(trackedBuildBytes.includes(13), false, "the tracked build must use repository-safe LF line endings");
  assert.deepEqual(
    appBytes,
    trackedBuildBytes,
    "the public demo must be the exact tracked desktop/web build",
  );
});

test("the immutable release manifest records the verified Windows and macOS packages", () => {
  const manifest = JSON.parse(readFileSync(join(projectRoot, "release-manifest.json"), "utf8"));

  assert.equal(manifest.schemaVersion, "v-curve-tool-release/1");
  assert.equal(manifest.version, "1.5.0");
  assert.equal(manifest.release.tag, releaseTag);
  assert.ok(Number.isSafeInteger(manifest.release.id) && manifest.release.id > 0);
  assert.ok(Number.isSafeInteger(manifest.releaseWorkflow.runId) && manifest.releaseWorkflow.runId > 0);
  assert.match(manifest.releaseWorkflow.sourceCommit, /^[0-9a-f]{40}$/u);
  assert.equal(manifest.assets.windows.file, windowsAsset);
  assert.equal(manifest.assets.windows.url, `${releaseBase}/${windowsAsset}`);
  assert.ok(manifest.assets.windows.bytes > 90_000_000);
  assert.match(manifest.assets.windows.sha256, /^[A-F0-9]{64}$/u);
  assert.match(manifest.assets.windows.executableSha256, /^[A-F0-9]{64}$/u);
  assert.equal(manifest.assets.windows.signature, "NotSigned");
  assert.equal(manifest.assets.mac.file, macAsset);
  assert.equal(manifest.assets.mac.url, `${releaseBase}/${macAsset}`);
  assert.ok(manifest.assets.mac.bytes > 200_000_000);
  assert.match(manifest.assets.mac.sha256, /^[A-F0-9]{64}$/u);
  assert.deepEqual(manifest.assets.mac.architectures, ["arm64", "x64"]);
  assert.equal(manifest.bundledLevels.files, 64);
  assert.equal(manifest.bundledLevels.playable, 32);
});

test("the V curve tutorial is a short shared-player H.264 walkthrough with one-line captions", () => {
  const videoRoot = join(projectRoot, "video");
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  const captions = parseCues(readFileSync(join(videoRoot, "v-curve-tool-demo.vtt"), "utf8"));

  assert.match(html, /data-hub-video-page/u);
  assert.match(html, /class="hub-video-home" href="\.\.\/\.\.\/\.\.\/index\.html#engineering"/u);
  assert.match(html, /preload="none"[^>]+data-src="\.\/v-curve-tool-demo\.mp4"/u);
  assert.match(html, /kind="captions"[^>]+src="\.\/v-curve-tool-demo\.vtt"/u);
  assert.equal(captions.length, 6);
  captions.forEach((cue, index) => {
    assert.equal(cue.lines.length, 1, `cue ${index + 1} must stay on one line`);
    assert.ok(cue.lines[0].length > 0 && cue.lines[0].length <= 28);
    assert.ok(cue.end > cue.start);
    if (index > 0) assert.ok(cue.start >= captions[index - 1].end);
  });

  const mediaPath = join(videoRoot, "v-curve-tool-demo.mp4");
  const media = inspectMedia(mediaPath);
  assert.equal(media.videoCodec, "h264");
  assert.equal(media.width, 1280);
  assert.equal(media.height, 720);
  assert.ok(media.duration >= 45 && media.duration <= 90, `duration=${media.duration}`);
  assert.ok(captions.at(-1).end <= media.duration + 0.001);
  const decoded = decodeMedia(mediaPath);
  assert.equal(decoded.status, 0, decoded.stderr);
});
