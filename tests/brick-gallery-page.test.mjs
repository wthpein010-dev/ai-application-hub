import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = join(root, "projects", "brick-character-copy-preview");

test("brick preview now defaults to the game-style 45-character gallery", () => {
  const html = readFileSync(join(projectRoot, "index.html"), "utf8");
  const app = readFileSync(join(projectRoot, "app.js"), "utf8");
  const data = JSON.parse(readFileSync(join(projectRoot, "data", "characters.json"), "utf8"));

  assert.match(html, /<title>砖块小人图鉴与文案校对<\/title>/);
  assert.match(html, /id="character-grid"/);
  assert.match(html, /id="gallery-count"/);
  assert.match(html, /id="detail-dialog"/);
  assert.match(html, /id="detail-description"/);
  assert.match(html, /id="copy-diagnostics"/);
  assert.match(html, /href="\.\/copy-review\.html"/);
  assert.match(html, /href="\.\.\/trinket-market\/index\.html"/);
  assert.match(app, /copy-diagnostics\.js/);
  assert.match(app, /data\/characters\.json/);
  assert.equal(data.length, 45);
});

test("gallery CSS preserves the formal 3-by-4 card and detail text geometry", () => {
  const css = readFileSync(join(projectRoot, "styles.css"), "utf8");

  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*170px\)/);
  assert.match(css, /\.character-card\s*\{[^}]*width:\s*170px[^}]*height:\s*180px/s);
  assert.match(css, /\.character-name\s*\{[^}]*font-size:\s*22px/s);
  assert.match(css, /\.detail-copy-box\s*\{[^}]*width:\s*464px[^}]*min-height:\s*196px/s);
  assert.match(css, /#detail-description\s*\{[^}]*width:\s*420px[^}]*min-height:\s*126px[^}]*font-size:\s*28px/s);
  assert.match(css, /prefers-reduced-motion/);
});

test("the former 20-role copy table remains available as a secondary review page", () => {
  const html = readFileSync(join(projectRoot, "copy-review.html"), "utf8");
  const names = Array.from(html.matchAll(/name:\s*"([^"]+)"/g), (match) => match[1]);

  assert.equal(names.length, 20);
  assert.match(html, /id="rows"/);
  assert.match(html, /id="role-image-input"/);
  assert.match(html, /brick-character-copy-preview-v1/);
  assert.match(html, /href="\.\/index\.html"/);
});

test("Hub showcase capture source describes the upgraded 45-character experience", () => {
  const sources = readFileSync(join(root, "scripts", "hub-showcase-media-sources.json"), "utf8");
  const media = readFileSync(join(root, "hub-project-media.js"), "utf8");

  assert.match(sources, /"brick-character-copy-preview"[^\n]+"feature":\s*"45 个正式角色的游戏式详情与真实换行检查"/);
  assert.match(media, /"brick-character-copy-preview"[\s\S]*45 个正式角色的游戏式详情与真实换行检查/);
});
