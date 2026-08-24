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

test("the redesign preserves prior release cache markers and accessible action names", () => {
  for (const marker of [
    "20260803-nang-game-catalog-refresh",
    "20260803-hub-full-audit-v2",
    "20260811-gamepulse-community-api",
    "20260812-wanxiang-lab-rename",
    "20260818-brick-preview-feishu-upload",
    "20260820-hub-quality-audit",
    "20260820-pureshrink-v105",
    "20260821-tool-taxonomy",
    "20260824-white-workspace-themes",
    "20260824-card-motion-once",
    "20260824-readable-type"
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
  assert.match(runtime, /function completeListIntroAnimation\(\)[\s\S]*?card-intro-complete/u);
});
