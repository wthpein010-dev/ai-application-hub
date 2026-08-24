import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, normalize, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const regexEscape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const root = dirname(dirname(fileURLToPath(import.meta.url)));
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

const startServer = server => new Promise(resolveServer => {
  server.listen(0, "127.0.0.1", () => {
    resolveServer(`http://127.0.0.1:${server.address().port}`);
  });
});

const stopServer = server => new Promise(resolveServer => server.close(resolveServer));

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

test("hub registers the Confirmation Bar demo, video, Windows, Mac, and iOS actions", async () => {
  const source = await read("../app-20260706-restore-games.js");
  const downloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/";
  const macDownloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/mac/";
  const iosInstallPage = "./projects/codex-thread-workbench/ios/index.html";
  const videoPage = "./projects/codex-thread-workbench/video/index.html";

  assert.match(source, /id:\s*"codex-thread-workbench"/);
  assert.match(source, /name:\s*"Codex 待确认悬浮助手"/);
  assert.match(source, /entry:\s*"\.\/projects\/codex-thread-workbench\/index\.html"/);
  assert.match(source, new RegExp(`video:\\s*"${regexEscape(videoPage)}"`));
  assert.match(source, new RegExp(`package:\\s*"${regexEscape(downloadPage)}"`));
  assert.match(source, new RegExp(`windows:\\s*\\{ href: "${regexEscape(downloadPage)}"`));
  assert.match(source, new RegExp(`mac:\\s*\\{ href: "${regexEscape(macDownloadPage)}"`));
  assert.match(source, new RegExp(`ios:\\s*\\{ href: "${regexEscape(iosInstallPage)}"`));
  assert.equal(
    (source.match(new RegExp(`${regexEscape(downloadPage)}"`, "g")) || []).length,
    2,
  );
  assert.equal(
    (source.match(new RegExp(`${regexEscape(macDownloadPage)}"`, "g")) || []).length,
    1,
  );
  assert.equal(
    (source.match(new RegExp(`${regexEscape(iosInstallPage)}"`, "g")) || []).length,
    1,
  );
  assert.match(source, /data-action="ios"/);
  assert.match(source, /tags:\s*\[[^\]]*"macOS"/);
  assert.doesNotMatch(source, /releases\/download\/codex-thread-workbench-v1\.0\.0/);
  assert.match(source, /function isDirectPackageHref\(href\)/);
  assert.match(
    source,
    /group\.key !== "web" && isDirectPackageHref\(href\) \? " download" : ""/
  );
  assert.match(
    source,
    /const windowsDownload = isDirectPackageHref\(windows\) \? " download" : ""/
  );
});

test("project page presents the confirmation overlay workflow and every release path", async () => {
  const html = await read("../projects/codex-thread-workbench/index.html");
  const windowsDownloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/";
  const macDownloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/mac/";

  assert.match(html, /Codex 待确认悬浮助手/);
  assert.match(html, /data-overlay-state="retracted"/);
  assert.match(html, /data-action="reveal-idle"/);
  assert.match(html, /data-action="simulate-candidates"/);
  assert.match(html, /data-action="simulate-error"/);
  assert.match(html, /data-action="confirm-all"/);
  assert.match(html, /data-action="reset-demo"/);
  assert.match(html, /Windows 与 macOS/);
  assert.match(html, /iPhone 与 iPad/);
  assert.equal(
    (html.match(new RegExp(`${regexEscape(windowsDownloadPage)}"`, "g")) || []).length,
    1,
  );
  assert.equal(
    (html.match(new RegExp(`${regexEscape(macDownloadPage)}"`, "g")) || []).length,
    1,
  );
  assert.equal((html.match(/href="\.\/video\/index\.html"/g) || []).length, 1);
  assert.equal((html.match(/href="\.\/ios\/index\.html"/g) || []).length, 1);
  assert.match(html, />观看视频</);
  assert.match(html, />\s*Windows 下载\s*</);
  assert.match(html, />\s*Mac 下载\s*</);
  assert.match(html, />\s*iOS 安装\s*</);
  assert.doesNotMatch(html, /releases\/download\/codex-thread-workbench-v1\.0\.0/);
});

