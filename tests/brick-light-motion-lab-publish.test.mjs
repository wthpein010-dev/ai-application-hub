import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { decodeMedia, inspectMedia } from "./media-inspect.mjs";

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

test("hub publishes the material motion lab once at the end of engineering experiences", () => {
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
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.platforms)),
    { web: "./projects/brick-light-motion-lab/index.html", windows: "", mac: "" },
  );

  const engineering = defaults.filter((item) => item.status === "engineering");
  assert.equal(engineering.at(-1).id, app.id);
});

test("demo and video pages use the Hub shell and return-home path", () => {
  const projectRoot = join(root, "projects", "brick-light-motion-lab");
  const demo = readFileSync(join(projectRoot, "index.html"), "utf8");
  const video = readFileSync(join(projectRoot, "video", "index.html"), "utf8");

  for (const html of [demo, video]) {
    assert.match(html, /subpage-shell\.css/);
    assert.match(html, /class="hub-home-link"/);
    assert.match(html, /href="\.\.\/\.\.\/index\.html#games"|href="\.\.\/\.\.\/\.\.\/index\.html#games"/);
  }

  assert.match(demo, /src="\.\/lab\/index\.html"/);
  assert.match(video, /id="loadVideo"/);
  assert.match(video, /data-src="\.\/brick-light-motion-lab\.mp4"/);
  assert.equal(existsSync(join(projectRoot, "video", "brick-light-motion-lab.mp4")), true);
});

test("the embedded lab exposes ten material-only schemes and six slow speeds", () => {
  const labRoot = join(root, "projects", "brick-light-motion-lab", "lab");
  const html = readFileSync(join(labRoot, "index.html"), "utf8");
  const app = readFileSync(join(labRoot, "app.mjs"), "utf8");
  const visual = readFileSync(join(labRoot, "visual-model.mjs"), "utf8");
  const playback = readFileSync(join(labRoot, "playback-model.mjs"), "utf8");
  const combined = `${html}\n${app}\n${visual}`;

  assert.match(html, /十个方案/);
  assert.match(app, /VISUAL_SCHEMES/);
  assert.match(visual, /id: 'recommended'/);
  assert.match(playback, /\[0\.25, 0\.4, 0\.55, 0\.7, 0\.85, 1\]/);
  assert.doesNotMatch(combined, /柔光扩散|方向扫光|描边充能|波纹唤醒|bloom|sweep|edge-charge|wake-ripple|hybrid-ring/);
});

test("home page refreshes the runtime cache key for the new card", () => {
  assert.match(page, /app-20260706-restore-games\.js\?v=20260722-brick-motion-v3/);
});

test("tutorial video is a short, decodable 720p H.264 asset", () => {
  const mediaPath = join(root, "projects", "brick-light-motion-lab", "video", "brick-light-motion-lab.mp4");
  const media = inspectMedia(mediaPath);
  assert.equal(media.videoCodec, "h264");
  assert.equal(media.width, 1280);
  assert.equal(media.height, 720);
  assert.ok(media.duration > 25 && media.duration < 240, `duration=${media.duration}`);

  const decoded = decodeMedia(mediaPath);
  assert.equal(decoded.status, 0, decoded.stderr);
});
