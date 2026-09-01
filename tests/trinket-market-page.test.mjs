import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = join(root, "projects", "trinket-market");

test("market page owns the approved public title and Hub return shell", () => {
  const html = readFileSync(join(projectRoot, "index.html"), "utf8");
  assert.match(html, /<title>随身小物交易市场<\/title>/);
  assert.match(html, /数据更新时间/);
  assert.match(html, /<body class="hub-subpage" data-theme="a">/);
  assert.match(html, /class="hub-home-link" href="\.\.\/\.\.\/index\.html#engineering"/);
  assert.match(html, /\.\.\/\.\.\/assets\/subpage-shell\.css/);
  assert.match(html, /id="item-grid"/);
  assert.match(html, /id="value-toggle"/);
  assert.match(html, /class="gallery-link" href="\.\.\/brick-character-copy-preview\/index\.html"/);
  assert.match(html, />砖块小人图鉴<\/a>/);
});

test("daylight skin control lives in the market header", () => {
  const html = readFileSync(join(projectRoot, "index.html"), "utf8");
  const header = html.match(/<header class="market-header">([\s\S]*?)<\/header>/)?.[1] || "";
  const toolbar = html.match(/<div class="catalog-toolbar">([\s\S]*?)<\/div>/)?.[1] || "";

  assert.match(header, /id="theme-select"/);
  assert.match(header, /<option value="d">D 白昼集市<\/option>/);
  assert.doesNotMatch(toolbar, /id="theme-select"/);
});

test("market runtime exposes the future count bridge and count event", () => {
  const source = readFileSync(join(projectRoot, "app.js"), "utf8");
  assert.match(source, /window\.TrinketMarketAPI/);
  assert.match(source, /setAcquisitionCounts/);
  assert.match(source, /trinket-market:counts/);
});

test("market styles encode the approved dense responsive grid and readable card type", () => {
  const css = readFileSync(join(projectRoot, "styles.css"), "utf8");
  assert.match(css, /grid-template-columns:\s*repeat\(8,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /repeat\(9,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.item-art img\s*\{[^}]*width:\s*163px/s);
  assert.match(css, /\.item-name\s*\{[^}]*font-size:\s*12px/s);
  assert.match(css, /prefers-reduced-motion/);
});
