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
  assert.match(source, /brief:\s*"[^"]*左侧悬停[^"]*查看原任务[^"]*自动确认[^"]*"/);
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

test("hub gives the confirmation helper and multi-thread workbench distinct identities", async () => {
  const source = await read("../app-20260706-restore-games.js");
  const recordFor = id => {
    const start = source.indexOf(`id: "${id}"`);
    const end = source.indexOf("id:", start + 1);
    return start < 0 || end < 0 ? "" : source.slice(start, end);
  };
  const confirmationRecord = recordFor("codex-thread-workbench");
  const workbenchRecord = recordFor("codex-multi-thread-workbench");

  assert.ok(confirmationRecord, "confirmation helper catalog record must exist");
  assert.ok(workbenchRecord, "multi-thread workbench catalog record must exist");
  assert.match(confirmationRecord, /name:\s*"Codex 待确认悬浮助手"/);
  assert.match(confirmationRecord, /badge:\s*"待确认助手"/);
  assert.match(confirmationRecord, /待确认提醒/);
  assert.match(confirmationRecord, /projects\/codex-thread-workbench\/download\//);
  assert.match(confirmationRecord, /projects\/codex-thread-workbench\/download\/mac\//);
  assert.match(workbenchRecord, /name:\s*"Codex 多线程工作台"/);
  assert.match(workbenchRecord, /badge:\s*"桌面工作台"/);
  assert.match(workbenchRecord, /多线程操作/);
  assert.match(workbenchRecord, /projects\/codex-multi-thread-workbench\/download\//);
  assert.match(workbenchRecord, /projects\/codex-multi-thread-workbench\/download\/mac\//);
  assert.notEqual(confirmationRecord, workbenchRecord);
});

test("project page presents the confirmation overlay workflow and every release path", async () => {
  const html = await read("../projects/codex-thread-workbench/index.html");
  const windowsDownloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/";
  const macDownloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/mac/";

  assert.match(html, /Codex 待确认悬浮助手/);
  assert.match(html, /v2\.3\.9/);
  assert.match(html, /左侧悬停/);
  assert.match(html, /查看原任务/);
  assert.match(html, /自动确认/);
  assert.match(html, /普通关闭请求会被拦截/);
  assert.match(html, /每分钟检查恢复/);
  assert.match(html, /data-overlay-state="retracted"/);
  assert.match(html, /data-action="reveal-idle"/);
  assert.match(html, /data-action="simulate-candidates"/);
  assert.match(html, /data-action="simulate-error"/);
  assert.match(html, /data-action="simulate-close"/);
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

test("portrait preview keeps its left handle usable and batch action fixed below scrolling cards", async () => {
  const server = createStaticServer();
  const baseUrl = await startServer(server);
  const browser = await launchBrowser();
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${baseUrl}/projects/codex-thread-workbench/index.html`);
      const handle = page.locator('[data-role="overlay-handle"]');
      const handleBox = await handle.boundingBox();
      const desktopBox = await page.locator('.desktop-demo').boundingBox();
      assert.ok(handleBox.width <= 20 && handleBox.height >= 48, 'idle handle must be narrow and vertical');
      assert.ok(handleBox.x >= desktopBox.x && handleBox.x <= desktopBox.x + 20, 'handle stays on the left edge');
      await page.getByRole('button', { name: '模拟待确认出现' }).click();
      await page.waitForTimeout(300);
      const panel = page.locator('.overlay-panel');
      const panelBox = await panel.boundingBox();
      assert.ok(panelBox.height > panelBox.width, 'expanded panel must be portrait');
      const batch = page.locator('[data-action="confirm-all"]');
      const batchBefore = await batch.boundingBox();
      assert.ok(batchBefore.width >= panelBox.width - 40, 'batch action spans the panel');
      await page.locator('[data-action="ignore-one"]').first().click();
      assert.equal(await page.locator('[data-role="candidate"]').count(), 1);
      assert.match(await page.locator('[data-role="activity-log"]').textContent(), /忽略/);
      assert.doesNotMatch(await page.locator('[data-role="activity-log"]').textContent(), /发送/);
      await page.locator('[data-role="candidate-list"]').evaluate(list => {
        const first = list.firstElementChild;
        for (let index = 0; index < 8; index += 1) list.append(first.cloneNode(true));
        list.scrollTop = list.scrollHeight;
      });
      const batchAfter = await batch.boundingBox();
      const panelAfter = await panel.boundingBox();
      const desktopAfter = await page.locator('.desktop-demo').boundingBox();
      assert.ok(Math.abs((batchBefore.y - panelBox.y) - (batchAfter.y - panelAfter.y)) < 1, 'scrolling cards must not move the batch action within the panel');
      assert.ok(batchAfter.y + batchAfter.height <= panelAfter.y + panelAfter.height, 'batch action remains within panel');
      assert.ok(batchAfter.y + batchAfter.height <= desktopAfter.y + desktopAfter.height, 'desktop frame must not clip the action');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.close();
    }
  } finally {
    await browser.close();
    await stopServer(server);
  }
});

test("left hover waits before revealing and does not bounce or hide pending tasks", async () => {
  const server = createStaticServer();
  const baseUrl = await startServer(server);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(`${baseUrl}/projects/codex-thread-workbench/index.html`);
    const overlay = page.locator('[data-role="confirmation-overlay"]');
    const handle = page.locator('[data-role="overlay-handle"]');
    await handle.scrollIntoViewIfNeeded();
    const handleBounds = await handle.boundingBox();
    await page.mouse.move(handleBounds.x + 8, handleBounds.y - 70);
    await page.waitForTimeout(500);
    assert.equal(await overlay.getAttribute('data-overlay-state'), 'retracted', 'invisible area above the tab must not reveal the panel');
    await handle.hover();
    await page.waitForTimeout(80);
    await page.mouse.move(1400, 10);
    await page.waitForTimeout(420);
    assert.equal(await overlay.getAttribute('data-overlay-state'), 'retracted');
    await handle.hover();
    await page.waitForFunction(() => document.querySelector('[data-role="confirmation-overlay"]').dataset.overlayState === 'idle');
    await page.locator('.overlay-header').hover();
    await page.waitForTimeout(900);
    assert.equal(await overlay.getAttribute('data-overlay-state'), 'idle');
    await page.mouse.move(1400, 10);
    await page.waitForFunction(() => document.querySelector('[data-role="confirmation-overlay"]').dataset.overlayState === 'retracted');
    await page.getByRole('button', { name: '模拟待确认出现' }).click();
    await page.mouse.move(1400, 10);
    await page.waitForTimeout(900);
    assert.equal(await overlay.getAttribute('data-overlay-state'), 'attention');
  } finally {
    await browser.close();
    await stopServer(server);
  }
});

test("confirmation overlay expands for candidates, retracts, and reports protected close", async () => {
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
      homePosition: "fixed",
      noHomeBrandOverlap: true,
      noBrandActionOverlap: true,
    });

    const overlay = page.locator('[data-role="confirmation-overlay"]');
    const handle = page.locator('[data-role="overlay-handle"]');
    assert.equal(await overlay.getAttribute("data-overlay-state"), "retracted");
    assert.equal((await handle.boundingBox()).height, 64);

    await handle.click({ position: { x: 8, y: 32 } });
    assert.equal(await overlay.getAttribute("data-overlay-state"), "idle");
    assert.match(await page.locator('[data-role="overlay-status"]').textContent(), /监控中/);

    await page.getByRole("button", { name: "模拟待确认出现" }).click();
    assert.equal(await overlay.getAttribute("data-overlay-state"), "attention");
    assert.equal(await page.locator('[data-role="candidate"]').count(), 2);
    assert.equal(await page.locator('[data-role="candidate-count"]').textContent(), "2");
    assert.equal(await page.locator('[data-action="confirm-all"]').isVisible(), true);

    await page.locator('[data-action="view-one"]').first().click();
    assert.equal(await page.locator('[data-role="candidate"]').count(), 2);
    assert.match(await page.locator('[data-role="activity-log"]').textContent(), /查看/);

    await page.locator('[data-action="confirm-one"]').first().click();
    assert.equal(await page.locator('[data-role="candidate"]').count(), 1);
    assert.equal(await page.locator('[data-role="candidate-count"]').textContent(), "1");
    assert.equal(await overlay.getAttribute("data-overlay-state"), "attention");

    await page.locator('[data-action="confirm-all"]').click();
    assert.equal(await page.locator('[data-role="candidate"]').count(), 0);
    assert.equal(await overlay.getAttribute("data-overlay-state"), "retracted");
    assert.match(await page.locator('[data-role="activity-log"]').textContent(), /已向 1 个任务发送/);

    await page.getByRole("button", { name: "模拟窗口关闭" }).click();
    assert.equal(await page.locator('[data-role="candidate"]').count(), 0);
    assert.equal(await overlay.getAttribute("data-overlay-state"), "retracted");
    assert.match(await page.locator('[data-role="activity-log"]').textContent(), /关闭请求已拦截/);
  } finally {
    await browser.close();
    await stopServer(server);
  }
});

test("v2.3.9 source snapshot retains the full-window hover fix", async () => {
  const [project, xaml, code, placement] = await Promise.all([
    read("../build/codex-thread-workbench/src/CodexThreadWorkbench/CodexThreadWorkbench.csproj"),
    read("../build/codex-thread-workbench/src/CodexThreadWorkbench/ConfirmationOverlayWindow.axaml"),
    read("../build/codex-thread-workbench/src/CodexThreadWorkbench/ConfirmationOverlayWindow.axaml.cs"),
    read("../build/codex-thread-workbench/src/CodexThreadWorkbench/ConfirmationOverlayPlacement.cs"),
  ]);

  assert.match(project, /<Version>2\.3\.9<\/Version>/);
  assert.match(xaml, /x:Name="OverlayRoot"/);
  assert.match(xaml, /PointerEntered="OverlayRoot_OnPointerEntered"/);
  assert.match(xaml, /PointerExited="OverlayRoot_OnPointerExited"/);
  assert.match(code, /_isPointerOverWindow/);
  assert.match(placement, /workingArea\.X/);
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

test("Mac download page stays fail-closed until both manifests are published", async () => {
  const manifestsPresent = ["arm64", "x64"].every((architecture) =>
    existsSync(resolve(
      root,
      "projects",
      "codex-thread-workbench",
      "download",
      "mac",
      `manifest-${architecture}.json`,
    ))
  );
  const server = createStaticServer();
  const baseUrl = await startServer(server);
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${baseUrl}/projects/codex-thread-workbench/download/mac/index.html`);

    const downloadButton = page.locator('[data-role="download-button"]');
    if (!manifestsPresent) {
      await page.waitForFunction(() =>
        document.querySelector('[data-role="status"]')?.textContent?.includes("暂时不可用"),
        undefined,
        { timeout: 1_500 },
      );
      assert.equal(await downloadButton.isDisabled(), true);
      assert.equal(await page.locator('[data-role="error"]').isVisible(), true);
      assert.equal(await page.locator('[data-role="retry-button"]').isVisible(), true);
      return;
    }

    await page.waitForFunction(() =>
      document.querySelector('[data-role="download-button"]')?.disabled === false,
      undefined,
      { timeout: 1_500 },
    );
    assert.equal(await downloadButton.isEnabled(), true);
    assert.equal(
      await page.locator('[data-role="file-name"]').textContent(),
      "CodexConfirmationBar-macOS-arm64.app.zip",
    );

    await page.locator('[data-architecture="x64"]').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-role="file-name"]')?.textContent ===
        "CodexConfirmationBar-macOS-x64.app.zip",
      undefined,
      { timeout: 1_500 },
    );
    assert.equal(await downloadButton.isEnabled(), true);
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
  assert.match(html, /v2\.3\.9/);
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
