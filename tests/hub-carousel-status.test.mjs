import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

function loadCarousel(selectedId = "simuai") {
  const renderStart = runtime.indexOf("function renderDots");
  const renderEnd = runtime.indexOf("function renderGrid", renderStart);
  const switchStart = runtime.indexOf("function switchApp");
  const switchEnd = runtime.indexOf("function getAdvice", switchStart);
  assert.notEqual(renderStart, -1);
  assert.notEqual(renderEnd, -1);
  assert.notEqual(switchStart, -1);
  assert.notEqual(switchEnd, -1);

  const navigationApps = [
    { id: "planmap", name: "PlanMap" },
    { id: "simuai", name: "万象实验室" },
    { id: "fill-what", name: "填了个啥" },
  ];
  const context = {
    globalThis: {},
    nodes: { dots: { innerHTML: "" } },
    state: { selectedId },
  };
  vm.runInNewContext([
    `const navigationApps = ${JSON.stringify(navigationApps)};`,
    "function getNavigationApps() { return navigationApps; }",
    "function escapeHtml(value) { return String(value); }",
    "function selectApp(id) { state.selectedId = id; }",
    runtime.slice(renderStart, renderEnd),
    runtime.slice(switchStart, switchEnd),
    "globalThis.renderDots = renderDots;",
    "globalThis.switchApp = switchApp;",
  ].join("\n"), context);
  return { ...context, navigationApps };
}

test("carousel renders position and progress without repeating the project name", () => {
  const page = loadCarousel();
  page.globalThis.renderDots(page.navigationApps);
  const html = page.nodes.dots.innerHTML;

  assert.match(html, /class="showcase-status"/);
  assert.doesNotMatch(html, /万象实验室/);
  assert.match(html, /02\s*\/\s*03/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="2"/);
  assert.match(html, /aria-valuemax="3"/);
  assert.match(html, /width:\s*66\.67%/);
  assert.doesNotMatch(html, /showcase-dot/);
  assert.doesNotMatch(html, /data-dot-id/);
});

test("carousel previous and next navigation still wraps in catalog order", () => {
  const page = loadCarousel("planmap");

  page.globalThis.switchApp(-1);
  assert.equal(page.state.selectedId, "fill-what");
  page.globalThis.switchApp(1);
  assert.equal(page.state.selectedId, "planmap");
  page.globalThis.switchApp(1);
  assert.equal(page.state.selectedId, "simuai");
});
