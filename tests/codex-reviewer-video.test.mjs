import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

test("codex reviewer exposes and migrates its video entry", () => {
  assert.match(source, /video:\s*"\.\/projects\/Codex对话评分工具\/视频资源\/演示视频\.html"/);
  assert.match(source, /if \(normalized\.id === "codex-reviewer"\)/);
  assert.match(source, /normalized\.video = "\.\/projects\/Codex对话评分工具\/视频资源\/演示视频\.html"/);
});

test("codex reviewer video page lazy-loads media and subtitles", () => {
  const page = readFileSync(join(root, "projects", "Codex对话评分工具", "视频资源", "演示视频.html"), "utf8");
  assert.match(page, /id="loadVideo"/);
  assert.match(page, /id="walkthroughVideo"/);
  assert.doesNotMatch(page, /<video[^>]+src=/);
  assert.match(page, /codex-reviewer-intro\.mp4/);
  assert.match(page, /codex-reviewer-intro\.vtt/);
  assert.match(page, /overflow-x:\s*hidden/);
});
