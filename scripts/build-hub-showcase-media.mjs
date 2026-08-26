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
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  }[extname(path).toLowerCase()] || "application/octet-stream";
}

function createStaticServer() {
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
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": stats.size,
      "Content-Type": contentType(path),
    });
    createReadStream(path).pipe(response);
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
    if (source.mode === "file" && typeof source.source !== "string") throw new Error(`Missing file source for ${id}`);
    if (source.mode === "capture" && typeof source.entry !== "string" && typeof source.publicEntry !== "string") {
      throw new Error(`Missing capture entry for ${id}`);
    }
    if (source.publicEntry && typeof source.publicEntry !== "string") throw new Error(`Invalid public capture entry for ${id}`);
    if (source.readySelector && typeof source.readySelector !== "string") throw new Error(`Invalid ready selector for ${id}`);
    if (source.captureTime !== undefined && (!Number.isFinite(source.captureTime) || source.captureTime < 0)) {
      throw new Error(`Invalid capture time for ${id}`);
    }
  }
}

async function convertToWebp(sharp, input, output) {
  await sharp(input)
    .resize({ width: 1440, height: 900, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
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
      document.querySelector("#loadCard")?.setAttribute("hidden", "");
      video.currentTime = captureTime;
      await new Promise((resolve, reject) => {
        video.addEventListener("seeked", resolve, { once: true });
        video.addEventListener("error", () => reject(new Error("Video frame failed to seek")), { once: true });
      });
      video.pause();
    }, { selector: source.readySelector, captureTime: source.captureTime });
  }
  const temporaryPng = join(tempDirectory, `${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
  await page.screenshot({ path: temporaryPng, type: "png", fullPage: false });
  await convertToWebp(sharp, temporaryPng, output);
}

function registrySource(apps, sources) {
  const entries = apps.map((app) => {
    if (app.id === "clickflow") {
      return [app.id, { src: "", alt: "", position: "center", layout: "standard", fallback: app.name }];
    }
    return [app.id, {
      src: `./assets/hub-showcase/${app.id}.webp`,
      alt: app.id === "hub" ? "AI 应用方案整理器功能画面" : `${app.name}功能画面`,
      position: "center",
      layout: sources[app.id].layout,
      fallback: app.name,
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
        await convertToWebp(sharp, input, output);
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
