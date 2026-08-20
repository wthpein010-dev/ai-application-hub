import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const target = resolve(root, `.${normalize(pathname)}`);
  if ((!target.startsWith(root + sep) && target !== root) || !existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404).end();
    return;
  }
  const size = statSync(target).size;
  response.writeHead(200, {
    "Content-Length": size,
    "Content-Type": contentTypes.get(extname(target)) || "application/octet-stream",
  });
  createReadStream(target).pipe(response);
});

async function launchBrowser() {
  const errors = [];
  for (const options of [
    { channel: "chrome", headless: true, args: ["--headless=new"] },
    { headless: true },
    { channel: "msedge", headless: true },
  ]) {
    try { return await chromium.launch(options); } catch (error) { errors.push(error.message); }
  }
  throw new Error(`No Chromium browser available.\n${errors.join("\n")}`);
}

await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await launchBrowser();
const failures = [];

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(`${viewport.name} console: ${message.text()}`);
    });
    page.on("pageerror", (error) => failures.push(`${viewport.name} page: ${error.message}`));
    page.on("requestfailed", (request) => failures.push(`${viewport.name} request: ${request.url()} ${request.failure()?.errorText}`));

    await page.goto(`${origin}/projects/gamespec-relay/index.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelector("#relayLoading")?.classList.contains("is-ready"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

    await page.goto(`${origin}/projects/gamespec-relay/app/index.html`, { waitUntil: "networkidle" });
    await page.locator("#loadSample").click();
    assert.match(await page.locator("#sourceInput").inputValue(), /40%/);
    await page.locator("#analyzeButton").click();
    await page.waitForSelector("[data-task-id]", { state: "attached" });

    assert.ok(await page.locator("[data-role-lane]").count() >= 5);
    assert.ok(await page.locator("[data-acceptance-item]").count() >= 8);
    assert.equal(await page.locator("[data-question-status='open']").count(), 2);

    if (viewport.name === "mobile") await page.locator('[data-step-target="delivery"]').click();
    const firstTask = page.locator("[data-task-title]").first();
    await firstTask.fill("锁定二阶段最终验收口径");
    await firstTask.blur();
    if (viewport.name === "mobile") await page.locator('[data-step-target="decisions"]').click();
    await page.locator("[data-question-answer]").first().fill("采用新版本 B");
    await page.locator("[data-confirm-question]").first().click();
    assert.equal(await page.locator("[data-question-status='confirmed']").count(), 1);

    await page.reload({ waitUntil: "networkidle" });
    if (viewport.name === "mobile") await page.locator('[data-step-target="delivery"]').click();
    assert.equal(await page.locator("[data-task-title]").first().inputValue(), "锁定二阶段最终验收口径");
    if (viewport.name === "mobile") await page.locator('[data-step-target="decisions"]').click();
    assert.equal(await page.locator("[data-question-status='confirmed']").count(), 1);

    await page.locator("#saveVersion").click();
    await page.locator("#loadChangeSample").click();
    if (viewport.name === "mobile") await page.locator('[data-step-target="source"]').click();
    assert.match(await page.locator("#sourceInput").inputValue(), /新版本 B/);
    await page.locator("#analyzeButton").click();
    if (viewport.name === "mobile") await page.locator('[data-step-target="versions"]').click();
    else await page.locator("#openDiff").click();
    await page.waitForSelector("#diffPanel[data-visible='true']");
    assert.ok(Number(await page.locator("#diffChangedCount").textContent()) >= 3);
    assert.ok(await page.locator("[data-affected-test]").count() >= 1);

    for (const id of ["exportMarkdown", "exportJson", "exportCsv"]) {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.locator(`#${id}`).click(),
      ]);
      assert.ok((await download.suggestedFilename()).startsWith("GameSpec-Relay"));
    }
    await page.locator("#copyCodex").click();
    await page.waitForFunction(() => document.querySelector("#exportStatus")?.textContent.includes("Codex"));

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (viewport.name === "mobile") {
      assert.equal(await page.locator(".mobile-steps").evaluate((node) => getComputedStyle(node).display !== "none"), true);
      assert.equal(await page.locator('[data-pane="versions"]').evaluate((node) => !node.hidden), true);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolveServer) => server.close(resolveServer));
}

assert.deepEqual(failures, []);
