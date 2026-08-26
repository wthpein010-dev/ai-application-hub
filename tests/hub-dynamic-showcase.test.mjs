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
});

test("approved showcase uses image-led Bento layouts with responsive fallbacks", () => {
  assert.match(rule(".showcase-stage"), /grid-template-columns:\s*minmax\([^)]*\)\s+minmax\([^)]*\)/u);
  assert.match(styles, /@media\s*\(max-width:\s*1180px\)[\s\S]*?\.showcase-stage[^{]*\{[^}]*grid-template-columns:\s*minmax\(0,\s*0\.67fr\)\s+minmax\(0,\s*1fr\)/u);
  assert.match(rule(".app-grid"), /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/u);
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

test("media lookup prefers a valid edited visual and Windows-local visibility is host scoped", () => {
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

  assert.equal(context.globalThis.isWindowsLocalPreview(), true);
  assert.deepEqual(Array.from(context.globalThis.visibleApps(), ({ id }) => id), ["visible"]);
  assert.equal(context.globalThis.projectMedia({ id: "visible", name: "Visible", visual: "  ./edited.webp  " }).src, "./edited.webp");
  assert.equal(context.globalThis.projectMedia({ id: "visible", name: "Visible", visual: "javascript:alert(1)" }).src, "./registry.webp");

  context.location.hostname = "example.com";
  assert.equal(context.globalThis.isWindowsLocalPreview(), false);
  assert.deepEqual(Array.from(context.globalThis.visibleApps(), ({ id }) => id), ["visible", "clickflow"]);
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
