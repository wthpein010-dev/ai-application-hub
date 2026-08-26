import assert from "node:assert/strict";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const playwrightEntry = require.resolve("playwright", {
  paths: [
    process.env.CODEX_NODE_MODULES,
    join(
      homedir(),
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "node",
      "node_modules",
    ),
  ].filter(Boolean),
});
const playwrightModule = await import(pathToFileURL(playwrightEntry).href);
const { chromium } = playwrightModule.default || playwrightModule;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const screenshotDirectory = process.env.HUB_SHOWCASE_SCREENSHOT_DIR || "";
const windowsUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const failures = [];
const browserErrors = [];
const servedRequests = [];
const performanceSamples = [];
let assertionCount = 0;
let screenshotCount = 0;

function check(actual, expected, label) {
  assertionCount += 1;
  try {
    if (arguments.length === 2) assert.ok(actual, expected);
    else assert.deepEqual(actual, expected, label);
  } catch (error) {
    failures.push(`${label || expected}: ${error.message}`);
  }
}

function contentType(path) {
  return {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  }[extname(path).toLowerCase()] || "application/octet-stream";
}

function createStaticServer() {
  return createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname);
    servedRequests.push(pathname);
    if (/clickflow/iu.test(pathname)) {
      response.writeHead(451).end();
      return;
    }
    const target = resolve(root, "." + normalize(pathname));
    if (!target.startsWith(root + sep) && target !== root) {
      response.writeHead(403).end();
      return;
    }
    const path = existsSync(target) && statSync(target).isDirectory()
      ? join(target, "index.html")
      : target;
    if (!existsSync(path) || statSync(path).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    const stats = statSync(path);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": stats.size,
      "Content-Type": contentType(path),
    });
    createReadStream(path).pipe(response);
  });
}

function startServer(server) {
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => resolveServer(`http://127.0.0.1:${server.address().port}`));
  });
}

function stopServer(server) {
  return new Promise((resolveServer) => server.close(resolveServer));
}

function browserExecutable() {
  return [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find((path) => path && existsSync(path));
}

function collectBrowserErrors(page, label) {
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`${label}/console: ${message.text()}`);
  });
  page.on("pageerror", (error) => browserErrors.push(`${label}/pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    browserErrors.push(`${label}/request: ${request.url()} ${request.failure()?.errorText || "failed"}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) browserErrors.push(`${label}/http-${response.status()}: ${response.url()}`);
  });
}

async function configureWindowsPage(context, label) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { configurable: true, get: () => "Win32" });
    globalThis.__showcaseAnimations = [];
    document.addEventListener("animationstart", (event) => {
      globalThis.__showcaseAnimations.push(event.animationName);
    });
  });
  collectBrowserErrors(page, label);
  return page;
}

