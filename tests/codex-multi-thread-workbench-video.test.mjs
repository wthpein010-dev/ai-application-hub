import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
process.env.FFMPEG_PATH ||= require("ffmpeg-static");
const { decodeMedia, inspectMedia } = await import("./media-inspect.mjs");
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(root, "projects", "codex-multi-thread-workbench", "video");
const mediaPath = join(videoRoot, "codex-multi-thread-workbench-demo.mp4");

function timestampToMilliseconds(timestamp) {
  const match = timestamp.match(/(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})/);
  assert.ok(match, `Invalid VTT timestamp: ${timestamp}`);
  return Number(match[1] || 0) * 3_600_000 + Number(match[2]) * 60_000 + Number(match[3]) * 1_000 + Number(match[4]);
}

function parseCues(contents) {
  return contents.replace(/\r/g, "").split(/\n{2,}/).filter(block => block.includes("-->"))
    .map(block => {
      const lines = block.split("\n");
      const timing = lines.findIndex(line => line.includes("-->"));
      const [start, end] = lines[timing].split("-->").map(value => value.trim());
      return { start: timestampToMilliseconds(start), end: timestampToMilliseconds(end), text: lines.slice(timing + 1).filter(Boolean) };
    });
}

test("desktop Workbench video page uses the shared player and Chinese captions", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  assert.match(html, /Codex 多线程工作台/);
  assert.match(html, /v2\.3\.0/);
  assert.doesNotMatch(html, /v2\.2\.1/);
  for (const topic of ["一级界面", "直接对话", "拖拽换位", "状态刷新", "Windows", "macOS"]) {
    assert.match(html, new RegExp(topic));
  }
  assert.match(html, /class="hub-video-home"/);
  assert.match(html, /href="\.\.\/\.\.\/\.\.\/index\.html#apps"/);
  assert.match(html, /data-src="\.\/codex-multi-thread-workbench-demo\.mp4"/);
  assert.match(html, /poster="\.\/poster\.jpg"/);
  assert.match(html, /<track[^>]+kind="captions"[^>]+src="\.\/codex-multi-thread-workbench-demo\.vtt"[^>]+srclang="zh"[^>]+default/);
  assert.equal((html.match(/data-time="/g) || []).length, 7);
  assert.doesNotMatch(html, /<video[^>]+\ssrc=/);
});

test("desktop Workbench captions are seven non-overlapping single-line chapters", () => {
  const captions = readFileSync(join(videoRoot, "codex-multi-thread-workbench-demo.vtt"), "utf8");
  const script = readFileSync(join(videoRoot, "tutorial-script.md"), "utf8");
  const renderer = readFileSync(join(root, "scripts", "render-codex-multi-thread-workbench-video.mjs"), "utf8");
  const cues = parseCues(captions);
  assert.equal(cues.length, 7);
  for (const cue of cues) {
    assert.equal(cue.text.length, 1);
    assert.ok(cue.end > cue.start);
  }
  for (let index = 1; index < cues.length; index += 1) assert.ok(cues[index].start >= cues[index - 1].end);
  for (const topic of ["多线程", "对话", "拖拽", "全屏", "状态", "Windows", "macOS"]) {
    assert.match(script, new RegExp(topic));
  }
  assert.match(script, /v2\.3\.0/);
  assert.match(captions, /v2\.3\.0/);
  assert.match(renderer, /codex-multi-thread-workbench-v230-recording/);
  assert.doesNotMatch(`${script}\n${captions}\n${renderer}`, /v2\.2\.1|v221-recording/);
  assert.equal(existsSync(join(videoRoot, "poster.jpg")), true);
});

test("desktop Workbench walkthrough is silent 720p H.264 and at most four minutes", () => {
  assert.equal(existsSync(mediaPath), true);
  const media = inspectMedia(mediaPath);
  assert.equal(media.videoCodec, "h264");
  assert.equal(media.width, 1280);
  assert.equal(media.height, 720);
  assert.ok(media.duration >= 80 && media.duration <= 95);
  assert.ok(media.duration <= 240);
  assert.equal(media.audioCodec, "");
  const decode = decodeMedia(mediaPath);
  assert.equal(decode.status, 0, decode.stderr || decode.error?.message);
  assert.equal(decode.stderr.trim(), "");
});
