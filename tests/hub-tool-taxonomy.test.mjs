import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const homepage = readFileSync(join(root, "index.html"), "utf8");
const apps = loadDefaultAppsFromRuntime(runtime);

function loadCatalogTypeContract() {
  const start = runtime.indexOf("const catalogTypeLabels");
  const end = runtime.indexOf("const defaultPageText", start);
  assert.notEqual(start, -1, "runtime should define the public catalog taxonomy");
  assert.notEqual(end, -1);

  const context = { globalThis: {} };
  vm.runInNewContext([
    runtime.slice(start, end),
    "globalThis.catalogTypeLabels = catalogTypeLabels;",
    "globalThis.catalogTypeKey = catalogTypeKey;",
    "globalThis.catalogTypeLabel = catalogTypeLabel;",
    "globalThis.editableCatalogTypes = editableCatalogTypes;",
    "globalThis.setCatalogType = setCatalogType;",
  ].join("\n"), context);
  return context.globalThis;
}

function loadNormalizer() {
  const start = runtime.indexOf("function normalizeApp");
  const end = runtime.indexOf("function projectHref", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const context = {
    globalThis: {},
    URL,
    defaultApps: apps,
    statusLabel: {
      navigation: "项目导航",
      content: "内容工具",
      plugin: "插件工具",
      assistant: "辅助工具",
      game: "小游戏",
      ai: "AI版",
      engineering: "工程体验",
      life: "生活工具",
      training: "训练工具",
      idea: "创意工具",
      desktop: "桌面工具",
    },
    OLD_HUB_BRIEF: "",
    HUB_BRIEF: "",
  };
  vm.runInNewContext(
    `function cloneApp(app) { return { ...app, tags: [...app.tags], platforms: { ...(app.platforms || {}) } }; }\n${runtime.slice(start, end)}\nglobalThis.normalizeApp = normalizeApp;`,
    context,
  );
  return context.globalThis.normalizeApp;
}

function loadFilteringContract() {
  const start = runtime.indexOf("function renderCategoryOptions");
  const end = runtime.indexOf("function getNavigationApps", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const taxonomy = loadCatalogTypeContract();
  const state = { query: "", category: "all", status: "all", sort: "default" };
  const context = {
    globalThis: {},
    state,
    defaultApps: apps,
    visibleApps: () => apps,
    catalogTypeKey: taxonomy.catalogTypeKey,
    catalogTypeLabel: taxonomy.catalogTypeLabel,
  };
  vm.runInNewContext([
    runtime.slice(start, end),
    "globalThis.getFilteredApps = getFilteredApps;",
  ].join("\n"), context);
  return { getFilteredApps: context.globalThis.getFilteredApps, state, catalogTypeKey: taxonomy.catalogTypeKey };
}

test("application cards use six concise public tool types", () => {
  const { catalogTypeLabels, catalogTypeKey, catalogTypeLabel } = loadCatalogTypeContract();
  const expectedLabels = {
    plugin: "插件工具",
    assistant: "辅助工具",
    life: "生活工具",
    intelligence: "网页情报",
    desktop: "桌面工具",
    content: "内容工具",
    game: "小游戏",
    engineering: "工程体验",
  };
  assert.deepEqual(JSON.parse(JSON.stringify(catalogTypeLabels)), expectedLabels);

  const expectedGroups = {
    plugin: ["feishu-downloader"],
    assistant: [
      "hub",
      "minigame-project-simulator",
      "ai-game-requirements-workshop",
      "planner-daily-quiz",
      "codex-reviewer",
      "planmap",
      "simuai",
      "gamespec-relay",
      "loop-bgm-lab",
    ],
    life: ["wanhuatong"],
    intelligence: ["gamepulse-mini-radar", "x-ai-codex-radar"],
    desktop: [
      "codex-quota-bar",
      "codex-thread-workbench",
      "web-media-collector",
      "codex-habit-tool",
      "clickflow",
      "pureshrink",
      "codex-multi-thread-workbench",
    ],
    content: ["travel-generator"],
  };

  for (const [type, ids] of Object.entries(expectedGroups)) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(apps.filter((app) => catalogTypeKey(app) === type).map((app) => app.id))),
      ids,
      `${catalogTypeLabels[type]} should contain the intended applications`,
    );
    for (const id of ids) {
      assert.equal(catalogTypeLabel(apps.find((app) => app.id === id)), catalogTypeLabels[type]);
    }
  }

  assert.equal(apps.filter((app) => catalogTypeKey(app) === "game").length, 5);
  assert.equal(apps.filter((app) => catalogTypeKey(app) === "engineering").length, 6);
});

