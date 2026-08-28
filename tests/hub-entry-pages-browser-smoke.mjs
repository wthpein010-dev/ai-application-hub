import assert from "node:assert/strict";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const apps = loadDefaultAppsFromRuntime(runtime).filter((app) => app.entry?.startsWith("./projects/"));

function sectionFor(app) {
  if (app.status === "game") return "games";
  if (app.status === "ai" || app.status === "engineering") return "engineering";
  return "apps";
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
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".mjs": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".vtt": "text/vtt; charset=utf-8",
    ".wasm": "application/wasm",
    ".webp": "image/webp",
  }[extname(path).toLowerCase()] || "application/octet-stream";
}

function createStaticServer() {
  return createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const target = resolve(root, "." + normalize(pathname));

    if (!target.startsWith(root + sep) && target !== root) {
      response.writeHead(403).end();
      return;
    }

    const path = existsSync(target) && statSync(target).isDirectory() ? join(target, "index.html") : target;
    if (!existsSync(path) || statSync(path).isDirectory()) {
      response.writeHead(404).end();
      return;
    }

    const stats = statSync(path);
    const headers = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Type": contentType(path),
    };
    const range = request.headers.range;

    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [rawStart, rawEnd] = range.replace("bytes=", "").split("-");
      const start = rawStart ? Number(rawStart) : 0;
      const end = rawEnd ? Math.min(Number(rawEnd), stats.size - 1) : stats.size - 1;
      response.writeHead(206, {
        ...headers,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
      });
      createReadStream(path, { start, end }).pipe(response);
      return;
    }

    response.writeHead(200, { ...headers, "Content-Length": stats.size });
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

function urlPath(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

const playwrightBrowserPath = chromium.executablePath();
const browserPath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  playwrightBrowserPath,
].find((path) => path && existsSync(path));

assert.ok(browserPath, "A system or Playwright Chromium executable is required for browser verification.");
assert.equal(apps.length, 27, "all local catalog entries are covered");

const requestedBaseUrl = process.env.HUB_BASE_URL?.replace(/\/+$/, "");
const server = requestedBaseUrl ? null : createStaticServer();
const baseUrl = requestedBaseUrl || await startServer(server);
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const failures = [];

