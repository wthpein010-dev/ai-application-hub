import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";
import { inspectMedia } from "./media-inspect.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(root, "projects", "gamespec-relay", "video");
const pagePath = join(videoRoot, "index.html");
const videoPath = join(videoRoot, "gamespec-relay-demo.mp4");
const captionsPath = join(videoRoot, "gamespec-relay-demo.vtt");
const posterPath = join(videoRoot, "poster.jpg");
const manifestPath = join(videoRoot, "recording-manifest.json");
const recordingScriptPath = join(root, "scripts", "record-gamespec-relay-demo.mjs");
process.env.FFMPEG_PATH ||= ffmpegPath;

function timestampSeconds(value) {
  const parts = value.split(":").map(Number);
  return parts.length === 2
    ? parts[0] * 60 + parts[1]
    : parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function parseVtt(source) {
  return source.replace(/\r/g, "").trim().split(/\n{2,}/).slice(1).map((block) => {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => line.includes(" --> "));
    assert.notEqual(timingIndex, -1, `caption cue is missing timing: ${block}`);
    const [start, end] = lines[timingIndex].split(" --> ");
    return {
      start: timestampSeconds(start.trim()),
      end: timestampSeconds(end.trim().split(/\s/, 1)[0]),
      text: lines.slice(timingIndex + 1).filter(Boolean),
    };
  });
}

function browserExecutable() {
  return [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean).find(existsSync);
}

function mimeType(filePath) {
  return new Map([
    [".css", "text/css; charset=utf-8"],
    [".html", "text/html; charset=utf-8"],
    [".jpg", "image/jpeg"],
    [".js", "text/javascript; charset=utf-8"],
    [".mp4", "video/mp4"],
    [".vtt", "text/vtt; charset=utf-8"],
  ]).get(extname(filePath)) || "application/octet-stream";
}

async function startMediaServer() {
  const rangeRequests = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
      let filePath = normalize(join(root, relativePath));
      if (url.pathname.endsWith("/")) filePath = join(filePath, "index.html");
      assert.ok(filePath.startsWith(root), "test server path stays inside the repository");
      const body = await readFile(filePath);
      const range = request.headers.range;
      if (range && extname(filePath) === ".mp4") {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        const start = Number(match?.[1] || 0);
        const requestedEnd = match?.[2] ? Number(match[2]) : start + 1024 * 1024 - 1;
        const end = Math.min(requestedEnd, body.length - 1);
        rangeRequests.push({ start, end, total: body.length });
        response.writeHead(206, {
          "accept-ranges": "bytes",
          "content-length": end - start + 1,
          "content-range": `bytes ${start}-${end}/${body.length}`,
          "content-type": "video/mp4",
        });
        response.end(body.subarray(start, end + 1));
        return;
      }
      response.writeHead(200, {
        "accept-ranges": extname(filePath) === ".mp4" ? "bytes" : "none",
        "content-length": body.length,
        "content-type": mimeType(filePath),
      });
      response.end(body);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500);
      response.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    rangeRequests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("tutorial page uses the shared player and complete workflow chapters", async () => {
  assert.equal(existsSync(pagePath), true, "the tutorial page should exist");
  const html = await readFile(pagePath, "utf8");

  assert.match(html, /href="\.\.\/\.\.\/\.\.\/assets\/hub-video-player\.css"/);
  assert.match(html, /src="\.\.\/\.\.\/\.\.\/assets\/hub-video-player\.js"/);
  assert.match(html, /class="hub-video-home" href="\.\.\/\.\.\/\.\.\/index\.html#apps"/);
  assert.match(html, /id="loadVideo"/);
  assert.match(html, /preload="none" data-src="\.\/gamespec-relay-demo\.mp4"/);
  assert.match(html, /kind="captions"[^>]+default/);
  assert.match(html, /<title>游戏需求开工台教学视频<\/title>/);
  assert.match(html, /把游戏讨论和文档拆成能开工、能验收的任务/);
  assert.doesNotMatch(html, /需求接力站/);
  assert.doesNotMatch(html, />\s*(?:GameSpec Relay|Agent|Boss|V2|MP4)\s*</);
  assert.deepEqual(
    Array.from(html.matchAll(/data-time="(\d+)"/g), (match) => Number(match[1])),
    [0, 15, 40, 75, 120, 150],
  );
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.durationSeconds, 168);
  assert.deepEqual(manifest.chapters.map((chapter) => chapter.start), [0, 15, 40, 75, 120, 150, 168]);
});