test("the type filter exposes only the six tool types plus games and engineering", () => {
  const filter = /<select id="statusFilter">([\s\S]*?)<\/select>/.exec(homepage)?.[1] || "";
  const options = [...filter.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)]
    .map((match) => [match[1], match[2]]);

  assert.deepEqual(options, [
    ["all", "全部类型"],
    ["plugin", "插件工具"],
    ["assistant", "辅助工具"],
    ["life", "生活工具"],
    ["intelligence", "网页情报"],
    ["desktop", "桌面工具"],
    ["content", "内容工具"],
    ["game", "小游戏"],
    ["engineering", "工程体验"],
  ]);
  assert.doesNotMatch(filter, /AI版|训练工具|创意工具|项目导航/);
  assert.match(homepage, /styles\.css\?v=20260827-hub-visual-polish/u);
});

test("the maintenance editor uses and persists the same public taxonomy", () => {
  const { catalogTypeKey, editableCatalogTypes, setCatalogType } = loadCatalogTypeContract();
  const normalizeApp = loadNormalizer();
  const radar = apps.find((app) => app.id === "x-ai-codex-radar");
  const clickflow = apps.find((app) => app.id === "clickflow");
  const game = apps.find((app) => app.id === "nang-keng-pai-pai-xiang");
  const engineering = apps.find((app) => app.id === "paws-home-client");

  assert.equal(catalogTypeKey(radar), "intelligence");
  assert.equal(catalogTypeKey(clickflow), "desktop");

  const editedRadar = setCatalogType(radar, "assistant");
  assert.equal(editedRadar.status, "assistant");
  assert.equal(editedRadar.catalogType, "assistant");
  assert.equal(catalogTypeKey(editedRadar), "assistant");
  assert.equal(catalogTypeKey(normalizeApp(editedRadar)), "assistant");

  const editedClickflow = setCatalogType(clickflow, "content");
  assert.equal(editedClickflow.catalogType, "content");
  assert.equal(catalogTypeKey(editedClickflow), "content");

  const unchangedGame = setCatalogType(game, "life");
  assert.equal(unchangedGame.status, "game");
  assert.equal("catalogType" in unchangedGame, false);
  assert.equal(catalogTypeKey(normalizeApp(unchangedGame)), "game");

  const unchangedEngineering = setCatalogType(engineering, "content");
  assert.equal(unchangedEngineering.status, "engineering");
  assert.equal("catalogType" in unchangedEngineering, false);
  assert.equal(catalogTypeKey(normalizeApp(unchangedEngineering)), "engineering");

  assert.deepEqual(JSON.parse(JSON.stringify(editableCatalogTypes(radar).map(([key]) => key))), [
    "plugin", "assistant", "life", "intelligence", "desktop", "content",
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(editableCatalogTypes(game))), [["game", "小游戏"]]);
  assert.deepEqual(JSON.parse(JSON.stringify(editableCatalogTypes(engineering))), [["engineering", "工程体验"]]);

  assert.match(homepage, /<select id="editStatus"><\/select>/);
  assert.doesNotMatch(homepage, /<select id="editStatus">[\s\S]*?AI版/);
  assert.match(runtime, /nodes\.editStatus\.innerHTML = editableCatalogTypes\(app\)/);
  assert.match(runtime, /nodes\.editStatus\.value = catalogTypeKey\(app\);/);
  assert.match(runtime, /return setCatalogType\(\{[\s\S]*?\}, nodes\.editStatus\.value\);/);
});

