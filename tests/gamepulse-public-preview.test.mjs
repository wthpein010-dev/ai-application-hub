import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const previewRoot = join(root, "projects", "gamepulse-mini-radar");

test("GamePulse has a GitHub Pages read-only preview", () => {
  const pagePath = join(previewRoot, "index.html");
  const stylePath = join(previewRoot, "preview.css");
  const scriptPath = join(previewRoot, "app.js");
  const dataPath = join(previewRoot, "data", "rankings.json");

  for (const path of [pagePath, stylePath, scriptPath, dataPath]) {
    assert.equal(existsSync(path), true, `missing ${path}`);
  }

  const html = readFileSync(pagePath, "utf8");
  const script = readFileSync(scriptPath, "utf8");
  assert.match(html, /<title>小游戏每日排行<\/title>/);
  assert.match(html, /<body\b[^>]*class="[^"]*hub-subpage[^"]*"/);
  assert.match(html, /href="\.\.\/\.\.\/assets\/subpage-shell\.css"/);
  assert.match(html, /class="hub-home-link"[^>]*href="\.\.\/\.\.\/index\.html#apps"/);
  assert.match(html, /GitHub Pages 只读预览/);
  assert.match(html, /只展示同步快照，不提供投稿、收藏或写入/);
  assert.doesNotMatch(html, /<form\b|<iframe\b|contenteditable|type="(?:text|search|file)"/i);
  assert.match(html, /data-ranking="wechat"/);
  assert.match(html, /data-ranking="popular"/);
  assert.match(html, /data-ranking="grossing"/);
  assert.match(html, /data-ranking="overseas"/);
  assert.match(
    html,
    /href="https:\/\/gamepulse-mini-radar\.polite-chord-7994\.chatgpt\.site"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/,
  );
  assert.doesNotMatch(html, /综合排名/);
  assert.match(script, /fetch\(["']\.\/data\/rankings\.json["']/);
  assert.match(script, /textContent/);
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(script, /item\.sourceUrl|\.href\s*=\s*sourceUrl/);
});

test("GamePulse preview styles keep four rankings responsive and accessible", () => {
  const cssPath = join(previewRoot, "preview.css");
  assert.equal(existsSync(cssPath), true, `missing ${cssPath}`);
  const css = readFileSync(cssPath, "utf8");

  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
