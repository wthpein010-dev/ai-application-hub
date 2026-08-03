import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";
import { inspectMedia } from "./media-inspect.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const apps = loadDefaultAppsFromRuntime(runtime);
process.env.FFMPEG_PATH ||= ffmpegPath;

function sectionFor(app) {
  if (app.status === "game") return "games";
  if (app.status === "ai" || app.status === "engineering") return "engineering";
  return "apps";
}

function anchorHrefByClass(html, className) {
  const anchor = (html.match(/<a\b[^>]*>/gi) || []).find((tag) => {
    const classes = /\bclass=["']([^"']*)["']/i.exec(tag)?.[1] || "";
    return classes.split(/\s+/).includes(className);
  });
  return anchor ? /\bhref=["']([^"']+)["']/i.exec(anchor)?.[1] || "" : "";
}

function seconds(value) {
  const parts = value.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function parseVtt(source) {
  const cues = [];
  const blocks = source.replace(/\r/g, "").trim().split(/\n{2,}/).slice(1);
  for (const block of blocks) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => line.includes(" --> "));
    if (timingIndex < 0) continue;
    const [start, end] = lines[timingIndex].split(" --> ").map(seconds);
    cues.push({ start, end, lines: lines.slice(timingIndex + 1).filter(Boolean) });
  }
  return cues;
}

test("every tutorial video returns to its owning catalog section", () => {
  for (const app of apps) {
    const pagePath = join(root, ...app.video.replace(/^\.\//, "").split("/"));
    const html = readFileSync(pagePath, "utf8");
    const rootFromPage = relative(dirname(pagePath), root).replaceAll(sep, "/") || ".";
    assert.equal(
      anchorHrefByClass(html, "hub-video-home"),
      `${rootFromPage}/index.html#${sectionFor(app)}`,
      app.id,
    );
  }
});

test("captions are single-line, ordered and bounded by their media", () => {
  for (const app of apps) {
    const pagePath = join(root, ...app.video.replace(/^\.\//, "").split("/"));
    const html = readFileSync(pagePath, "utf8");
    const videoTag = /<video\b[\s\S]*?<\/video>/i.exec(html)?.[0] || "";
    const mediaSource = /\bdata-src=["']([^"']+)["']/i.exec(videoTag)?.[1];
    const trackSource = /<track\b[^>]*\bsrc=["']([^"']+\.vtt)["']/i.exec(videoTag)?.[1];
    if (!trackSource) continue;

    const media = inspectMedia(resolve(dirname(pagePath), mediaSource.split(/[?#]/, 1)[0]));
    const cues = parseVtt(readFileSync(resolve(dirname(pagePath), trackSource.split(/[?#]/, 1)[0]), "utf8"));
    assert.ok(cues.length > 0, `${app.id} captions are empty`);
    for (let index = 0; index < cues.length; index += 1) {
      const cue = cues[index];
      assert.equal(cue.lines.length, 1, `${app.id} cue ${index + 1} must use one line`);
      assert.ok(cue.end > cue.start, `${app.id} cue ${index + 1} duration`);
      if (index > 0) assert.ok(cue.start >= cues[index - 1].end, `${app.id} cue ${index + 1} overlap`);
    }
    assert.ok(cues.at(-1).end <= media.duration + 0.001, `${app.id} captions exceed ${media.duration}s`);
  }
});

test("GamePulse captions use the current public name", () => {
  const captions = readFileSync(join(root, "projects", "gamepulse-mini-radar", "video", "gamepulse-mini-radar-demo.vtt"), "utf8");
  assert.match(captions, /小游戏每日排行/);
  assert.doesNotMatch(captions, /GamePulse 小游雷达/);
});

test("portrait and Hub video pages provide appropriate presentation metadata", () => {
  const nang = readFileSync(join(root, "projects", "nang-keng-pai-pai-xiang", "video", "index.html"), "utf8");
  const hub = readFileSync(join(root, "projects", "AI应用方案整理器", "视频资源", "index.html"), "utf8");

  assert.match(nang, /data-video-orientation="portrait"/);
  assert.match(hub, /class="hub-video-description">[^<]+</);
  assert.match(hub, /应用|项目|小游戏/);
});
