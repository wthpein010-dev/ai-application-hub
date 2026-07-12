import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
  const command = process.env.FFPROBE_PATH || "ffprobe";
  const result = spawnSync(command, ["-v", "error", "-show_streams", "-show_format", "-of", "json", videoPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || `Unable to run ${command}`);
  const probe = JSON.parse(result.stdout);
  const video = probe.streams.find(stream => stream.codec_type === "video");
  const audio = probe.streams.find(stream => stream.codec_type === "audio");

  assert.equal(video?.width, 1920);
  assert.equal(video?.height, 1080);
  assert.ok(audio, "audio stream should exist");
  assert.ok(Number(probe.format.duration) > 150, "video should be at least 150 seconds");
  assert.ok(Number(probe.format.duration) <= 180, "video should not exceed three minutes");
});
