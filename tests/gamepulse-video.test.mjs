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

test("GamePulse script and captions cover the six walkthrough chapters", () => {
  const captions = readFileSync(
    join(videoRoot, "gamepulse-mini-radar-demo.vtt"),
    "utf8",
  );
  const script = readFileSync(join(videoRoot, "tutorial-script.md"), "utf8");
  for (const cue of [
    "00:00.000",
    "00:12.000",
    "00:25.000",
    "00:38.000",
    "00:51.000",
    "01:04.000",
  ]) {
    assert.equal(captions.includes(cue), true, `captions should include ${cue}`);
  }
  for (const chapter of [
    "总览与双核心定位",
    "四榜工作台",
    "知识搜索和筛选",
    "知识详情、收藏与历史",
    "游戏详情：玩法拆解与市场表现",
    "07:10 更新、来源可信度与返回主页",
  ]) {
    assert.match(script, new RegExp(chapter));
  }

  const visiblePage = decodeNumericEntities(
    readFileSync(join(videoRoot, "index.html"), "utf8"),
  );
  assert.match(visiblePage, /排行榜与行业知识库/);
  assert.match(visiblePage, /知识详情、收藏与历史/);
  assert.match(visiblePage, /玩法拆解与市场表现/);
  assert.equal(existsSync(join(videoRoot, "poster.jpg")), true);
});

test("GamePulse walkthrough is silent 16:9 H.264 and 60 to 90 seconds", () => {
  const media = inspectMedia(mediaPath);
  assert.equal(media.videoCodec, "h264");
  assert.equal(media.width / media.height, 16 / 9);
  assert.ok(media.duration >= 60 && media.duration <= 90);
  const decode = decodeMedia(mediaPath);
  assert.equal(decode.status, 0, decode.stderr || decode.error?.message);
  assert.equal(decode.stderr.trim(), "");
});
