import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, "index.html"), "utf8");
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

function loadEditMode() {
  const start = runtime.indexOf("function setEditMode");
  const end = runtime.indexOf("function closeEditMode", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const context = { globalThis: {} };
  vm.runInNewContext([
    "const state = { editing: false };",
    "const document = { body: { classList: { toggle() {} } } };",
    "const nodes = { editPanel: { inert: true, setAttribute(name, value) { this[name] = value; } }, exportButton: { textContent: '' } };",
    "function renderEditForm() {}",
    runtime.slice(start, end),
    "globalThis.state = state;",
    "globalThis.nodes = nodes;",
    "globalThis.setEditMode = setEditMode;",
  ].join("\n"), context);
  return context.globalThis;
}

test("catalog cards use article semantics while remaining keyboard focusable", () => {
  assert.doesNotMatch(html, /role="listbox"/);
  assert.doesNotMatch(runtime, /role="option"/);
  assert.doesNotMatch(runtime, /aria-selected=/);
  assert.match(runtime, /<article[^>]+tabindex="0"[^>]+aria-current=/);
});

test("hidden editor starts inert and toggles inert with its visible state", () => {
  assert.match(html, /<aside id="editPanel"[^>]+aria-hidden="true"[^>]+inert/);
  const page = loadEditMode();

  page.setEditMode(true);
  assert.equal(page.nodes.editPanel.inert, false);
  assert.equal(page.nodes.editPanel["aria-hidden"], "false");

  page.setEditMode(false);
  assert.equal(page.nodes.editPanel.inert, true);
  assert.equal(page.nodes.editPanel["aria-hidden"], "true");
});

test("showcase controls keep accessible labels inside the semantic media region", () => {
  assert.match(html, /<section id="showcaseMedia"[^>]+aria-label="当前应用"/u);
  assert.match(html, /<button id="prevApp"[^>]+aria-label="上一个应用"/u);
  assert.match(html, /<button id="nextApp"[^>]+aria-label="下一个应用"/u);
  assert.match(html, /<div id="showcaseProgress"[^>]+aria-live="polite"/u);
});

test("home metadata describes the full cross-platform catalog", () => {
  const description = html.match(/<meta name="description" content="([^"]+)"/u)?.[1] || "";
  assert.doesNotMatch(description, /HyperFrames/u);
  for (const phrase of ["AI 应用", "小游戏", "工程体验", "Windows", "macOS"]) {
    assert.match(description, new RegExp(phrase, "u"));
  }
});
