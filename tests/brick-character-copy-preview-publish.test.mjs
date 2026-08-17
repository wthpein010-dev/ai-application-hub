import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";
import { inspectMedia } from "./media-inspect.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = join(root, "projects", "brick-character-copy-preview");
const videoRoot = join(projectRoot, "video");
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const home = readFileSync(join(root, "index.html"), "utf8");
process.env.FFMPEG_PATH ||= ffmpegPath;

function seconds(timestamp) {
  const parts = timestamp.split(":").map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function normalizeStoredProject(stored) {
  const defaultApps = loadDefaultAppsFromRuntime(runtime);
  const start = runtime.indexOf("function normalizeApp");
  const end = runtime.indexOf("function projectHref", start);
  const context = {
    globalThis: {},
    defaultApps,
    statusLabel: { assistant: "辅助工具", engineering: "工程体验" },
    OLD_HUB_BRIEF: "",
    HUB_BRIEF: "",
  };
  vm.runInNewContext(
    `function cloneApp(app) { return { ...app, tags: [...app.tags], platforms: { ...(app.platforms || {}) } }; }\n${runtime.slice(start, end)}\nglobalThis.normalizeApp = normalizeApp;`,
    context,
  );
  return context.globalThis.normalizeApp(stored);
}

test("brick copy preview is the final engineering card with truthful actions", () => {
  const apps = loadDefaultAppsFromRuntime(runtime);
  const project = apps.find((app) => app.id === "brick-character-copy-preview");
  const engineering = apps.filter((app) => ["engineering", "ai"].includes(app.status));

  assert.equal(engineering.at(-1).id, project.id);
  assert.equal(project.name, "砖块角色文案预览");
  assert.equal(project.status, "engineering");
  assert.equal(project.badge, "工程体验");
  assert.equal(project.category, "美术设计参考");
  assert.equal(project.platforms.web.label, "演示");
  assert.equal(project.platforms.windows, "");
  assert.equal(project.platforms.mac, "");
  assert.equal(project.package, "");
  assert.equal(project.video, "./projects/brick-character-copy-preview/video/index.html");
  assert.match(home, /20260817-brick-copy-preview-engineering/);
});

test("stored application metadata migrates into the engineering experience section", () => {
  const project = loadDefaultAppsFromRuntime(runtime).find((app) => app.id === "brick-character-copy-preview");
  const normalized = normalizeStoredProject({
    ...project,
    category: "游戏文案工具",
    status: "assistant",
    badge: "美术文案",
    brief: "集中审阅10个砖块角色的名字、梗概与27字图鉴文案，点击任意角色即可同步查看游戏内详情排版。",
    tags: ["角色命名", "27字文案", "图鉴预览", "砖块角色"],
  });

  assert.equal(normalized.category, "美术设计参考");
  assert.equal(normalized.status, "engineering");
  assert.equal(normalized.badge, "工程体验");
  assert.match(normalized.brief, /20个砖块角色/);
  assert.deepEqual(Array.from(normalized.tags), Array.from(project.tags));
});

test("page preserves ten 27-character career roles and adds ten illustrated catalog roles", () => {
  const html = readFileSync(join(projectRoot, "index.html"), "utf8");
  const names = Array.from(html.matchAll(/name:\s*"([^"]+)"/g), (match) => match[1]);
  const copies = Array.from(html.matchAll(/copy:\s*"([^"]+)"/g), (match) => match[1]);
  const images = Array.from(html.matchAll(/image:\s*"\.\/assets\/([^"]+)"/g), (match) => match[1]);

  assert.equal(names.length, 20);
  assert.equal(copies.length, 20);
  assert.equal(copies.slice(0, 10).every((copy) => Array.from(copy).length === 27), true);
  assert.deepEqual(names.slice(10), [
    "原生松弛草",
    "红蝶草公主",
    "冬帽草团子",
    "心草恋爱脑",
    "草场嘻哈仔",
    "蓝蝶萝卜妹",
    "木桩发芽啦",
    "不是棉羊哥",
    "粉镜毛线精",
    "黑镜麦霸总",
  ]);
  assert.equal(images.length, 10);
  assert.equal(images.every((image) => existsSync(join(projectRoot, "assets", image))), true);
  assert.match(html, /<body class="hub-subpage">/);
  assert.match(html, /class="hub-home-link" href="\.\.\/\.\.\/index\.html#engineering"/);
  assert.match(html, /placeholder="搜索代号、名字或文案"/);
  assert.match(html, /id="preview-copy"/);
});

test("video page uses the shared player and a short H.264 walkthrough", () => {
  const page = readFileSync(join(videoRoot, "index.html"), "utf8");
  const mediaPath = join(videoRoot, "brick-character-copy-preview-demo.mp4");

  assert.match(page, /data-hub-video-page/);
  assert.match(page, /class="hub-video-home" href="\.\.\/\.\.\/\.\.\/index\.html#engineering"/);
  assert.match(page, /id="loadVideo"/);
  assert.match(page, /preload="none" data-src="\.\/brick-character-copy-preview-demo\.mp4"/);
  assert.equal(existsSync(mediaPath), true);

  const media = inspectMedia(mediaPath);
  assert.equal(media.videoCodec, "h264");
  assert.deepEqual([media.width, media.height], [1280, 720]);
  assert.ok(media.duration >= 30 && media.duration <= 40);

  const captions = readFileSync(join(videoRoot, "brick-character-copy-preview-demo.vtt"), "utf8");
  const cues = captions.replace(/\r/g, "").trim().split(/\n{2,}/).slice(1).map((block) => {
    const lines = block.split("\n");
    const timing = lines.find((line) => line.includes(" --> "));
    return { end: seconds(timing.split(" --> ")[1]), text: lines.slice(1).filter(Boolean) };
  });
  assert.equal(cues.length, 5);
  assert.equal(cues.every((cue) => cue.text.length === 1), true);
  assert.ok(cues.at(-1).end <= media.duration);
});
