import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";
import {
  assertSafeConfiguredPublicBase,
  resolveSafeCaptureUrl,
} from "../scripts/build-hub-showcase-media.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const mediaRuntime = readFileSync(join(root, "hub-project-media.js"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");
const browserSmoke = readFileSync(join(root, "tests", "hub-dynamic-showcase-browser-smoke.mjs"), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`, "u"))?.[0] || "";
}

test("homepage exposes the approved dynamic showcase shell", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  for (const id of ["showcaseStage", "showcaseCopy", "showcaseMedia", "showcaseImage", "showcaseCaption", "showcaseProgress"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`, "u"));
  }
  assert.match(html, /<section id="apps"[^>]*>[\s\S]*id="appGrid"/u);
  assert.match(html, /<section id="games"[^>]*>[\s\S]*id="gameGrid"/u);
  assert.match(html, /<section id="engineering"[^>]*>[\s\S]*id="engineeringGrid"/u);
  assert.match(html, /<aside id="editPanel"[^>]+aria-hidden="true"[^>]+inert/u);
  assert.match(html, /href="\.\/styles\.css\?v=20260827-showcase-complete-copy"/u);
  assert.match(html, /src="\.\/hub-project-media\.js\?v=20260826-dynamic-showcase"/u);
  assert.match(html, /src="\.\/app-20260706-restore-games\.js\?v=20260826-dynamic-showcase"/u);
});

