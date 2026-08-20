import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

function loadPageTextNormalizer() {
  const defaultsStart = runtime.indexOf("const defaultPageText");
  const defaultsEnd = runtime.indexOf("const pageTextTargets", defaultsStart);
  const normalizerStart = runtime.indexOf("function isCorruptedEditableText");
  const normalizerEnd = runtime.indexOf("function loadApps", normalizerStart);
  assert.notEqual(defaultsStart, -1);
  assert.notEqual(defaultsEnd, -1);
  assert.notEqual(normalizerStart, -1);
  assert.notEqual(normalizerEnd, -1);

  const context = { globalThis: {} };
  vm.runInNewContext([
    runtime.slice(defaultsStart, defaultsEnd),
    runtime.slice(normalizerStart, normalizerEnd),
    "globalThis.defaultPageText = defaultPageText;",
    "globalThis.normalizePageText = normalizePageText;",
  ].join("\n"), context);
  return context.globalThis;
}

test("obviously corrupted editable page text falls back field by field", () => {
  const { defaultPageText, normalizePageText } = loadPageTextNormalizer();
  const storedDescription = "通过 Codex 调用 HyperFrames，保留我在线修改过的主页说明。";
  const normalized = normalizePageText({
    "brand.title": "AI ????",
    "nav.overview": "??",
    "hero.title": "??????",
    "filter.searchLabel": "搜?索",
    "hero.description": storedDescription,
  });

  assert.equal(normalized["brand.title"], defaultPageText["brand.title"]);
  assert.equal(normalized["nav.overview"], defaultPageText["nav.overview"]);
  assert.equal(normalized["hero.title"], defaultPageText["hero.title"]);
  assert.equal(normalized["filter.searchLabel"], "搜?索");
  assert.equal(normalized["hero.description"], storedDescription);
});

test("replacement-character corruption falls back without replacing normal questions", () => {
  const { defaultPageText, normalizePageText } = loadPageTextNormalizer();
  const normalized = normalizePageText({
    "metrics.totalNote": "���",
    "platforms.description": "Windows 还是 Mac？网页入口都可以直接使用。",
  });

  assert.equal(normalized["metrics.totalNote"], defaultPageText["metrics.totalNote"]);
  assert.equal(normalized["platforms.description"], "Windows 还是 Mac？网页入口都可以直接使用。");
});
