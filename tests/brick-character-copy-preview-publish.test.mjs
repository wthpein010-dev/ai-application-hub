import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";
import { inspectMedia } from "./media-inspect.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = join(root, "projects", "brick-character-copy-preview");
const videoRoot = join(projectRoot, "video");
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
process.env.FFMPEG_PATH ||= ffmpegPath;

function seconds(timestamp) {
  const parts = timestamp.split(":").map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
}

test("brick copy preview is the final application card with truthful actions", () => {
  const apps = loadDefaultAppsFromRuntime(runtime);
  const project = apps.find((app) => app.id === "brick-character-copy-preview");

  assert.equal(apps.at(-1).id, project.id);
  assert.equal(project.name, "砖块角色文案预览");
  assert.equal(project.status, "assistant");
  assert.equal(project.platforms.web.label, "演示");
  assert.equal(project.platforms.windows, "");
  assert.equal(project.platforms.mac, "");
  assert.equal(project.package, "");
  assert.equal(project.video, "./projects/brick-character-copy-preview/video/index.html");
});

test("page exposes ten readable role records with exact 27-character detail copy", () => {
  const html = readFileSync(join(projectRoot, "index.html"), "utf8");
  const names = Array.from(html.matchAll(/name:\s*"([^"]+)"/g), (match) => match[1]);
  const copies = Array.from(html.matchAll(/copy:\s*"([^"]+)"/g), (match) => match[1]);

  assert.equal(names.length, 10);
  assert.equal(copies.length, 10);
  assert.equal(copies.every((copy) => Array.from(copy).length === 27), true);
  assert.match(html, /<body class="hub-subpage">/);
  assert.match(html, /class="hub-home-link" href="\.\.\/\.\.\/index\.html#apps"/);
  assert.match(html, /placeholder="搜索代号、名字或文案"/);
  assert.match(html, /id="preview-copy"/);
});

test("video page uses the shared player and a short H.264 walkthrough", () => {
  const page = readFileSync(join(videoRoot, "index.html"), "utf8");
  const mediaPath = join(videoRoot, "brick-character-copy-preview-demo.mp4");

  assert.match(page, /data-hub-video-page/);
  assert.match(page, /class="hub-video-home" href="\.\.\/\.\.\/\.\.\/index\.html#apps"/);
  assert.match(page, /id="loadVideo"/);
  assert.match(page, /preload="none" data-src="\.\/brick-character-copy-preview-demo\.mp4"/);
  assert.equal(existsSync(mediaPath), true);

  const media = inspectMedia(mediaPath);
  assert.equal(media.videoCodec, "h264");
  assert.deepEqual([media.width, media.height], [1280, 720]);
  assert.ok(media.duration >= 30 && media.duration <= 40);

  const captions = readFileSync(join(videoRoot, "brick-character-copy-preview-demo.vtt"), "utf8");
  const cues = captions.replace(/\r/g, "").trim().split(/\n{2,}/).slice(1).map((block) => {
    const lines = block.split("\n");
    const timing = lines.find((line) => line.includes(" --> "));
    return { end: seconds(timing.split(" --> ")[1]), text: lines.slice(1).filter(Boolean) };
  });
  assert.equal(cues.length, 4);
  assert.equal(cues.every((cue) => cue.text.length === 1), true);
  assert.ok(cues.at(-1).end <= media.duration);
});