test("project preview keeps a ten-pixel green handle visible while retracted", async () => {
  const css = await read("../projects/codex-thread-workbench/styles.css");

  assert.match(css, /\.overlay-handle\s*\{[^}]*height:\s*10px/s);
  assert.match(css, /data-overlay-state="retracted"/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("confirmation overlay expands for candidates and retracts after confirmations", async () => {
  const server = createStaticServer();
  const baseUrl = await startServer(server);
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(`${baseUrl}/projects/codex-thread-workbench/index.html`);

    const headerLayout = await page.evaluate(() => {
      const home = document.querySelector(".hub-home-link");
      const brand = document.querySelector(".brand-lockup");
      const action = document.querySelector(".header-demo-link");
      const homeBounds = home.getBoundingClientRect();
      const brandBounds = brand.getBoundingClientRect();
      const actionBounds = action.getBoundingClientRect();
      return {
        homePosition: getComputedStyle(home).position,
        noHomeBrandOverlap: homeBounds.right <= brandBounds.left,
        noBrandActionOverlap: brandBounds.right <= actionBounds.left,
      };
    });
    assert.deepEqual(headerLayout, {
      homePosition: "static",
      noHomeBrandOverlap: true,
      noBrandActionOverlap: true,
    });

    const overlay = page.locator('[data-role="confirmation-overlay"]');
    const handle = page.locator('[data-role="overlay-handle"]');
    assert.equal(await overlay.getAttribute("data-overlay-state"), "retracted");
    assert.equal((await handle.boundingBox()).height, 10);

    await handle.click({ position: { x: 30, y: 5 } });
    assert.equal(await overlay.getAttribute("data-overlay-state"), "idle");
    assert.match(await page.locator('[data-role="overlay-status"]').textContent(), /监控中/);

    await page.getByRole("button", { name: "模拟待确认出现" }).click();
    assert.equal(await overlay.getAttribute("data-overlay-state"), "attention");
    assert.equal(await page.locator('[data-role="candidate"]').count(), 2);
    assert.equal(await page.locator('[data-role="candidate-count"]').textContent(), "2");
    assert.equal(await page.locator('[data-action="confirm-all"]').isVisible(), true);

    await page.locator('[data-action="confirm-one"]').first().click();
    assert.equal(await page.locator('[data-role="candidate"]').count(), 1);
    assert.equal(await page.locator('[data-role="candidate-count"]').textContent(), "1");
    assert.equal(await overlay.getAttribute("data-overlay-state"), "attention");

    await page.locator('[data-action="confirm-all"]').click();
    assert.equal(await page.locator('[data-role="candidate"]').count(), 0);
    assert.equal(await overlay.getAttribute("data-overlay-state"), "retracted");
    assert.match(await page.locator('[data-role="activity-log"]').textContent(), /已向 1 个任务发送/);
  } finally {
    await browser.close();
    await stopServer(server);
  }
});

test("error state is fail-closed and keyboard and mobile controls stay usable", async () => {
  const server = createStaticServer();
  const baseUrl = await startServer(server);
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(`${baseUrl}/projects/codex-thread-workbench/index.html`);

    const reveal = page.getByRole("button", { name: "展开悬浮栏" });
    await reveal.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator('[data-role="confirmation-overlay"]').getAttribute("data-overlay-state"), "idle");

    const simulateCandidates = page.getByRole("button", { name: "模拟待确认出现" });
    await simulateCandidates.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator('[data-role="candidate"]').count(), 2);

    await page.getByRole("button", { name: "模拟扫描异常" }).click();
    assert.equal(await page.locator('[data-role="confirmation-overlay"]').getAttribute("data-overlay-state"), "error");
    assert.equal(await page.locator('[data-action="confirm-one"]').count(), 0);
    assert.equal(await page.locator('[data-action="confirm-all"]').isVisible(), false);
    assert.equal(await page.locator('[data-role="overlay-error"]').isVisible(), true);

    await page.getByRole("button", { name: "重置演示" }).click();
    assert.equal(await page.locator('[data-role="confirmation-overlay"]').getAttribute("data-overlay-state"), "retracted");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      true,
    );
  } finally {
    await browser.close();
    await stopServer(server);
  }
});

test("download page exposes progress, verification, failure and retry states", async () => {
  const [html, controller] = await Promise.all([
    read("../projects/codex-thread-workbench/download/index.html"),
    read("../projects/codex-thread-workbench/download/download.js")
  ]);

  assert.match(html, /CodexConfirmationBar-Windows-x64\.zip/);
  assert.match(html, /v2\.0\.0/);
  assert.match(html, /data-role="download-button"/);
  assert.match(html, /data-role="retry-button"/);
  assert.match(html, /data-role="progress"/);
  assert.match(html, /data-role="progress-text"/);
  assert.match(html, /data-role="status"/);
  assert.match(html, /data-role="error"/);
  assert.match(html, /SHA-256/);
  assert.match(controller, /fetch\("\.\/manifest\.json"/);
  assert.match(controller, /assembleDownload/);
  assert.match(controller, /application\/zip/);
  assert.match(controller, /URL\.revokeObjectURL/);
  assert.match(controller, /retryButton/);
});
