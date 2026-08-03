import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { decodeMedia, inspectMedia } from "./media-inspect.mjs";
import {
  VISUAL_SCHEME_IDS,
  getSchemeVisualState,
} from "../projects/brick-light-motion-lab/lab/visual-model.mjs";
import {
  getPathPlaybackProgress,
} from "../projects/brick-light-motion-lab/lab/motion-model.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const page = readFileSync(join(root, "index.html"), "utf8");

function loadDefaults() {
  const start = runtime.indexOf("const defaultApps = [");
  const closing = /\r?\n\];\r?\n\r?\nlet apps/.exec(runtime.slice(start));
  assert.notEqual(start, -1);
  assert.ok(closing);
  const source = runtime
    .slice(start, start + closing.index + 3)
    .replace("const defaultApps =", "globalThis.defaultApps =")
    .replace(/\bHUB_BRIEF\b/g, '""');
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  return context.globalThis.defaultApps;
}

test("hub publishes the material motion lab once in engineering experiences", () => {
  const defaults = loadDefaults();
  const matches = defaults.filter((app) => app.id === "brick-light-motion-lab");
  assert.equal(matches.length, 1);

  const app = matches[0];
  assert.equal(app.name, "砖块点亮动效实验台");
  assert.equal(app.category, "美术设计参考");
  assert.equal(app.status, "engineering");
  assert.equal(app.tags.includes("美术设计参考"), true);
  assert.equal(app.entry, "./projects/brick-light-motion-lab/index.html");
  assert.equal(app.video, "./projects/brick-light-motion-lab/video/index.html");
  assert.equal(app.package, "");
  assert.match(app.brief, /遮罩与形变/);
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.platforms)),
    { web: "./projects/brick-light-motion-lab/index.html", windows: "", mac: "" },
  );

});

test("demo and video pages use their current Hub shells and return-home paths", () => {
  const projectRoot = join(root, "projects", "brick-light-motion-lab");
  const demo = readFileSync(join(projectRoot, "index.html"), "utf8");
  const video = readFileSync(join(projectRoot, "video", "index.html"), "utf8");

  assert.match(demo, /subpage-shell\.css/);
  assert.match(demo, /class="hub-home-link"/);
  assert.match(demo, /href="\.\.\/\.\.\/index\.html#engineering"/);
  assert.match(demo, /src="\.\/lab\/index\.html"/);
  assert.match(demo, /id="motionLabLoading"/);
  assert.match(demo, /role="progressbar"/);
  assert.match(demo, /loading="eager"/);
  assert.match(demo, /fetchpriority="high"/);
  assert.match(demo, /requestIdleCallback/);
  assert.match(demo, /background-ready/);
  assert.match(video, /data-hub-video-page/);
  assert.match(video, /class="hub-video-home"/);
  assert.match(video, /href="\.\.\/\.\.\/\.\.\/index\.html#engineering"/);
  assert.match(video, /hub-video-player\.css/);
  assert.match(video, /hub-video-player\.js/);
  assert.match(video, /class="hub-video-stage"/);
  assert.match(video, /id="loadVideo"/);
  assert.match(video, /data-src="\.\/brick-light-motion-lab\.mp4"/);
  assert.equal(existsSync(join(projectRoot, "video", "brick-light-motion-lab.mp4")), true);
});

test("the embedded lab exposes ten distinct transition schemes and six slow speeds", () => {
  const labRoot = join(root, "projects", "brick-light-motion-lab", "lab");
  const html = readFileSync(join(labRoot, "index.html"), "utf8");
  const app = readFileSync(join(labRoot, "app.mjs"), "utf8");
  const visual = readFileSync(join(labRoot, "visual-model.mjs"), "utf8");
  const playback = readFileSync(join(labRoot, "playback-model.mjs"), "utf8");
  const loading = readFileSync(join(labRoot, "loading-model.mjs"), "utf8");
  const combined = `${html}\n${app}\n${visual}`;

  assert.match(html, /十个方案/);
  assert.match(app, /VISUAL_SCHEMES/);
  assert.match(app, /getPathPlaybackProgress\(raw, phase\)/);
  assert.doesNotMatch(app, /easeOutCubic/);
  assert.match(visual, /id: 'recommended'/);
  assert.match(visual, /name: '横向百叶窗'/);
  assert.match(visual, /name: '棋盘格拼亮'/);
  assert.match(visual, /name: '轻微 3D 翻面'/);
  assert.match(app, /lower-tile__bright/);
  assert.match(app, /transition-segments/);
  assert.match(app, /edge-covers/);
  assert.match(playback, /\[0\.25, 0\.4, 0\.55, 0\.7, 0\.85, 1\]/);
  assert.match(loading, /completeLoading/);
  assert.doesNotMatch(combined, /柔光扩散|方向扫光|描边充能|波纹唤醒|bloom|sweep|edge-charge|wake-ripple|hybrid-ring/);
});

test("published schemes have distinct transition signatures and keep outbound pacing observable", () => {
  const states = VISUAL_SCHEME_IDS.map((id) => getSchemeVisualState(id, 0.5));
  const signatures = new Set(states.map((state) => JSON.stringify({
    maskType: state.maskType,
    maskProgress: state.maskProgress,
    scaleX: state.tileScaleX,
    scaleY: state.tileScaleY,
    rotateY: state.tileRotateY,
    segments: state.segmentProgress,
    edges: state.edgeProgress,
  })));
  assert.equal(signatures.size, 10);

  assert.equal(getPathPlaybackProgress(0.25, "dragging"), 0.25);
  assert.equal(getPathPlaybackProgress(0.5, "dragging"), 0.5);
  assert.equal(getPathPlaybackProgress(0.75, "dragging"), 0.75);
});

test("home page refreshes the runtime cache key for the new card", () => {
  assert.match(page, /app-20260706-restore-games\.js\?v=[^"]+/);
});

test("tutorial video is a short, decodable 720p H.264 asset", () => {
  const mediaPath = join(root, "projects", "brick-light-motion-lab", "video", "brick-light-motion-lab.mp4");
  const media = inspectMedia(mediaPath);
  assert.equal(media.videoCodec, "h264");
  assert.equal(media.width, 1280);
  assert.equal(media.height, 720);
  assert.ok(media.duration > 20 && media.duration < 240, `duration=${media.duration}`);
  const videoPage = readFileSync(join(root, "projects", "brick-light-motion-lab", "video", "index.html"), "utf8");
  const chapterTimes = [...videoPage.matchAll(/data-time="(\d+)"/g)].map((match) => Number(match[1]));
  assert.ok(chapterTimes.length >= 5);
  assert.ok(chapterTimes.every((time) => time < media.duration), `${chapterTimes.join(",")} / ${media.duration}`);

  const decoded = decodeMedia(mediaPath);
  assert.equal(decoded.status, 0, decoded.stderr);
});
