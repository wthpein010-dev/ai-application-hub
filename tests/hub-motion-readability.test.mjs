import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const page = readFileSync(join(root, "index.html"), "utf8");
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`, "u"))?.[0] || "";
}

test("homepage owns lightweight ambient and reading-progress layers", () => {
  assert.match(page, /class="ambient-backdrop"[^>]*aria-hidden="true"/u);
  assert.match(page, /class="ambient-grid"/u);
  assert.match(page, /class="ambient-scan"/u);
  assert.match(page, /id="scrollProgress"[^>]*role="progressbar"/u);
  assert.match(rule(".ambient-backdrop"), /pointer-events:\s*none/u);
  assert.match(rule(".ambient-grid"), /repeating-linear-gradient/u);
  assert.match(rule(".ambient-scan"), /animation:\s*ambient-scan/u);
  assert.match(styles, /@keyframes\s+ambient-scan/u);
  assert.match(rule(".scroll-progress > span"), /transform-origin:\s*left center/u);
});

test("runtime updates progress, active navigation, and short theme feedback", () => {
  assert.match(runtime, /scrollProgress:\s*document\.querySelector\("#scrollProgress"\)/u);
  assert.match(runtime, /function setupPageEffects\(/u);
  assert.match(runtime, /function updateScrollProgress\(/u);
  assert.match(runtime, /addEventListener\("scroll",\s*updateScrollProgress,\s*\{\s*passive:\s*true\s*\}\)/u);
  assert.match(runtime, /current\s*\?\s*link\.setAttribute\("aria-current",\s*"page"\)\s*:\s*link\.removeAttribute\("aria-current"\)/u);
  assert.match(runtime, /classList\.add\("theme-transitioning"\)/u);
  assert.match(runtime, /classList\.remove\("theme-transitioning"\)/u);
});

test("project interactions remain readable, focused, and motion-safe", () => {
  assert.match(rule(".app-card:focus-visible"), /box-shadow:/u);
  assert.match(rule(".app-card.selected"), /--project-accent/u);
  assert.match(rule(".card-meta > span:last-child"), /font-size:\s*13px/u);
  assert.match(rule(".tag-row span"), /font-size:\s*13px/u);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.ambient-scan[\s\S]*?display:\s*none/u);
  assert.match(styles, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.top-nav nav a\s*\{[^}]*font-size:\s*13px/u);
});
