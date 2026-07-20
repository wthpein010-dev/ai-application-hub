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
const videoRoot = join(root, "projects", "paws-level-editor", "video");
const mediaPath = join(videoRoot, "paws-level-editor-tutorial.mp4");

test("tutorial player exposes lazy loading, captions and five chapters", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  assert.match(html, /id="loadVideo"/);
  assert.match(html, /<video[^>]+controls[^>]+playsinline[^>]+preload="none"/);
  assert.match(html, /data-src="\.\/paws-level-editor-tutorial\.mp4"/);
  assert.match(
    html,
    /<track[^>]+kind="captions"[^>]+src="\.\/paws-level-editor-tutorial\.vtt"[^>]+srclang="zh"[^>]+default/,
  );
  assert.equal((html.match(/data-time="/g) || []).length, 5);
  assert.doesNotMatch(html, /<video[^>]+\ssrc=/);
});

test("tutorial assets keep the chapter timeline and player references aligned", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  const captions = readFileSync(
    join(videoRoot, "paws-level-editor-tutorial.vtt"),
    "utf8",
  );
  const script = readFileSync(join(videoRoot, "tutorial-script.md"), "utf8");

  for (const time of ["0", "12", "32", "50", "70"]) {
    assert.match(html, new RegExp(`data-time="${time}"`));
  }
  for (const cue of ["00:00.000", "00:12.000", "00:32.000", "00:50.000", "01:10.000"]) {
    assert.equal(captions.includes(cue), true, `captions should include ${cue}`);
  }
  assert.match(script, /00:00/);
  assert.match(script, /01:10/);
  assert.equal(existsSync(join(videoRoot, "poster.jpg")), true);
});

test("tutorial is 16:9 H.264 and lasts 75 to 110 seconds", () => {
  const media = inspectMedia(mediaPath);
  assert.equal(media.videoCodec, "h264");
  assert.equal(media.width / media.height, 16 / 9);
  assert.ok(media.duration >= 75 && media.duration <= 110);

  const decode = decodeMedia(mediaPath);
  assert.equal(decode.status, 0, decode.stderr || decode.error?.message);
  assert.equal(decode.stderr.trim(), "");
});
