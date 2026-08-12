import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";
import { decodeMedia, inspectMedia } from "./media-inspect.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const apps = loadDefaultAppsFromRuntime(runtime);
const projectRoot = join(root, "projects", "planmap");
const videoRoot = join(projectRoot, "video");
const archivePath = join(root, "downloads", "planmap-source.zip");
process.env.FFMPEG_PATH ||= ffmpegPath;

test("思维导图快捷工具 remains immediately before SimuAI with only demo and video card actions", () => {
  const app = apps.find((item) => item.id === "planmap");

  assert.ok(app, "PlanMap should be present in the catalog");
  assert.deepEqual(JSON.parse(JSON.stringify(apps.slice(-2).map((item) => item.id))), ["planmap", "simuai"]);
  assert.equal(app.name, "思维导图快捷工具");
  assert.equal(app.status, "engineering");
  assert.equal(app.entry, "./projects/planmap/index.html");
  assert.equal(app.video, "./projects/planmap/video/index.html");
  assert.equal(app.package, "");
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.platforms)),
    {
      web: { href: "./projects/planmap/index.html", label: "演示" },
      windows: "",
      mac: "",
    },
  );
});

test("PlanMap demo uses the Hub shell, returns to engineering and exposes the source attachment", () => {
  const html = readFileSync(join(projectRoot, "index.html"), "utf8");

  assert.match(html, /class="hub-subpage planmap-demo-page"/);
  assert.match(html, /href="\.\.\/\.\.\/index\.html#engineering"/);
  assert.match(html, /href="\.\.\/\.\.\/downloads\/planmap-source\.zip"/);
  assert.match(html, /src="\.\/app\/index\.html"/);
  assert.match(html, /assets\/subpage-shell\.css/);
  assert.equal(existsSync(join(projectRoot, "app", "index.html")), true);
});

test("思维导图快捷工具 supports global conversation edits, six structures, three views and open-source model presets", () => {
  const html = readFileSync(join(projectRoot, "app", "index.html"), "utf8");
  const script = readFileSync(join(projectRoot, "app", "app.js"), "utf8");
  const publishedApp = `${html}\n${script}`;

  assert.match(html, /aria-label="AI 对话区"/);
  assert.match(html, /aria-label="脑图画布"/);
  assert.match(html, /aria-label="发送消息"/);
  assert.match(publishedApp, /校园音乐节/);
  assert.match(publishedApp, /清透办公蓝/);
  assert.match(publishedApp, /清新青绿/);
  assert.match(publishedApp, /温暖珊瑚/);
  assert.match(publishedApp, /思维导图快捷工具/);
  assert.match(publishedApp, /brand-logo/);
  assert.match(publishedApp, /脑图 \+ AI/);
  for (const label of [
    "左右脑图", "横向脑图", "树状图", "鱼骨图", "逻辑结构", "时间轴",
    "脑图视图", "大纲模式", "演示模式",
    "Ollama", "LM Studio", "LocalAI", "OpenAI 兼容",
    "PNG 图片", "PDF 文档", "Markdown 大纲", "XMind 文件",
  ]) {
    assert.match(publishedApp, new RegExp(label));
  }
  assert.match(script, /replaceTextGlobally/);
  assert.match(script, /findTextCandidates/);
  assert.match(script, /askCompatibleModel/);
});

test("PlanMap video page uses the shared player and returns to engineering", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");

  assert.match(html, /data-hub-video-page/);
  assert.match(html, /class="hub-video-home" href="\.\.\/\.\.\/\.\.\/index\.html#engineering"/);
  assert.match(html, /data-src="\.\/planmap-demo\.mp4"/);
  assert.match(html, /src="\.\/planmap-demo\.vtt"/);
  assert.match(html, /assets\/hub-video-player\.css/);
  assert.match(html, /assets\/hub-video-player\.js/);
  assert.ok((html.match(/data-time="/g) || []).length >= 5);
});

test("PlanMap tutorial is short browser-playable H.264 with bounded one-line captions", () => {
  const mediaPath = join(videoRoot, "planmap-demo.mp4");
  const media = inspectMedia(mediaPath);

  assert.equal(media.videoCodec, "h264");
  assert.equal(media.width / media.height, 16 / 9);
  assert.ok(media.duration >= 45 && media.duration < 240, `duration=${media.duration}`);
  const decoded = decodeMedia(mediaPath);
  assert.equal(decoded.status, 0, decoded.stderr || decoded.error?.message);
  assert.equal(decoded.stderr.trim(), "");

  const captions = readFileSync(join(videoRoot, "planmap-demo.vtt"), "utf8");
  const blocks = captions.replace(/\r/g, "").trim().split(/\n{2,}/).slice(1);
  assert.ok(blocks.length >= 5);
  let previousEnd = 0;
  for (const block of blocks) {
    const lines = block.split("\n");
    const timing = lines.find((line) => line.includes(" --> "));
    const text = lines.filter((line) => line && line !== timing);
    assert.equal(text.length, 1, `caption should be one line: ${block}`);
    assert.ok([...text[0]].length <= 18, `caption is too wide for a 390px player: ${text[0]}`);
    const [, end] = timing.split(" --> ");
    const toSeconds = (value) => {
      const [hours, minutes, seconds] = value.split(":").map(Number);
      return hours * 3600 + minutes * 60 + seconds;
    };
    const startSeconds = toSeconds(timing.split(" --> ")[0]);
    const endSeconds = toSeconds(end);
    assert.ok(startSeconds >= previousEnd, `overlapping caption: ${block}`);
    assert.ok(endSeconds > startSeconds, `invalid caption: ${block}`);
    previousEnd = endSeconds;
  }
  assert.ok(previousEnd <= media.duration + 0.001);
});

test("PlanMap source attachment is a clean, non-trivial and inspectable ZIP", () => {
  assert.equal(existsSync(archivePath), true);
  assert.ok(statSync(archivePath).size > 100_000);
  const listing = spawnSync("tar", ["-tf", archivePath], { encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  const files = listing.stdout.replaceAll("\\", "/").split(/\r?\n/).filter(Boolean);

  for (const required of [
    "planmap-source/README.md",
    "planmap-source/package.json",
    "planmap-source/package-lock.json",
    "planmap-source/app/components/PlanMapApp.tsx",
    "planmap-source/tests/mindmap.test.mjs",
  ]) {
    assert.equal(files.includes(required), true, `${required} should be packaged`);
  }
  for (const forbidden of ["node_modules/", "dist/", ".git/", ".env"]) {
    assert.equal(files.some((file) => file.includes(forbidden)), false, `${forbidden} should be excluded`);
  }
  const packageJson = spawnSync("tar", ["-xOf", archivePath, "planmap-source/package.json"], { encoding: "utf8" });
  assert.equal(packageJson.status, 0, packageJson.stderr);
  assert.equal(JSON.parse(packageJson.stdout).dependencies.jspdf, "^4.2.1");
});
