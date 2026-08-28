import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(root, "projects", "gamespec-relay", "video");
const rawRoot = join(tmpdir(), "gamespec-relay-video");
const rawVideoPath = join(rawRoot, "gamespec-relay-demo.webm");
const durationSeconds = 168;
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
]);

function browserExecutable() {
  return [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean).find(existsSync);
}

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

await rm(rawRoot, { recursive: true, force: true });
await mkdir(rawRoot, { recursive: true });
await mkdir(videoRoot, { recursive: true });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: rawRoot, size: { width: 1280, height: 720 } },
  acceptDownloads: true,
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
page.on("requestfailed", (request) => errors.push(`request: ${request.url()} ${request.failure()?.errorText}`));
await page.addInitScript(() => localStorage.clear());
await page.goto(`${origin}/projects/gamespec-relay/app/index.html`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "首领二阶段表现优化" }).waitFor();
const recording = page.video();
const startedAt = Date.now();

async function at(second, action) {
  const remaining = second * 1000 - (Date.now() - startedAt);
  if (remaining > 0) await page.waitForTimeout(remaining);
  if (action) await action();
}

await at(8, () => page.locator("#loadSample").click());
await at(15, () => page.locator(".source-pane").evaluate((pane) => { pane.scrollTop = 190; }));
await at(22, () => page.locator("#analyzeButton").click());
await page.locator("#taskLanes [data-role-lane]").first().waitFor({ state: "attached" });
await at(30, () => page.screenshot({ path: join(videoRoot, "poster.jpg"), type: "jpeg", quality: 91 }));
await at(40, () => page.locator(".decision-pane").evaluate((pane) => { pane.scrollTop = 0; }));
await at(48, async () => {
  const question = page.locator("#questionList .question-card").first();
  await question.locator("[data-question-answer]").fill("保持短前摇，低端机同样不跳帧");
  await question.locator("[data-confirm-question]").click();
});
await at(60, () => page.locator('[data-step-target="delivery"]').click());
await at(75, () => page.locator(".delivery-pane").evaluate((pane) => { pane.scrollTop = 260; }));
await at(88, () => page.locator(".delivery-pane").evaluate((pane) => { pane.scrollTop = pane.scrollHeight; }));
await at(100, async () => {
  const drawer = page.locator(".test-drawer");
  await drawer.evaluate((details) => { details.open = true; });
  await page.locator(".delivery-pane").evaluate((pane) => { pane.scrollTop = pane.scrollHeight; });
});
await at(112, () => page.locator(".delivery-pane").evaluate((pane) => { pane.scrollTop = 0; }));
await at(120, () => page.locator("#saveVersion").click());
await at(125, () => page.locator("#loadChangeSample").click());
await at(130, () => page.locator("#analyzeButton").click());
await page.locator("#versionPill", { hasText: "第二版" }).waitFor();
await at(143, () => page.locator('[data-step-target="versions"]').click());
await page.locator("#diffPanel[data-visible='true']").waitFor();
for (const [second, selector] of [
  [150, "#exportMarkdown"],
  [154, "#exportJson"],
  [158, "#exportCsv"],
  [162, "#copyCodex"],
]) {
  await at(second, () => page.locator(selector).click());
}
await at(durationSeconds);

await context.close();
await browser.close();
await new Promise((resolve) => server.close(resolve));
if (errors.length) throw new Error(errors.join("\n"));

const recordedPath = await recording.path();
await copyFile(recordedPath, rawVideoPath);
process.stdout.write(`${rawVideoPath}\n`);
