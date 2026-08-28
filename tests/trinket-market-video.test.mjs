import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeMedia, inspectMedia } from "./media-inspect.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(root, "projects", "trinket-market", "video");
const videoPath = join(videoRoot, "trinket-market-demo.mp4");

function seconds(value) {
  const parts = value.split(":").map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
}

test("trinket market publishes a short silent H.264 walkthrough", () => {
  assert.equal(existsSync(videoPath), true);
  const media = inspectMedia(videoPath);
  assert.equal(media.videoCodec, "h264");
  assert.equal(media.audioCodec, "");
  assert.deepEqual([media.width, media.height], [1280, 720]);
  assert.ok(media.duration >= 45 && media.duration <= 75);
  assert.equal(decodeMedia(videoPath).status, 0);
});

test("video page and single-line captions cover the core interactions", () => {
  const page = readFileSync(join(videoRoot, "index.html"), "utf8");
  const captions = readFileSync(join(videoRoot, "trinket-market-demo.vtt"), "utf8");
  const tutorial = readFileSync(join(videoRoot, "tutorial-script.md"), "utf8");

  assert.match(page, /data-hub-video-page/);
  assert.match(page, /href="\.\.\/\.\.\/\.\.\/index\.html#engineering"/);
  assert.match(page, /preload="none" data-src="\.\/trinket-market-demo\.mp4"/);
  assert.match(page, /小物排序与桌面式拖拽/);

  const cues = captions.replace(/\r/g, "").trim().split(/\n{2,}/).slice(1).map((block) => {
    const lines = block.split("\n");
    const timing = lines.find((line) => line.includes(" --> "));
    return { end: seconds(timing.split(" --> ")[1]), text: lines.slice(1).filter(Boolean) };
  });
  assert.ok(cues.length >= 6);
  assert.equal(cues.every((cue) => cue.text.length === 1), true);
  assert.ok(cues.at(-1).end <= 75);
  for (const phrase of ["参考估值", "拖拽", "编辑物品", "导出 JSON"]) assert.match(tutorial, new RegExp(phrase));
});
