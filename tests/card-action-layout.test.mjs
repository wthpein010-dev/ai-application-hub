import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");
const page = readFileSync(join(root, "index.html"), "utf8");

function actionRenderer() {
  return runtime.slice(
    runtime.indexOf("function renderActions"),
    runtime.indexOf("function platformValue")
  );
}

test("application cards keep demo and video above the two download actions", () => {
  const actions = actionRenderer();

  assert.match(actions, /\$\{webLink\}\s*\$\{video\}\s*\$\{windowsLink\}\s*\$\{macLink\}/);
  assert.match(actions, /data-action="web"[^>]*>\u6f14\u793a<\/a>/);
  assert.match(actions, /data-action="video"[^>]*>\u89c6\u9891<\/a>/);
  assert.match(actions, /data-action="download"[^>]*>Wins\u4e0b\u8f7d<\/a>/);
  assert.match(actions, /data-action="mac"[^>]*>Mac\u4e0b\u8f7d<\/a>/);
  assert.doesNotMatch(actions, /platformLabel\(/);
});

test("engineering cards use the same two-column action grid", () => {
  const engineeringRule = styles.match(/\.card-actions\.actions-engineering\s*\{[^}]*\}/)?.[0] || "";

  assert.match(engineeringRule, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test("homepage refreshes both card assets after the button layout update", () => {
  assert.match(page, /styles\.css\?v=20260716-button-order/);
  assert.match(page, /app-20260706-restore-games\.js\?v=20260729-clickflow/);
});
