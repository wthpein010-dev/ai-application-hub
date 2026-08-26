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
const publicHubBase = process.env.HUB_PUBLIC_BASE || "https://wthpein010-dev.github.io/ai-application-hub/";
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

function assertSafeSources(sources) {
  if (process.platform !== "win32") return;
  for (const [id, source] of Object.entries(sources)) {
    const inspected = `${id}\n${source.entry || ""}\n${source.source || ""}`.toLowerCase();
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
    if (source.mode === "capture" && typeof source.entry !== "string") throw new Error(`Missing capture entry for ${id}`);
  }
}

async function convertToWebp(sharp, input, output) {
  await sharp(input)
    .resize({ width: 1440, height: 900, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(output);
}

function captureUrl(entry, baseUrl) {
  if (/^https?:\/\//iu.test(entry)) return entry;
  const relativeEntry = entry.replace(/^\.\//u, "");
  return existsSync(sourcePath(relativeEntry))
    ? new URL(relativeEntry, `${baseUrl}/`).href
    : new URL(relativeEntry, publicHubBase).href;
}

async function captureToWebp(page, sharp, entry, baseUrl, tempDirectory, output) {
  await page.goto(captureUrl(entry, baseUrl), { waitUntil: "commit" });
  await page.waitForFunction(() => document.head && document.body);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }",
  });
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

const sources = JSON.parse(readFileSync(sourcesPath, "utf8"));
const apps = loadDefaultAppsFromRuntime(readFileSync(runtimePath, "utf8"));
assertSafeSources(sources);
validateSources(apps, sources);
mkdirSync(outputDirectory, { recursive: true });

const sharpModule = require(resolveDependency("sharp"));
const sharp = sharpModule.default || sharpModule;
const captureSources = Object.entries(sources).filter(([, source]) => source.mode === "capture");
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
    for (const [id, source] of Object.entries(sources)) {
      const output = join(outputDirectory, `${id}.webp`);
      if (source.mode === "file") {
        const input = sourcePath(source.source);
        if (!existsSync(input)) throw new Error(`Missing file source for ${id}: ${relative(sourceRoot, input)}`);
        await convertToWebp(sharp, input, output);
      } else {
        await captureToWebp(page, sharp, source.entry, baseUrl, temporaryDirectory, output);
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

process.stdout.write(`Generated ${Object.keys(sources).length} showcase images and hub-project-media.js.\n`);
