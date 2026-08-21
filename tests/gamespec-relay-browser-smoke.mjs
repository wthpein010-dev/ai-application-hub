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
    assert.deepEqual(await page.locator("[data-step-target]").allTextContents(), [
      "1放进讨论和文档",
      "2把决定与疑问说清楚",
      "3分清谁来做、怎么验",
      "4对比新旧版本影响",
    ]);
    if (viewport.name === "mobile") {
      assert.ok(await page.locator("#loadSample").evaluate((node) => node.getBoundingClientRect().height >= 44));
    }
    await page.locator("#loadSample").click();
    assert.match(await page.locator("#sourceInput").inputValue(), /40%/);
    assert.equal(/[A-Za-z]/.test(await page.locator("#sourceInput").inputValue()), false);
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
    await page.locator("[data-question-answer]").first().fill("采用新版本乙");
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
    assert.match(await page.locator("#sourceInput").inputValue(), /新版本乙/);
    await page.locator("#analyzeButton").click();
    if (viewport.name === "mobile") await page.locator('[data-step-target="versions"]').click();
    else await page.locator("#openDiff").click();
    await page.waitForSelector("#diffPanel[data-visible='true']");
    assert.ok(Number(await page.locator("#diffChangedCount").textContent()) >= 3);
    assert.ok(await page.locator("[data-affected-test]").count() >= 1);

    const expectedDownloads = new Map([
      ["exportMarkdown", "需求接力站-交付文档.md"],
      ["exportJson", "需求接力站-数据备份.json"],
      ["exportCsv", "需求接力站-任务表格.csv"],
    ]);
    for (const [id, expectedName] of expectedDownloads) {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.locator(`#${id}`).click(),
      ]);
      assert.equal(await download.suggestedFilename(), expectedName);
    }
    await page.locator("#copyCodex").click();
    await page.waitForFunction(() => document.querySelector("#exportStatus")?.textContent.includes("开发助手包"));

    const readability = await page.evaluate(() => {
      const visible = (node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const directText = (node) => Array.from(node.childNodes).some((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
      const tooSmall = Array.from(document.querySelectorAll("body *"))
        .filter((node) => visible(node) && directText(node) && !["SCRIPT", "STYLE"].includes(node.tagName))
        .map((node) => ({ tag: node.tagName, text: node.textContent.trim().slice(0, 30), size: Number.parseFloat(getComputedStyle(node).fontSize) }))
        .filter((item) => item.size < 14);
      const smallButtons = Array.from(document.querySelectorAll("button, .ghost-button"))
        .filter(visible)
        .map((node) => ({ text: node.textContent.trim(), size: Number.parseFloat(getComputedStyle(node).fontSize) }))
        .filter((item) => item.size < 15);
      return { tooSmall, smallButtons, visibleText: document.body.innerText };
    });
    assert.deepEqual(readability.tooSmall, []);
    assert.deepEqual(readability.smallButtons, []);
    assert.equal(/[A-Za-z]/.test(readability.visibleText), false, readability.visibleText.match(/.{0,16}[A-Za-z].{0,16}/)?.[0]);

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
