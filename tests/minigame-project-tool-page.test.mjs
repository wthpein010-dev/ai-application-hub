import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const project = join(root, "projects", "minigame-project-tool");

test("web demo exposes the complete project brief workflow", () => {
  const html = readFileSync(join(project, "index.html"), "utf8");

  assert.match(html, /<link[^>]+href="\.\/styles\.css"/);
  assert.match(html, /<script[^>]+type="module"[^>]+src="\.\/app\.js"/);
  assert.match(html, /id="quickFields"/);
  assert.match(html, /id="advancedSections"/);
  assert.match(html, /id="progressText"/);
  assert.match(html, /id="issueList"/);
  assert.match(html, /id="markdownPreview"/);
  assert.match(html, /id="downloadMarkdown"/);
  assert.match(html, /id="memoryDialog"/);
  assert.match(html, /id="viewMemory"/);
});

test("web demo persists locally and imports the pure core", () => {
  const app = readFileSync(join(project, "app.js"), "utf8");

  assert.match(app, /from "\.\/core\.mjs"/);
  assert.match(app, /minigame-project-tool-draft-v1/);
  assert.match(app, /localStorage\.setItem/);
  assert.match(app, /localStorage\.getItem/);
  assert.match(app, /generateMarkdown/);
  assert.match(app, /checkCompleteness/);
  assert.match(app, /URL\.createObjectURL/);
});

test("web demo explicitly protects narrow-screen readability", () => {
  const css = readFileSync(join(project, "styles.css"), "utf8");

  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /color-scheme:\s*dark/);
  assert.match(css, /select\s*\{/);
  assert.match(css, /option\s*\{/);
  assert.match(css, /overflow-x:\s*hidden/);
});
