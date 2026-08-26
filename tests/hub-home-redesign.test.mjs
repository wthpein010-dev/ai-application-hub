import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, "index.html"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`, "u"))?.[0] || "";
}

function colorToken(selector, name) {
  const declaration = rule(selector).match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, "u"));
  assert.ok(declaration, `missing --${name} in ${selector}`);
  return declaration[1];
}

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/gu).map((channel) => Number.parseInt(channel, 16) / 255);
    const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

test("homepage boots into the clean theme and exposes an accessible theme menu", () => {
  assert.match(html, /<html[^>]+data-theme="clean"/u);
  assert.match(html, /id="themeToggle"[^>]+aria-expanded="false"/u);
  assert.match(html, /id="themeMenu"[^>]+role="menu"[^>]+hidden/u);
  assert.match(html, /id="themeOptions"/u);
  assert.match(html, /ai-competition-hub-theme/u);
});

test("runtime defines and persists the four approved themes", () => {
  assert.match(runtime, /const THEME_STORAGE_KEY = "ai-competition-hub-theme";/u);
  for (const theme of ["clean", "mist", "coral", "night"]) {
    assert.match(runtime, new RegExp(`${theme}:\\s*\\{`, "u"));
  }
  assert.match(runtime, /function normalizeTheme\(/u);
  assert.match(runtime, /document\.documentElement\.dataset\.theme = normalized/u);
  assert.match(runtime, /localStorage\.setItem\(THEME_STORAGE_KEY, normalized\)/u);
  assert.match(runtime, /role="menuitemradio"/u);
  assert.match(runtime, /aria-checked=/u);
});

test("application filters use a horizontal sticky toolbar and public type chips", () => {
  assert.match(html, /class="filter-toolbar"/u);
  assert.match(html, /id="typeChips"/u);
  assert.match(runtime, /function renderTypeChips\(/u);
  assert.match(runtime, /function syncTypeChips\(/u);
  assert.match(runtime, /aria-pressed=/u);
  assert.match(rule(".filter-toolbar"), /position:\s*sticky/u);
  assert.doesNotMatch(rule(".workspace"), /grid-template-columns:\s*minmax\(0,\s*220px\)/u);
});

test("wide cards use four columns and collapse to one column on mobile", () => {
  assert.match(rule(".app-grid"), /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/u);
  assert.match(styles, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.app-grid[^}]*grid-template-columns:\s*1fr/u);
});

test("card rendering keeps only two keywords plus a compact overflow count", () => {
  const start = runtime.indexOf("function renderAppCard");
  const end = runtime.indexOf("function handleAppCardClick", start);
  const renderer = runtime.slice(start, end);

  assert.match(renderer, /app\.tags\.slice\(0,\s*2\)/u);
  assert.match(renderer, /app\.tags\.length\s*-\s*2/u);
  assert.match(renderer, /tag-overflow/u);
});

test("the visual system is white-first and includes four theme token sets", () => {
  assert.match(rule(":root"), /color-scheme:\s*light/u);
  assert.match(rule(":root"), /--page-bg:\s*#[fF][0-9a-fA-F]{5}/u);
  for (const selector of ['html[data-theme="mist"]', 'html[data-theme="coral"]', 'html[data-theme="night"]']) {
    assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
});

test("each approved theme supplies Bento stage tokens and accessible controlled motion", () => {
  for (const selector of [":root", 'html[data-theme="mist"]', 'html[data-theme="coral"]', 'html[data-theme="night"]']) {
    for (const token of ["showcase-surface", "selection", "game-accent", "engineering-accent"]) {
      assert.match(rule(selector), new RegExp(`--${token}:\\s*#[0-9a-fA-F]{6}`, "u"));
    }
    assert.ok(contrastRatio("#ffffff", colorToken(selector, "showcase-badge-bg")) >= 4.5, `${selector} showcase badge is below AA`);
    assert.match(rule(selector), /--showcase-overlay:\s*rgba\(/u);
  }

  assert.match(rule(":focus-visible"), /outline:\s*3px\s+solid/u);
  assert.match(rule(".showcase-media:hover"), /rotate[XY]\([1-3]deg\)/u);
  assert.match(styles, /body\.showcase-intro-complete\s+\.showcase-stage/u);
});

test("card entrance completion supports the current and future body gates", () => {
  assert.match(runtime, /document\.body\.classList\.add\("showcase-intro-complete"\)/u);
  assert.match(styles, /body\.card-intro-complete\s+\.app-card\s*,\s*body\.showcase-intro-complete\s+\.app-card\s*\{[^}]*animation:\s*none/u);
});

