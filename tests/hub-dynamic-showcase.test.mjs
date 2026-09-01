import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";
import * as mediaBuilderModule from "../scripts/build-hub-showcase-media.mjs";

const {
  assertSafeConfiguredPublicBase,
  createStaticServer,
  resolveSafeCaptureUrl,
} = mediaBuilderModule;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const mediaRuntime = readFileSync(join(root, "hub-project-media.js"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");
const browserSmoke = readFileSync(join(root, "tests", "hub-dynamic-showcase-browser-smoke.mjs"), "utf8");
const mediaBuilder = readFileSync(join(root, "scripts", "build-hub-showcase-media.mjs"), "utf8");
const mediaSources = JSON.parse(readFileSync(join(root, "scripts", "hub-showcase-media-sources.json"), "utf8"));

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
  assert.match(html, /href="\.\/styles\.css\?v=20260827-hub-visual-polish"/u);
  assert.match(html, /src="\.\/hub-project-media\.js\?v=20260827-hub-visual-polish"/u);
  assert.match(html, /src="\.\/app-20260706-restore-games\.js\?v=20260827-hub-visual-polish"/u);
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
    assert.match(media[app.id].src, /^\.\/assets\/hub-showcase\/[a-z0-9-]+\.(?:webp|jpg|png)\?v=\d{8}-[a-z0-9-]+$/u);
    const assetPath = join(root, media[app.id].src.split("?")[0]);
    assert.ok(existsSync(assetPath));
    assert.ok(statSync(assetPath).size <= 750 * 1024);
    assert.ok(media[app.id].alt.includes(app.name));
    assert.ok(["standard", "wide", "tall"].includes(media[app.id].layout));
    assert.match(media[app.id].feature, /\S{4,}/u);
    assert.match(media[app.id].accent, /^#[0-9a-f]{6}$/u);
    assert.ok(["product", "data", "game", "media"].includes(media[app.id].visualKind));
  }
  assert.notEqual(
    new URLSearchParams(media["brick-character-copy-preview"].src.split("?")[1]).get("v"),
    "20260827-hub-visual-polish",
    "the replaced brick-gallery showcase must not reuse the historical cache key",
  );
});

test("the multi-thread Workbench is appended with a dedicated showcase image", () => {
  const apps = loadDefaultAppsFromRuntime(runtime);
  const media = loadMediaRegistry(mediaRuntime);

  assert.equal(apps.length, 32);
  const radarIndex = apps.findIndex(({ id }) => id === "x-ai-codex-radar");
  assert.equal(apps.at(radarIndex + 1)?.id, "loop-bgm-lab");
  assert.equal(apps.at(radarIndex + 2)?.id, "codex-multi-thread-workbench");
  assert.equal(media["loop-bgm-lab"]?.src, "./assets/hub-showcase/loop-bgm-lab.webp?v=20260827-hub-visual-polish");
  assert.equal(media["loop-bgm-lab"]?.fallback, "循环乐工房");
  assert.equal(media["loop-bgm-lab"]?.layout, "wide");
  assert.ok(existsSync(join(root, "assets", "hub-showcase", "loop-bgm-lab.webp")));
  assert.equal(media["codex-multi-thread-workbench"]?.src, "./assets/hub-showcase/codex-multi-thread-workbench.webp?v=20260827-hub-visual-polish");
  assert.equal(media["codex-multi-thread-workbench"]?.fallback, "Codex 多线程工作台");
  assert.equal(media["codex-multi-thread-workbench"]?.layout, "wide");
  assert.ok(existsSync(join(root, "assets", "hub-showcase", "codex-multi-thread-workbench.webp")));
});

test("Bento metadata preserves order and closes the final application row", () => {
  const expectedLayouts = {
    "travel-generator": "standard",
    "codex-reviewer": "standard",
    planmap: "standard",
    simuai: "standard",
    "gamespec-relay": "standard",
    "paws-home-client": "standard",
    "brick-character-copy-preview": "wide",
  };
  for (const [id, layout] of Object.entries(expectedLayouts)) {
    assert.equal(mediaSources[id].layout, layout, `${id} should use the reviewed ${layout} span`);
  }
  assert.equal(Object.values(mediaSources).filter(({ layout }) => layout === "tall").length, 0);

  const collections = [
    { ids: ["hub", "gamepulse-mini-radar", "codex-quota-bar", "codex-thread-workbench", "web-media-collector", "minigame-project-simulator", "ai-game-requirements-workshop", "planner-daily-quiz", "travel-generator", "feishu-downloader", "codex-reviewer", "codex-habit-tool", "wanhuatong", "pureshrink", "planmap", "simuai", "gamespec-relay", "x-ai-codex-radar", "loop-bgm-lab", "codex-multi-thread-workbench"], finalSpan: 0 },
    { ids: ["vita-mahjong", "paws-home-client", "paws-level-editor", "brick-light-motion-lab", "brick-character-copy-preview", "trinket-market"], finalSpan: 2 },
  ];
  for (const { ids, finalSpan } of collections) {
    let used = 0;
    for (const id of ids) {
      const span = mediaSources[id].layout === "wide" ? 2 : 1;
      if (used + span > 4) {
        assert.equal(used, 4, `${id} must not start after an incomplete Bento row`);
        used = 0;
      }
      used += span;
      if (used === 4) used = 0;
    }
    assert.equal(used, finalSpan, "reviewed collection should preserve its intentional final Bento span");
  }
});

