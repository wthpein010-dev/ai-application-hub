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
  const end = runtime.indexOf("function renderSelectedApp", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const context = { globalThis: { cards: [] } };
  vm.runInNewContext([
    'const state = { selectedId: "selected-app" };',
    "const document = { querySelectorAll(selector) { globalThis.queriedSelector = selector; return globalThis.cards; } };",
    "function selectApp(id) { globalThis.selectedId = id; }",
    runtime.slice(start, end),
    "globalThis.handleAppCardClick = handleAppCardClick;",
    "globalThis.handleAppCardKeydown = handleAppCardKeydown;",
    "globalThis.updateSelectedCards = updateSelectedCards;",
  ].join("\n"), context);
  return context.globalThis;
}

function eventFor({ appId = "nang-keng-pai-pai-xiang", interactive = false, key = "" } = {}) {
  const card = { dataset: { appId } };
  return {
    key,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    target: {
      closest(selector) {
        if (selector.startsWith("a, button")) return interactive ? {} : null;
        if (selector === "[data-app-id]") return card;
        return null;
      },
    },
  };
}

function loadSelection(initialHref = "http://127.0.0.1:8000/index.html?theme=night#games") {
  const storageSetStart = runtime.indexOf("function storageSet");
  const storageSetEnd = runtime.indexOf("function storageRemove", storageSetStart);
  const start = runtime.indexOf("function selectApp");
  const end = runtime.indexOf("function ensureSelectedApp", start);
  assert.notEqual(storageSetStart, -1);
  assert.notEqual(storageSetEnd, -1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const context = {
    globalThis: {},
    apps: [{ id: "selected-app" }, { id: "another-app" }],
    state: { selectedId: "selected-app" },
    URL,
    location: { href: initialHref },
    history: {
      state: { retained: true },
      replaceState(state, unused, url) {
        this.call = { state, unused, url: String(url) };
      },
    },
    localStorage: {
      setItem(key, value) {
        this.call = { key, value };
      },
    },
  };
  vm.runInNewContext([
    'const SELECTED_KEY = "selected-key";',
    runtime.slice(storageSetStart, storageSetEnd),
    "function visibleApps() { return apps; }",
    "function renderSelectedApp() { globalThis.renderSelectedAppCalls = (globalThis.renderSelectedAppCalls || 0) + 1; }",
    "function render() { globalThis.renderCalls = (globalThis.renderCalls || 0) + 1; }",
    runtime.slice(start, end),
    "globalThis.selectApp = selectApp;",
  ].join("\n"), context);
  return context;
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

test("Enter and Space select a focused application or game card", () => {
  for (const key of ["Enter", " "]) {
    const page = loadHandler();
    const event = eventFor({ key });
    page.handleAppCardKeydown(event);
    assert.equal(page.selectedId, "nang-keng-pai-pai-xiang");
    assert.equal(event.defaultPrevented, true);
  }
});

test("card keyboard handling leaves actions and unrelated keys alone", () => {
  const page = loadHandler();
  const actionEvent = eventFor({ interactive: true, key: "Enter" });
  const escapeEvent = eventFor({ key: "Escape" });

  page.handleAppCardKeydown(actionEvent);
  page.handleAppCardKeydown(escapeEvent);

  assert.equal(page.selectedId, undefined);
  assert.equal(actionEvent.defaultPrevented, false);
  assert.equal(escapeEvent.defaultPrevented, false);
});

test("selected card state is synchronized for visual and assistive users", () => {
  const page = loadHandler();
  const cards = ["selected-app", "another-app"].map((appId) => ({
    dataset: { appId },
    selected: null,
    ariaCurrent: null,
    classList: {
      toggle(_name, selected) {
        this.owner.selected = selected;
      },
      owner: null,
    },
    setAttribute(name, value) {
      if (name === "aria-current") this.ariaCurrent = value;
    },
  }));
  cards.forEach((card) => {
    card.classList.owner = card;
  });
  page.cards = cards;

  page.updateSelectedCards();

  assert.equal(page.queriedSelector, "article.app-card[data-app-id]");
  assert.deepEqual(cards.map((card) => [card.selected, card.ariaCurrent]), [
    [true, "true"],
    [false, "false"],
  ]);
});

test("selection persists stage state and project query without replacing the section hash", () => {
  const page = loadSelection();

  page.globalThis.selectApp("another-app");

  assert.equal(page.state.selectedId, "another-app");
  assert.deepEqual(page.localStorage.call, { key: "selected-key", value: "another-app" });
  assert.equal(page.globalThis.renderSelectedAppCalls, 1);
  assert.equal(page.globalThis.renderCalls, undefined);
  const updated = new URL(page.history.call.url);
  assert.equal(updated.searchParams.get("project"), "another-app");
  assert.equal(updated.searchParams.get("theme"), "night");
  assert.equal(updated.hash, "#games");
});