test("the maintenance editor exposes a validated project visual path after video", () => {
  assert.match(homepage, /id="editVideo"[\s\S]*?<span>展示图片地址<\/span>[\s\S]*?id="editVisual"/u);
  assert.match(runtime, /editVisual:\s*document\.querySelector\(["']#editVisual["']\)/u);
  assert.match(runtime, /nodes\.editVisual\.value\s*=\s*app\.visual\s*\|\|\s*projectMedia\(app\)\.src/u);
  assert.match(runtime, /visual:\s*normalizeVisualPath\(nodes\.editVisual\?\.value\)/u);
  assert.match(runtime, /editVisual:\s*["']visual["']/u);
});

test("application taxonomy filters leave games and engineering intact while search stays global", () => {
  const { getFilteredApps, state, catalogTypeKey } = loadFilteringContract();
  const groupedIds = () => {
    const filtered = Array.from(getFilteredApps());
    return {
      apps: filtered.filter((app) => !["game", "engineering"].includes(catalogTypeKey(app))).map(({ id }) => id),
      games: filtered.filter((app) => catalogTypeKey(app) === "game").map(({ id }) => id),
      engineering: filtered.filter((app) => catalogTypeKey(app) === "engineering").map(({ id }) => id),
    };
  };

  state.status = "plugin";
  assert.deepEqual(groupedIds(), {
    apps: ["feishu-downloader"],
    games: ["icecream", "zhuanglege-sha", "fill-what", "xiang-le-ge-xiang", "nang-keng-pai-pai-xiang"],
    engineering: ["vita-mahjong", "paws-home-client", "paws-level-editor", "brick-light-motion-lab", "brick-character-copy-preview", "trinket-market"],
  });

  state.status = "all";
  state.category = "AI 内容生成";
  assert.deepEqual(groupedIds(), {
    apps: ["travel-generator"],
    games: ["icecream", "zhuanglege-sha", "fill-what", "xiang-le-ge-xiang", "nang-keng-pai-pai-xiang"],
    engineering: ["vita-mahjong", "paws-home-client", "paws-level-editor", "brick-light-motion-lab", "brick-character-copy-preview", "trinket-market"],
  });

  state.category = "all";
  state.query = "小游戏";
  assert.deepEqual(groupedIds(), {
    apps: ["hub", "gamepulse-mini-radar", "minigame-project-simulator"],
    games: ["icecream", "zhuanglege-sha", "fill-what", "xiang-le-ge-xiang", "nang-keng-pai-pai-xiang"],
    engineering: [],
  });
});

test("sorting, cards and exports share the public taxonomy", () => {
  assert.match(runtime, /catalogTypeLabel\(a\)\.localeCompare\(catalogTypeLabel\(b\)/);
  assert.match(runtime, /status-\$\{escapeHtml\(catalogTypeKey\(app\)\)\}/);
  assert.match(runtime, /\$\{escapeHtml\(catalogTypeLabel\(app\)\)\}<\/span>/);
  assert.match(runtime, /`- 类型：\$\{catalogTypeLabel\(app\)\}`/);
});

test("stored legacy badges migrate without replacing editable copy", () => {
  const { catalogTypeLabel } = loadCatalogTypeContract();
  const normalizeApp = loadNormalizer();
  const legacyBadges = new Map([
    ["hub", "项目导航"],
    ["gamepulse-mini-radar", "辅助工具"],
    ["planner-daily-quiz", "训练工具"],
    ["clickflow", "辅助工具"],
    ["pureshrink", "辅助工具"],
    ["planmap", "脑图 + AI"],
    ["simuai", "AI 实验工具"],
    ["gamespec-relay", "游戏研发 Agent"],
    ["x-ai-codex-radar", "AI 情报工具"],
  ]);

  for (const [id, badge] of legacyBadges) {
    const base = apps.find((app) => app.id === id);
    const normalized = normalizeApp({ ...base, badge, brief: `保留 ${id} 的自定义简介` });
    assert.equal(normalized.badge, catalogTypeLabel(base));
    assert.equal(normalized.brief, `保留 ${id} 的自定义简介`);
  }
});
