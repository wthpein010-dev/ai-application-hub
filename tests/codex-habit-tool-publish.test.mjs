import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("Codex habit tool is available from the application collection", () => {
  const source = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
  assert.match(source, /id:\s*"codex-habit-tool"/);
  assert.match(source, /Codex 习惯设置工具/);
  assert.doesNotMatch(source, /codex-habit-tool-(?:windows|mac-source)\.zip/);
  assert.match(source, /codex-habit-tool-demo\.html/);
});

test("preview and video pages both provide a return path to the hub", () => {
  const preview = join(root, "projects", "codex-habit-tool", "index.html");
  const video = join(root, "videos", "codex-habit-tool-demo.html");
  assert.equal(existsSync(preview), true, "preview page should exist");
  assert.equal(existsSync(video), true, "video page should exist");
  assert.match(readFileSync(preview, "utf8"), /\.\.\/\.\.\/index\.html#apps/);
  const videoPage = readFileSync(video, "utf8");
  assert.match(videoPage, /class="hub-video-home"/);
  assert.match(videoPage, /href="\.\.\/index\.html#apps"/);
  assert.match(videoPage, /hub-video-player\.css/);
  assert.match(videoPage, /codex-habit-tool-demo\.mp4/);
});

test("unverified operating-system archives are not shipped", () => {
  assert.equal(existsSync(join(root, "downloads", "codex-habit-tool-windows.zip")), false);
  assert.equal(existsSync(join(root, "downloads", "codex-habit-tool-mac-source.zip")), false);
});

test("mobile preview keeps the introduction at full content width", () => {
  const styles = readFileSync(join(root, "projects", "codex-habit-tool", "styles.css"), "utf8");
  assert.match(styles, /\.page-intro\s*>\s*div\s*\{\s*width:\s*100%/);
});
