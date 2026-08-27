import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadDefaultAppsFromRuntime } from "../tests/helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = resolve(process.env.HUB_SOURCE_ROOT || root);
const outputDirectory = join(root, "assets", "hub-showcase");
const registryPath = join(root, "hub-project-media.js");
const sourcesPath = join(root, "scripts", "hub-showcase-media-sources.json");
const runtimePath = join(root, "app-20260706-restore-games.js");
const SHOWCASE_CACHE_VERSION = "20260827-hub-visual-polish";
const bundledNodeModules = join(
  homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "node",
  "node_modules",
);
const modulePaths = [process.env.CODEX_NODE_MODULES, bundledNodeModules].filter(Boolean);
const require = createRequire(import.meta.url);

function resolveDependency(name) {
  return require.resolve(name, { paths: modulePaths });
}

function contentType(path) {
  return {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  }[extname(path).toLowerCase()] || "application/octet-stream";
}

function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(String(header || "").trim());
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const requestedLength = Number(match[2]);
    if (!Number.isSafeInteger(requestedLength) || requestedLength <= 0) return null;
    const suffixLength = Math.min(requestedLength, size);
    return { start: size - suffixLength, end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return null;
  return { start, end };
}

export function createStaticServer() {
  return createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const target = resolve(sourceRoot, `.${normalize(pathname)}`);
    if (!target.startsWith(sourceRoot + sep) && target !== sourceRoot) {
      response.writeHead(403).end();
      return;
    }
    const path = existsSync(target) && statSync(target).isDirectory() ? join(target, "index.html") : target;
    if (!existsSync(path) || statSync(path).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    const stats = statSync(path);
    const range = request.headers.range ? parseByteRange(request.headers.range, stats.size) : null;
    if (request.headers.range && !range) {
      response.writeHead(416, { "Content-Range": `bytes */${stats.size}` }).end();
      return;
    }
    if (range) {
      const length = range.end - range.start + 1;
      response.writeHead(206, {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Length": length,
        "Content-Range": `bytes ${range.start}-${range.end}/${stats.size}`,
        "Content-Type": contentType(path),
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(path, range).pipe(response);
      return;
    }
    response.writeHead(200, {
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Length": stats.size,
      "Content-Type": contentType(path),
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(path).pipe(response);
  });
}

function startServer(server) {
  return new Promise((ready) => {
    server.listen(0, "127.0.0.1", () => ready(`http://127.0.0.1:${server.address().port}`));
  });
}

function stopServer(server) {
  return new Promise((done) => server.close(done));
}

function browserExecutable(chromium) {
  return [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    chromium.executablePath(),
  ].find((path) => path && existsSync(path));
}

function sourcePath(path) {
  const resolved = resolve(sourceRoot, path);
  if (!resolved.startsWith(sourceRoot + sep)) throw new Error(`Source must remain inside HUB_SOURCE_ROOT: ${path}`);
  return resolved;
}

export function assertSafeConfiguredPublicBase(publicBase = process.env.HUB_PUBLIC_BASE || "") {
  if (publicBase && publicBase.toLowerCase().includes("clickflow")) {
    throw new Error("ClickFlow public base is prohibited");
  }
}

export function assertSafeCaptureUrl(url) {
  if (String(url).toLowerCase().includes("clickflow")) {
    throw new Error(`ClickFlow capture URL is prohibited: ${url}`);
  }
}

function assertSafeSources(sources) {
  if (process.platform !== "win32") return;
  for (const [id, source] of Object.entries(sources)) {
    const inspected = `${id}\n${source.entry || ""}\n${source.publicEntry || ""}\n${source.source || ""}`.toLowerCase();
    if (inspected.includes("clickflow")) {
      throw new Error(`ClickFlow sources are prohibited on Windows: ${id}`);
    }
  }
}

function validateSources(apps, sources) {
  const expectedIds = apps.filter(({ id }) => id !== "clickflow").map(({ id }) => id);
  const actualIds = Object.keys(sources);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error("Showcase media source ids must match production ids without ClickFlow in production order");
  }
  for (const [id, source] of Object.entries(sources)) {
    if (!["file", "capture"].includes(source.mode)) throw new Error(`Unsupported source mode for ${id}`);
    if (!["standard", "wide", "tall"].includes(source.layout)) throw new Error(`Unsupported layout for ${id}`);
    if (typeof source.feature !== "string" || source.feature.trim().length < 4) throw new Error(`Missing feature story for ${id}`);
    if (!/^#[0-9a-f]{6}$/u.test(source.accent)) throw new Error(`Invalid project accent for ${id}`);
    if (!["product", "data", "game", "media"].includes(source.visualKind)) throw new Error(`Invalid visual kind for ${id}`);
    if (source.mode === "file" && typeof source.source !== "string") throw new Error(`Missing file source for ${id}`);
    if (source.mode === "capture" && typeof source.entry !== "string" && typeof source.publicEntry !== "string") {
      throw new Error(`Missing capture entry for ${id}`);
    }
    if (source.publicEntry && typeof source.publicEntry !== "string") throw new Error(`Invalid public capture entry for ${id}`);
    if (source.readySelector && typeof source.readySelector !== "string") throw new Error(`Invalid ready selector for ${id}`);
    if (source.focusSelector && typeof source.focusSelector !== "string") throw new Error(`Invalid focus selector for ${id}`);
    if (source.focusFile && typeof source.focusFile !== "string") throw new Error(`Invalid focus file for ${id}`);
    if (source.clickSelector && typeof source.clickSelector !== "string") throw new Error(`Invalid click selector for ${id}`);
    if (source.afterClickText && typeof source.afterClickText !== "string") throw new Error(`Invalid post-click text for ${id}`);
    if (source.waitForCanvasVariance !== undefined && typeof source.waitForCanvasVariance !== "boolean") {
      throw new Error(`Invalid canvas variance flag for ${id}`);
    }
    if (source.captureDelay !== undefined && (!Number.isFinite(source.captureDelay) || source.captureDelay < 0 || source.captureDelay > 10000)) {
      throw new Error(`Invalid capture delay for ${id}`);
    }
    if (source.mode === "capture" && source.captureTime === undefined && !source.focusSelector && source.focusMode !== "auto") {
      throw new Error(`Missing focus strategy for ${id}`);
    }
    if (source.captureTime !== undefined && (!Number.isFinite(source.captureTime) || source.captureTime < 0)) {
      throw new Error(`Invalid capture time for ${id}`);
    }
  }
}

function visualBackground(kind) {
  return {
    data: "#eaf1f7",
    game: "#fff1df",
    media: "#f5edf6",
    product: "#edf4f1",
  }[kind] || "#edf4f1";
}

async function roundedImage(sharp, input, width, height, position = "attention", radius = 28) {
  const image = await sharp(input)
    .resize({ width, height, fit: "cover", position })
    .png()
    .toBuffer();
  const mask = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/></svg>`);
  return sharp(image).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

function solidBuffer(sharp, width, height, background) {
  return sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
}

async function composeProductFrame(sharp, contextInput, focusInput, output, source) {
  const width = 1440;
  const height = 900;
  const context = await roundedImage(sharp, contextInput, 1060, 716, "attention", 30);
  const focus = await roundedImage(sharp, focusInput || contextInput, 440, 516, "attention", 24);
  const shadow = await sharp({ create: { width: 472, height: 548, channels: 4, background: "rgba(9, 24, 22, 0.22)" } })
    .blur(18)
    .png()
    .toBuffer();
  const focusBorder = await solidBuffer(sharp, 460, 536, "rgba(255,255,255,0.96)");
  const accentRail = await solidBuffer(sharp, 14, 900, source.accent);
  const accentMark = await solidBuffer(sharp, 150, 12, source.accent);
  const dotOne = await roundedImage(sharp, await solidBuffer(sharp, 18, 18, source.accent), 18, 18, "center", 9);
  const dotTwo = await roundedImage(sharp, await solidBuffer(sharp, 18, 18, "#f5b449"), 18, 18, "center", 9);
  const dotThree = await roundedImage(sharp, await solidBuffer(sharp, 18, 18, "#ffffff"), 18, 18, "center", 9);

  await sharp({ create: { width, height, channels: 4, background: visualBackground(source.visualKind) } })
    .composite([
      { input: accentRail, left: 0, top: 0 },
      { input: context, left: 58, top: 92 },
      { input: shadow, left: 930, top: 190 },
      { input: focusBorder, left: 926, top: 174 },
      { input: focus, left: 936, top: 184 },
      { input: accentMark, left: 58, top: 60 },
      { input: dotOne, left: 1192, top: 62 },
      { input: dotTwo, left: 1226, top: 62 },
      { input: dotThree, left: 1260, top: 62 },
    ])
    .webp({ quality: 84, effort: 5 })
    .toFile(output);
}

export function resolveSafeCaptureUrl(id, source, baseUrl) {
  let url = "";
  if (typeof source.entry === "string" && /^https?:\/\//iu.test(source.entry)) {
    url = source.entry;
  } else if (typeof source.entry === "string") {
    const relativeEntry = source.entry.replace(/^\.\//u, "");
    if (existsSync(sourcePath(relativeEntry))) url = new URL(relativeEntry, `${baseUrl}/`).href;
  }
  if (!url && typeof source.publicEntry === "string") url = source.publicEntry;
  if (!url) throw new Error(`Missing capture source for ${id}`);
  assertSafeCaptureUrl(url);
  return url;
}

async function captureFocusRegion(page, source, output) {
  const explicitSelector = source.focusSelector || (source.captureTime !== undefined ? source.readySelector : "");
  if (explicitSelector) {
    const explicit = page.locator(explicitSelector).first();
    if (await explicit.count() && await explicit.isVisible()) {
      await explicit.scrollIntoViewIfNeeded();
      await explicit.screenshot({ path: output, type: "png" });
      return;
    }
  }

  const marked = await page.evaluate(() => {
    document.querySelectorAll("[data-hub-showcase-focus]").forEach((element) => element.removeAttribute("data-hub-showcase-focus"));
    const selectors = [
      "[data-showcase-focus]",
      "canvas",
      "video",
      "main > section",
      "main section",
      "[role='main'] > section",
      ".workspace",
      ".dashboard",
      ".editor-shell",
      ".editor-main",
      ".game-board",
      ".preview-stage",
      ".content-panel",
      ".result-panel",
      ".panel",
    ];
    const candidates = Array.from(new Set(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))));
    const viewportArea = innerWidth * innerHeight;
    const scored = candidates.map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return null;
      if (rect.width < 280 || rect.height < 160 || rect.width > innerWidth * 1.35 || rect.height > innerHeight * 1.6) return null;
      const area = rect.width * rect.height;
      if (area < viewportArea * 0.09) return null;
      const ratio = area / viewportArea;
      const media = element.querySelectorAll("canvas, video, img, svg").length + (element.matches("canvas, video, img, svg") ? 2 : 0);
      const controls = element.querySelectorAll("button, input, select, textarea, [role='button']").length;
      const text = (element.textContent || "").trim().length;
      const preferredArea = 1 - Math.min(0.85, Math.abs(0.48 - Math.min(1, ratio)));
      return { element, score: area * preferredArea + media * 180000 + controls * 15000 + Math.min(text, 800) * 120 };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    if (!scored.length) return false;
    scored[0].element.setAttribute("data-hub-showcase-focus", "true");
    return true;
  });

  if (marked) {
    const focus = page.locator('[data-hub-showcase-focus="true"]').first();
    await focus.scrollIntoViewIfNeeded();
    await focus.screenshot({ path: output, type: "png" });
    return;
  }
  await page.screenshot({ path: output, type: "png", fullPage: false });
}

async function captureToWebp(page, sharp, id, source, baseUrl, tempDirectory, output) {
  const url = resolveSafeCaptureUrl(id, source, baseUrl);
  await page.goto(url, { waitUntil: "commit" });
  await page.waitForFunction(() => document.head && document.body);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }",
  });
  if (source.readySelector) await page.waitForSelector(source.readySelector, { state: "attached" });
  if (source.clickSelector) {
    await page.locator(source.clickSelector).first().click();
    if (source.afterClickText) {
      await page.waitForFunction(
        ({ selector, text }) => document.querySelector(selector)?.textContent?.includes(text),
        { selector: source.clickSelector, text: source.afterClickText },
        { timeout: source.afterClickTimeout || 120000 },
      );
    }
    if (source.captureDelay) await page.waitForTimeout(source.captureDelay);
  }
  if (source.waitForCanvasVariance) {
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector);
      const canvas = root?.matches("canvas") ? root : root?.querySelector("canvas");
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || canvas.width < 2 || canvas.height < 2) return false;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const stride = Math.max(4, Math.floor(pixels.length / 12000 / 4) * 4);
      let darkest = 255;
      let lightest = 0;
      for (let index = 0; index < pixels.length; index += stride) {
        const value = Math.round((pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3);
        darkest = Math.min(darkest, value);
        lightest = Math.max(lightest, value);
      }
      return lightest - darkest >= 28;
    }, source.focusSelector || "canvas", { timeout: source.canvasVarianceTimeout || 10000 });
  }
  if (source.captureTime !== undefined) {
    await page.evaluate(async ({ selector, captureTime }) => {
      const video = document.querySelector(selector);
      if (!(video instanceof HTMLVideoElement)) throw new Error(`Expected video selector: ${selector}`);
      if (!video.getAttribute("src") && video.dataset.src) {
        video.src = video.dataset.src;
        video.load();
      }
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise((resolve, reject) => {
          video.addEventListener("loadeddata", resolve, { once: true });
          video.addEventListener("error", () => reject(new Error("Video frame failed to load")), { once: true });
        });
      }
      video.hidden = false;
      video.controls = false;
      document.querySelector("#loadCard")?.setAttribute("hidden", "");
      video.currentTime = captureTime;
      await new Promise((resolve, reject) => {
        video.addEventListener("seeked", resolve, { once: true });
        video.addEventListener("error", () => reject(new Error("Video frame failed to seek")), { once: true });
      });
      video.pause();
    }, { selector: source.readySelector, captureTime: source.captureTime });
  }
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const contextPng = join(tempDirectory, `${token}-context.png`);
  const focusPng = join(tempDirectory, `${token}-focus.png`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: contextPng, type: "png", fullPage: false });
  let focusInput = focusPng;
  if (source.focusFile) {
    focusInput = sourcePath(source.focusFile);
    if (!existsSync(focusInput)) throw new Error(`Missing focus file for ${id}: ${source.focusFile}`);
  } else {
    await captureFocusRegion(page, source, focusPng);
  }
  await composeProductFrame(sharp, contextPng, focusInput, output, source);
}

function registrySource(apps, sources) {
  const entries = apps.map((app) => {
    if (app.id === "clickflow") {
      return [app.id, {
        src: "",
        alt: "",
        position: "center",
        layout: "standard",
        fallback: app.name,
        feature: "自动化任务编排与执行",
        accent: "#6b7280",
        visualKind: "product",
      }];
    }
    return [app.id, {
      src: `./assets/hub-showcase/${app.id}.webp?v=${SHOWCASE_CACHE_VERSION}`,
      alt: app.id === "hub" ? "AI 应用方案整理器功能画面" : `${app.name}功能画面`,
      position: "center",
      layout: sources[app.id].layout,
      fallback: app.name,
      feature: sources[app.id].feature,
      accent: sources[app.id].accent,
      visualKind: sources[app.id].visualKind,
    }];
  });
  const lines = ["globalThis.HUB_PROJECT_MEDIA = Object.freeze({"];
  for (const [id, media] of entries) {
    lines.push(`  ${JSON.stringify(id)}: Object.freeze({`);
    for (const [key, value] of Object.entries(media)) lines.push(`    ${key}: ${JSON.stringify(value)},`);
    lines.push("  }),");
  }
  lines.push("});", "");
  return lines.join("\n");
}

export async function buildHubShowcaseMedia() {
  const sources = JSON.parse(readFileSync(sourcesPath, "utf8"));
  const apps = loadDefaultAppsFromRuntime(readFileSync(runtimePath, "utf8"));
  assertSafeConfiguredPublicBase();
  assertSafeSources(sources);
  validateSources(apps, sources);
  const requestedIds = (process.env.HUB_SHOWCASE_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
  const unknownIds = requestedIds.filter((id) => !(id in sources));
  if (unknownIds.length) throw new Error(`Unknown showcase media ids: ${unknownIds.join(", ")}`);
  const selectedSources = requestedIds.length
    ? Object.entries(sources).filter(([id]) => requestedIds.includes(id))
    : Object.entries(sources);
  mkdirSync(outputDirectory, { recursive: true });

  const sharpModule = require(resolveDependency("sharp"));
  const sharp = sharpModule.default || sharpModule;
  const captureSources = selectedSources.filter(([, source]) => source.mode === "capture");
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "hub-showcase-"));
  let server;
  let browser;

  try {
  if (captureSources.length) {
    const playwrightEntry = resolveDependency("playwright");
    const playwrightModule = await import(pathToFileURL(playwrightEntry).href);
    const { chromium } = playwrightModule.default || playwrightModule;
    const executablePath = browserExecutable(chromium);
    if (!executablePath) throw new Error("Chrome, Edge, or Playwright Chromium is required for showcase capture");
    server = createStaticServer();
    const baseUrl = await startServer(server);
    browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      bypassCSP: true,
    });
    const page = await context.newPage();
    for (const [id, source] of selectedSources) {
      const output = join(outputDirectory, `${id}.webp`);
      if (source.mode === "file") {
        const input = sourcePath(source.source);
        if (!existsSync(input)) throw new Error(`Missing file source for ${id}: ${relative(sourceRoot, input)}`);
        await composeProductFrame(sharp, input, input, output, source);
      } else {
        await captureToWebp(page, sharp, id, source, baseUrl, temporaryDirectory, output);
      }
    }
    await context.close();
  }
    writeFileSync(registryPath, registrySource(apps, sources), "utf8");
  } finally {
    if (browser) await browser.close();
    if (server) await stopServer(server);
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  process.stdout.write(`Generated ${selectedSources.length} showcase images and hub-project-media.js.\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildHubShowcaseMedia();