test("approved showcase uses image-led Bento layouts with responsive fallbacks", () => {
  assert.match(rule(".showcase-stage"), /grid-template-columns:\s*minmax\([^)]*\)\s+minmax\([^)]*\)/u);
  assert.match(styles, /@media\s*\(max-width:\s*1180px\)[\s\S]*?\.showcase-stage[^{]*\{[^}]*grid-template-columns:\s*minmax\(0,\s*0\.67fr\)\s+minmax\(0,\s*1fr\)/u);
  assert.match(rule(".app-grid"), /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/u);
  assert.doesNotMatch(rule(".app-grid"), /grid-auto-flow:\s*dense/u);
  assert.match(rule(".app-card.media-wide"), /grid-column:\s*span\s+2/u);
  assert.match(rule(".app-card.media-tall"), /grid-row:\s*span\s+2/u);
  assert.match(styles, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.showcase-stage[^{]*\{[^}]*grid-template-columns:\s*1fr/u);
  assert.match(styles, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.app-card\.media-wide[^{]*\{[^}]*grid-column:\s*auto/u);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
});

function loadMediaRegistry(source) {
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  return context.globalThis.HUB_PROJECT_MEDIA;
}

test("project media registry covers every production id without loading ClickFlow locally", () => {
  const apps = loadDefaultAppsFromRuntime(runtime);
  const media = loadMediaRegistry(mediaRuntime);
  assert.deepEqual(Object.keys(media), Array.from(apps, ({ id }) => id));
  assert.equal(media.clickflow.src, "");
  assert.equal(media.clickflow.fallback, "ClickFlow 鼠标自动化");
  for (const app of apps.filter(({ id }) => id !== "clickflow")) {
    assert.match(media[app.id].src, /^\.\/assets\/hub-showcase\/[a-z0-9-]+\.(?:webp|jpg|png)$/u);
    const assetPath = join(root, media[app.id].src);
    assert.ok(existsSync(assetPath));
    assert.ok(statSync(assetPath).size <= 750 * 1024);
    assert.ok(media[app.id].alt.includes(app.name));
    assert.ok(["standard", "wide", "tall"].includes(media[app.id].layout));
  }
});

test("runtime renders project-owned media and excludes ClickFlow from Windows-local DOM", () => {
  assert.match(runtime, /function projectMedia\(/u);
  assert.match(runtime, /function isWindowsLocalPreview\(/u);
  assert.match(runtime, /function visibleApps\(/u);
  assert.match(runtime, /app\.id\s*!==\s*["']clickflow["']/u);
  assert.match(runtime, /loading="lazy"/u);
  assert.match(runtime, /loading\s*=\s*["']eager["']/u);
  assert.match(runtime, /aria-current/u);
  assert.match(runtime, /history\.replaceState/u);
  assert.match(runtime, /function renderMedia\(app, context\)/u);
});

test("runtime treats unavailable browser storage as an optional enhancement", () => {
  assert.match(runtime, /function storageGet\(key\)[\s\S]*?try[\s\S]*?localStorage\.getItem\(key\)[\s\S]*?catch/u);
  assert.match(runtime, /function storageSet\(key, value\)[\s\S]*?try[\s\S]*?localStorage\.setItem\(key, value\)[\s\S]*?catch/u);
  assert.match(runtime, /function storageRemove\(key\)[\s\S]*?try[\s\S]*?localStorage\.removeItem\(key\)[\s\S]*?catch/u);
  assert.match(runtime, /selectedId:\s*storageGet\(SELECTED_KEY\)\s*\|\|\s*["']travel-generator["']/u);
  assert.doesNotMatch(runtime, /selectedId:\s*localStorage\.getItem/u);
  for (const functionName of ["applyTheme", "selectApp", "saveEditForm", "resetEdits"]) {
    const start = runtime.indexOf(`function ${functionName}`);
    const end = runtime.indexOf("\nfunction ", start + 1);
    const source = runtime.slice(start, end === -1 ? runtime.length : end);
    assert.ok(start >= 0, `${functionName} should be present`);
    assert.doesNotMatch(source, /localStorage\.(?:setItem|removeItem)/u);
  }
});

test("stage fallback is hidden after successful media load and restored on image errors", () => {
  assert.match(runtime, /nodes\.showcaseImage\.onload\s*=\s*handleMediaLoad/u);
  assert.match(runtime, /function handleMediaLoad\(event\)[\s\S]*?showcaseCaption\.hidden\s*=\s*true/u);
  assert.match(runtime, /function handleMediaError\(event\)[\s\S]*?fallback\.hidden\s*=\s*false/u);
});

test("browser smoke owns an independent literal catalog order oracle", () => {
  const expected = {
    apps: ["hub", "gamepulse-mini-radar", "codex-quota-bar", "codex-thread-workbench", "web-media-collector", "minigame-project-simulator", "ai-game-requirements-workshop", "planner-daily-quiz", "travel-generator", "feishu-downloader", "codex-reviewer", "codex-habit-tool", "wanhuatong", "pureshrink", "planmap", "simuai", "gamespec-relay", "x-ai-codex-radar"],
    games: ["zhuanglege-sha", "xiang-le-ge-xiang", "fill-what", "nang-keng-pai-pai-xiang", "icecream"],
    engineering: ["vita-mahjong", "paws-home-client", "paws-level-editor", "brick-light-motion-lab", "brick-character-copy-preview"],
  };
  const oracle = /const expectedCollectionIds = \{([\s\S]*?)\n\};/u.exec(browserSmoke)?.[1] || "";
  for (const [collection, ids] of Object.entries(expected)) {
    const literal = new RegExp(`${collection}:\\s*\\[([\\s\\S]*?)\\]`, "u").exec(oracle)?.[1] || "";
    assert.deepEqual(Array.from(literal.matchAll(/"([a-z0-9-]+)"/gu), ([, id]) => id), ids);
  }
  assert.match(browserSmoke, /const expectedNavigationIds = \[\s*\.\.\.expectedCollectionIds\.apps,\s*\.\.\.expectedCollectionIds\.games,\s*\.\.\.expectedCollectionIds\.engineering,\s*\];/u);
  assert.doesNotMatch(browserSmoke, /loadDefaultAppsFromRuntime|readFileSync\(join\(root, "app-20260706-restore-games\.js"\)/u);
});

test("media lookup prefers a valid edited visual and Windows-local visibility is host and platform scoped", () => {
  const helpersStart = runtime.indexOf("function isWindowsLocalPreview");
  const helpersEnd = runtime.indexOf("function renderCategoryOptions", helpersStart);
  const normalizerStart = runtime.indexOf("function normalizeVisualPath");
  const normalizerEnd = runtime.indexOf("function projectHref", normalizerStart);
  assert.notEqual(helpersStart, -1);
  assert.notEqual(helpersEnd, -1);
  assert.notEqual(normalizerStart, -1);
  assert.notEqual(normalizerEnd, -1);

  const productionApps = [
    { id: "visible", name: "Visible" },
    { id: "clickflow", name: "ClickFlow" },
  ];
  const context = {
    globalThis: {
      HUB_PROJECT_MEDIA: {
        visible: { src: "./registry.webp", alt: "Visible screen", position: "top", layout: "wide", fallback: "Visible fallback" },
      },
    },
    URL,
    apps: productionApps,
    navigator: { platform: "Win32", userAgent: "Windows NT 10.0" },
    location: { protocol: "http:", hostname: "127.0.0.1" },
  };
  vm.runInNewContext([
    runtime.slice(helpersStart, helpersEnd),
    runtime.slice(normalizerStart, normalizerEnd),
    "globalThis.isWindowsLocalPreview = isWindowsLocalPreview;",
    "globalThis.visibleApps = visibleApps;",
    "globalThis.projectMedia = projectMedia;",
  ].join("\n"), context);

  assert.equal(context.globalThis.projectMedia({ id: "visible", name: "Visible", visual: "  ./edited.webp  " }).src, "./edited.webp");
  assert.equal(context.globalThis.projectMedia({ id: "visible", name: "Visible", visual: "javascript:alert(1)" }).src, "./registry.webp");

  const cases = [
    { label: "Windows localhost", platform: "Win32", userAgent: "Windows NT 10.0", protocol: "http:", hostname: "localhost", local: true },
    { label: "Windows loopback", platform: "Win32", userAgent: "Windows NT 10.0", protocol: "http:", hostname: "127.0.0.1", local: true },
    { label: "Windows file", platform: "Win32", userAgent: "Windows NT 10.0", protocol: "file:", hostname: "", local: true },
    { label: "Windows public", platform: "Win32", userAgent: "Windows NT 10.0", protocol: "https:", hostname: "example.com", local: false },
    { label: "non-Windows localhost", platform: "MacIntel", userAgent: "Macintosh", protocol: "http:", hostname: "localhost", local: false },
    { label: "non-Windows loopback", platform: "Linux x86_64", userAgent: "X11; Linux x86_64", protocol: "http:", hostname: "127.0.0.1", local: false },
    { label: "non-Windows file", platform: "MacIntel", userAgent: "Macintosh", protocol: "file:", hostname: "", local: false },
  ];
  for (const scenario of cases) {
    context.navigator.platform = scenario.platform;
    context.navigator.userAgent = scenario.userAgent;
    context.location.protocol = scenario.protocol;
    context.location.hostname = scenario.hostname;
    assert.equal(context.globalThis.isWindowsLocalPreview(), scenario.local, scenario.label);
    assert.deepEqual(
      Array.from(context.globalThis.visibleApps(), ({ id }) => id),
      scenario.local ? ["visible"] : ["visible", "clickflow"],
      `${scenario.label} visibility`,
    );
  }
});

test("capture sources require an explicit public entry when the local page is absent", () => {
  assert.throws(
    () => resolveSafeCaptureUrl("missing-project", { entry: "./projects/missing-project/index.html" }, "http://127.0.0.1:9000"),
    /Missing capture source for missing-project/u,
  );
  assert.equal(
    resolveSafeCaptureUrl(
      "explicit-public-project",
      {
        entry: "./projects/missing-project/index.html",
        publicEntry: "https://example.invalid/projects/explicit-public-project/index.html",
      },
      "http://127.0.0.1:9000",
    ),
    "https://example.invalid/projects/explicit-public-project/index.html",
  );
});

test("capture URL guards reject ClickFlow before browser navigation", () => {
  assert.throws(
    () => resolveSafeCaptureUrl("safe-id", { publicEntry: "https://example.invalid/projects/clickflow/index.html" }, "http://127.0.0.1:9000"),
    /ClickFlow capture URL is prohibited/u,
  );
  assert.throws(
    () => assertSafeConfiguredPublicBase("https://example.invalid/clickflow/"),
    /ClickFlow public base is prohibited/u,
  );
});
