import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimePath = join(root, "app-20260706-restore-games.js");
const dataPath = join(
  root,
  "design-previews",
  "hub-interactive-atlas",
  "data.generated.js",
);
const previewRoot = dirname(dataPath);
const htmlPath = join(previewRoot, "index.html");
const cssPath = join(previewRoot, "styles.css");
const runtime = readFileSync(runtimePath, "utf8");

test("preview data mirrors every production project in order", async () => {
  assert.ok(existsSync(dataPath), "preview data module must be generated");
  const sourceApps = loadDefaultAppsFromRuntime(runtime);
  const generated = await import(`${pathToFileURL(dataPath).href}?t=${Date.now()}`);

  assert.equal(sourceApps.length, 29);
  assert.equal(generated.projects.length, sourceApps.length);
  assert.deepEqual(
    generated.projects.map(({ id }) => id),
    Array.from(sourceApps, ({ id }) => id),
  );
  assert.deepEqual(
    [...new Set(generated.projects.map(({ kind }) => kind))].sort(),
    ["app", "engineering", "game"],
  );
  assert.ok(
    generated.projects.every(({ actions }) =>
      actions.every(({ href }) => href && href !== "#"),
    ),
  );
});

test("preview shell exposes the approved stage, filter rail, and catalogs", () => {
  assert.ok(existsSync(htmlPath), "preview HTML must exist");
  assert.ok(existsSync(cssPath), "preview CSS must exist");
  const html = readFileSync(htmlPath, "utf8");
  const css = readFileSync(cssPath, "utf8");

  for (const id of [
    "themeToggle",
    "themeMenu",
    "heroStage",
    "heroContent",
    "heroVisual",
    "typeRail",
    "searchInput",
    "sortSelect",
    "appGrid",
    "gameGrid",
    "engineeringGrid",
    "linkInspector",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`, "u"));
  }
  assert.match(
    css,
    /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/u,
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*1024px\)[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/u,
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*720px\)[\s\S]*grid-template-columns:\s*1fr/u,
  );
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
  assert.doesNotMatch(css, /font-size:\s*(?:9|10|11)px/u);
  for (const theme of ["clean", "mist", "coral", "night"]) {
    assert.match(html + css, new RegExp(`data-theme=["']${theme}["']`, "u"));
  }
});
