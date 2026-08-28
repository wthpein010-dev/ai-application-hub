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
    const shellTextSizes = await page.locator(".hub-home-link, .relay-wordmark__mark").evaluateAll((nodes) =>
      nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
    );
    assert.ok(shellTextSizes.every((size) => size >= 15), `shell text fell below 15px: ${shellTextSizes.join(", ")}`);

    await page.goto(`${origin}/projects/gamespec-relay/app/index.html`, { waitUntil: "networkidle" });
    assert.deepEqual(await page.locator("[data-step-target]").allTextContents(), [
      "1放入讨论与文档",
      "2核对决定与疑问",
      "3生成开工任务与验收",
      "4查看改动影响",
    ]);
    if (viewport.name === "mobile") {
      const mobileControlHeights = await page.locator("button, .ghost-button").evaluateAll((nodes) =>
        nodes
          .filter((node) => node.getBoundingClientRect().width > 0)
          .map((node) => Math.round(node.getBoundingClientRect().height)),
      );
      assert.ok(mobileControlHeights.length > 0);
      assert.ok(
        mobileControlHeights.every((height) => height >= 46),
        `mobile control fell below 46px: ${mobileControlHeights.join(", ")}`,
      );
    }
    await page.locator("#loadSample").click();
    assert.match(await page.locator("#sourceInput").inputValue(), /40%/);
    assert.equal(/[A-Za-z]/.test(await page.locator("#sourceInput").inputValue()), false);
    await page.locator("#analyzeButton").click();
    await page.waitForSelector("[data-task-id]", { state: "attached" });

    assert.deepEqual(
      await page.locator("[data-role-lane]").evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-role-lane")),
      ),
      ["策划", "客户端", "特效", "音频", "动画", "测试"],
    );
    assert.ok(await page.locator("[data-acceptance-item]").count() >= 8);
    assert.equal(await page.locator("[data-question-status='open']").count(), 2);

    await page.locator('[data-step-target="delivery"]').click();
    const firstTask = page.locator("[data-task-title]").first();
    await firstTask.fill("锁定二阶段最终验收口径");
    await firstTask.blur();
    await page.locator('[data-step-target="decisions"]').click();
    await page.locator("[data-question-answer]").first().fill("采用新版本乙");
    await page.locator("[data-confirm-question]").first().click();
    assert.equal(await page.locator("[data-question-status='confirmed']").count(), 1);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator('[data-step-target="delivery"]').click();
    assert.equal(await page.locator("[data-task-title]").first().inputValue(), "锁定二阶段最终验收口径");
    await page.locator('[data-step-target="decisions"]').click();
    assert.equal(await page.locator("[data-question-status='confirmed']").count(), 1);

    await page.locator("#saveVersion").click();
    await page.locator("#loadChangeSample").click();
    await page.locator('[data-step-target="source"]').click();
    assert.match(await page.locator("#sourceInput").inputValue(), /新版本乙/);
    await page.locator("#analyzeButton").click();
    await page.locator('[data-step-target="versions"]').click();
    await page.waitForSelector("#diffPanel[data-visible='true']");
    assert.ok(Number(await page.locator("#diffChangedCount").textContent()) >= 3);
    assert.ok(await page.locator("[data-affected-test]").count() >= 1);

    const expectedDownloads = new Map([
      ["exportMarkdown", "游戏需求开工台-交付文档.md"],
      ["exportJson", "游戏需求开工台-数据备份.json"],
      ["exportCsv", "游戏需求开工台-任务表格.csv"],
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
        .filter((item) => item.size < 15);
      const smallButtons = Array.from(document.querySelectorAll("button, .ghost-button"))
        .filter(visible)
        .map((node) => ({ text: node.textContent.trim(), size: Number.parseFloat(getComputedStyle(node).fontSize) }))
        .filter((item) => item.size < 16);
      return { tooSmall, smallButtons, visibleText: document.body.innerText };
    });
    assert.deepEqual(readability.tooSmall, []);
    assert.deepEqual(readability.smallButtons, []);
    assert.equal(/[A-Za-z]/.test(readability.visibleText), false, readability.visibleText.match(/.{0,16}[A-Za-z].{0,16}/)?.[0]);

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (viewport.name === "desktop") {
      assert.equal(await page.locator('.source-pane').isVisible(), true);
      const visibleResultPanes = await page.locator('.decision-pane, .delivery-pane, .versions-pane').evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).display !== "none").length);
      assert.equal(visibleResultPanes, 1);
    } else {
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
