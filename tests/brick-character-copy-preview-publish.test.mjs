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
  assert.match(home, /20260818-brick-preview-feishu-upload/);
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

test("page preserves career copy and synchronizes the confirmed Feishu skin content", () => {
  const html = readFileSync(join(projectRoot, "index.html"), "utf8");
  const names = Array.from(html.matchAll(/name:\s*"([^"]+)"/g), (match) => match[1]);
  const summaries = Array.from(html.matchAll(/summary:\s*"([^"]+)"/g), (match) => match[1]);
  const copies = Array.from(html.matchAll(/copy:\s*"([^"]+)"/g), (match) => match[1]);
  const images = Array.from(html.matchAll(/image:\s*"\.\/assets\/([^"]+)"/g), (match) => match[1]);

  assert.equal(names.length, 20);
  assert.equal(summaries.length, 20);
  assert.equal(copies.length, 20);
  assert.equal(copies.slice(0, 10).every((copy) => Array.from(copy).length === 27), true);
  assert.deepEqual(names.slice(10).map((name, index) => ({
    name,
    summary: summaries[index + 10],
    copy: copies[index + 10],
  })), [
    { name: "原皮战神", summary: "/", copy: "没有配饰也敢直接出场，原皮才是最强皮肤。" },
    { name: "邻家甜妹", summary: "甜妹能量满格，烦恼暂不接待", copy: "少女能量上线，专治阴天、困倦和隔壁那位的坏心情。" },
    { name: "冬帽草团子", summary: "帽檐压住寒风，没压住一脸小脾气", copy: "红色暖帽裹住嫩青草，疲惫感瞬间被自然气息治愈。" },
    { name: "满眼心动", summary: "爱心镜片映出主角，快乐这回不用向外借", copy: "粉红滤镜只认本人，所有温柔最后都回到自己身上。" },
    { name: "草场从容哥", summary: "绿帽压着青草，松弛感铺满草场", copy: "出门太急拿错了那顶，回头率却直接拉满；小尴尬也算限定装扮。" },
    { name: "萝卜界甜心", summary: "蓝蝴蝶结晃一下，甜妹能量满格", copy: "蓝蝶结搭配橙色胡萝卜，甜妹能量已经全部补充完毕。" },
    { name: "枯木逢春", summary: "不是不开心，只是笑容正在冬眠，预计开春重新加载", copy: "身体还是老木桩，头顶已经偷偷把春天更新到最新版。" },
    { name: "咩羊哥", summary: "不是哥们，棉花怎么突然长出羊脸了！", copy: "只要没人说破，它就同时保持棉花和小羊两种状态。" },
    { name: "超前毛线团", summary: "粉镜配毛线团，也能走出时尚秀", copy: "粉色镜框镇住混乱，纠缠半天反而织出了高级感。" },
    { name: "黑镜麦霸总", summary: "墨镜一戴气场全开，麦穗也当霸总", copy: "别的庄稼迎风弯腰，他扶了扶墨镜，静候秋天亲自递上分红。" },
  ]);
  assert.deepEqual(images, [
    "career-meituan-rider.png",
    "career-taobao-flash-rider.png",
    "career-jd-courier.png",
    "career-sf-courier.png",
    "career-basketball-player.png",
    "career-suited-boss.png",
    "career-grid-programmer.png",
    "career-construction-worker.png",
    "career-male-server.png",
    "career-female-server.png",
    "native-grass.png",
    "red-bow-grass.png",
    "winter-hat-grass.png",
    "heart-grass.png",
    "hiphop-grass.png",
    "carrot-grass.png",
    "sprout-stump.png",
    "cotton-sheep.png",
    "pink-glasses-yarn.png",
    "black-glasses-wheat.png",
  ]);
  assert.equal(images.every((image) => existsSync(join(projectRoot, "assets", image))), true);
  assert.match(html, /<body class="hub-subpage">/);
  assert.match(html, /class="hub-home-link" href="\.\.\/\.\.\/index\.html#engineering"/);
  assert.match(html, /placeholder="搜索代号、名字或文案"/);
  assert.match(html, /id="preview-copy"/);
});

test("brick character preview uses the portrait in-game detail artwork contract", () => {
  const html = readFileSync(join(projectRoot, "index.html"), "utf8");
  const requiredAssets = [
    "tujian_juese_title.png",
    "tujian_juese_turn.png",
    "tujian_jues_save1.png",
    "tujian_jues_save2.png",
    "tujian_btn_bright.png",
  ];

  for (const asset of requiredAssets) {
    assert.equal(existsSync(join(projectRoot, "assets", asset)), true, `${asset} should be bundled`);
    assert.match(html, new RegExp(`\\./assets/${asset.replaceAll(".", "\\.")}`));
  }

  assert.match(html, /class="game-detail-overlay"/);
  assert.match(html, /class="game-detail-panel"/);
  assert.match(html, /id="preview-prev"/);
  assert.match(html, /id="preview-next"/);
  assert.match(html, /id="preview-favorite"/);
  assert.match(html, /id="preview-action"/);
  assert.match(html, /border-image-source:\s*url\("\.\/assets\/tujian_btn_bright\.png"\)/);
  assert.match(html, /\.artwork-fixed\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(html, /\.character-image\s*\{[^}]*object-fit:\s*contain/s);
  assert.doesNotMatch(html, /<img[^>]+class="[^\"]*(?:title|turn|save)[^\"]*"[^>]+style="[^"]*(?:width|height):\s*100%/i);
});

test("video page uses the shared player and a short H.264 walkthrough", () => {
  const page = readFileSync(join(videoRoot, "index.html"), "utf8");
  const mediaPath = join(videoRoot, "brick-character-copy-preview-demo.mp4");
  const tutorial = readFileSync(join(videoRoot, "tutorial-script.md"), "utf8");

  assert.match(page, /data-hub-video-page/);
  assert.match(page, /class="hub-video-home" href="\.\.\/\.\.\/\.\.\/index\.html#engineering"/);
  assert.match(page, /id="loadVideo"/);
  assert.match(page, /preload="none" data-src="\.\/brick-character-copy-preview-demo\.mp4"/);
  assert.match(page, /竖版图鉴详情/);
  assert.match(tutorial, /左右切换与收藏状态/);
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
  assert.match(captions, /参考游戏内样式/);
  assert.ok(cues.at(-1).end <= media.duration);
});
