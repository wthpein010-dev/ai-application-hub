import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";
import { inspectMedia } from "./media-inspect.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const apps = loadDefaultAppsFromRuntime(runtime);
const projectRoot = join(root, "projects", "x-ai-codex-radar");

test("X intelligence forum is the final Hub tool with demo and video only", () => {
  const radar = apps.find((app) => app.id === "x-ai-codex-radar");

  assert.ok(radar, "the Radar catalog card should exist");
  assert.equal(apps.at(-1).id, "x-ai-codex-radar");
  assert.equal(radar.name, "X 情报吧｜AI / Codex 雷达");
  assert.equal(radar.category, "AI 情报工具");
  assert.equal(radar.status, "assistant");
  assert.equal(radar.badge, "网页情报");
  assert.equal(radar.platforms.web.href, "./projects/x-ai-codex-radar/index.html");
  assert.equal(radar.platforms.web.label, "演示");
  assert.equal(radar.platforms.windows, "");
  assert.equal(radar.platforms.mac, "");
  assert.equal(radar.package, "");
  assert.equal(radar.video, "./projects/x-ai-codex-radar/video/index.html");
  assert.match(radar.brief, /马斯克/);
  assert.match(radar.brief, /Tibo/);
  assert.match(radar.brief, /Token／额度重置/);
  assert.match(radar.brief, /中英文/);
  assert.match(radar.brief, /两小时/);
});

test("the public demo clearly separates sample data from the private live site", () => {
  const pagePath = join(projectRoot, "index.html");
  assert.equal(existsSync(pagePath), true, "the public demo should exist");
  const html = readFileSync(pagePath, "utf8");

  assert.match(html, /<title>X 情报吧｜AI \/ Codex 雷达<\/title>/);
  assert.match(html, /示例数据/);
  assert.match(html, /不代表实时|非实时/);
  assert.match(html, /需 ChatGPT 登录/);
  assert.match(html, /https:\/\/ai-codex-radar\.polite-chord-7994\.chatgpt\.site/);
  assert.match(html, /class="hub-home-link"/);
  assert.match(html, /href="\.\.\/\.\.\/index\.html#apps"/);
  assert.match(html, /id="searchInput"/);
  assert.match(html, /data-daily-brief="true"/);
  assert.match(html, /data-quick-status="true"/);
  assert.match(html, /data-priority-section="true"/);
  assert.match(html, /id="priorityGrid"/);
  assert.match(html, /id="threadList"/);
  assert.match(html, /id="threadDetail"/);
  assert.match(html, /data-filter="token"/);
  assert.match(html, /data-filter="tibo"/);
  assert.match(html, /Tibo/);
  assert.match(html, /@thsottiaux/);
  assert.match(html, /data-token-alert="true"/);
  assert.match(html, /Tibo 确认：额度已重置/);
  assert.match(html, /图片长会话多次压缩/);
  assert.match(html, /<details class="token-disclosure"/);
  assert.match(html, /查看中英文内容/);
  assert.match(html, /英文原文/);
  assert.match(html, /中文整理/);
  assert.match(html, /每两小时检查/);
  assert.match(html, /最新可信事件/);
  assert.match(html, /时间待确认/);
  assert.match(html, /https:\/\/x\.com\/thsottiaux\/status\/2091688655828246890/);
  assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
  assert.equal(existsSync(join(projectRoot, "styles.css")), true);
  assert.equal(existsSync(join(projectRoot, "app.js")), true);

  const brief = html.indexOf('data-daily-brief="true"');
  const quickStatus = html.indexOf('data-quick-status="true"');
  const priority = html.indexOf('data-priority-section="true"');
  const threads = html.indexOf('id="threads"');
  assert.ok(brief >= 0 && quickStatus > brief && priority > quickStatus && threads > priority);
});

