import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMedia } from "./media-inspect.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoDir = join(root, "projects", "minigame-project-tool", "video");
const videoPath = join(videoDir, "minigame-project-tool-intro.mp4");

test("recording script keeps the zoompan size option outside PowerShell interpolation", () => {
  const script = readFileSync(join(root, "scripts", "record-minigame-tool-demo.ps1"), "utf8");
  assert.match(script, /d=\$\{frames\}:s=1920x1080/);
});

test("video page lazy-loads the narrated walkthrough and subtitles", () => {
  const html = readFileSync(join(videoDir, "index.html"), "utf8");
  const captions = readFileSync(join(videoDir, "minigame-project-tool-intro.vtt"), "utf8");

  assert.match(html, /data-src="\.\/minigame-project-tool-intro\.mp4"/);
  assert.match(html, /<track[^>]+kind="captions"[^>]+srclang="zh-CN"/);
  assert.match(html, /id="loadVideo"/);
  assert.match(captions, /^WEBVTT/m);
  assert.match(captions, /拖入 Codex/);
});

test("walkthrough is 1080p with audio and no longer than three minutes", () => {
  assert.equal(existsSync(videoPath), true, "MP4 should exist");
  const probe = inspectMedia(videoPath);

  assert.equal(probe.width, 1920);
  assert.equal(probe.height, 1080);
  assert.ok(probe.audioCodec, "audio stream should exist");
  assert.ok(probe.duration > 150, "video should be at least 150 seconds");
  assert.ok(probe.duration <= 180, "video should not exceed three minutes");
});