async function waitForImages(page) {
  const cards = page.locator(".app-card[data-app-id]");
  for (let index = 0; index < await cards.count(); index += 4) {
    await cards.nth(index).scrollIntoViewIfNeeded();
  }
  await cards.last().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".card-media img"))
    .every((image) => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function assertSelected(page, selector, label, expectedHash = "#apps") {
  const card = page.locator(selector);
  const id = await card.getAttribute("data-app-id");
  const name = (await card.locator("h3").innerText()).trim();
  await card.click();
  const state = await page.evaluate((selectedId) => {
    const selected = document.querySelector(`.app-card[data-app-id="${CSS.escape(selectedId)}"]`);
    const progress = document.querySelector('[role="progressbar"]');
    return {
      hash: location.hash,
      preservedQuery: new URL(location.href).searchParams.get("qa"),
      project: new URL(location.href).searchParams.get("project"),
      stageName: document.querySelector("#spotlightCard .summary-copy > strong")?.textContent.trim(),
      ariaCurrent: selected?.getAttribute("aria-current"),
      selectedCount: document.querySelectorAll(".app-card.selected").length,
      progressNow: Number(progress?.getAttribute("aria-valuenow")),
      progressMax: Number(progress?.getAttribute("aria-valuemax")),
    };
  }, id);
  check(state.hash, expectedHash, `${label} preserves section hash`);
  check(state.preservedQuery, "keep", `${label} preserves unrelated query`);
  check(state.project, id, `${label} synchronizes project query`);
  check(state.stageName, name, `${label} synchronizes stage name`);
  check(state.ariaCurrent, "true", `${label} synchronizes aria-current`);
  check(state.selectedCount, 1, `${label} keeps one selection`);
  check(state.progressNow > 0 && state.progressNow <= state.progressMax, `${label} synchronizes progress`);
  return id;
}

async function assertNoIntroReplay(page, label) {
  const animation = await page.evaluate(() => ({
    bodyComplete: document.body.classList.contains("showcase-intro-complete"),
    card: getComputedStyle(document.querySelector(".app-card[data-app-id]")).animationName,
    stage: getComputedStyle(document.querySelector(".showcase-stage")).animationName,
  }));
  check(animation.bodyComplete, `${label} keeps intro completion gate`);
  check(animation.card, "none", `${label} does not replay card entrance`);
  check(animation.stage, "none", `${label} does not replay stage entrance`);
}

async function takeScreenshot(page, name) {
  if (!screenshotDirectory) return;
  check(!/clickflow/iu.test(name), `screenshot name excludes ClickFlow: ${name}`);
  check(await page.locator('[data-app-id="clickflow"]').count(), 0, `${name} has zero ClickFlow nodes before capture`);
  mkdirSync(screenshotDirectory, { recursive: true });
  await page.screenshot({ path: join(screenshotDirectory, `${name}.png`), fullPage: false });
  screenshotCount += 1;
}

const server = createStaticServer();
const baseUrl = await startServer(server);
const executablePath = browserExecutable();
assert.ok(executablePath, "An installed Chrome or Edge executable is required");
const browser = await chromium.launch({ executablePath, headless: true });

try {
  const viewports = [
    { name: "desktop", width: 1440, height: 900, columns: 4 },
    { name: "tablet", width: 1024, height: 768, columns: 2 },
    { name: "mobile", width: 390, height: 844, columns: 1 },
  ];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, userAgent: windowsUserAgent });
    const page = await configureWindowsPage(context, viewport.name);
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(`${baseUrl}/index.html?qa=keep#apps`, { waitUntil: "networkidle" });
    await page.waitForSelector(".app-card[data-app-id]");

    await page.waitForSelector("body.showcase-intro-complete");
    const initialAnimations = await page.evaluate(() => globalThis.__showcaseAnimations);
    check(initialAnimations.includes("card-enter"), `${viewport.name} first card entrance runs`);
    check(initialAnimations.includes("showcase-stage-enter"), `${viewport.name} first stage entrance runs`);
    await waitForImages(page);

    const baseline = await page.evaluate(() => {
      const ids = (selector) => Array.from(document.querySelectorAll(selector), (card) => card.dataset.appId);
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const smallText = Array.from(document.body.querySelectorAll("*")).filter((element) => {
        if (!visible(element) || element.children.length || !element.textContent.trim()) return false;
        return Number.parseFloat(getComputedStyle(element).fontSize) < 12;
      }).map((element) => `${element.tagName}.${element.className}:${getComputedStyle(element).fontSize}`);
      const actions = Array.from(document.querySelectorAll(".app-card .card-actions a")).filter(visible);
      const actionGeometry = actions.map((action) => {
        const actionRect = action.getBoundingClientRect();
        const rowRect = action.closest(".card-actions").getBoundingClientRect();
        return {
          contained: actionRect.left >= rowRect.left - 1 && actionRect.right <= rowRect.right + 1
            && actionRect.top >= rowRect.top - 1 && actionRect.bottom <= rowRect.bottom + 1,
          height: actionRect.height,
          widthFits: action.scrollWidth <= action.clientWidth,
        };
      });
      const imageFrames = Array.from(document.querySelectorAll(".card-media")).map((media) => {
        const rect = media.getBoundingClientRect();
        return rect.width > 0 && rect.height >= 119;
      });
      const imageGeometry = Array.from(document.querySelectorAll(".card-media img")).map((image) => {
        const imageRect = image.getBoundingClientRect();
        const frameRect = image.parentElement.getBoundingClientRect();
        return {
          id: image.closest(".app-card")?.dataset.appId,
          fitted: Math.abs(imageRect.left - frameRect.left) < 1
            && Math.abs(imageRect.top - frameRect.top) < 1
            && Math.abs(imageRect.width - frameRect.width) < 1
            && Math.abs(imageRect.height - frameRect.height) < 1,
          frame: `${Math.round(frameRect.width)}x${Math.round(frameRect.height)}`,
          image: `${Math.round(imageRect.width)}x${Math.round(imageRect.height)}`,
          visible: !image.hidden && getComputedStyle(image).display !== "none"
            && imageRect.width > 0 && imageRect.height > 0,
        };
      });
      return {
        allIds: ids(".app-card[data-app-id]"),
        apps: ids("#appGrid .app-card[data-app-id]"),
        games: ids("#gameGrid .app-card[data-app-id]"),
        engineering: ids("#engineeringGrid .app-card[data-app-id]"),
        bodyFont: Number.parseFloat(getComputedStyle(document.body).fontSize),
        cardCount: document.querySelectorAll(".app-card").length,
        clickflowCount: document.querySelectorAll('[data-app-id="clickflow"]').length,
        columns: getComputedStyle(document.querySelector("#appGrid")).gridTemplateColumns.split(/\s+/u).filter(Boolean).length,
        imagesReady: Array.from(document.querySelectorAll(".card-media img")).every((image) => image.complete && image.naturalWidth > 0),
        imageCount: document.querySelectorAll(".card-media img").length,
        unfittedImages: imageGeometry.filter(({ fitted }) => !fitted)
          .map(({ id, frame, image }) => `${id}:${image} in ${frame}`),
        imagesVisible: imageGeometry.every(({ visible: imageVisible }) => imageVisible),
        imageFramesReady: imageFrames.every(Boolean),
        mediaFallbackCount: document.querySelectorAll(".app-card.media-fallback").length,
        visibleFallbackCaptionCount: Array.from(document.querySelectorAll(".card-media figcaption")).filter(visible).length,
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        selectedCount: document.querySelectorAll(".app-card.selected").length,
        smallText,
        actionsContained: actionGeometry.every(({ contained }) => contained),
        actionsTallEnough: actionGeometry.every(({ height }) => height >= 38),
        actionsFit: actionGeometry.every(({ widthFits }) => widthFits),
      };
    });
    check(baseline.cardCount, 28, `${viewport.name} renders 28 cards`);
    check(baseline.clickflowCount, 0, `${viewport.name} has zero ClickFlow nodes`);
    check(requests.some((url) => /clickflow/iu.test(url)), false, `${viewport.name} has zero ClickFlow requests`);
    check(baseline.noHorizontalOverflow, `${viewport.name} has no horizontal overflow`);
    check(baseline.imagesReady, `${viewport.name} loads every card image`);
    check(baseline.imageCount, 28, `${viewport.name} renders 28 card images`);
    check(baseline.imagesVisible, `${viewport.name} displays all 28 loaded card images`);
    check(baseline.unfittedImages, [], `${viewport.name} fits every loaded card image to its media frame`);
    check(baseline.imageFramesReady, `${viewport.name} keeps stable media framing`);
    check(baseline.mediaFallbackCount, 0, `${viewport.name} has zero catalog fallback states`);
    check(baseline.visibleFallbackCaptionCount, 0, `${viewport.name} hides every catalog fallback caption`);
    check(baseline.selectedCount, 1, `${viewport.name} starts with one selected card`);
    check(baseline.columns, viewport.columns, `${viewport.name} uses expected responsive columns`);
    check(baseline.bodyFont >= 13, `${viewport.name} body text is at least 13px`);
    check(baseline.smallText, [], `${viewport.name} visible text is at least 12px`);
    check(baseline.actionsContained, `${viewport.name} card actions stay inside cards`);
    check(baseline.actionsTallEnough, `${viewport.name} card actions are comfortably sized`);
    check(baseline.actionsFit, `${viewport.name} card action labels fit`);
    const performance = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      return {
        loadMilliseconds: navigation?.loadEventEnd || 0,
        preloadCount: document.querySelectorAll('link[rel="preload"][as="image"]').length,
        resourceCount: performance.getEntriesByType("resource").length,
      };
    });
    performanceSamples.push({ viewport: viewport.name, ...performance });
    check(performance.loadMilliseconds > 0 && performance.loadMilliseconds < 5000, `${viewport.name} local load completes within 5 seconds`);
    check(performance.resourceCount <= 40, `${viewport.name} initial resources stay within budget`);
    check(performance.preloadCount, 1, `${viewport.name} preloads only the next showcase image`);

    for (const theme of ["clean", "mist", "coral", "night"]) {
      await page.locator("#themeToggle").click();
      await page.locator(`[data-theme-option="${theme}"]`).click();
      check(await page.getAttribute("html", "data-theme"), theme, `${viewport.name} applies ${theme} theme`);
      await assertNoIntroReplay(page, `${viewport.name}/${theme} theme`);
      await page.waitForTimeout(220);
      const themeContrast = await page.evaluate(() => {
        const channels = (value) => (value.match(/[\d.]+/gu) || []).slice(0, 3).map(Number);
        const luminance = (value) => {
          const linear = channels(value).map((channel) => channel / 255).map((channel) => (
            channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
          ));
          return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
        };
        const contrast = (foreground, background) => (
          (Math.max(luminance(foreground), luminance(background)) + 0.05)
          / (Math.min(luminance(foreground), luminance(background)) + 0.05)
        );
        const background = getComputedStyle(document.body).backgroundColor;
        return {
          heading: contrast(getComputedStyle(document.querySelector(".showcase-copy h1")).color, background),
          lead: contrast(getComputedStyle(document.querySelector(".showcase-lead")).color, background),
        };
      });
      check(themeContrast.heading >= 4.5, `${viewport.name}/${theme} hero heading has AA contrast`);
      check(themeContrast.lead >= 4.5, `${viewport.name}/${theme} hero copy has AA contrast`);
      await takeScreenshot(page, `${viewport.name}-${theme}`);
    }
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".app-card[data-app-id]");
    check(await page.getAttribute("html", "data-theme"), "night", `${viewport.name} persists theme on reload`);
    await page.waitForSelector("body.showcase-intro-complete");

    await assertSelected(page, "#appGrid .app-card[data-app-id]:nth-of-type(2)", `${viewport.name}/application`);
    await assertSelected(page, "#gameGrid .app-card[data-app-id]:first-of-type", `${viewport.name}/game`);
    await assertSelected(page, "#engineeringGrid .app-card[data-app-id]:first-of-type", `${viewport.name}/engineering`);

    const keyboardCards = page.locator("#appGrid .app-card[data-app-id]");
    const enterId = await keyboardCards.nth(2).getAttribute("data-app-id");
    await keyboardCards.nth(2).focus();
    await page.keyboard.press("Enter");
    check(new URL(page.url()).searchParams.get("project"), enterId, `${viewport.name} Enter selects a card`);
    const spaceId = await keyboardCards.nth(3).getAttribute("data-app-id");
    await keyboardCards.nth(3).focus();
    await page.keyboard.press("Space");
    check(new URL(page.url()).searchParams.get("project"), spaceId, `${viewport.name} Space selects a card`);
    await assertNoIntroReplay(page, `${viewport.name}/keyboard selection`);

    const selectionBeforeAction = new URL(page.url()).searchParams.get("project");
    await page.evaluate(() => document.addEventListener("click", (event) => {
      if (event.target.closest(".app-card .card-actions a")) event.preventDefault();
    }, true));
    await page.locator(".app-card .card-actions a").first().click();
    check(new URL(page.url()).searchParams.get("project"), selectionBeforeAction, `${viewport.name} action click does not select its card`);

    const filterChip = page.locator('[data-filter-type]:not([data-filter-type="all"])').first();
    await filterChip.click();
    const filtered = await page.evaluate(() => ({
      ids: Array.from(document.querySelectorAll(".app-card[data-app-id]"), (card) => card.dataset.appId),
      selected: document.querySelector(".app-card.selected")?.dataset.appId,
    }));
    check(filtered.ids.length > 0 && filtered.ids.length < 28, `${viewport.name} category chip filters the catalog`);
    check(filtered.selected, filtered.ids[0], `${viewport.name} category chip selects the first visible fallback`);
    check(filtered.ids, baseline.allIds.filter((id) => filtered.ids.includes(id)), `${viewport.name} category chip preserves production order`);
    await assertNoIntroReplay(page, `${viewport.name}/category filter`);

    await page.locator('[data-filter-type="all"]').click();
    await page.locator("#searchInput").fill("AI");
    const searchCollections = await page.evaluate(() => ["#appGrid", "#gameGrid", "#engineeringGrid"]
      .filter((selector) => document.querySelector(`${selector} .app-card[data-app-id]`)).length);
    check(searchCollections >= 2, `${viewport.name} search crosses project collections`);
    await page.locator("#searchInput").fill("");
    check(await page.locator(".app-card[data-app-id]").count(), 28, `${viewport.name} reset restores all cards`);
    const resetOrder = await page.locator(".app-card[data-app-id]").evaluateAll((cards) => cards.map((card) => card.dataset.appId));
    check(resetOrder, baseline.allIds, `${viewport.name} reset restores production order`);
    await assertNoIntroReplay(page, `${viewport.name}/search reset`);

    const editorClosed = await page.evaluate(() => {
      const panel = document.querySelector("#editPanel");
      const close = document.querySelector("#editClose");
      close.focus();
      return { hidden: panel.getAttribute("aria-hidden"), inert: panel.inert, focusBlocked: document.activeElement !== close };
    });
    check(editorClosed, { hidden: "true", inert: true, focusBlocked: true }, `${viewport.name} closed editor is inert`);
    await page.locator("#exportButton").click();
    check(await page.locator("#editPanel").getAttribute("aria-hidden"), "false", `${viewport.name} editor opens`);
    check(await page.locator("#editPanel").evaluate((panel) => panel.inert), false, `${viewport.name} open editor is interactive`);
    await page.locator("#editClose").click();
    check(await page.locator("#editPanel").getAttribute("aria-hidden"), "true", `${viewport.name} editor closes`);
    check(await page.locator("#editPanel").evaluate((panel) => panel.inert), true, `${viewport.name} closed editor becomes inert`);
    await page.waitForFunction(() => document.querySelector("#editPanel").getBoundingClientRect().left >= innerWidth);
    check(await page.locator("#editPanel").evaluate((panel) => panel.getBoundingClientRect().left >= innerWidth), true, `${viewport.name} closed editor leaves the viewport`);
    await assertNoIntroReplay(page, `${viewport.name}/editor`);

    await page.locator("#themeToggle").click();
    await page.locator('[data-theme-option="clean"]').click();
    await page.waitForTimeout(220);
    await assertNoIntroReplay(page, `${viewport.name}/catalog theme`);
    await page.evaluate(() => {
      const html = document.documentElement;
      const previousBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      window.scrollTo(0, Math.max(0, document.querySelector("#apps").offsetTop - 116));
      html.style.scrollBehavior = previousBehavior;
    });
    await takeScreenshot(page, `${viewport.name}-catalog`);
    const fallback = await page.locator(".app-card .card-media img").first().evaluate(async (image) => {
      const frame = image.parentElement;
      const before = frame.getBoundingClientRect();
      const failed = new Promise((resolveFailure) => image.addEventListener("error", resolveFailure, { once: true }));
      image.src = "data:image/webp;base64,AAAA";
      await failed;
      const after = frame.getBoundingClientRect();
      const caption = frame.querySelector("figcaption");
      return {
        captionVisible: Boolean(caption && !caption.hidden),
        imageHidden: image.hidden,
        stable: Math.abs(before.width - after.width) < 1 && Math.abs(before.height - after.height) < 1,
      };
    });
    check(fallback, { captionVisible: true, imageHidden: true, stable: true }, `${viewport.name} failed image uses stable fallback`);
    await assertNoIntroReplay(page, `${viewport.name}/image fallback`);

    const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
    check(resources.some((url) => /clickflow/iu.test(url)), false, `${viewport.name} has zero ClickFlow resources`);
    check(requests.some((url) => /clickflow/iu.test(url)), false, `${viewport.name} keeps zero ClickFlow requests after interactions`);
    await context.close();
  }

  const reducedContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: windowsUserAgent,
    reducedMotion: "reduce",
  });
  const reducedPage = await configureWindowsPage(reducedContext, "reduced-motion");
  await reducedPage.goto(`${baseUrl}/index.html?qa=keep#apps`, { waitUntil: "networkidle" });
  await reducedPage.waitForSelector(".app-card[data-app-id]");
  await reducedPage.locator(".app-card[data-app-id]").first().hover();
  const reduced = await reducedPage.evaluate(() => ({
    cardTransform: getComputedStyle(document.querySelector(".app-card[data-app-id]")).transform,
    stageTransform: getComputedStyle(document.querySelector(".showcase-media")).transform,
    cardDuration: getComputedStyle(document.querySelector(".app-card[data-app-id]")).animationDuration,
  }));
  check(reduced.cardTransform, "none", "reduced motion removes card transform");
  check(reduced.stageTransform, "none", "reduced motion removes stage transform");
  check(Number.parseFloat(reduced.cardDuration) <= 0.001, "reduced motion minimizes entrance duration");
  await reducedContext.close();

  const storageContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: windowsUserAgent,
  });
  const storagePage = await storageContext.newPage();
  await storagePage.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { configurable: true, get: () => "Win32" });
    Storage.prototype.getItem = () => { throw new Error("storage get blocked"); };
    Storage.prototype.setItem = () => { throw new Error("storage set blocked"); };
  });
  collectBrowserErrors(storagePage, "storage-throwing");
  await storagePage.goto(`${baseUrl}/index.html#apps`, { waitUntil: "networkidle" });
  const storageBooted = await storagePage.locator(".app-card[data-app-id]").count() === 28;
  check(storageBooted, "storage-throwing context renders default catalog");
  if (storageBooted) {
    check(await storagePage.getAttribute("html", "data-theme"), "clean", "storage-throwing context uses default theme");
    const firstVisible = await storagePage.locator(".app-card[data-app-id]").first().getAttribute("data-app-id");
    check(firstVisible, "hub", "storage-throwing context renders the first production project");
    check(await storagePage.locator(".app-card.selected").getAttribute("data-app-id"), "travel-generator", "storage-throwing context keeps the approved default selection");
    await storagePage.locator('[data-filter-type]:not([data-filter-type="all"])').first().click();
    check(await storagePage.locator(".app-card[data-app-id]").count() < 28, "storage-throwing context filters catalog");
    await storagePage.locator("#exportButton").click();
    check(await storagePage.locator("#editPanel").getAttribute("aria-hidden"), "false", "storage-throwing context opens editor");
    await storagePage.locator("#editClose").click();
    check(await storagePage.locator("#editPanel").getAttribute("aria-hidden"), "true", "storage-throwing context closes editor");
  }
  await storageContext.close();

  check(servedRequests.some((path) => /clickflow/iu.test(path)), false, "server received zero ClickFlow requests");
  check(browserErrors, [], "browser console, page, request, and HTTP errors stay empty");
} finally {
  await browser.close();
  await stopServer(server);
}

assert.deepEqual(failures, []);
const maxLoadMilliseconds = Math.ceil(Math.max(...performanceSamples.map(({ loadMilliseconds }) => loadMilliseconds)));
const maxResourceCount = Math.max(...performanceSamples.map(({ resourceCount }) => resourceCount));
process.stdout.write(`Dynamic showcase browser smoke passed: ${assertionCount} assertions, 3 viewports, 4 themes, ${screenshotCount} screenshots, max load ${maxLoadMilliseconds}ms, max initial resources ${maxResourceCount}, 0 browser errors, 0 ClickFlow nodes/requests/resources/screenshots.\n`);
