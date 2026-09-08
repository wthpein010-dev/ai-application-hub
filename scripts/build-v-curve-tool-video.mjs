import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";

// Records the actual shipped app and its controls; no reconstructed chart images.
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const videoRoot = join(root, "projects/v-curve-tool/video");
const evidenceRoot = join(root, "artifacts/v-curve-v150");
const sourceRoot = resolve(process.env.VCURVE_SOURCE_ROOT || join(root, "build/v-curve-tool"));
await mkdir(evidenceRoot, { recursive: true });
const recordingRoot = await mkdtemp(join(evidenceRoot, "recording-"));
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    let target = resolve(root, `.${pathname}`);
    if (target !== root && !target.startsWith(root + sep)) throw new Error("outside root");
    if (!extname(target)) target = join(target, "index.html");
    const body = await readFile(target);
    response.writeHead(200, { "content-type": mime[extname(target)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, chromium.executablePath(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((path) => path && existsSync(path));
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 810 },
  recordVideo: { dir: recordingRoot, size: { width: 1280, height: 720 } },
  acceptDownloads: true,
});
const page = await context.newPage();
const video = page.video();
const recordStarted = performance.now();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
const evidence = { version: "1.5.0", segments: [], errors };
let trimStart;
async function ready() {
  await page.locator("#export-json").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("#export-json").disabled, null, { timeout: 120_000 });
}
async function segment(label, action) {
  const start = performance.now();
  evidence.segments.push({ label, startSeconds: (start - recordStarted) / 1000 - trimStart });
  await action();
  const remaining = 9000 - (performance.now() - start);
  if (remaining > 0) await page.waitForTimeout(remaining);
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/projects/v-curve-tool/app/index.html`, { waitUntil: "networkidle" });
  await ready();
  await page.evaluate(() => document.fonts.ready);
  trimStart = (performance.now() - recordStarted) / 1000;
  await segment("双模型与双侧关卡", async () => {
    await page.locator("#model-select").scrollIntoViewIfNeeded();
    evidence.defaultModel = await page.locator("#model-select").inputValue();
    evidence.leftCount = await page.locator("#left-level-select option").count();
  });
  await segment("一键参考示例", async () => {
    await page.locator("#load-reference-sample").click();
    await ready();
    await page.locator(".charts-grid").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(videoRoot, "poster.jpg"), type: "jpeg", quality: 92 });
    await page.screenshot({ path: join(evidenceRoot, "reference-charts.png") });
  });
  await segment("独立切换关卡", async () => {
    await page.locator("#left-level-select").scrollIntoViewIfNeeded();
    const alternate = await page.locator("#left-level-select option").evaluateAll((options) => options.find((option) => !option.textContent.includes("900121"))?.value);
    if (!alternate) throw new Error("The built-in Sheep library is missing");
    await page.locator("#left-level-select").selectOption(alternate);
    await ready();
    const packageJson = JSON.parse(await readFile(join(sourceRoot, "package.json"), "utf8"));
    const levels = join(sourceRoot, packageJson.build.mac.extraResources.find((resource) => resource.to === "Editorlevel").from);
    const levelNames = await readdir(levels);
    const file = levelNames.find((name) => /^level_0024.*\.json$/u.test(name));
    if (!file) throw new Error("Missing real Paws level 0024 for import demonstration");
    await page.locator("#right-file-input").setInputFiles(join(levels, file));
    await ready();
    evidence.importedPaws = file;
    evidence.sourcePackageVersion = packageJson.version;
    evidence.pawsSourceCount = levelNames.filter((name) => name.endsWith(".json")).length;
  });
  await segment("工程模型", async () => {
    await page.locator("#model-select").scrollIntoViewIfNeeded();
    await page.locator("#model-select").selectOption("runtime");
    await ready();
    await page.locator(".charts-grid").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(evidenceRoot, "runtime-charts.png") });
  });
  await segment("悬停查看曲线", async () => {
    const chart = page.locator("#left-chart");
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    await page.mouse.move(box.x + box.width * 0.26, box.y + box.height * 0.43);
    await page.waitForTimeout(2500);
    await page.mouse.move(box.x + box.width * 0.51, box.y + box.height * 0.55);
  });
  await segment("导出完整报告", async () => {
    await page.locator("#export-json").scrollIntoViewIfNeeded();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-json").click();
    const download = await downloadPromise;
    await download.saveAs(join(evidenceRoot, "demo-report.json"));
    evidence.exportedReport = download.suggestedFilename();
    await page.locator(".metrics-card").scrollIntoViewIfNeeded();
  });
  await page.waitForTimeout(1000);
  if (errors.length) throw new Error(`Video browser errors: ${errors.join("; ")}`);
} finally {
  await page.close();
  await context.close();
  await browser.close();
  server.close();
}
const webmPath = await video.path();
const encoded = spawnSync(process.env.FFMPEG_PATH || ffmpegPath, [
  "-y", "-ss", String(trimStart), "-i", webmPath, "-vf", "tpad=stop_mode=clone:stop_duration=2", "-t", "55", "-an",
  "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  join(videoRoot, "v-curve-tool-demo.mp4"),
], { stdio: "inherit" });
if (encoded.status !== 0) throw new Error(`ffmpeg exited ${encoded.status}`);
for (let index = 0; index < evidence.segments.length; index += 1) {
  if (Math.abs(evidence.segments[index].startSeconds - index * 9) > 1) {
    throw new Error(`Segment ${index + 1} exceeded its chapter time; adjust the script before publishing`);
  }
}
evidence.sourceWebm = relative(root, webmPath);
evidence.trimStartSeconds = trimStart;
await writeFile(join(evidenceRoot, "video-recording.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
