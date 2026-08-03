import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

function loadHandler() {
  const start = runtime.indexOf("function handleAppCardClick");
  const end = runtime.indexOf("function updateSelectedCards", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const context = { globalThis: {} };
  vm.runInNewContext([
    "function selectApp(id) { globalThis.selectedId = id; }",
    runtime.slice(start, end),
    "globalThis.handleAppCardClick = handleAppCardClick;",
  ].join("\n"), context);
  return context.globalThis;
}

function eventFor({ appId = "nang-keng-pai-pai-xiang", interactive = false } = {}) {
  const card = { dataset: { appId } };
  return {
    target: {
      closest(selector) {
        if (selector.startsWith("a, button")) return interactive ? {} : null;
        if (selector === "[data-app-id]") return card;
        return null;
      },
    },
  };
}

test("clicking an application or game card selects that project", () => {
  const page = loadHandler();
  page.handleAppCardClick(eventFor());
  assert.equal(page.selectedId, "nang-keng-pai-pai-xiang");
});

test("clicking a card action keeps navigation with the action", () => {
  const page = loadHandler();
  page.handleAppCardClick(eventFor({ interactive: true }));
  assert.equal(page.selectedId, undefined);
});
