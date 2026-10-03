import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";
import { inspectMedia } from "./media-inspect.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const apps = loadDefaultAppsFromRuntime(readFileSync(join(root, "app-20260706-restore-games.js"), "utf8"));
const project = join(root, "projects", "lighthouse-rescue");

test("lighthouse rescue is the last game with real demo, video and Windows release only", () => {
  const games = apps.filter(app => app.status === "game");
  const game = games.at(-1);
  assert.equal(game.id, "lighthouse-rescue");
  assert.equal(game.platforms.web.href, "./projects/lighthouse-rescue/index.html");
  assert.equal(game.video, "./projects/lighthouse-rescue/video/index.html");
  assert.match(game.platforms.windows.href, /^https:\/\/github\.com\/wthpein010-dev\/ai-application-hub\/releases\/download\/lighthouse-rescue-v1\.4\.4\/LighthouseRescue-Windows-x64\.zip$/);
  assert.equal(game.platforms.mac, "");
  assert.ok(existsSync(join(root, "assets", "hub-showcase", "lighthouse-rescue.webp")));
});

test("published video has a playable MP4, poster and single-line captions", () => {
  const video = join(project, "video");
  const html = readFileSync(join(video, "index.html"), "utf8");
  assert.match(html, /hub-video-player\.css/);
  assert.match(html, /hub-video-player\.js/);
  assert.match(html, /lighthouse-demo\.mp4/);
  const mp4 = join(video, "lighthouse-demo.mp4");
  assert.ok(statSync(mp4).size > 100_000);
  const media = inspectMedia(mp4);
  assert.ok(media.duration > 10 && media.duration <= 240);
  assert.match(media.videoCodec, /h264/i);
  assert.match(media.audioCodec, /aac/i, "storm gameplay recap should include sound");
  assert.ok(existsSync(join(video, "poster.jpg")));
  const vtt = readFileSync(join(video, "lighthouse-demo.vtt"), "utf8");
  assert.match(vtt, /^WEBVTT/);
  for (const block of vtt.split(/\n\s*\n/).filter(block => block.includes("-->"))) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 2, `caption must occupy one line: ${block}`);
  }
});
