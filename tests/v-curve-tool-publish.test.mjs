import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";
import { decodeMedia, inspectMedia } from "./media-inspect.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const apps = loadDefaultAppsFromRuntime(runtime);
const projectRoot = join(root, "projects", "v-curve-tool");
const releaseTag = "v-curve-tool-v1.2.0";
const windowsAsset = "V-Curve-Comparison-Tool-1.2.0-Windows-x64.zip";
const macAsset = "V-Curve-Comparison-Tool-1.2.0-macOS.zip";
const releaseBase = `https://github.com/wthpein010-dev/ai-application-hub/releases/download/${releaseTag}`;

function platformHref(value) {
  return typeof value === "string" ? value : value?.href || "";
}

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
  assert.equal(apps.length, 32);
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
  assert.match(html, /31\s*个关卡/u);
  assert.ok(existsSync(appHtml));
  assert.ok(statSync(appHtml).size > 100_000, "the demo must contain the real bundled web app");
  assert.match(readFileSync(appHtml, "utf8"), /羊了个羊 900121/u);
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
  assert.equal(manifest.version, "1.2.0");
  assert.deepEqual(manifest.releaseWorkflow, {
    runId: 33163156365,
    sourceCommit: "54b0c8765dc079979617bf51670c37dfb1eb3ac0",
  });
  assert.deepEqual(manifest.assets.windows, {
    file: windowsAsset,
    url: `${releaseBase}/${windowsAsset}`,
    bytes: 99_701_005,
    sha256: "7AD80A5926FE7B7F110CE4C845B5F466BA0C276D77300790DDFA1C0D3919AB97",
    executableSha256: "B0D1C277CDFE1758E7921F4A81BE8BE5B7F67A9F4EE53B2BFE9554459AC964FD",
    signature: "NotSigned",
  });
  assert.equal(manifest.assets.mac.file, macAsset);
  assert.equal(manifest.assets.mac.url, `${releaseBase}/${macAsset}`);
  assert.equal(manifest.assets.mac.bytes, 261_380_371);
  assert.equal(manifest.assets.mac.sha256, "A355EEA4BBB98D66E6C976363C970F2ADBAFB4A99D95E5AE72166C8341A793B7");
  assert.deepEqual(manifest.assets.mac.architectures, ["arm64", "x64"]);
  assert.equal(manifest.bundledLevels.files, 62);
  assert.equal(manifest.bundledLevels.playable, 31);
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
