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
const previewPath = "/design-previews/hub-interactive-atlas/index.html";
const failures = [];
const screenshotDirectory = process.env.HUB_ATLAS_SCREENSHOT_DIR || "";

function contentType(path) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
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
    server.listen(0, "127.0.0.1", () => {
      resolveServer(`http://127.0.0.1:${server.address().port}`);
    });
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
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    chromium.executablePath(),
  ].find((path) => path && existsSync(path));
}

function collectPageFailures(page, label) {
  const current = [];
  page.on("console", (message) => {
    if (message.type() === "error") current.push(`${label}/console: ${message.text()}`);
  });
  page.on("pageerror", (error) => current.push(`${label}/pageerror: ${error.message}`));
  page.on("requestfailed", (request) => current.push(`${label}/request: ${request.url()} ${request.failure()?.errorText || "failed"}`));
  page.on("response", (response) => {
    if (response.status() >= 400) current.push(`${label}/http-${response.status()}: ${response.url()}`);
  });
  return current;
}

const server = createStaticServer();
const baseUrl = await startServer(server);
const executablePath = browserExecutable();
assert.ok(executablePath, "Chrome, Edge, or Playwright Chromium is required");
const browser = await chromium.launch({ executablePath, headless: true });

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900, columns: 4 },
    { name: "tablet", width: 1024, height: 768, columns: 2 },
    { name: "mobile", width: 390, height: 844, columns: 1 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const pageFailures = collectPageFailures(page, viewport.name);
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));

    await page.goto(`${baseUrl}${previewPath}`, { waitUntil: "networkidle" });
    await page.waitForSelector('.project-card[data-project-id="hub"]');
    await page.waitForTimeout(850);

    const layout = await page.evaluate(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const smallText = Array.from(document.body.querySelectorAll("*")).filter((element) => {
        if (!visible(element) || element.children.length > 0 || !element.textContent.trim()) return false;
        return Number.parseFloat(getComputedStyle(element).fontSize) < 12;
      }).map((element) => ({
        selector: element.className || element.tagName,
        size: getComputedStyle(element).fontSize,
        text: element.textContent.trim().slice(0, 24),
      }));
      const grid = document.querySelector("#appGrid");
      const heroStage = document.querySelector("#heroStage")?.getBoundingClientRect();
      const heroContent = document.querySelector("#heroContent")?.getBoundingClientRect();
      const heroVisual = document.querySelector("#heroVisual")?.getBoundingClientRect();
      return {
        cardCount: document.querySelectorAll(".project-card[data-project-id]").length,
        clickflowCount: document.querySelectorAll('[data-project-id="clickflow"]').length,
        columns: getComputedStyle(grid).gridTemplateColumns.split(/\s+/u).filter(Boolean).length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        smallText,
        intro: document.body.classList.contains("is-intro"),
        heroStageWidth: heroStage?.width || 0,
        heroContentWidth: heroContent?.width || 0,
        heroVisualWidth: heroVisual?.width || 0,
      };
    });

    if (layout.cardCount !== 28) failures.push(`${viewport.name}/card count: ${JSON.stringify(layout)}`);
    if (layout.clickflowCount !== 0) failures.push(`${viewport.name}/ClickFlow DOM: ${JSON.stringify(layout)}`);
    if (layout.columns !== viewport.columns) failures.push(`${viewport.name}/columns: ${JSON.stringify(layout)}`);
    if (layout.overflow) failures.push(`${viewport.name}/horizontal overflow: ${JSON.stringify(layout)}`);
    if (layout.smallText.length) failures.push(`${viewport.name}/small text: ${JSON.stringify(layout.smallText.slice(0, 8))}`);
    if (layout.intro) failures.push(`${viewport.name}/intro replay gate: ${JSON.stringify(layout)}`);
    if (viewport.name === "mobile" && (
      layout.heroContentWidth < layout.heroStageWidth * 0.85
      || layout.heroVisualWidth < layout.heroStageWidth * 0.85
    )) {
      failures.push(`${viewport.name}/hero column width: ${JSON.stringify(layout)}`);
    }
    if (requests.some((url) => url.toLowerCase().includes("clickflow"))) {
      failures.push(`${viewport.name}/ClickFlow request: ${requests.filter((url) => url.toLowerCase().includes("clickflow")).join(", ")}`);
    }
    if (screenshotDirectory) {
      mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({
        path: join(screenshotDirectory, `${viewport.name}.png`),
        fullPage: false,
      });
    }

    const secondCard = page.locator(".project-card[data-project-id]").nth(1);
    const selectedId = await secondCard.getAttribute("data-project-id");
    const selectedName = await secondCard.locator("h4").textContent();
    await secondCard.click();
    const selection = await page.evaluate((id) => ({
      current: document.querySelector(`.project-card[data-project-id="${CSS.escape(id)}"]`)?.getAttribute("aria-current"),
      heroName: document.querySelector("#heroContent h2")?.textContent,
      projectParam: new URL(location.href).searchParams.get("project"),
      intro: document.body.classList.contains("is-intro"),
    }), selectedId);
    if (selection.current !== "true" || selection.heroName !== selectedName?.trim() || selection.projectParam !== selectedId || selection.intro) {
      failures.push(`${viewport.name}/selection sync: ${JSON.stringify(selection)}`);
    }

    if (viewport.name === "desktop") {
      const boundaries = await page.evaluate(() => {
        const ids = (selector) => Array.from(document.querySelectorAll(selector), (card) => card.dataset.projectId);
        return {
          apps: ids("#appGrid .project-card[data-project-id]"),
          games: ids("#gameGrid .project-card[data-project-id]"),
          engineering: ids("#engineeringGrid .project-card[data-project-id]"),
        };
      });
      for (const [from, expected, label] of [
        [boundaries.apps.at(-1), boundaries.games[0], "apps-to-games"],
        [boundaries.games.at(-1), boundaries.engineering[0], "games-to-engineering"],
        [boundaries.engineering.at(-1), boundaries.apps[0], "engineering-to-apps"],
      ]) {
        await page.locator(`.project-card[data-project-id="${from}"]`).click();
        await page.locator("[data-stage-next]").click();
        const actual = new URL(page.url()).searchParams.get("project");
        if (actual !== expected) failures.push(`desktop/${label}: expected ${expected}, got ${actual}`);
      }
    }

    const desktopChip = page.locator('[data-type="桌面工具"]');
    if (await desktopChip.count()) {
      await desktopChip.click();
      const filtered = await page.evaluate(() => ({
        count: document.querySelectorAll(".project-card[data-project-id]").length,
        intro: document.body.classList.contains("is-intro"),
      }));
      if (!filtered.count || filtered.intro) failures.push(`${viewport.name}/filter state: ${JSON.stringify(filtered)}`);
      await page.locator('[data-type="all"]').click();
    }

    const firstAction = page.locator(".project-card .card-action").first();
    await firstAction.click();
    const inspector = await page.evaluate(() => ({
      open: document.querySelector("#linkInspector")?.open,
      url: document.querySelector("[data-inspector-url]")?.textContent.trim(),
    }));
    if (!inspector.open || !inspector.url || inspector.url === "#") {
      failures.push(`${viewport.name}/link inspector: ${JSON.stringify(inspector)}`);
    }
    await page.locator("[data-inspector-close]").first().click();

    const mappedImage = page.locator('[data-project-id="hub"] img[data-project-image]').first();
    if (await mappedImage.count()) {
      const fallback = await mappedImage.evaluate((image) => {
        const visual = image.parentElement;
        const before = visual.getBoundingClientRect();
        image.dispatchEvent(new Event("error"));
        const after = visual.getBoundingClientRect();
        const fallbackNode = visual.querySelector(".image-fallback");
        return {
          imageHidden: image.hidden,
          fallbackVisible: fallbackNode && !fallbackNode.hidden,
          stable: Math.abs(before.width - after.width) < 1 && Math.abs(before.height - after.height) < 1,
        };
      });
      if (!Object.values(fallback).every(Boolean)) failures.push(`${viewport.name}/image fallback: ${JSON.stringify(fallback)}`);
    }

    await page.locator("#themeToggle").click();
    await page.locator('#themeMenu [data-theme="night"]').click();
    await page.reload({ waitUntil: "networkidle" });
    const persistedTheme = await page.getAttribute("html", "data-theme");
    if (persistedTheme !== "night") failures.push(`${viewport.name}/theme persistence: ${persistedTheme}`);
    const imageLabelContrast = await page.locator(".has-image > .cover-category").first().evaluate((label) => {
      const channels = (value) => (value.match(/[\d.]+/gu) || []).slice(0, 3).map(Number);
      const luminance = (value) => {
        const normalized = channels(value).map((channel) => channel / 255);
        const linear = normalized.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
        return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
      };
      const style = getComputedStyle(label);
      const foreground = luminance(style.color);
      const background = luminance(style.backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    if (imageLabelContrast < 4.5) failures.push(`${viewport.name}/night image label contrast: ${imageLabelContrast.toFixed(2)}`);

    failures.push(...pageFailures);
    await context.close();
  }

  const reducedContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const reducedPage = await reducedContext.newPage();
  const reducedFailures = collectPageFailures(reducedPage, "reduced-motion");
  await reducedPage.goto(`${baseUrl}${previewPath}`, { waitUntil: "networkidle" });
  await reducedPage.waitForSelector(".project-card");
  await reducedPage.locator(".project-card").first().hover();
  const reducedTransform = await reducedPage.locator(".project-card").first().evaluate((card) => getComputedStyle(card).transform);
  if (reducedTransform !== "none") failures.push(`reduced-motion/transform: ${reducedTransform}`);
  failures.push(...reducedFailures);
  await reducedContext.close();
} finally {
  await browser.close();
  await stopServer(server);
}

assert.deepEqual(failures, []);
process.stdout.write("Interactive atlas preview browser smoke passed for desktop, tablet, mobile, and reduced motion.\n");
