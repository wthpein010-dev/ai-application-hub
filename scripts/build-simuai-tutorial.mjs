import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(root, "projects", "simuai", "video");
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    let filePath = join(root, decodeURIComponent(url.pathname).replace(/^\/+/, ""));
    if (url.pathname.endsWith("/")) filePath = join(filePath, "index.html");
    const data = await readFile(filePath);
    response.writeHead(200, { "content-type": mimeTypes.get(extname(filePath)) || "application/octet-stream" });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
await mkdir(videoRoot, { recursive: true });
const origin = `http://127.0.0.1:${server.address().port}`;
const browserCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = browserCandidates.find((candidate) => existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: videoRoot, size: { width: 1280, height: 720 } },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
page.on("requestfailed", (request) => errors.push(`request: ${request.url()} ${request.failure()?.errorText}`));

await page.goto(`${origin}/projects/simuai/index.html`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "小游戏买量回本", exact: true }).waitFor();
const recording = page.video();

await page.waitForTimeout(4000);
await page.locator("#categoryTabs").scrollIntoViewIfNeeded();
await page.getByRole("tab", { name: /趣味脑洞/ }).click();
await page.getByRole("button", { name: /展开.*5 个实验/ }).click();
await page.waitForTimeout(4500);
await page.getByRole("button", { name: "打开生日碰撞概率实验" }).click();
await page.getByRole("heading", { name: "生日碰撞概率", exact: true }).waitFor();
await page.waitForTimeout(4500);
await page.getByRole("button", { name: "柱状" }).click();
await page.waitForTimeout(4500);
await page.locator("#questionForm").scrollIntoViewIfNeeded();
await page.getByLabel("想模拟什么？").fill("小游戏每天买量 5000 元多久回本");
await page.getByRole("button", { name: "匹配实验" }).click();
await page.locator("#searchResults[data-state='matched']").waitFor();
await page.waitForTimeout(4500);
await page.locator("#experimentStage").scrollIntoViewIfNeeded();
await page.getByLabel("每日买量成本精确值").fill("8000");
await page.getByLabel("每日买量成本精确值").press("Enter");
await page.screenshot({ path: join(videoRoot, "poster.jpg"), type: "jpeg", quality: 91 });
await page.waitForTimeout(5500);
await page.getByRole("button", { name: "为什么这样算" }).click();
await page.getByRole("heading", { name: "公式与边界" }).waitFor();
await page.waitForTimeout(5000);
await page.locator("#questionForm").scrollIntoViewIfNeeded();
await page.getByLabel("想模拟什么？").fill("量子香蕉天气会怎样");
await page.getByRole("button", { name: "匹配实验" }).click();
await page.locator("#searchResults[data-state='recommended']").waitFor();
await page.waitForTimeout(5500);
await page.locator("[data-recommendation-id]").nth(1).click();
await page.locator("#experimentStage").scrollIntoViewIfNeeded();
await page.waitForTimeout(5000);
await page.locator("#searchCapability").scrollIntoViewIfNeeded();
await page.waitForTimeout(4000);

await context.close();
await browser.close();
await new Promise((resolve) => server.close(resolve));
if (errors.length) throw new Error(errors.join("\n"));

const webmPath = await recording.path();
const outputPath = join(videoRoot, "simuai-tutorial.mp4");
const conversion = spawnSync(process.env.FFMPEG_PATH || ffmpegPath, [
  "-y", "-hide_banner", "-i", webmPath,
  "-vf", "scale=1280:720:flags=lanczos,fps=30",
  "-an", "-c:v", "libx264", "-profile:v", "high", "-level", "4.0",
  "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
  "-movflags", "+faststart", outputPath,
], { encoding: "utf8" });
if (conversion.status !== 0) throw new Error(conversion.stderr || "ffmpeg conversion failed");
await unlink(webmPath);
process.stdout.write(`${outputPath}\n`);
