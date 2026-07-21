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
const videoRoot = join(root, "projects", "codex-thread-workbench", "video");
const mediaPath = join(videoRoot, "codex-thread-workbench-demo.mp4");

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

test("Workbench video page lazy-loads MP4 with default Chinese captions", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  assert.match(html, /id="loadVideo"/);
  assert.match(html, /data-src="\.\/codex-thread-workbench-demo\.mp4"/);
  assert.match(html, /poster="\.\/poster\.jpg"/);
  assert.match(
    html,
    /<track[^>]+kind="captions"[^>]+src="\.\/codex-thread-workbench-demo\.vtt"[^>]+srclang="zh"[^>]+default/,
  );
  assert.equal((html.match(/data-time="/g) || []).length, 6);
  assert.doesNotMatch(html, /<video[^>]+\ssrc=/);
});

test("Workbench video page returns to the Hub games collection", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  assert.equal(
    (html.match(/href="\.\.\/\.\.\/\.\.\/index\.html#games"/g) || []).length,
    2,
  );
  assert.match(html, /返回工具集合/);
});

test("Workbench script and captions cover six non-overlapping single-line chapters", () => {
  const captions = readFileSync(
    join(videoRoot, "codex-thread-workbench-demo.vtt"),
    "utf8",
  );
  const script = readFileSync(join(videoRoot, "tutorial-script.md"), "utf8");
  const cues = parseCues(captions);

  assert.equal(cues.length, 6);
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

  for (const marker of [
    "00:00",
    "00:11",
    "00:23",
    "00:36",
    "00:49",
    "01:02",
  ]) {
    assert.match(script, new RegExp(marker.replace(":", "\\:")));
  }
  assert.equal(existsSync(join(videoRoot, "poster.jpg")), true);
});

test("Workbench walkthrough is silent 16:9 H.264 and 60 to 90 seconds", () => {
  const media = inspectMedia(mediaPath);
  assert.equal(media.videoCodec, "h264");
  assert.equal(media.width / media.height, 16 / 9);
  assert.ok(media.duration >= 60 && media.duration <= 90);
  assert.equal(media.audioCodec, "");
  const decode = decodeMedia(mediaPath);
  assert.equal(decode.status, 0, decode.stderr || decode.error?.message);
  assert.equal(decode.stderr.trim(), "");
});
