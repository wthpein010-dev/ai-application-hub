import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");
const page = readFileSync(join(root, "index.html"), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`, "u"))?.[0] || "";
}

function actionRenderer() {
  return runtime.slice(
    runtime.indexOf("function renderActions"),
    runtime.indexOf("function platformValue")
  );
}

test("application cards keep web preview and introduction video before platform actions", () => {
  const actions = actionRenderer();

  assert.match(actions, /\$\{webLink\}\s*\$\{video\}\s*\$\{windowsLink\}\s*\$\{macLink\}\s*\$\{iosLink\}/);
  assert.match(actions, /data-action="web"[^>]*>\u7f51\u9875\u9884\u89c8<\/a>/);
  assert.match(actions, /data-action="video"[^>]*>\u4ecb\u7ecd\u89c6\u9891<\/a>/);
  assert.match(actions, /data-action="download"[^>]*>Wins\u4e0b\u8f7d<\/a>/);
  assert.match(actions, /data-action="mac"[^>]*>Mac\u4e0b\u8f7d<\/a>/);
  assert.match(actions, /data-action="ios"[^>]*>iOS\u5b89\u88c5<\/a>/);
  assert.doesNotMatch(actions, /platformLabel\(/);
});

test("engineering cards use the same two-column action grid", () => {
  const engineeringRule = styles.match(/\.card-actions\.actions-engineering\s*\{[^}]*\}/)?.[0] || "";

  assert.match(engineeringRule, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test("Bento cards pin equal action cells to their lower edge", () => {
  assert.match(rule(".card-bottom"), /margin-top:\s*auto/u);
  assert.match(rule(".card-actions"), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/u);
  assert.match(rule(".card-actions a"), /min-height:\s*44px/u);
  assert.match(rule(".card-actions a"), /font-size:\s*13px/u);
  assert.match(rule(".card-actions a::before"), /content:\s*attr\(data-icon\)/u);
  assert.match(actionRenderer(), /data-icon="&#8599;"/u);
  assert.match(actionRenderer(), /data-icon="&#9654;"/u);
  assert.match(actionRenderer(), /data-icon="&#8595;"/u);
});

test("cards expose one readable project-owned feature without repeating the summary", () => {
  assert.match(runtime, /media\.feature/u);
  assert.match(runtime, /class="card-feature"/u);
  assert.match(runtime, /--project-accent:\$\{escapeHtml\(media\.accent\)\}/u);
  assert.match(rule(".card-feature"), /min-height:\s*48px/u);
  assert.match(rule(".card-feature"), /font-size:\s*14px/u);
  assert.match(rule(".app-card > p"), /font-size:\s*14px/u);
});

test("homepage loads all showcase assets with the exact release cache marker", () => {
  assert.match(page, /href="\.\/styles\.css\?v=20260827-showcase-complete-copy"/);
  assert.match(page, /src="\.\/hub-project-media\.js\?v=20260826-dynamic-showcase"/);
  assert.match(page, /src="\.\/app-20260706-restore-games\.js\?v=20260826-dynamic-showcase"/);
});
