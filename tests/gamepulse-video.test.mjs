import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
process.env.FFMPEG_PATH ||= require("ffmpeg-static");
const { decodeMedia, inspectMedia } = await import("./media-inspect.mjs");
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(root, "projects", "gamepulse-mini-radar", "video");
const mediaPath = join(videoRoot, "gamepulse-mini-radar-demo.mp4");

function cueSeconds(value) {
  const parts = value.split(":").map(Number);
  return parts.length === 2
    ? parts[0] * 60 + parts[1]
    : parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function decodeNumericEntities(value) {
  return value.replace(/&#(\d+);/g, (_, codePoint) =>
    String.fromCodePoint(Number(codePoint)),
  );
}

test("GamePulse video page lazy-loads MP4 with default Chinese captions", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  assert.match(html, /id="loadVideo"/);
  assert.match(html, /data-src="\.\/gamepulse-mini-radar-demo\.mp4"/);
  assert.match(html, /poster="\.\/poster\.jpg"/);
  assert.match(
    html,
    /<track[^>]+kind="captions"[^>]+src="\.\/gamepulse-mini-radar-demo\.vtt"[^>]+srclang="zh"[^>]+default/,
  );
  assert.equal((html.match(/data-time="/g) || []).length, 6);
  assert.doesNotMatch(html, /<video[^>]+\ssrc=/);
});

test("GamePulse video page returns to the application collection", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  assert.match(html, /class="hub-video-home" href="\.\.\/\.\.\/\.\.\/index\.html#apps"/);
});

test("GamePulse video shell uses the shared Hub player assets", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  assert.match(html, /data-hub-video-page/);
  assert.match(html, /assets\/hub-video-player\.css/);
  assert.match(html, /assets\/hub-video-player\.js/);
});

test("GamePulse script and captions cover the six v18 walkthrough chapters", () => {
  const captions = readFileSync(
    join(videoRoot, "gamepulse-mini-radar-demo.vtt"),
    "utf8",
  );
  const script = readFileSync(join(videoRoot, "tutorial-script.md"), "utf8");
  for (const cue of [
    "00:00.000",
    "00:13.000",
    "00:27.000",
    "00:40.000",
    "00:55.000",
    "01:09.000",
  ]) {
    assert.equal(captions.includes(cue), true, `captions should include ${cue}`);
  }
  for (const chapter of [
    "今日与五页签总览",
    "四榜与玩法拆解",
    "行业知识库",
    "发布合作与四类信息",
    "我的发布与接口说明",
    "每日更新与返回主页",
  ]) {
    assert.match(script, new RegExp(chapter));
  }

  const visiblePage = decodeNumericEntities(
    readFileSync(join(videoRoot, "index.html"), "utf8"),
  );
  assert.match(visiblePage, /排行榜与行业知识库/);
  assert.match(visiblePage, /发布合作/);
  assert.match(visiblePage, /我的发布与接口说明/);
  assert.equal(existsSync(join(videoRoot, "poster.jpg")), true);
});

test("GamePulse captions keep one visible Chinese line at a time", () => {
  const captions = readFileSync(
    join(videoRoot, "gamepulse-mini-radar-demo.vtt"),
    "utf8",
  );
  const cueBlocks = captions.trim().split(/\r?\n\r?\n/).slice(1);
  assert.equal(cueBlocks.length, 6);
  for (const block of cueBlocks) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 2, `caption should be one line: ${block}`);
    assert.ok(lines[1].length <= 38, `caption is too long: ${lines[1]}`);
  }
});

test("GamePulse recorder follows the current five-tab navigation", () => {
  const recorder = readFileSync(
    join(root, "scripts", "record-gamepulse-mini-radar-demo.mjs"),
    "utf8",
  );
  for (const label of ["今日", "榜单", "情报", "发布合作", "我的"]) {
    assert.match(recorder, new RegExp(`name: "${label}"`));
  }
  assert.match(recorder, /name: "我的发布"/);
  assert.match(recorder, /name: "接口说明"/);
  assert.match(recorder, /getByRole\("tab", \{ name: \/四榜概览\//);
  assert.match(recorder, /name: "查看 赵云与阿斗 详情"/);
  assert.doesNotMatch(recorder, /row-arrow/);
  assert.doesNotMatch(recorder, /name: "排行榜"|name: "行业知识库"|name: "更新说明"/);
});

test("GamePulse walkthrough is silent 16:9 H.264 and 70 to 100 seconds", () => {
  const media = inspectMedia(mediaPath);
  assert.equal(media.videoCodec, "h264");
  assert.equal(media.width / media.height, 16 / 9);
  assert.ok(media.duration >= 70 && media.duration <= 100);
  const decode = decodeMedia(mediaPath);
  assert.equal(decode.status, 0, decode.stderr || decode.error?.message);
  assert.equal(decode.stderr.trim(), "");
});

test("GamePulse captions end within the published video", () => {
  const captions = readFileSync(
    join(videoRoot, "gamepulse-mini-radar-demo.vtt"),
    "utf8",
  );
  const cueEnds = [...captions.matchAll(/-->\s*([^\s]+)/g)].map((match) =>
    cueSeconds(match[1]),
  );
  const media = inspectMedia(mediaPath);

  assert.ok(cueEnds.length > 0);
  assert.ok(
    cueEnds.at(-1) <= media.duration + 0.001,
    `captions exceed ${media.duration}s`,
  );
});