test("recording waits for generated task data before switching to the hidden task pane", async () => {
  const source = await readFile(recordingScriptPath, "utf8");

  assert.match(source, /#taskLanes \[data-role-lane\][\s\S]*waitFor\(\{\s*state:\s*"attached"/);
});

test("tutorial captions stay one line and teach the entire relay workflow", async () => {
  assert.equal(existsSync(captionsPath), true, "the tutorial captions should exist");
  const source = await readFile(captionsPath, "utf8");
  const cues = parseVtt(source);
  const text = cues.flatMap((cue) => cue.text).join(" ");

  assert.ok(cues.length >= 10);
  assert.equal(cues.every((cue) => cue.text.length === 1), true);
  assert.equal(cues.every((cue, index) => cue.start < cue.end && (!index || cue.start >= cues[index - 1].end)), true);
  for (const phrase of ["游戏需求开工台", "首领示例", "决定", "待确认", "跨职能", "验收标准", "健康度", "第二版", "变更影响", "文档版", "数据备份", "任务表格", "开发助手包"]) {
    assert.match(text, new RegExp(phrase));
  }
  assert.equal(/[A-Za-z]/.test(text), false, "captions should not expose English copy");
});

test("tutorial media is a browser-compatible three-minute H.264 recording", async () => {
  assert.equal(existsSync(videoPath), true, "the tutorial MP4 should exist");
  assert.equal(existsSync(posterPath), true, "the tutorial poster should exist");
  assert.ok((await stat(videoPath)).size > 1_000_000);
  assert.ok((await stat(posterPath)).size > 10_000);

  const media = inspectMedia(videoPath);
  assert.equal(media.videoCodec, "h264");
  assert.deepEqual([media.width, media.height], [1280, 720]);
  assert.ok(media.duration >= 150 && media.duration <= 210, `duration was ${media.duration}s`);

  const probe = spawnSync(process.env.FFMPEG_PATH, ["-hide_banner", "-i", videoPath], { encoding: "utf8" });
  const output = `${probe.stdout || ""}${probe.stderr || ""}`;
  assert.match(output, /Video:\s*h264[^\n]*yuv420p/);
  const cues = parseVtt(await readFile(captionsPath, "utf8"));
  assert.ok(cues.at(-1).end <= media.duration);

  const poster = await readFile(posterPath);
  assert.deepEqual(Array.from(poster.subarray(0, 3)), [0xff, 0xd8, 0xff]);
});

test("video loads only after a click, plays with showing captions, and serves byte ranges", async () => {
  assert.equal(existsSync(videoPath), true, "the tutorial MP4 should exist before playback testing");
  const mediaServer = await startMediaServer();
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => errors.push(`request: ${request.url()} ${request.failure()?.errorText}`));

  try {
    await page.goto(`${mediaServer.origin}/projects/gamespec-relay/video/index.html`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#introVideo").getAttribute("src"), null);
    assert.equal(mediaServer.rangeRequests.length, 0);
    await page.locator("#loadVideo").click();
    await page.waitForFunction(() => {
      const video = document.querySelector("#introVideo");
      return video && video.currentTime > 0.25;
    });
    const playback = await page.locator("#introVideo").evaluate((video) => ({
      currentTime: video.currentTime,
      error: video.error?.message || "",
      readyState: video.readyState,
      trackMode: video.textTracks[0]?.mode || "missing",
    }));
    assert.ok(playback.currentTime > 0.25);
    assert.equal(playback.error, "");
    assert.ok(playback.readyState >= 2);
    assert.equal(playback.trackMode, "showing");
    assert.ok(mediaServer.rangeRequests.length > 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await mediaServer.close();
  }
});