test("every project media source defines a focused visual story", () => {
  const expectedIds = Array.from(loadDefaultAppsFromRuntime(runtime))
    .filter(({ id }) => id !== "clickflow")
    .map(({ id }) => id);
  assert.deepEqual(Object.keys(mediaSources), expectedIds);
  for (const [id, source] of Object.entries(mediaSources)) {
    assert.match(source.feature, /\S{4,}/u, `${id} should name its core visual feature`);
    assert.match(source.accent, /^#[0-9a-f]{6}$/u, `${id} should define a stable project accent`);
    assert.ok(["product", "data", "game", "media"].includes(source.visualKind), `${id} should define a visual kind`);
    if (source.mode === "capture" && source.captureTime === undefined) {
      assert.ok(source.focusSelector || source.focusMode === "auto", `${id} should target a real functional region`);
    }
  }
});

test("media builder composes authentic context and focal detail into fixed product frames", () => {
  assert.match(mediaBuilder, /function composeProductFrame\(/u);
  assert.match(mediaBuilder, /function captureFocusRegion\(/u);
  assert.match(mediaBuilder, /source\.focusSelector/u);
  assert.match(mediaBuilder, /width:\s*1440[\s\S]*height:\s*900/u);
  assert.match(mediaBuilder, /sharp\([\s\S]*?\.composite\(/u);
  assert.match(mediaBuilder, /source\.clickSelector/u);
  assert.match(mediaBuilder, /source\.afterClickText/u);
  assert.match(mediaBuilder, /source\.focusFile/u);
  assert.match(mediaBuilder, /source\.waitForCanvasVariance/u);
  assert.match(mediaBuilder, /getImageData\(0,\s*0,\s*canvas\.width,\s*canvas\.height\)/u);
  assert.match(mediaBuilder, /"\.mjs":\s*"text\/javascript; charset=utf-8"/u);
  for (const id of ["paws-home-client", "zhuanglege-sha"]) {
    assert.equal(mediaSources[id].clickSelector, "#startButton");
    assert.match(mediaSources[id].afterClickText, /游戏已启动/u);
    assert.match(mediaSources[id].focusSelector, /canvas/u);
  }
  assert.equal(mediaSources["paws-home-client"].focusFile, "tests/artifacts/paws-ai-real-template-play-2d.png");
  assert.ok(existsSync(join(root, mediaSources["paws-home-client"].focusFile)));
  assert.equal(mediaSources["xiang-le-ge-xiang"].waitForCanvasVariance, true);
  assert.equal(mediaSources["nang-keng-pai-pai-xiang"].captureTime, 20);
  assert.match(mediaBuilder, /video\.controls\s*=\s*false/u);
});

test("capture server supports valid byte ranges and rejects empty suffix ranges", async () => {
  assert.equal(typeof createStaticServer, "function");
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/index.html`;
    const invalidResponse = await fetch(url, {
      headers: { Range: "bytes=-0" },
    });
    assert.equal(invalidResponse.status, 416);

    const response = await fetch(url, {
      headers: { Range: "bytes=0-15" },
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.match(response.headers.get("content-range") || "", /^bytes 0-15\/\d+$/u);
    assert.equal((await response.arrayBuffer()).byteLength, 16);
  } finally {
    await new Promise((resolve) => server.close(resolve));
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
    apps: ["hub", "gamepulse-mini-radar", "codex-quota-bar", "codex-thread-workbench", "web-media-collector", "minigame-project-simulator", "ai-game-requirements-workshop", "planner-daily-quiz", "travel-generator", "feishu-downloader", "codex-reviewer", "codex-habit-tool", "wanhuatong", "pureshrink", "planmap", "simuai", "gamespec-relay", "x-ai-codex-radar", "codex-multi-thread-workbench"],
    games: ["zhuanglege-sha", "xiang-le-ge-xiang", "fill-what", "nang-keng-pai-pai-xiang", "icecream"],
    engineering: ["vita-mahjong", "paws-home-client", "paws-level-editor", "brick-light-motion-lab", "brick-character-copy-preview", "trinket-market"],
  };
  const oracle = /const expectedCollectionIds = \{([\s\S]*?)\n\};/u.exec(browserSmoke)?.[1] || "";
  for (const [collection, ids] of Object.entries(expected)) {
    const literal = new RegExp(`${collection}:\\s*\\[([\\s\\S]*?)\\]`, "u").exec(oracle)?.[1] || "";
    assert.deepEqual(Array.from(literal.matchAll(/"([a-z0-9-]+)"/gu), ([, id]) => id), ids);
  }
  for (const expectation of [
    "cardCount, 30",
    "imageCount, 30",
    "featureCount, 30",
    ".count() === 30",
  ]) assert.match(browserSmoke, new RegExp(expectation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  assert.doesNotMatch(browserSmoke, /cardCount, 29|imageCount, 29|featureCount, 29|\.count\(\) === 29/u);
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