test("the demo script provides local filtering, detail inspection and reset", () => {
  const scriptPath = join(projectRoot, "app.js");
  assert.equal(existsSync(scriptPath), true, "the demo interaction script should exist");
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /addEventListener\(["']input["']/);
  assert.match(script, /addEventListener\(["']click["']/);
  assert.match(script, /renderThreads/);
  assert.match(script, /renderDetail/);
  assert.match(script, /resetFilters/);
  assert.match(script, /ChatGPT Sites/);
  assert.match(script, /thsottiaux/);
  assert.match(script, /2091407991736332689/);
  assert.match(script, /2091033630147854385/);
  assert.match(script, /You should feel a positive difference/);
  assert.match(readFileSync(join(projectRoot, "index.html"), "utf8"), /aria-live="polite"/);
  assert.doesNotMatch(script, /\bscore\b|SCORE/);
  assert.doesNotMatch(readFileSync(join(projectRoot, "index.html"), "utf8"), /按价值排序/);
});

test("the Radar video bundle follows the shared Hub player contract", () => {
  const videoRoot = join(projectRoot, "video");
  const pagePath = join(videoRoot, "index.html");
  const mediaPath = join(videoRoot, "x-ai-codex-radar-demo.mp4");
  const captionsPath = join(videoRoot, "x-ai-codex-radar-demo.vtt");

  assert.equal(existsSync(pagePath), true, "the video page should exist");
  assert.equal(existsSync(mediaPath), true, "the H.264 walkthrough should exist");
  assert.equal(existsSync(captionsPath), true, "the Chinese captions should exist");
  assert.equal(existsSync(join(videoRoot, "poster.jpg")), true, "the video poster should exist");
  assert.equal(existsSync(join(videoRoot, "tutorial-script.md")), true, "the walkthrough script should exist");

  const media = inspectMedia(mediaPath);
  assert.equal(media.videoCodec, "h264");
  assert.equal(media.width, 1280);
  assert.equal(media.height, 720);
  assert.ok(media.duration >= 60 && media.duration <= 90, `walkthrough duration should be 60-90 seconds, received ${media.duration}`);

  const html = readFileSync(pagePath, "utf8");
  const captions = readFileSync(captionsPath, "utf8");
  const tutorial = readFileSync(join(videoRoot, "tutorial-script.md"), "utf8");
  assert.match(html, /data-hub-video-page/);
  assert.match(html, /class="hub-video-home" href="\.\.\/\.\.\/\.\.\/index\.html#apps"/);
  assert.match(html, /id="loadVideo"/);
  assert.match(html, /preload="none"/);
  assert.match(html, /data-src="\.\/x-ai-codex-radar-demo\.mp4"/);
  assert.match(html, /src="\.\/x-ai-codex-radar-demo\.vtt"/);
  assert.match(html, /\.\.\/\.\.\/\.\.\/assets\/hub-video-player\.css/);
  assert.match(html, /\.\.\/\.\.\/\.\.\/assets\/hub-video-player\.js/);
  assert.match(captions, /^WEBVTT/);
  assert.match(html, /中英文/);
  assert.match(tutorial, /展开.*中英文/);
  assert.match(captions, /每两小时/);
  assert.match(html, /data-time="9"[^>]*><time>00:09<\/time><span>中英文原文下拉/);
  assert.match(captions, /00:00:09\.000 -->[\s\S]*展开提醒可同时查看/);

  const finalCueEnd = [...captions.matchAll(/-->\s*(\d{2}):(\d{2}):(\d{2}\.\d{3})/g)].at(-1);
  assert.ok(finalCueEnd, "captions should include at least one complete timing cue");
  const finalCueSeconds = Number(finalCueEnd[1]) * 3600 + Number(finalCueEnd[2]) * 60 + Number(finalCueEnd[3]);
  assert.ok(finalCueSeconds <= media.duration + 0.25, "captions should not extend past the video");

  for (const block of captions.replace(/\r/g, "").trim().split(/\n{2,}/).slice(1)) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => line.includes(" --> "));
    if (timingIndex >= 0) assert.equal(lines.slice(timingIndex + 1).filter(Boolean).length, 1);
  }
});

test("CI runs the Radar desktop, mobile and playback acceptance", () => {
  const workflow = readFileSync(join(root, ".github", "workflows", "verify-clickflow-publish.yml"), "utf8");
  assert.match(workflow, /Run all Hub page browser acceptance[\s\S]*node tests\/x-ai-codex-radar-browser-smoke\.mjs/);
});
