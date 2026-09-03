import assert from "node:assert/strict";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listenForFetch } from "./helpers/fetch-safe-listener.mjs";

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
const expectedCollectionIds = {
  apps: [
    "hub",
    "gamepulse-mini-radar",
    "codex-quota-bar",
    "codex-thread-workbench",
    "web-media-collector",
    "minigame-project-simulator",
    "ai-game-requirements-workshop",
    "planner-daily-quiz",
    "travel-generator",
    "feishu-downloader",
    "codex-reviewer",
    "codex-habit-tool",
    "wanhuatong",
    "pureshrink",
    "planmap",
    "simuai",
    "gamespec-relay",
    "x-ai-codex-radar",
    "loop-bgm-lab",
    "codex-multi-thread-workbench",
  ],
  games: ["zhuanglege-sha", "xiang-le-ge-xiang", "fill-what", "nang-keng-pai-pai-xiang", "icecream"],
  engineering: [
    "vita-mahjong",
    "paws-home-client",
    "paws-level-editor",
    "brick-light-motion-lab",
    "brick-character-copy-preview",
    "trinket-market",
    "v-curve-tool",
  ],
};
const expectedNavigationIds = [
  ...expectedCollectionIds.apps,
  ...expectedCollectionIds.games,
  ...expectedCollectionIds.engineering,
];
const expectedCardCount = expectedNavigationIds.length;
const expectedSearch = {
  apps: ["hub", "gamepulse-mini-radar", "minigame-project-simulator"],
  games: ["zhuanglege-sha", "xiang-le-ge-xiang", "fill-what", "nang-keng-pai-pai-xiang", "icecream"],
  engineering: [],
};
const selectedStorageKey = "ai-competition-hub-v2-selected";
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
  return listenForFetch(server);
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
    globalThis.__showcaseEntranceEvents = [];
    document.addEventListener("animationstart", (event) => {
      const target = event.target;
      if (target.matches?.(".showcase-stage")) {
        globalThis.__showcaseEntranceEvents.push({ element: "stage", name: event.animationName });
      } else if (target.matches?.(".app-card[data-app-id]")) {
        globalThis.__showcaseEntranceEvents.push({ element: target.dataset.appId, name: event.animationName });
      }
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

async function waitForStageImage(page) {
  await page.waitForFunction(() => {
    const image = document.querySelector("#showcaseImage");
    const caption = document.querySelector("#showcaseCaption");
    return image?.complete && image.naturalWidth > 0 && !image.hidden && caption?.hidden;
  });
}

async function assertCompleteShowcaseText(page, label) {
  const clipped = await page.evaluate(() => Array.from(document.querySelectorAll(
    "#spotlightCard .summary-intro, #spotlightCard .summary-richtext em",
  )).filter((element) => (
    element.scrollHeight > element.clientHeight + 1
    || element.scrollWidth > element.clientWidth + 1
  )).map((element) => ({
    selector: element.className || element.tagName.toLowerCase(),
    heightFits: element.scrollHeight <= element.clientHeight + 1,
    widthFits: element.scrollWidth <= element.clientWidth + 1,
  })));
  check(clipped, [], `${label} shows the complete selected-project description and use case`);
}

function normalizedEntranceEvents(events) {
  return events.map(({ element, name }) => ({ element, name })).sort((a, b) => (
    a.element.localeCompare(b.element) || a.name.localeCompare(b.name)
  ));
}

async function assertInitialEntranceEvents(page, label) {
  const events = normalizedEntranceEvents(await page.evaluate(() => globalThis.__showcaseEntranceEvents));
  const expected = normalizedEntranceEvents([
    { element: "stage", name: "showcase-stage-enter" },
    ...expectedNavigationIds.map((id) => ({ element: id, name: "card-enter" })),
  ]);
  check(events, expected, `${label} starts each stage and card entrance exactly once`);
  await page.evaluate(() => { globalThis.__showcaseEntranceEvents.length = 0; });
}

async function assertNoEntranceReplay(page, label) {
  check(await page.evaluate(() => globalThis.__showcaseEntranceEvents), [], `${label} starts no new stage or card entrance animation`);
}

async function assertSelected(page, id, label, expectedHash = "#apps") {
  const card = page.locator(`.app-card[data-app-id="${id}"]`);
  const name = (await card.locator("h3").innerText()).trim();
  await card.click();
  await waitForStageImage(page);
  const state = await page.evaluate((selectedId) => {
    const selected = document.querySelector(`.app-card[data-app-id="${CSS.escape(selectedId)}"]`);
    const progress = document.querySelector('.showcase-status__track[role="progressbar"]');
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
  check(state.progressNow, expectedNavigationIds.indexOf(id) + 1, `${label} synchronizes exact progress index`);
  check(state.progressMax, expectedNavigationIds.length, `${label} synchronizes exact progress total`);
  return id;
}

async function assertSynchronizedFallback(page, {
  id,
  label,
  name,
  navigationIds,
  stored = id,
}) {
  await waitForStageImage(page);
  const state = await page.evaluate(({ selectedId, storageKey }) => {
    const selected = document.querySelector(`.app-card[data-app-id="${CSS.escape(selectedId)}"]`);
    const progress = document.querySelector('.showcase-status__track[role="progressbar"]');
    let storedSelection = "unavailable";
    try {
      storedSelection = localStorage.getItem(storageKey);
    } catch {}
    return {
      hash: location.hash,
      preservedQuery: new URL(location.href).searchParams.get("qa"),
      project: new URL(location.href).searchParams.get("project"),
      stageName: document.querySelector("#spotlightCard .summary-copy > strong")?.textContent.trim(),
      selectedId: selected?.dataset.appId,
      ariaCurrent: selected?.getAttribute("aria-current"),
      selectedCount: document.querySelectorAll(".app-card.selected").length,
      progressNow: Number(progress?.getAttribute("aria-valuenow")),
      progressMax: Number(progress?.getAttribute("aria-valuemax")),
      storedSelection,
    };
  }, { selectedId: id, storageKey: selectedStorageKey });
  check(state.hash, "#apps", `${label} preserves the section hash`);
  check(state.preservedQuery, "keep", `${label} preserves the unrelated query`);
  check(state.project, id, `${label} synchronizes the project query`);
  check(state.stageName, name, `${label} synchronizes the stage`);
  check(state.selectedId, id, `${label} synchronizes the selected card`);
  check(state.ariaCurrent, "true", `${label} synchronizes aria-current`);
  check(state.selectedCount, 1, `${label} keeps one selected card`);
  check(state.progressNow, navigationIds.indexOf(id) + 1, `${label} synchronizes the progress position`);
  check(state.progressMax, navigationIds.length, `${label} synchronizes the progress total`);
  check(state.storedSelection, stored, `${label} synchronizes selection storage`);
}

async function takeScreenshot(page, name, fullPage = false) {
  if (!screenshotDirectory) return;
  check(!/clickflow/iu.test(name), `screenshot name excludes ClickFlow: ${name}`);
  check(await page.locator('[data-app-id="clickflow"]').count(), 0, `${name} has zero ClickFlow nodes before capture`);
  mkdirSync(screenshotDirectory, { recursive: true });
  await page.screenshot({ path: join(screenshotDirectory, `${name}.png`), fullPage });
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
    const initialBaseline = await page.evaluate(() => ({
      cardCount: document.querySelectorAll(".app-card[data-app-id]").length,
      clickflowCount: document.querySelectorAll('[data-app-id="clickflow"]').length,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      resources: performance.getEntriesByType("resource").map((entry) => entry.name),
    }));
    check(initialBaseline.cardCount, expectedCardCount, `${viewport.name} initial DOM renders exactly ${expectedCardCount} cards before catalog scrolling`);
    check(initialBaseline.clickflowCount, 0, `${viewport.name} initial DOM has zero ClickFlow nodes`);
    check(initialBaseline.noHorizontalOverflow, `${viewport.name} initial DOM has no horizontal overflow`);
    check(initialBaseline.resources.some((url) => /clickflow/iu.test(url)), false, `${viewport.name} initial resources exclude ClickFlow`);
    check(requests.some((url) => /clickflow/iu.test(url)), false, `${viewport.name} initial requests exclude ClickFlow`);

    await page.waitForSelector("body.showcase-intro-complete");
    await assertInitialEntranceEvents(page, viewport.name);
    await waitForImages(page);
    await waitForStageImage(page);

    const baseline = await page.evaluate(() => {
      const ids = (selector) => Array.from(document.querySelectorAll(selector), (card) => card.dataset.appId);
      const visualIds = (selector) => Array.from(document.querySelectorAll(selector), (card) => {
        const rect = card.getBoundingClientRect();
        return { id: card.dataset.appId, left: rect.left, top: rect.top };
      }).sort((a, b) => {
        const topDifference = a.top - b.top;
        return Math.abs(topDifference) <= 2 ? a.left - b.left : topDifference;
      }).map(({ id }) => id);
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
      const imagePixels = Array.from(document.querySelectorAll(".card-media img")).map((image) => {
        const id = image.closest(".app-card")?.dataset.appId;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 24;
          canvas.height = 24;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let opaque = 0;
          let sum = 0;
          let squareSum = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index + 3] === 0) continue;
            const luma = (0.2126 * pixels[index]) + (0.7152 * pixels[index + 1]) + (0.0722 * pixels[index + 2]);
            opaque += 1;
            sum += luma;
            squareSum += luma * luma;
          }
          const variance = opaque ? (squareSum / opaque) - ((sum / opaque) ** 2) : 0;
          return { id, opaque, variance };
        } catch (error) {
          return { id, error: String(error) };
        }
      });
      const showcaseTextGeometry = Array.from(document.querySelectorAll(
        "#spotlightCard .summary-intro, #spotlightCard .summary-richtext em",
      )).map((element) => ({
        selector: element.className || element.tagName.toLowerCase(),
        heightFits: element.scrollHeight <= element.clientHeight + 1,
        widthFits: element.scrollWidth <= element.clientWidth + 1,
      }));
      return {
        allIds: ids(".app-card[data-app-id]"),
        apps: ids("#appGrid .app-card[data-app-id]"),
        games: ids("#gameGrid .app-card[data-app-id]"),
        engineering: ids("#engineeringGrid .app-card[data-app-id]"),
        visualApps: visualIds("#appGrid .app-card[data-app-id]"),
        visualGames: visualIds("#gameGrid .app-card[data-app-id]"),
        visualEngineering: visualIds("#engineeringGrid .app-card[data-app-id]"),
        bodyFont: Number.parseFloat(getComputedStyle(document.body).fontSize),
        cardCount: document.querySelectorAll(".app-card").length,
        clickflowCount: document.querySelectorAll('[data-app-id="clickflow"]').length,
        columns: getComputedStyle(document.querySelector("#appGrid")).gridTemplateColumns.split(/\s+/u).filter(Boolean).length,
        imagesReady: Array.from(document.querySelectorAll(".card-media img")).every((image) => image.complete && image.naturalWidth > 0),
        imageCount: document.querySelectorAll(".card-media img").length,
        blankImages: imagePixels.filter(({ opaque, variance, error }) => error || opaque < 24 || variance < 3)
          .map(({ id, opaque, variance, error }) => `${id}: opaque=${opaque || 0}, variance=${variance || 0}, error=${error || ""}`),
        unfittedImages: imageGeometry.filter(({ fitted }) => !fitted)
          .map(({ id, frame, image }) => `${id}:${image} in ${frame}`),
        imagesVisible: imageGeometry.every(({ visible: imageVisible }) => imageVisible),
        imageFramesReady: imageFrames.every(Boolean),
        mediaFallbackCount: document.querySelectorAll(".app-card.media-fallback").length,
        visibleFallbackCaptionCount: Array.from(document.querySelectorAll(".card-media figcaption")).filter(visible).length,
        stageCaptionHidden: document.querySelector("#showcaseCaption")?.hidden,
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        selectedCount: document.querySelectorAll(".app-card.selected").length,
        smallText,
        actionsContained: actionGeometry.every(({ contained }) => contained),
        actionsTallEnough: actionGeometry.every(({ height }) => height >= 44),
        actionsFit: actionGeometry.every(({ widthFits }) => widthFits),
        clippedShowcaseText: showcaseTextGeometry
          .filter(({ heightFits, widthFits }) => !heightFits || !widthFits)
          .map(({ selector, heightFits, widthFits }) => `${selector}:height=${heightFits},width=${widthFits}`),
        ambientLayerCount: document.querySelectorAll(".ambient-grid, .ambient-scan").length,
        readingProgressMax: Number(document.querySelector("#scrollProgress")?.getAttribute("aria-valuemax")),
        readingProgressNow: Number(document.querySelector("#scrollProgress")?.getAttribute("aria-valuenow")),
        activeNavigation: document.querySelector('.top-nav nav a[aria-current="page"]')?.getAttribute("href"),
        featureCount: document.querySelectorAll(".app-card .card-feature").length,
        featureTextReadable: Array.from(document.querySelectorAll(".card-feature")).every((feature) => Number.parseFloat(getComputedStyle(feature).fontSize) >= 14),
      };
    });
    check(baseline.cardCount, expectedCardCount, `${viewport.name} renders ${expectedCardCount} cards`);
    check(baseline.allIds, expectedNavigationIds, `${viewport.name} preserves the independent production navigation order`);
    check(baseline.apps, expectedCollectionIds.apps, `${viewport.name} preserves production application order`);
    check(baseline.games, expectedCollectionIds.games, `${viewport.name} preserves production game order`);
    check(baseline.engineering, expectedCollectionIds.engineering, `${viewport.name} preserves production engineering order`);
    check(baseline.visualApps, expectedCollectionIds.apps, `${viewport.name} application visual order matches literal production order`);
    check(baseline.visualGames, expectedCollectionIds.games, `${viewport.name} game visual order matches literal production order`);
    check(baseline.visualEngineering, expectedCollectionIds.engineering, `${viewport.name} engineering visual order matches literal production order`);
    check(baseline.clickflowCount, 0, `${viewport.name} has zero ClickFlow nodes`);
    check(requests.some((url) => /clickflow/iu.test(url)), false, `${viewport.name} has zero ClickFlow requests`);
    check(baseline.noHorizontalOverflow, `${viewport.name} has no horizontal overflow`);
    check(baseline.imagesReady, `${viewport.name} loads every card image`);
    check(baseline.imageCount, expectedCardCount, `${viewport.name} renders ${expectedCardCount} card images`);
    check(baseline.blankImages, [], `${viewport.name} renders ${expectedCardCount} nonblank, nontransparent catalog images`);
    check(baseline.imagesVisible, `${viewport.name} displays all ${expectedCardCount} loaded card images`);
    check(baseline.unfittedImages, [], `${viewport.name} fits every loaded card image to its media frame`);
    check(baseline.imageFramesReady, `${viewport.name} keeps stable media framing`);
    check(baseline.mediaFallbackCount, 0, `${viewport.name} has zero catalog fallback states`);
    check(baseline.visibleFallbackCaptionCount, 0, `${viewport.name} hides every catalog fallback caption`);
    check(baseline.stageCaptionHidden, true, `${viewport.name} hides the stage fallback caption after a successful image load`);
    check(baseline.selectedCount, 1, `${viewport.name} starts with one selected card`);
    check(baseline.columns, viewport.columns, `${viewport.name} uses expected responsive columns`);
    check(baseline.bodyFont >= 13, `${viewport.name} body text is at least 13px`);
    check(baseline.smallText, [], `${viewport.name} visible text is at least 12px`);
    check(baseline.actionsContained, `${viewport.name} card actions stay inside cards`);
    check(baseline.actionsTallEnough, `${viewport.name} card actions are comfortably sized`);
    check(baseline.actionsFit, `${viewport.name} card action labels fit`);
    check(baseline.clippedShowcaseText, [], `${viewport.name} shows the complete selected-project description and use case`);
    check(baseline.ambientLayerCount, 2, `${viewport.name} renders both ambient motion layers`);
    check(baseline.readingProgressMax, 100, `${viewport.name} exposes a bounded page reading progress`);
    check(baseline.readingProgressNow, 0, `${viewport.name} reading progress starts at the reset top position`);
    check(baseline.activeNavigation, "#overview", `${viewport.name} highlights overview at the reset top position`);
    check(baseline.featureCount, expectedCardCount, `${viewport.name} renders one project feature per card`);
    check(baseline.featureTextReadable, `${viewport.name} project features use readable text`);
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
      if (theme !== "clean") {
        await page.evaluate(() => {
          globalThis.__themeTransitionObserved = false;
          globalThis.__themeTransitionObserver?.disconnect();
          globalThis.__themeTransitionObserver = new MutationObserver(() => {
            if (document.documentElement.classList.contains("theme-transitioning")) {
              globalThis.__themeTransitionObserved = true;
            }
          });
          globalThis.__themeTransitionObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        });
      }
      await page.locator("#themeToggle").click();
      await page.locator(`[data-theme-option="${theme}"]`).click();
      check(await page.getAttribute("html", "data-theme"), theme, `${viewport.name} applies ${theme} theme`);
      if (theme !== "clean") {
        check(await page.evaluate(() => globalThis.__themeTransitionObserved), `${viewport.name}/${theme} exposes short theme feedback`);
      }
      await assertNoEntranceReplay(page, `${viewport.name}/${theme} theme`);
      await page.waitForTimeout(340);
      check(await page.locator("html").evaluate((element) => element.classList.contains("theme-transitioning")), false, `${viewport.name}/${theme} theme feedback settles`);
      await page.evaluate(() => globalThis.__themeTransitionObserver?.disconnect());
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
        const featureRatios = Array.from(document.querySelectorAll(".card-feature strong"), (feature) => {
          const card = feature.closest(".app-card");
          return contrast(getComputedStyle(feature).color, getComputedStyle(card).backgroundColor);
        });
        return {
          heading: contrast(getComputedStyle(document.querySelector(".showcase-copy h1")).color, background),
          lead: contrast(getComputedStyle(document.querySelector(".showcase-lead")).color, background),
          feature: Math.min(...featureRatios),
        };
      });
      check(themeContrast.heading >= 4.5, `${viewport.name}/${theme} hero heading has AA contrast`);
      check(themeContrast.lead >= 4.5, `${viewport.name}/${theme} hero copy has AA contrast`);
      check(themeContrast.feature >= 4.5, `${viewport.name}/${theme} feature labels have AA contrast`);
      await takeScreenshot(page, `${viewport.name}-${theme}`);
    }
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".app-card[data-app-id]");
    check(await page.getAttribute("html", "data-theme"), "night", `${viewport.name} persists theme on reload`);
    await page.waitForSelector("body.showcase-intro-complete");
    await assertInitialEntranceEvents(page, `${viewport.name} reload`);

    await assertSelected(page, expectedCollectionIds.apps[1], `${viewport.name}/application`);
    await assertSelected(page, expectedCollectionIds.games[0], `${viewport.name}/game`);
    await assertSelected(page, expectedCollectionIds.engineering[0], `${viewport.name}/engineering`);

    await assertSelected(page, expectedNavigationIds[0], `${viewport.name}/navigation starts at first app`);
    const navigationSequence = [expectedNavigationIds[0]];
    for (let index = 1; index <= expectedNavigationIds.length; index += 1) {
      await page.locator("#nextApp").click();
      await waitForStageImage(page);
      const projectId = new URL(page.url()).searchParams.get("project");
      navigationSequence.push(projectId);
      await assertCompleteShowcaseText(page, `${viewport.name}/${projectId}`);
    }
    check(
      navigationSequence,
      [...expectedNavigationIds, expectedNavigationIds[0]],
      `${viewport.name} next navigation follows applications, games, engineering, then wraps to the first app`,
    );
    await assertNoEntranceReplay(page, `${viewport.name}/navigation`);

    const keyboardCards = page.locator("#appGrid .app-card[data-app-id]");
    const enterId = await keyboardCards.nth(2).getAttribute("data-app-id");
    await keyboardCards.nth(2).focus();
    await page.keyboard.press("Enter");
    await waitForStageImage(page);
    check(new URL(page.url()).searchParams.get("project"), enterId, `${viewport.name} Enter selects a card`);
    const spaceId = await keyboardCards.nth(3).getAttribute("data-app-id");
    await keyboardCards.nth(3).focus();
    await page.keyboard.press("Space");
    await waitForStageImage(page);
    check(new URL(page.url()).searchParams.get("project"), spaceId, `${viewport.name} Space selects a card`);
    await assertNoEntranceReplay(page, `${viewport.name}/keyboard selection`);

    const selectionBeforeAction = new URL(page.url()).searchParams.get("project");
    await page.evaluate(() => document.addEventListener("click", (event) => {
      if (event.target.closest(".app-card .card-actions a")) event.preventDefault();
    }, true));
    await page.locator(".app-card .card-actions a").first().click();
    check(new URL(page.url()).searchParams.get("project"), selectionBeforeAction, `${viewport.name} action click does not select its card`);

    await assertSelected(page, "travel-generator", `${viewport.name}/category fallback setup`);
    await page.locator("#categoryFilter").selectOption("浏览器插件");
    const filtered = await page.evaluate(() => ({
      apps: Array.from(document.querySelectorAll("#appGrid .app-card[data-app-id]"), (card) => card.dataset.appId),
      games: Array.from(document.querySelectorAll("#gameGrid .app-card[data-app-id]"), (card) => card.dataset.appId),
      engineering: Array.from(document.querySelectorAll("#engineeringGrid .app-card[data-app-id]"), (card) => card.dataset.appId),
    }));
    check(filtered.apps, ["feishu-downloader"], `${viewport.name} category filter affects only matching applications`);
    check(filtered.games, expectedCollectionIds.games, `${viewport.name} category filter retains all five games`);
    check(filtered.engineering, expectedCollectionIds.engineering, `${viewport.name} category filter retains all seven engineering records`);
    const categoryNavigationIds = [
      "feishu-downloader",
      ...expectedCollectionIds.games,
      ...expectedCollectionIds.engineering,
    ];
    await assertSynchronizedFallback(page, {
      id: "feishu-downloader",
      label: `${viewport.name}/category fallback`,
      name: "飞书文件批量下载插件",
      navigationIds: categoryNavigationIds,
    });
    await assertNoEntranceReplay(page, `${viewport.name}/category filter`);

    await page.locator("#categoryFilter").selectOption("all");
    await page.locator('[data-filter-type="plugin"]').click();
    const typeFiltered = await page.evaluate(() => ({
      apps: Array.from(document.querySelectorAll("#appGrid .app-card[data-app-id]"), (card) => card.dataset.appId),
      games: Array.from(document.querySelectorAll("#gameGrid .app-card[data-app-id]"), (card) => card.dataset.appId),
      engineering: Array.from(document.querySelectorAll("#engineeringGrid .app-card[data-app-id]"), (card) => card.dataset.appId),
    }));
    check(typeFiltered.apps, ["feishu-downloader"], `${viewport.name} type chip affects only matching applications`);
    check(typeFiltered.games, expectedCollectionIds.games, `${viewport.name} type chip retains all five games`);
    check(typeFiltered.engineering, expectedCollectionIds.engineering, `${viewport.name} type chip retains all seven engineering records`);
    await assertNoEntranceReplay(page, `${viewport.name}/type filter`);

    await page.locator('[data-filter-type="all"]').click();
    await assertSelected(page, "travel-generator", `${viewport.name}/search fallback setup`);
    await page.locator("#searchInput").fill("小游戏");
    const searchResults = await page.evaluate(() => Object.fromEntries(
      [["apps", "#appGrid"], ["games", "#gameGrid"], ["engineering", "#engineeringGrid"]]
        .map(([collection, selector]) => [collection, Array.from(document.querySelectorAll(`${selector} .app-card[data-app-id]`), (card) => card.dataset.appId)]),
    ));
    check(searchResults, expectedSearch, `${viewport.name} search returns the exact expected ids in each collection`);
    await assertSynchronizedFallback(page, {
      id: "hub",
      label: `${viewport.name}/search fallback`,
      name: "AI 应用方案整理器",
      navigationIds: [...expectedSearch.apps, ...expectedSearch.games, ...expectedSearch.engineering],
    });
    await page.locator("#searchInput").fill("");
    check(await page.locator(".app-card[data-app-id]").count(), expectedCardCount, `${viewport.name} reset restores all cards`);
    const resetOrder = await page.locator(".app-card[data-app-id]").evaluateAll((cards) => cards.map((card) => card.dataset.appId));
    check(resetOrder, expectedNavigationIds, `${viewport.name} reset restores production order`);
    await assertNoEntranceReplay(page, `${viewport.name}/search reset`);

    const editorClosed = await page.evaluate(() => {
      const panel = document.querySelector("#editPanel");
      const close = document.querySelector("#editClose");
      close.focus();
      return { hidden: panel.getAttribute("aria-hidden"), inert: panel.inert, focusBlocked: document.activeElement !== close };
    });
    check(editorClosed, { hidden: "true", inert: true, focusBlocked: true }, `${viewport.name} closed editor is inert`);
    await page.locator("#exportButton").click();
    await page.waitForFunction(() => {
      const rect = document.querySelector("#editPanel").getBoundingClientRect();
      return rect.left >= -1 && rect.right <= innerWidth + 1;
    });
    check(await page.locator("#editPanel").getAttribute("aria-hidden"), "false", `${viewport.name} editor opens`);
    check(await page.locator("#editPanel").evaluate((panel) => panel.inert), false, `${viewport.name} open editor is interactive`);
    const editorOpen = await page.locator("#editPanel").evaluate((panel) => {
      const panelRect = panel.getBoundingClientRect();
      const textNodes = Array.from(panel.querySelectorAll("h2, h3, label > span, button, p")).filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      });
      return {
        accessibleName: panel.getAttribute("aria-label"),
        contained: panelRect.left >= -1 && panelRect.right <= innerWidth + 1,
        noOverflow: panel.scrollWidth <= panel.clientWidth,
        textFits: textNodes.every((element) => element.scrollWidth <= element.clientWidth),
      };
    });
    check(editorOpen, { accessibleName: "编辑面板", contained: true, noOverflow: true, textFits: true }, `${viewport.name} open editor is an accessible unclipped drawer`);
    await takeScreenshot(page, `${viewport.name}-editor`);
    await page.locator("#editClose").click();
    check(await page.locator("#editPanel").getAttribute("aria-hidden"), "true", `${viewport.name} editor closes`);
    check(await page.locator("#editPanel").evaluate((panel) => panel.inert), true, `${viewport.name} closed editor becomes inert`);
    await page.waitForFunction(() => document.querySelector("#editPanel").getBoundingClientRect().left >= innerWidth);
    check(await page.locator("#editPanel").evaluate((panel) => panel.getBoundingClientRect().left >= innerWidth), true, `${viewport.name} closed editor leaves the viewport`);
    await assertNoEntranceReplay(page, `${viewport.name}/editor`);

    await page.locator("#themeToggle").click();
    await page.locator('[data-theme-option="clean"]').click();
    await page.waitForTimeout(220);
    await assertNoEntranceReplay(page, `${viewport.name}/catalog theme`);
    await page.evaluate(() => {
      const html = document.documentElement;
      const previousBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      window.scrollTo(0, Math.max(0, document.querySelector("#apps").offsetTop - 116));
      html.style.scrollBehavior = previousBehavior;
    });
    await page.waitForFunction(() => (
      Number(document.querySelector("#scrollProgress")?.getAttribute("aria-valuenow")) > 0
      && document.querySelector('.top-nav nav a[aria-current="page"]')?.getAttribute("href") === "#apps"
    ));
    const catalogNavigation = await page.evaluate(() => ({
      progress: Number(document.querySelector("#scrollProgress")?.getAttribute("aria-valuenow")),
      current: document.querySelector('.top-nav nav a[aria-current="page"]')?.getAttribute("href"),
    }));
    check(catalogNavigation.progress > 0, `${viewport.name} reading progress follows catalog scrolling`);
    check(catalogNavigation.current, "#apps", `${viewport.name} navigation follows catalog scrolling`);
    await takeScreenshot(page, `${viewport.name}-catalog`);
    await takeScreenshot(page, `${viewport.name}-catalog-full`, true);
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
    await assertNoEntranceReplay(page, `${viewport.name}/image fallback`);

    const stageFallback = await page.locator("#showcaseImage").evaluate(async (image) => {
      const media = image.closest(".showcase-media");
      const before = media.getBoundingClientRect();
      const failed = new Promise((resolveFailure) => image.addEventListener("error", resolveFailure, { once: true }));
      image.src = "data:image/webp;base64,AAAA";
      await failed;
      const after = media.getBoundingClientRect();
      const caption = document.querySelector("#showcaseCaption");
      return {
        captionVisible: Boolean(caption && !caption.hidden),
        imageHidden: image.hidden,
        stable: Math.abs(before.width - after.width) < 1 && Math.abs(before.height - after.height) < 1,
      };
    });
    check(stageFallback, { captionVisible: true, imageHidden: true, stable: true }, `${viewport.name} failed stage image exposes a stable semantic fallback caption`);

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
    ambientGridAnimation: getComputedStyle(document.querySelector(".ambient-grid")).animationName,
    ambientScanDisplay: getComputedStyle(document.querySelector(".ambient-scan")).display,
  }));
  check(reduced.cardTransform, "none", "reduced motion removes card transform");
  check(reduced.stageTransform, "none", "reduced motion removes stage transform");
  check(Number.parseFloat(reduced.cardDuration) <= 0.001, "reduced motion minimizes entrance duration");
  check(reduced.ambientGridAnimation, "none", "reduced motion stops ambient grid movement");
  check(reduced.ambientScanDisplay, "none", "reduced motion hides the ambient scan");
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
  await storagePage.goto(`${baseUrl}/index.html?qa=keep#apps`, { waitUntil: "networkidle" });
  const storageBooted = await storagePage.locator(".app-card[data-app-id]").count() === expectedCardCount;
  check(storageBooted, "storage-throwing context renders default catalog");
  if (storageBooted) {
    check(await storagePage.getAttribute("html", "data-theme"), "clean", "storage-throwing context uses default theme");
    const firstVisible = await storagePage.locator(".app-card[data-app-id]").first().getAttribute("data-app-id");
    check(firstVisible, "hub", "storage-throwing context renders the first production project");
    check(await storagePage.locator(".app-card.selected").getAttribute("data-app-id"), "travel-generator", "storage-throwing context keeps the approved default selection");
    await storagePage.locator("#categoryFilter").selectOption("浏览器插件");
    await assertSynchronizedFallback(storagePage, {
      id: "feishu-downloader",
      label: "storage-throwing/category fallback",
      name: "飞书文件批量下载插件",
      navigationIds: ["feishu-downloader", ...expectedCollectionIds.games, ...expectedCollectionIds.engineering],
      stored: "unavailable",
    });
    await storagePage.locator("#categoryFilter").selectOption("all");
    const storageSelectedId = await storagePage.locator("#appGrid .app-card[data-app-id]").nth(1).getAttribute("data-app-id");
    await storagePage.locator(`#appGrid .app-card[data-app-id="${storageSelectedId}"]`).click();
    check(new URL(storagePage.url()).searchParams.get("project"), storageSelectedId, "storage-throwing context keeps selection functional when persistence throws");
    await storagePage.locator("#themeToggle").click();
    await storagePage.locator('[data-theme-option="coral"]').click();
    check(await storagePage.getAttribute("html", "data-theme"), "coral", "storage-throwing context keeps theme changes functional when persistence throws");
    await storagePage.locator("#exportButton").click();
    check(await storagePage.locator("#editPanel").getAttribute("aria-hidden"), "false", "storage-throwing context opens editor");
    const originalName = await storagePage.locator("#editName").inputValue();
    await storagePage.locator("#editName").fill(`${originalName} 临时保存`);
    await storagePage.locator("#editSave").click();
    check(await storagePage.locator("#spotlightCard .summary-copy > strong").innerText(), `${originalName} 临时保存`, "storage-throwing context keeps editor save data in the live UI when persistence throws");
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
