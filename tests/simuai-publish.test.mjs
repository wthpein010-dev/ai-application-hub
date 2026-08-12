import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";
import { decodeMedia, inspectMedia } from "./media-inspect.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const homepage = readFileSync(join(root, "index.html"), "utf8");
const apps = loadDefaultAppsFromRuntime(runtime);
process.env.FFMPEG_PATH ||= ffmpegPath;

test("SimuAI follows PlanMap in the application collection with demo and video only", () => {
  const matches = apps.filter((item) => item.id === "simuai");

  assert.equal(matches.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(apps.slice(-2).map((item) => item.id))), ["planmap", "simuai"]);
  const app = matches[0];
  assert.equal(app.name, "SimuAI 万物实验室");
  assert.equal(app.category, "AI 互动实验");
  assert.equal(app.status, "assistant");
  assert.equal(app.badge, "AI 实验工具");
  assert.equal(app.entry, "./projects/simuai/index.html");
  assert.equal(app.video, "./projects/simuai/video/index.html");
  assert.equal(app.package, "");
  assert.match(app.brief, /30 个受控实验/);
  assert.match(app.brief, /5 种图表视图/);
  assert.match(app.brief, /本地匹配/);
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.platforms)),
    {
      web: { href: "./projects/simuai/index.html", label: "演示" },
      windows: "",
      mac: "",
    },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.tags)),
    ["30 个实验", "本地匹配", "曲线切换", "透明模型"],
  );
});

test("SimuAI demo returns to the application catalog and Hub refreshes its runtime", () => {
  const demo = readFileSync(join(root, "projects", "simuai", "index.html"), "utf8");
  assert.match(demo, /class="hub-home-link"/);
  assert.match(demo, /href="\.\.\/\.\.\/index\.html#apps"/);
  assert.match(
    homepage,
    /app-20260706-restore-games\.js\?v=[^"]*simuai-30-experiments/,
  );
});

test("SimuAI exact legacy default copy migrates without a broad overwrite", () => {
  assert.match(runtime, /normalized\.id === "simuai"/);
  assert.match(runtime, /normalized\.brief === "输入一个问题，让 AI 生成可拖动参数、观察曲线的互动实验。"/);
  assert.match(runtime, /normalized\.brief === "输入一个适合量化的问题，从 12 个受控实验中本地匹配模型，拖动参数观察指标、曲线与结论如何变化。"/);
  assert.doesNotMatch(runtime, /normalized\.id === "simuai"[\s\S]{0,500}normalized\.brief = base\.brief;[\s\S]{0,80}normalized\.problem = base\.problem/);
});

test("SimuAI tutorial uses the shared player and returns to applications", () => {
  const videoRoot = join(root, "projects", "simuai", "video");
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");

  assert.match(html, /data-hub-video-page/);
  assert.match(html, /class="hub-video-home" href="\.\.\/\.\.\/\.\.\/index\.html#apps"/);
  assert.match(html, /hub-video-player\.css/);
  assert.match(html, /hub-video-player\.js/);
  assert.match(html, /<video[^>]+preload="none"[^>]+data-src="\.\/simuai-tutorial\.mp4"/);
  assert.match(html, /<track[^>]+src="\.\/simuai-tutorial\.vtt"[^>]+srclang="zh-CN"[^>]+default/);
  assert.ok((html.match(/data-time="/g) || []).length >= 5);

  for (const fileName of ["simuai-tutorial.mp4", "simuai-tutorial.vtt", "poster.jpg", "tutorial-script.md"]) {
    assert.equal(existsSync(join(videoRoot, fileName)), true, `${fileName} should exist`);
  }
});

test("SimuAI tutorial is short H.264 720p with bounded one-line captions", () => {
  const videoRoot = join(root, "projects", "simuai", "video");
  const mediaPath = join(videoRoot, "simuai-tutorial.mp4");
  const media = inspectMedia(mediaPath);
  assert.equal(media.videoCodec, "h264");
  assert.equal(media.width, 1280);
  assert.equal(media.height, 720);
  assert.ok(media.duration > 20 && media.duration < 240, `duration=${media.duration}`);
  const decoded = decodeMedia(mediaPath);
  assert.equal(decoded.status, 0, decoded.stderr || decoded.error?.message);

  const captions = readFileSync(join(videoRoot, "simuai-tutorial.vtt"), "utf8");
  const blocks = captions.replace(/\r/g, "").trim().split(/\n{2,}/).slice(1);
  assert.ok(blocks.length >= 5);
  let previousEnd = 0;
  const toSeconds = (value) => {
    const [hours, minutes, seconds] = value.split(":").map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  };
  for (const block of blocks) {
    const lines = block.split("\n");
    const timing = lines.find((line) => line.includes(" --> "));
    const cueText = lines.filter((line) => line && line !== timing);
    assert.equal(cueText.length, 1, `caption should be one line: ${block}`);
    assert.ok([...cueText[0]].length <= 18, `caption is too wide: ${cueText[0]}`);
    const [start, end] = timing.split(" --> ");
    const startSeconds = toSeconds(start);
    const endSeconds = toSeconds(end);
    assert.ok(startSeconds >= previousEnd, `caption overlaps: ${block}`);
    assert.ok(endSeconds > startSeconds, `invalid caption: ${block}`);
    previousEnd = endSeconds;
  }
  assert.ok(previousEnd <= media.duration + 0.001);
});
