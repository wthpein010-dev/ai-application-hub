import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = join(root, "projects", "brick-character-copy-preview");

test("brick preview now defaults to a landscape dual atlas workbench", () => {
  const html = readFileSync(join(projectRoot, "index.html"), "utf8");
  const app = readFileSync(join(projectRoot, "app.js"), "utf8");
  const data = JSON.parse(readFileSync(join(projectRoot, "data", "characters.json"), "utf8"));

  assert.match(html, /<title>砖块小人与随身小物图鉴<\/title>/);
  assert.match(html, /id="atlas-workbench"/);
  assert.match(html, /id="atlas-list-panel"/);
  assert.match(html, /id="atlas-detail-panel"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /id="tab-characters"/);
  assert.match(html, /id="tab-trinkets"/);
  assert.match(html, /id="character-grid"/);
  assert.match(html, /id="trinket-grid"/);
  assert.match(html, /id="gallery-count"/);
  assert.match(html, /id="detail-empty"/);
  assert.match(html, /id="character-detail"/);
  assert.match(html, /id="trinket-detail"/);
  assert.match(html, /id="detail-description"/);
  assert.match(html, /id="copy-diagnostics"/);
  assert.doesNotMatch(html, /detail-dialog|detail-scrim|aria-modal="true"/);
  assert.doesNotMatch(app, /setModalBackgroundInert|trapDetailFocus|detailIsOpen/);
  assert.match(html, /href="\.\/copy-review\.html"/);
  assert.match(html, /href="\.\.\/trinket-market\/index\.html"/);
  assert.match(app, /copy-diagnostics\.js/);
  assert.match(app, /data\/characters\.json/);
  assert.equal(data.length, 45);
});

test("gallery catalog publishes complete preview art for the available character ID range", () => {
  const dataPath = join(projectRoot, "data", "characters.json");
  const source = readFileSync(dataPath, "utf8");
  const data = JSON.parse(source);
  const previewCharacters = data.filter(({ preview }) => preview);

  assert.deepEqual(
    previewCharacters.map(({ id }) => id).sort((left, right) => left - right),
    Array.from({ length: 35 }, (_, index) => index + 10),
  );
  for (const character of previewCharacters) {
    assert.equal(
      existsSync(join(projectRoot, character.preview)),
      true,
      `${character.name} should bundle ${character.preview}`,
    );
  }
  assert.doesNotMatch(source, /[A-Z]:\\/iu);
});

test("gallery CSS preserves the formal card geometry inside a responsive landscape workbench", () => {
  const css = readFileSync(join(projectRoot, "styles.css"), "utf8");

  assert.match(css, /\.atlas-workbench\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*720px\)\s+minmax\(520px,\s*1fr\)/s);
  assert.match(css, /@media\s*\(max-width:\s*1099px\)/);
  assert.match(css, /\.atlas-detail-panel\s*\{[^}]*position:\s*sticky/s);
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