test("image-backed showcase badges use opaque AA theme surfaces", () => {
  const imageBadge = rule(".showcase-media:has(#showcaseImage:not([hidden])) .summary-type");

  assert.match(imageBadge, /background:\s*var\(--showcase-badge-bg\)/u);
  assert.match(imageBadge, /color:\s*#ffffff/u);
});

test("the featured carousel follows each page theme instead of forcing a dark panel", () => {
  for (const selector of [":root", 'html[data-theme="mist"]', 'html[data-theme="coral"]']) {
    assert.ok(contrastRatio(colorToken(selector, "hero-text"), colorToken(selector, "hero-panel")) >= 7);
    assert.ok(contrastRatio(colorToken(selector, "hero-panel"), "#000000") >= 12, `${selector} hero is not a light surface`);
  }

  assert.ok(contrastRatio(colorToken('html[data-theme="night"]', "hero-text"), colorToken('html[data-theme="night"]', "hero-panel")) >= 7);
  assert.ok(contrastRatio(colorToken('html[data-theme="night"]', "hero-panel"), "#000000") < 3, "night hero must remain dark");
  assert.match(rule(".hero-board"), /box-shadow:\s*var\(--shadow-md\)/u);
});

test("desktop carousel controls sit on opposite content edges and mobile controls return to the status rail", () => {
  assert.match(html, /class="carousel-arrow-icon"/u);
  assert.match(rule(".showcase-arrows"), /display:\s*contents/u);
  assert.match(rule(".showcase-arrows button"), /position:\s*absolute/u);
  assert.match(rule("#prevApp"), /left:\s*16px/u);
  assert.match(rule("#nextApp"), /right:\s*16px/u);
  assert.match(rule(".showcase-controls"), /grid-template-columns:\s*minmax\(0,\s*1fr\)/u);

  const mobile = styles.slice(styles.indexOf("@media (max-width: 720px)"));
  assert.match(mobile, /\.showcase-controls\s*\{[^}]*grid-template-columns:\s*42px\s+minmax\(0,\s*1fr\)\s+42px/u);
  assert.match(mobile, /\.showcase-arrows button\s*\{[^}]*position:\s*static/u);
  assert.match(mobile, /#prevApp\s*\{[^}]*grid-column:\s*1/u);
  assert.match(mobile, /#nextApp\s*\{[^}]*grid-column:\s*3/u);
});

test("primary homepage controls and card copy keep a readable text floor", () => {
  assert.doesNotMatch(styles, /font-size:\s*(?:9|10)px/u);

  for (const selector of [
    ".theme-menu-head span",
    ".theme-option-copy small",
    ".summary-type",
    ".summary-richtext span",
    ".summary-richtext em",
    ".showcase-status__position",
    ".type-chip",
    ".card-meta > span:last-child",
    ".status-badge",
    ".app-card > p",
    ".tag-row span",
    ".card-actions a"
  ]) {
    assert.match(rule(selector), /font-size:\s*(?:12|13|14)px/u, `${selector} is too small`);
  }

  const compactMobile = styles.slice(styles.indexOf("@media (max-width: 430px)"));
  assert.doesNotMatch(compactMobile, /\.card-actions a\s*\{[^}]*font-size:\s*(?:9|10|11)px/u);
});

test("secondary theme text keeps WCAG AA contrast on card surfaces", () => {
  for (const selector of [":root", 'html[data-theme="mist"]', 'html[data-theme="coral"]', 'html[data-theme="night"]']) {
    const ratio = contrastRatio(colorToken(selector, "text-soft"), colorToken(selector, "surface"));
    assert.ok(ratio >= 4.5, `${selector} text-soft contrast is only ${ratio.toFixed(2)}:1`);
  }
});

test("the redesign preserves current homepage cache markers and accessible action names", () => {
  for (const marker of [
    "20260820-hub-quality-audit",
    "20260821-tool-taxonomy",
    "20260824-white-workspace-themes",
    "20260824-readable-type",
    "20260824-hero-theme-controls"
  ]) {
    assert.match(html, new RegExp(marker, "u"));
  }
  assert.match(runtime, /const webActionLabel = `\$\{app\.name\} 演示`;/u);
  assert.match(runtime, /const videoActionLabel = `\$\{app\.name\} 视频`;/u);
});

test("any render after first paint disables the list entrance animation immediately", () => {
  assert.match(runtime, /let hasRenderedCatalog = false;/u);
  const renderStart = runtime.indexOf("function render()");
  const renderEnd = runtime.indexOf("function applyTheme", renderStart);
  const renderer = runtime.slice(renderStart, renderEnd);

  assert.match(renderer, /if \(hasRenderedCatalog\) completeListIntroAnimation\(\);/u);
  assert.match(renderer, /hasRenderedCatalog = true;/u);
  assert.match(runtime, /function completeListIntroAnimation\(\)[\s\S]*?showcase-intro-complete/u);
});
