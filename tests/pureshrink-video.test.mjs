import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeMedia, inspectMedia } from "./media-inspect.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(root, "projects", "pureshrink", "video");
const mediaPath = join(videoRoot, "pureshrink-demo.mp4");

function cueSeconds(value) {
  const [hours, minutes, seconds] = value.split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function parseCues(source) {
  return source
    .trim()
    .split(/\r?\n\r?\n/)
    .slice(1)
    .map((block) => {
      const [timing, ...textLines] = block.split(/\r?\n/);
      const match = timing.match(/^(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})$/);
      assert.ok(match, `invalid cue timing: ${timing}`);
      return {
        start: cueSeconds(match[1]),
        end: cueSeconds(match[2]),
        textLines,
      };
    });
}

test("PureShrink video page follows the shared lazy player contract", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");

  assert.match(html, /data-hub-video-page/);
  assert.match(html, /class="hub-video-home"/);
  assert.match(html, /href="\.\.\/\.\.\/\.\.\/index\.html#apps"/);
  assert.match(html, /hub-video-player\.css/);
  assert.match(html, /hub-video-player\.js/);
  assert.match(html, /id="loadVideo"/);
  assert.match(html, /preload="none"[^>]+data-src="\.\/pureshrink-demo\.mp4"/);
  assert.match(html, /kind="captions"[^>]+src="\.\/pureshrink-demo\.vtt"/);
  assert.equal((html.match(/data-time="/g) || []).length, 6);
  assert.doesNotMatch(html, /<video[^>]+\ssrc=/);
  assert.equal(existsSync(join(videoRoot, "poster.jpg")), true);
  assert.equal(existsSync(join(videoRoot, "tutorial-script.md")), true);
});

test("PureShrink captions use one short non-overlapping line at a time", () => {
  const cues = parseCues(readFileSync(join(videoRoot, "pureshrink-demo.vtt"), "utf8"));

  assert.equal(cues.length, 6);
  for (const [index, cue] of cues.entries()) {
    assert.equal(cue.textLines.length, 1, `cue ${index + 1} should contain one line`);
    assert.ok(cue.textLines[0].length > 0 && cue.textLines[0].length <= 32);
    assert.ok(cue.end > cue.start);
    if (index > 0) assert.ok(cue.start >= cues[index - 1].end);
  }
});

test("PureShrink tutorial is a short decodable 720p H.264 video", () => {
  const media = inspectMedia(mediaPath);

  assert.equal(media.videoCodec, "h264");
  assert.equal(media.width, 1280);
  assert.equal(media.height, 720);
  assert.ok(media.duration >= 40 && media.duration < 90, `duration=${media.duration}`);
  const decoded = decodeMedia(mediaPath);
  assert.equal(decoded.status, 0, decoded.stderr);
});