try {
  for (const viewport of [
    { width: 1440, height: 900, name: "desktop" },
    { width: 390, height: 844, name: "mobile" },
  ]) {
    const context = await browser.newContext({ viewport });

    const hubPage = await context.newPage();
    const selectedId = "nang-keng-pai-pai-xiang";
    const selectedCard = `#gameGrid article[data-app-id="${selectedId}"]`;
    await hubPage.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await hubPage.waitForSelector(selectedCard);
    const closedEditor = await hubPage.evaluate(() => {
      const panel = document.querySelector("#editPanel");
      const close = document.querySelector("#editClose");
      close?.focus();
      return {
        hidden: panel?.getAttribute("aria-hidden") === "true",
        inert: Boolean(panel?.inert),
        focusBlocked: document.activeElement !== close,
      };
    });
    if (!Object.values(closedEditor).every(Boolean)) {
      failures.push(`${viewport.name}/hub closed editor focus isolation: ${JSON.stringify(closedEditor)}`);
    }
    await hubPage.locator("#exportButton").click();
    const openEditor = await hubPage.evaluate(() => {
      const panel = document.querySelector("#editPanel");
      const close = document.querySelector("#editClose");
      close?.focus();
      return {
        visible: panel?.getAttribute("aria-hidden") === "false",
        interactive: panel?.inert === false,
        focusable: document.activeElement === close,
      };
    });
    if (!Object.values(openEditor).every(Boolean)) {
      failures.push(`${viewport.name}/hub open editor focus behavior: ${JSON.stringify(openEditor)}`);
    }
    await hubPage.locator("#editClose").click();
    const hubLayout = await hubPage.evaluate(() => {
      const header = document.querySelector(".top-nav")?.getBoundingClientRect();
      const hero = document.querySelector("#overview")?.getBoundingClientRect();
      const applications = document.querySelector("#apps")?.getBoundingClientRect();
      return {
        headerHeight: header?.height || 0,
        heroBottom: (hero?.bottom || 0) + window.scrollY,
        applicationsTop: (applications?.top || 0) + window.scrollY,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    if (hubLayout.overflow) failures.push(`${viewport.name}/hub horizontal overflow: ${JSON.stringify(hubLayout)}`);
    if (viewport.name === "mobile") {
      if (hubLayout.headerHeight > 120) failures.push(`${viewport.name}/hub compact header: ${JSON.stringify(hubLayout)}`);
      if (hubLayout.heroBottom > 1_120 || hubLayout.applicationsTop > 1_170) {
        failures.push(`${viewport.name}/hub compact first screen: ${JSON.stringify(hubLayout)}`);
      }
    }
    const catalogPlacement = await hubPage.evaluate((id) => ({
      apps: document.querySelectorAll(`#appGrid article[data-app-id="${id}"]`).length,
      games: document.querySelectorAll(`#gameGrid article[data-app-id="${id}"]`).length,
      engineering: document.querySelectorAll(`#engineeringGrid article[data-app-id="${id}"]`).length,
    }), selectedId);
    if (catalogPlacement.apps !== 0 || catalogPlacement.games !== 1 || catalogPlacement.engineering !== 0) {
      failures.push(`${viewport.name}/hub catalog placement: ${JSON.stringify(catalogPlacement)}`);
    }
    for (const id of ["planmap", "simuai"]) {
      const placement = await hubPage.evaluate((projectId) => ({
        apps: document.querySelectorAll(`#appGrid article[data-app-id="${projectId}"]`).length,
        games: document.querySelectorAll(`#gameGrid article[data-app-id="${projectId}"]`).length,
        engineering: document.querySelectorAll(`#engineeringGrid article[data-app-id="${projectId}"]`).length,
      }), id);
      if (placement.apps !== 1 || placement.games !== 0 || placement.engineering !== 0) {
        failures.push(`${viewport.name}/hub ${id} application placement: ${JSON.stringify(placement)}`);
      }
    }
    const enterCard = '#appGrid article[data-app-id="hub"]';
    await hubPage.locator(enterCard).focus();
    await hubPage.keyboard.press("Enter");
    const afterEnter = await hubPage.evaluate((selector) => ({
      activeId: document.activeElement?.getAttribute("data-app-id") || "",
      current: document.querySelector(selector)?.getAttribute("aria-current") || "",
      selectedId: localStorage.getItem("ai-competition-hub-v2-selected") || "",
    }), enterCard);
    if (afterEnter.activeId !== "hub" || afterEnter.current !== "true" || afterEnter.selectedId !== "hub") {
      failures.push(`${viewport.name}/hub Enter card selection: ${JSON.stringify(afterEnter)}`);
    }
    await hubPage.locator(selectedCard).focus();
    await hubPage.keyboard.press(" ");
    const afterSpace = await hubPage.evaluate(({ id, selector }) => ({
      activeId: document.activeElement?.getAttribute("data-app-id") || "",
      current: document.querySelector(selector)?.getAttribute("aria-current") || "",
      selectedId: localStorage.getItem("ai-competition-hub-v2-selected") || "",
    }), { id: selectedId, selector: selectedCard });
    if (afterSpace.activeId !== selectedId || afterSpace.current !== "true" || afterSpace.selectedId !== selectedId) {
      failures.push(`${viewport.name}/hub Space card selection: ${JSON.stringify(afterSpace)}`);
    }
    const actionLink = '#gameGrid article[data-app-id="fill-what"] a[data-action="web"]';
    const actionHref = await hubPage.locator(actionLink).getAttribute("href");
    const actionPagePromise = context.waitForEvent("page");
    await hubPage.locator(actionLink).click({ modifiers: ["ControlOrMeta"] });
    const actionPage = await actionPagePromise;
    await actionPage.waitForLoadState("domcontentloaded");
    const actionBehavior = {
      openedUrl: actionPage.url(),
      expectedUrl: new URL(actionHref, hubPage.url()).href,
      selectedId: await hubPage.evaluate(() => localStorage.getItem("ai-competition-hub-v2-selected") || ""),
    };
    await actionPage.close();
    if (actionBehavior.openedUrl !== actionBehavior.expectedUrl || actionBehavior.selectedId !== selectedId) {
      failures.push(`${viewport.name}/hub card action navigation: ${JSON.stringify(actionBehavior)}`);
    }
    const pointerId = "simuai";
    const pointerCard = `#appGrid article[data-app-id="${pointerId}"]`;
    await hubPage.evaluate((selector) => {
      window.__hubCardBeforeSelection = document.querySelector(selector);
    }, pointerCard);
    await hubPage.locator(`${pointerCard} h3 .editable-value`).click();
    const selection = await hubPage.evaluate(({ id, selector }) => ({
      cardPreserved: window.__hubCardBeforeSelection === document.querySelector(selector),
      cardSelected: document.querySelector(selector)?.classList.contains("selected") || false,
      spotlightName: document.querySelector("#spotlightCard strong")?.textContent.trim() || "",
      storedId: localStorage.getItem("ai-competition-hub-v2-selected"),
      repeatedStatusName: document.querySelector(".showcase-status strong")?.textContent.trim() || "",
      statusPosition: document.querySelector(".showcase-status__position")?.textContent.trim() || "",
      progressNow: Number(document.querySelector(".showcase-status__track")?.getAttribute("aria-valuenow") || 0),
      progressMax: Number(document.querySelector(".showcase-status__track")?.getAttribute("aria-valuemax") || 0),
      legacyDots: document.querySelectorAll(".showcase-dot, [data-dot-id]").length,
      cardRole: document.querySelector(selector)?.getAttribute("role") || "",
      cardTabIndex: document.querySelector(selector)?.tabIndex ?? -1,
      cardAriaCurrent: document.querySelector(selector)?.getAttribute("aria-current") || "",
      cardAriaSelected: document.querySelector(selector)?.getAttribute("aria-selected") || "",
      gridRole: document.querySelector(selector)?.parentElement?.getAttribute("role") || "",
    }), { id: pointerId, selector: pointerCard });
    for (const [condition, ok] of Object.entries({
      cardPreservedWithoutReplay: selection.cardPreserved,
      clickedCardSelected: selection.cardSelected,
      selectedCardAccessible: selection.cardRole === ""
        && selection.cardTabIndex === 0
        && selection.cardAriaCurrent === "true"
        && selection.cardAriaSelected === ""
        && selection.gridRole === "",
      spotlightSynchronized: selection.spotlightName === "万象实验室",
      selectedProjectPersisted: selection.storedId === pointerId,
      navigationStatusSynchronized: selection.repeatedStatusName === ""
        && /^\d{2,}\s*\/\s*\d{2,}$/.test(selection.statusPosition)
        && selection.progressNow > 0
        && selection.progressNow <= selection.progressMax
        && selection.legacyDots === 0,
    })) {
      if (!ok) failures.push(`${viewport.name}/hub ${condition}: ${JSON.stringify(selection)}`);
    }
    await hubPage.locator("#nextApp").click();
    const afterNext = await hubPage.evaluate(() => ({
      position: document.querySelector(".showcase-status__position")?.textContent.trim() || "",
      now: Number(document.querySelector(".showcase-status__track")?.getAttribute("aria-valuenow") || 0),
      spotlightName: document.querySelector("#spotlightCard strong")?.textContent.trim() || "",
    }));
    await hubPage.locator("#prevApp").click();
    const afterPrevious = await hubPage.evaluate(() => ({
      position: document.querySelector(".showcase-status__position")?.textContent.trim() || "",
      now: Number(document.querySelector(".showcase-status__track")?.getAttribute("aria-valuenow") || 0),
      spotlightName: document.querySelector("#spotlightCard strong")?.textContent.trim() || "",
    }));
    for (const [condition, ok] of Object.entries({
      nextButtonUpdatesStatus: afterNext.position !== selection.statusPosition
        && afterNext.spotlightName !== selection.spotlightName
        && afterNext.now !== selection.progressNow,
      previousButtonRestoresStatus: afterPrevious.position === selection.statusPosition
        && afterPrevious.spotlightName === selection.spotlightName
        && afterPrevious.now === selection.progressNow,
    })) {
      if (!ok) failures.push(`${viewport.name}/hub ${condition}: ${JSON.stringify({ selection, afterNext, afterPrevious })}`);
    }
    await hubPage.close();

    for (const app of apps) {
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const source = message.location().url;
        failures.push(`${viewport.name}/${app.id} console: ${message.text()}${source ? ` ${source}` : ""}`);
      });
      page.on("pageerror", (error) => failures.push(`${viewport.name}/${app.id} page: ${error.message}`));
      page.on("requestfailed", (request) => {
        const reason = request.failure()?.errorText || "request failed";
        if (reason.includes("ERR_ABORTED")) return;
        failures.push(`${viewport.name}/${app.id} request: ${reason} ${request.url()}`);
      });
      page.on("response", (response) => {
        if (response.status() >= 400) failures.push(`${viewport.name}/${app.id} HTTP ${response.status()}: ${response.url()}`);
      });

      const target = urlPath(app.entry.replace(/^\.\//, ""));
      await page.goto(`${baseUrl}/${target}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(350);

      const layout = await page.evaluate(({ expectedName, expectedSection }) => {
        const home = document.querySelector(".hub-home-link");
        const homeBox = home?.getBoundingClientRect();
        const homeStyle = home ? getComputedStyle(home) : null;
        const visibleMedia = Array.from(document.querySelectorAll("canvas, img, video, iframe"))
          .some((element) => {
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return box.width > 20 && box.height > 20 && style.display !== "none" && style.visibility !== "hidden";
          });
        const textLength = (document.body.innerText || "").replace(/\s+/g, "").length;
        const resolvedHome = home ? new URL(home.href) : null;

        return {
          bodyShell: document.body.classList.contains("hub-subpage"),
          homeCount: document.querySelectorAll(".hub-home-link").length,
          homeFixed: homeStyle?.position === "fixed",
          homeInViewport: Boolean(homeBox && homeBox.left >= 0 && homeBox.top >= 0
            && homeBox.right <= innerWidth + 1 && homeBox.bottom <= innerHeight + 1),
          homeSection: resolvedHome?.hash || "",
          homeTarget: resolvedHome?.pathname.endsWith("/index.html") || false,
          nonblank: textLength >= 8 || visibleMedia,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          title: document.title.trim(),
          titleMatches: document.title.trim() === expectedName,
          expectedSection: `#${expectedSection}`,
        };
      }, { expectedName: app.name, expectedSection: sectionFor(app) });

      for (const [condition, ok] of Object.entries({
        bodyShell: layout.bodyShell,
        oneHomeControl: layout.homeCount === 1,
        fixedHomeControl: layout.homeFixed,
        visibleHomeControl: layout.homeInViewport,
        correctHomeTarget: layout.homeTarget && layout.homeSection === layout.expectedSection,
        nonblankPrimaryContent: layout.nonblank,
        exactTitle: layout.titleMatches,
        noHorizontalOverflow: !layout.overflow,
      })) {
        if (!ok) failures.push(`${viewport.name}/${app.id} ${condition}: ${JSON.stringify(layout)}`);
      }

      page.removeAllListeners();
      await page.close();
    }

    await context.close();
  }

  assert.deepEqual(failures, []);
  console.log(`Verified home card selection and ${apps.length} entry pages at desktop and mobile sizes.`);
} finally {
  await browser.close();
  if (server) await stopServer(server);
}
