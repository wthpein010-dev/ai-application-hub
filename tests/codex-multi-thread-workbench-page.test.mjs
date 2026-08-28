import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, normalize, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectPath = "projects/codex-multi-thread-workbench";
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
]);

const createStaticServer = () => createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const target = resolve(root, "." + normalize(pathname));
  if ((!target.startsWith(root + sep) && target !== root)
      || !existsSync(target)
      || !statSync(target).isFile()) {
    response.writeHead(404).end();
    return;
  }
  const stats = statSync(target);
  response.writeHead(200, {
    "Content-Length": stats.size,
    "Content-Type": contentTypes.get(extname(target).toLowerCase()) || "application/octet-stream",
  });
  createReadStream(target).pipe(response);
});

const listen = server => new Promise(resolveListen => {
  server.listen(0, "127.0.0.1", () => resolveListen(`http://127.0.0.1:${server.address().port}`));
});

const close = server => new Promise(resolveClose => server.close(resolveClose));

async function launchBrowser() {
  const failures = [];
  for (const options of [
    { headless: true },
    { channel: "chrome", headless: true },
    { channel: "msedge", headless: true },
  ]) {
    try {
      return await chromium.launch(options);
    } catch (error) {
      failures.push(error.message);
    }
  }
  throw new Error(`No Chromium-compatible browser is available.\n${failures.join("\n")}`);
}

test("Hub registers the desktop Workbench as a separate four-action tool", async () => {
  const source = await read("../app-20260706-restore-games.js");
  const idMatches = source.match(/id:\s*"codex-multi-thread-workbench"/g) || [];

  assert.equal(idMatches.length, 1);
  assert.match(source, /name:\s*"Codex 多线程工作台"/);
  assert.match(source, /entry:\s*"\.\/projects\/codex-multi-thread-workbench\/index\.html"/);
  assert.match(source, /video:\s*"\.\/projects\/codex-multi-thread-workbench\/video\/index\.html"/);
  assert.match(source, /package:\s*"https:\/\/wthpein010-dev\.github\.io\/ai-application-hub\/projects\/codex-multi-thread-workbench\/download\/"/);
  assert.match(source, /windows:\s*\{ href:\s*"https:\/\/wthpein010-dev\.github\.io\/ai-application-hub\/projects\/codex-multi-thread-workbench\/download\/"/);
  assert.match(source, /mac:\s*\{ href:\s*"https:\/\/wthpein010-dev\.github\.io\/ai-application-hub\/projects\/codex-multi-thread-workbench\/download\/mac\/"/);
  assert.doesNotMatch(source, /id:\s*"codex-multi-thread-workbench"[\s\S]{0,1400}ios:/);
});

test("Workbench page presents the direct multi-thread operating surface", async () => {
  const html = await read(`../${projectPath}/index.html`);

  assert.match(html, /Codex 多线程工作台/);
  assert.match(html, /v2\.3\.0/);
  assert.doesNotMatch(html, /v2\.2\.1/);
  assert.match(html, /一级界面直接对话/);
  assert.match(html, /拖拽标题栏交换位置/);
  assert.match(html, /data-role="workbench-board"/);
  assert.equal((html.match(/data-role="thread-card"/g) || []).length, 3);
  assert.equal((html.match(/data-role="thread-composer"/g) || []).length, 3);
  assert.match(html, /data-action="toggle-fullscreen"/);
  assert.match(html, /href="\.\/video\/index\.html"/);
  assert.match(html, /href="\.\/download\/"/);
  assert.match(html, /href="\.\/download\/mac\/"/);
  assert.doesNotMatch(html, /待确认悬浮助手/);
});

test("Workbench demo sends text, toggles full screen, and swaps adjacent and non-adjacent cards", async () => {
  const server = createStaticServer();
  const baseUrl = await listen(server);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`${baseUrl}/${projectPath}/index.html`);

    const order = () => page.locator('[data-role="thread-card"]').evaluateAll(
      cards => cards.map(card => card.dataset.threadId),
    );
    assert.deepEqual(await order(), ["release", "site", "mac"]);

    const siteCard = page.locator('[data-thread-id="site"]');
    const composer = siteCard.locator('[data-role="thread-composer"]');
    await composer.fill("继续完善移动端布局");
    await siteCard.getByRole("button", { name: "发送" }).click();
    assert.equal(await composer.inputValue(), "");
    assert.match(await siteCard.locator('[data-role="conversation"]').textContent(), /继续完善移动端布局/);
    assert.match(await siteCard.locator('[data-role="thread-status"]').textContent(), /进行中/);

    await page.getByRole("button", { name: "切换全屏" }).click();
    assert.equal(await page.locator("body").getAttribute("data-demo-fullscreen"), "true");

    await page.locator('[data-thread-id="release"] [data-role="drag-handle"]').dragTo(
      page.locator('[data-thread-id="site"] [data-role="drag-handle"]'),
    );
    assert.deepEqual(await order(), ["site", "release", "mac"]);

    await page.locator('[data-thread-id="site"] [data-role="drag-handle"]').dragTo(
      page.locator('[data-thread-id="mac"] [data-role="drag-handle"]'),
    );
    assert.deepEqual(await order(), ["mac", "release", "site"]);

    const geometry = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    assert.ok(geometry.bodyWidth <= geometry.viewportWidth);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await close(server);
  }
});

test("Workbench page remains readable on a narrow phone viewport", async () => {
  const server = createStaticServer();
  const baseUrl = await listen(server);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${baseUrl}/${projectPath}/index.html`);
    const result = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      minText: Math.min(...Array.from(document.querySelectorAll("body *"))
        .filter(element => element.getClientRects().length)
        .map(element => Number.parseFloat(getComputedStyle(element).fontSize))
        .filter(Number.isFinite)),
    }));
    assert.ok(result.bodyWidth <= result.viewportWidth);
    assert.ok(result.minText >= 10);
  } finally {
    await browser.close();
    await close(server);
  }
});
