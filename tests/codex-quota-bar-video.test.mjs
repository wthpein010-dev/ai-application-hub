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
const videoRoot = join(root, "projects", "codex-quota-bar", "video");
const mediaPath = join(videoRoot, "codex-quota-bar-demo.mp4");

function timestampToMilliseconds(timestamp) {
  const match = timestamp.match(/(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})/);
  assert.ok(match, `Invalid VTT timestamp: ${timestamp}`);
  return (
    Number(match[1] || 0) * 3_600_000 +
    Number(match[2]) * 60_000 +
    Number(match[3]) * 1_000 +
    Number(match[4])
  );
}

function parseCues(contents) {
  return contents
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .filter((block) => block.includes("-->"))
    .map((block) => {
      const lines = block.split("\n");
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      const [start, end] = lines[timingIndex].split("-->").map((part) => part.trim());
      return {
        end: timestampToMilliseconds(end),
        start: timestampToMilliseconds(start),
        text: lines.slice(timingIndex + 1).filter(Boolean),
      };
    });
}

test("Codex quota video page uses the shared lazy player and Chinese captions", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  assert.match(html, /data-hub-video-page/);
  assert.match(html, /class="hub-video-home"/);
  assert.match(html, /hub-video-player\.css/);
  assert.match(html, /hub-video-player\.js/);
  assert.match(html, /id="loadVideo"/);
  assert.match(html, /data-src="\.\/codex-quota-bar-demo\.mp4"/);
  assert.match(html, /poster="\.\/poster\.jpg"/);
  assert.match(
    html,
    /<track[^>]+kind="captions"[^>]+src="\.\/codex-quota-bar-demo\.vtt"[^>]+srclang="zh-CN"[^>]+default/,
  );
  assert.equal((html.match(/data-time="/g) || []).length, 5);
  assert.doesNotMatch(html, /<video[^>]+\ssrc=/);
});

test("Codex quota captions are five single-line non-overlapping cues", () => {
  const cues = parseCues(
    readFileSync(join(videoRoot, "codex-quota-bar-demo.vtt"), "utf8"),
  );

  assert.equal(cues.length, 5);
  for (const cue of cues) {
    assert.equal(cue.text.length, 1, `cue at ${cue.start} must use one subtitle line`);
    assert.ok(cue.end > cue.start, `cue at ${cue.start} must have positive duration`);
  }
  for (let index = 1; index < cues.length; index += 1) {
    assert.ok(
      cues[index].start >= cues[index - 1].end,
      `cue ${index + 1} must not overlap cue ${index}`,
    );
  }
  assert.equal(existsSync(join(videoRoot, "poster.jpg")), true);
});

test("Codex quota walkthrough is silent 16:9 H.264 under one minute", () => {
  const media = inspectMedia(mediaPath);
  assert.equal(media.videoCodec, "h264");
  assert.equal(media.width / media.height, 16 / 9);
  assert.ok(media.duration >= 30 && media.duration < 60);
  assert.equal(media.audioCodec, "");
  const decode = decodeMedia(mediaPath);
  assert.equal(decode.status, 0, decode.stderr || decode.error?.message);
  assert.equal(decode.stderr.trim(), "");
});
