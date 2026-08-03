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
const orderStorageKey = "codex-thread-workbench-demo-thread-order-v1";

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

test("hub registers the Workbench demo, video, Windows, and Mac actions", async () => {
  const source = await read("../app-20260706-restore-games.js");
  const downloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/";
  const macDownloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/mac/";
  const videoPage = "./projects/codex-thread-workbench/video/index.html";

  assert.match(source, /id:\s*"codex-thread-workbench"/);
  assert.match(source, /entry:\s*"\.\/projects\/codex-thread-workbench\/index\.html"/);
  assert.match(source, new RegExp(`video:\\s*"${regexEscape(videoPage)}"`));
  assert.match(source, new RegExp(`package:\\s*"${regexEscape(downloadPage)}"`));
  assert.match(source, new RegExp(`windows:\\s*\\{ href: "${regexEscape(downloadPage)}"`));
  assert.match(source, new RegExp(`mac:\\s*\\{ href: "${regexEscape(macDownloadPage)}"`));
  assert.equal(
    (source.match(new RegExp(`${regexEscape(downloadPage)}"`, "g")) || []).length,
    2,
  );
  assert.equal(
    (source.match(new RegExp(`${regexEscape(macDownloadPage)}"`, "g")) || []).length,
    1,
  );
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

test("project page presents direct multi-thread conversation controls", async () => {
  const html = await read("../projects/codex-thread-workbench/index.html");
  const windowsDownloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/";
  const macDownloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/mac/";

  assert.match(html, /Codex 多会话工作台/);
  assert.match(html, /Windows · macOS/);
  assert.match(html, /data-action="open-picker"/);
  assert.match(html, /data-action="fullscreen"/);
  assert.equal((html.match(/class="thread-card/g) || []).length, 4);
  assert.equal((html.match(/data-role="composer"/g) || []).length, 4);
  assert.match(html, /进行中/);
  assert.match(html, /已完成/);
  assert.match(html, /需要确认/);
  assert.match(html, /已停止/);
  assert.equal(
    (html.match(new RegExp(`${regexEscape(windowsDownloadPage)}"`, "g")) || []).length,
    2,
  );
  assert.equal(
    (html.match(new RegExp(`${regexEscape(macDownloadPage)}"`, "g")) || []).length,
    2,
  );
  assert.equal((html.match(/href="\.\/video\/index\.html"/g) || []).length, 1);
  assert.match(html, />观看视频</);
  assert.match(html, />\s*Windows 下载\s*</);
  assert.match(html, />\s*Mac 下载\s*</);
  assert.doesNotMatch(html, /releases\/download\/codex-thread-workbench-v1\.0\.0/);
});

test("project preview uses green user bubbles and non-interactive message text", async () => {
  const css = await read("../projects/codex-thread-workbench/styles.css");

  assert.match(
    css,
    /\.message-list\s*\{[^}]*user-select:\s*none/s,
  );
  assert.doesNotMatch(css, /\.message-list\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.message\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(
    css,
    /\.message-user\s*>\s*p\s*\{[^}]*background:\s*#e7f4eb/s,
  );
  assert.doesNotMatch(css, /\.message(?:-[\w-]+)?(?::hover|\s*:hover)/);
});

test("project and download pages identify the Windows and Mac 1.3.0 update", async () => {
  const [projectHtml, downloadHtml] = await Promise.all([
    read("../projects/codex-thread-workbench/index.html"),
    read("../projects/codex-thread-workbench/download/index.html"),
  ]);

  assert.match(projectHtml, /Windows v1\.3\.0/);
  assert.match(projectHtml, /Mac v1\.3\.0/);
  assert.match(downloadHtml, /v1\.3\.0/);
  assert.match(downloadHtml, /5 个分片/);
  assert.match(downloadHtml, /40\.2 MB/);
  assert.match(
    downloadHtml,
    /D774AC535CD4C62598622112B33D539F62608435868CEA96EAC65D666583D9A1/,
  );
});

test("title-bar drag starts at six pixels, swaps exact card DOM nodes, and persists order", async () => {
  const server = createStaticServer();
  const baseUrl = await startServer(server);
  const browser = await launchBrowser();

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/projects/codex-thread-workbench/index.html`);

    assert.equal(await page.locator('[data-role="drag-surface"]').count(), 4);
    assert.equal(await page.locator('[data-role="drag-grip"] i').count(), 24);
    await page.evaluate(() => {
      window.__lastPointerId = null;
      document.addEventListener("pointerdown", event => {
        window.__lastPointerId = event.pointerId;
      }, { capture: true });
      window.__initialCards = [...document.querySelectorAll(".thread-card")];
      window.__initialContent = Object.fromEntries(window.__initialCards.map(card => [
        card.dataset.threadId,
        {
          title: card.querySelector("h2").textContent,
          messages: card.querySelector('[data-role="messages"]').textContent,
        },
      ]));
    });

    const firstHeader = page.locator('[data-thread-id="release"] [data-role="drag-surface"]');
    const firstBox = await firstHeader.boundingBox();
    assert.ok(firstBox);
    const startX = firstBox.x + 24;
    const startY = firstBox.y + firstBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 5, startY);
    assert.equal(await page.locator('[data-thread-id="release"]').evaluate(card => card.classList.contains("is-dragging")), false);
    await page.mouse.up();
    assert.deepEqual(
      await page.locator(".thread-card").evaluateAll(cards => cards.map(card => card.dataset.threadId)),
      ["release", "quota", "approval", "research"],
    );

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 6, startY);
    assert.equal(await page.locator('[data-thread-id="release"]').evaluate(card => card.classList.contains("is-dragging")), true);
    await page.mouse.up();
    assert.deepEqual(
      await page.locator(".thread-card").evaluateAll(cards => cards.map(card => card.dataset.threadId)),
      ["release", "quota", "approval", "research"],
    );
    assert.equal(await page.locator(".is-dragging, .is-drop-target").count(), 0);
    assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), orderStorageKey), null);

    const secondHeader = page.locator('[data-thread-id="quota"] [data-role="drag-surface"]');
    const secondBox = await secondHeader.boundingBox();
    assert.ok(secondBox);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(secondBox.x + 24, secondBox.y + secondBox.height / 2, { steps: 5 });
    assert.equal(await page.locator('[data-thread-id="quota"]').evaluate(card => card.classList.contains("is-drop-target")), true);
    await page.evaluate(() => {
      document.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        buttons: 0,
        clientX: -20,
        clientY: -20,
        pointerId: window.__lastPointerId,
        pointerType: "mouse",
      }));
    });
    await page.mouse.up();
    assert.deepEqual(
      await page.locator(".thread-card").evaluateAll(cards => cards.map(card => card.dataset.threadId)),
      ["release", "quota", "approval", "research"],
    );
    assert.equal(await page.locator(".is-dragging, .is-drop-target").count(), 0);
    assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), orderStorageKey), null);

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(secondBox.x + 24, secondBox.y + secondBox.height / 2, { steps: 5 });
    await page.evaluate(() => {
      document.dispatchEvent(new PointerEvent("pointercancel", {
        bubbles: true,
        pointerId: window.__lastPointerId,
        pointerType: "mouse",
      }));
    });
    await page.mouse.up();
    assert.deepEqual(
      await page.locator(".thread-card").evaluateAll(cards => cards.map(card => card.dataset.threadId)),
      ["release", "quota", "approval", "research"],
    );
    assert.equal(await page.locator(".is-dragging, .is-drop-target").count(), 0);
    assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), orderStorageKey), null);

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(secondBox.x + 24, secondBox.y + secondBox.height / 2, { steps: 5 });
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.mouse.up();
    assert.deepEqual(
      await page.locator(".thread-card").evaluateAll(cards => cards.map(card => card.dataset.threadId)),
      ["release", "quota", "approval", "research"],
    );
    assert.equal(await page.locator(".is-dragging, .is-drop-target").count(), 0);
    assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), orderStorageKey), null);

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 6, startY);
    assert.equal(await page.locator('[data-thread-id="release"]').evaluate(card => card.classList.contains("is-dragging")), true);
    const sourceStyle = await page.locator('[data-thread-id="release"]').evaluate(card => {
      const style = getComputedStyle(card);
      return { opacity: Number(style.opacity), borderColor: style.borderColor, transform: style.transform };
    });
    assert.ok(sourceStyle.opacity < 1);
    assert.match(sourceStyle.borderColor, /43, 170, 118/);
    assert.notEqual(sourceStyle.transform, "none");

    const targetHeader = page.locator('[data-thread-id="research"] [data-role="drag-surface"]');
    const targetBox = await targetHeader.boundingBox();
    assert.ok(targetBox);
    await page.mouse.move(targetBox.x + 24, targetBox.y + targetBox.height / 2, { steps: 5 });
    assert.equal(await page.locator('[data-thread-id="research"]').evaluate(card => card.classList.contains("is-drop-target")), true);
    const targetStyle = await page.locator('[data-thread-id="research"]').evaluate(card => ({
      outlineColor: getComputedStyle(card).outlineColor,
      headerBackground: getComputedStyle(card.querySelector(".thread-header")).backgroundColor,
    }));
    assert.match(targetStyle.outlineColor, /43, 170, 118/);
    assert.notEqual(targetStyle.headerBackground, "rgba(0, 0, 0, 0)");
    await page.mouse.up();

    const swapped = await page.evaluate(storageKey => {
      const cards = [...document.querySelectorAll(".thread-card")];
      const contentStayedWithCard = cards.every(card => {
        const initial = window.__initialContent[card.dataset.threadId];
        return card.querySelector("h2").textContent === initial.title
          && card.querySelector('[data-role="messages"]').textContent === initial.messages;
      });
      return {
        order: cards.map(card => card.dataset.threadId),
        exactDomSwap: cards[0] === window.__initialCards[3]
          && cards[1] === window.__initialCards[1]
          && cards[2] === window.__initialCards[2]
          && cards[3] === window.__initialCards[0],
        contentStayedWithCard,
        storedOrder: JSON.parse(localStorage.getItem(storageKey)),
        draggingCount: document.querySelectorAll(".is-dragging, .is-drop-target").length,
      };
    }, orderStorageKey);
    assert.deepEqual(swapped.order, ["research", "quota", "approval", "release"]);
    assert.equal(swapped.exactDomSwap, true);
    assert.equal(swapped.contentStayedWithCard, true);
    assert.deepEqual(swapped.storedOrder, swapped.order);
    assert.equal(swapped.draggingCount, 0);

    const cancelSource = page.locator('[data-thread-id="research"] [data-role="drag-surface"]');
    const cancelTarget = page.locator('[data-thread-id="quota"] [data-role="drag-surface"]');
    const cancelSourceBox = await cancelSource.boundingBox();
    const cancelTargetBox = await cancelTarget.boundingBox();
    await page.mouse.move(cancelSourceBox.x + 24, cancelSourceBox.y + cancelSourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(cancelTargetBox.x + 24, cancelTargetBox.y + cancelTargetBox.height / 2, { steps: 5 });
    assert.equal(await page.locator('[data-thread-id="quota"]').evaluate(card => card.classList.contains("is-drop-target")), true);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(await page.locator(".is-dragging, .is-drop-target").count(), 0);
    assert.deepEqual(
      await page.locator(".thread-card").evaluateAll(cards => cards.map(card => card.dataset.threadId)),
      swapped.order,
    );
    assert.deepEqual(
      await page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), orderStorageKey),
      swapped.order,
    );

    await page.reload();
    assert.deepEqual(
      await page.locator(".thread-card").evaluateAll(cards => cards.map(card => card.dataset.threadId)),
      swapped.order,
    );
    const approveButton = page.locator('[data-thread-id="approval"] [data-action="approve"]');
    assert.equal(await approveButton.evaluate(button => getComputedStyle(button).pointerEvents), "auto");
    await approveButton.click();
    assert.equal(await page.locator('[data-thread-id="approval"] [data-role="status"]').textContent(), "进行中");
    await context.close();
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

  assert.match(html, /CodexThreadWorkbench-Windows-x64\.zip/);
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
