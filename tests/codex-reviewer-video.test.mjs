import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync as childSpawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMedia } from "./media-inspect.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

function spawnSync(command, args, options) {
  if (command === (process.env.FFPROBE_PATH || "ffprobe")) {
    const media = inspectMedia(args.at(-1));
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify({
        format: { duration: media.duration },
        streams: [
          { codec_type: "video", codec_name: media.videoCodec, width: media.width, height: media.height },
          { codec_type: "audio", codec_name: media.audioCodec }
        ]
      })
    };
  }
  return childSpawnSync(command, args, options);
}

test("codex reviewer exposes and migrates its video entry", () => {
  assert.match(source, /video:\s*"\.\/projects\/Codex对话评分工具\/视频资源\/演示视频\.html"/);
  assert.match(source, /if \(normalized\.id === "codex-reviewer"\)/);
  assert.match(source, /normalized\.video = "\.\/projects\/Codex对话评分工具\/视频资源\/演示视频\.html"/);
});

test("home page cache key refreshes the current runtime metadata", () => {
  const home = readFileSync(join(root, "index.html"), "utf8");
  assert.match(home, /app-20260706-restore-games\.js\?v=20260720-gamepulse/);
});

test("codex reviewer video page lazy-loads media and subtitles", () => {
  const page = readFileSync(join(root, "projects", "Codex对话评分工具", "视频资源", "演示视频.html"), "utf8");
  assert.match(page, /id="loadVideo"/);
  assert.match(page, /id="walkthroughVideo"/);
  assert.doesNotMatch(page, /<video\s+[^>]*\ssrc=/);
  assert.match(page, /codex-reviewer-intro\.mp4/);
  assert.match(page, /codex-reviewer-intro\.vtt/);
  assert.match(page, /overflow-x:\s*hidden/);
});

test("storyboard avoids JavaScript escape sequences in example paths", () => {
  const storyboard = readFileSync(join(root, "projects", "Codex对话评分工具", "视频资源", "storyboard.html"), "utf8");
  assert.doesNotMatch(storyboard, /sessions\\2026\\07\\12/);
  assert.doesNotMatch(storyboard, /C:\\Users\\Demo/);
});

test("recording script builds Chinese paths without depending on PowerShell source encoding", () => {
  const script = readFileSync(join(root, "scripts", "record-codex-reviewer-demo.ps1"), "utf8");
  assert.doesNotMatch(script, /projects\\Codex对话评分工具\\视频资源/);
  assert.match(script, /\$projectName = -join/);
  assert.match(script, /\$assetName = -join/);
});

test("codex reviewer walkthrough is 1080p with audio and under three minutes", () => {
  const probe = spawnSync(process.env.FFPROBE_PATH || "ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,codec_name,width,height",
    "-of", "json",
    join(root, "projects", "Codex对话评分工具", "视频资源", "codex-reviewer-intro.mp4")
  ], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr || probe.error?.message);
  const data = JSON.parse(probe.stdout);
  const video = data.streams.find(stream => stream.codec_type === "video");
  const audio = data.streams.find(stream => stream.codec_type === "audio");
  assert.deepEqual([video.width, video.height, video.codec_name], [1920, 1080, "h264"]);
  assert.equal(audio.codec_name, "aac");
  assert.ok(Number(data.format.duration) >= 120 && Number(data.format.duration) <= 180);

  const decode = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", [
    "-v", "error", "-i",
    join(root, "projects", "Codex对话评分工具", "视频资源", "codex-reviewer-intro.mp4"),
    "-f", "null", "-"
  ], { encoding: "utf8" });
  assert.equal(decode.status, 0, decode.stderr || decode.error?.message);
  assert.equal(decode.stderr.trim(), "");
});
