import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const editorRoot = join(repoRoot, "projects", "paws-level-editor");

const requiredFiles = [
  "index.html",
  "styles.css",
  "app.mjs",
  "core/coverage.mjs",
  "core/gameplay-assets.mjs",
  "core/gameplay-metadata.mjs",
  "core/ai-level-generator.mjs",
  "core/edit-history.mjs",
  "core/level-adapter.mjs",
  "core/level-solver.mjs",
  "core/level-statistics.mjs",
  "core/level-validator.mjs",
  "core/play-engine.mjs",
  "core/random-assigner.mjs",
  "core/view-model.mjs",
  "core/xorshift.mjs",
  "ui/editor-tools.mjs",
  "ui/ai-level-dialog.mjs",
  "ui/inspector.mjs",
  "ui/local-level-import.mjs",
  "ui/level-export.mjs",
  "ui/level-summary.mjs",
  "ui/workbench-controller.mjs",
  "views/canvas-2d.mjs",
  "views/three-3d.mjs",
  "vendor/three.module.js",
  "vendor/OrbitControls.js",
];

const expectedBlockNames = [
  ...Array.from({ length: 32 }, (_, index) => `block_${index + 1}.png`),
  ...Array.from({ length: 6 }, (_, index) => `block_${index + 1001}.png`),
];

const expectedGameplayAssets = new Map([
  ["block_bg.png", { width: 120, height: 135 }],
  ["ui_tile_lock_mask.png", { width: 120, height: 135 }],
  ["bg-47bd7f.png", { width: 5, height: 5 }],
  ["grass.png", { width: 94, height: 34 }],
  ["Setting.png", { width: 69, height: 74 }],
  ["btn_random.png", { width: 147, height: 122 }],
  ["btn_replay.png", { width: 147, height: 122 }],
  ["play_save2.png", { width: 256, height: 178 }],
]);

function naturalSort(left, right) {
  return left.localeCompare(right, undefined, { numeric: true });
}

function readPublicTextFiles(root) {
  const extensions = new Set([".html", ".css", ".js", ".mjs", ".json"]);
  const text = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) {
        visit(path);
      } else if (extensions.has(extname(name))) {
        text.push(readFileSync(path, "utf8"));
      }
    }
  };
  visit(root);
  return text.join("\n");
}

function readPngSize(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG", path);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test("static editor has all modules, vendor files and exactly 38 block images", () => {
  for (const file of requiredFiles) {
    assert.equal(existsSync(join(editorRoot, file)), true, file);
  }
  const blocks = readdirSync(join(editorRoot, "assets", "blocks"))
    .filter((name) => name.endsWith(".png"));
  assert.equal(blocks.length, 38);
  assert.deepEqual(blocks.sort(naturalSort), expectedBlockNames);
});

test("all published block images preserve the expected 120 by 135 dimensions", () => {
  for (const name of expectedBlockNames) {
    assert.deepEqual(
      readPngSize(join(editorRoot, "assets", "blocks", name)),
      { width: 120, height: 135 },
      name,
    );
  }
});

test("public files contain no private level path or credential material", () => {
  const text = readPublicTextFiles(editorRoot);
  assert.doesNotMatch(text, /E:\\Mahjong|maque|WORKBENCH_PASSWORD\s*=|paws_lan_session=/i);
  assert.match(text, /type="password"/);
  assert.match(text, /level_0021_r2_第二关模板12\.json/);
});

test("gameplay skin publishes the selected Unity artwork at original dimensions", () => {
  const gameplayRoot = join(editorRoot, "assets", "gameplay");
  const names = readdirSync(gameplayRoot).filter((name) => name.endsWith(".png"));
  assert.deepEqual(names.sort(naturalSort), [...expectedGameplayAssets.keys()].sort(naturalSort));
  for (const [name, dimensions] of expectedGameplayAssets) {
    assert.deepEqual(readPngSize(join(gameplayRoot, name)), dimensions, name);
  }
});

test("editor stage and both renderers consume the gameplay skin without fake controls", () => {
  const html = readFileSync(join(editorRoot, "index.html"), "utf8");
  const css = readFileSync(join(editorRoot, "styles.css"), "utf8");
  const assets = readFileSync(join(editorRoot, "core", "gameplay-assets.mjs"), "utf8");
  const controller = readFileSync(join(editorRoot, "ui", "workbench-controller.mjs"), "utf8");
  const grassField = readFileSync(join(editorRoot, "ui", "grass-field.mjs"), "utf8");
  const canvas2d = readFileSync(join(editorRoot, "views", "canvas-2d.mjs"), "utf8");
  const three3d = readFileSync(join(editorRoot, "views", "three-3d.mjs"), "utf8");

  assert.match(html, /id="gameplay-fit"[^>]*title="适配游戏舞台"/);
  assert.match(html, /id="gameplay-level-title"/);
  assert.match(html, /id="restart-play"[\s\S]*assets\/gameplay\/btn_replay\.png/);
  assert.match(html, /id="rerandomize"[\s\S]*assets\/gameplay\/btn_random\.png/);
  assert.doesNotMatch(html, /<button[^>]*class="[^\"]*gameplay[^\"]*"[^>]*disabled/);

  assert.match(css, /\.canvas-host\s*\{[\s\S]*bg-47bd7f\.png/);
  assert.match(css, /\.level-grass-field\s*\{[\s\S]*pointer-events:\s*none/);
  assert.match(css, /\[data-mode="play"\][\s\S]*\.gameplay-action-image/);
  assert.match(assets, /block_bg\.png/);
  assert.match(assets, /ui_tile_lock_mask\.png/);
  assert.match(assets, /play_save2\.png/);
  assert.match(controller, /gameplayLevelTitle\.textContent/);
  assert.match(controller, /gameplayFit\.addEventListener\("click"/);
  assert.match(grassField, /GAMEPLAY_ASSETS\.grass/);
  assert.match(grassField, /drawGrassAtlasPatch/);

  assert.match(canvas2d, /GAMEPLAY_ASSETS\.blockBackground/);
  assert.match(canvas2d, /GAMEPLAY_ASSETS\.lockMask/);
  assert.match(canvas2d, /GAMEPLAY_ASSETS\.playTray/);
  assert.match(canvas2d, /TILE_ART_ASPECT\s*=\s*135\s*\/\s*120/);
  assert.match(three3d, /GAMEPLAY_ASSETS\.blockBackground/);
  assert.match(three3d, /GAMEPLAY_ASSETS\.grass/);
  assert.match(three3d, /GAMEPLAY_ASSETS\.playTray/);
  assert.match(three3d, /0x3f7d0a/i);
});

test("published levels contain the index and 22 authorized project files", () => {
  const levels = readdirSync(join(editorRoot, "levels")).sort();
  assert.equal(levels.length, 23);
  assert.equal(levels.includes("index.json"), true);
  assert.equal(levels.includes("level_showcase.json"), false);
  const index = JSON.parse(
    readFileSync(join(editorRoot, "levels", "index.json"), "utf8"),
  );
  assert.equal(index.levels.length, 22);
  assert.equal(index.defaultFileName, "level_0021_r2_第二关模板12.json");
  assert.deepEqual(
    levels.filter((name) => name !== "index.json"),
    index.levels.map(({ fileName }) => fileName).sort(),
  );
  for (const summary of index.levels) {
    assert.equal(typeof summary.name, "string");
    assert.equal(Number.isInteger(summary.tileCount) && summary.tileCount > 0, true);
    assert.equal(Number.isInteger(summary.layerCount) && summary.layerCount > 0, true);
    assert.equal(new Date(summary.modifiedAt).toISOString(), summary.modifiedAt);
  }
});

test("entry uses relative GitHub Pages module and Three paths", () => {
  const html = readFileSync(join(editorRoot, "index.html"), "utf8");
  assert.match(html, /"\.\/vendor\/three\.module\.js"/);
  assert.match(html, /src="\.\/app\.mjs"/);
  assert.doesNotMatch(html, /(?:src|href)="\//);
});

test("demo boundary occupies its own visible layout row", () => {
  const css = readFileSync(join(editorRoot, "styles.css"), "utf8");
  assert.match(css, /\.demo-banner\s*\{[^}]*grid-row:\s*2/s);
  assert.match(css, /\.readonly-banner\s*\{[^}]*grid-row:\s*3/s);
  assert.match(css, /\.workspace\s*\{[^}]*grid-row:\s*4/s);
  assert.match(css, /grid-template-rows:\s*64px auto 0 minmax\(0,\s*1fr\)/);
});

test("public copy describes the project library and browser-local AI boundary", () => {
  const html = readFileSync(join(editorRoot, "index.html"), "utf8");
  const controller = readFileSync(
    join(editorRoot, "ui", "workbench-controller.mjs"),
    "utf8",
  );
  assert.match(html, /已同步 22 个当前工程关卡/);
  assert.match(html, /编辑和 AI 生成结果只保存到当前浏览器/);
  assert.doesNotMatch(html, /仅使用独立示例关卡/);
  assert.doesNotMatch(html, /正在读取示例关卡/);
  assert.match(controller, /关卡库在线 · 编辑只保存到当前浏览器/);
  assert.doesNotMatch(controller, /静态演示在线/);
});

test("AI dialog styles radios as compact cards and stays desktop-only", () => {
  const css = readFileSync(join(editorRoot, "styles.css"), "utf8");
  assert.match(css, /\.ai-button\s*\{[^}]*linear-gradient/s);
  assert.match(css, /\.ai-choice-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3/s);
  assert.match(css, /\.ai-choice input\s*\{[^}]*width:\s*16px/s);
  assert.match(
    css,
    /@media \(max-width:\s*900px\),\s*\(pointer:\s*coarse\)[\s\S]*#generate-ai-level\s*\{[^}]*display:\s*none\s*!important/s,
  );
});

test("static editor exposes the built-in reset control and controller flow", () => {
  const html = readFileSync(join(editorRoot, "index.html"), "utf8");
  const controller = readFileSync(
    join(editorRoot, "ui", "workbench-controller.mjs"),
    "utf8",
  );
  assert.match(html, /id="reset-level"[^>]*>恢复内置</);
  assert.match(controller, /api\.resetLevel\(document\.fileName\)/);
  assert.match(controller, /openLevel\(fileName,\s*\{\s*discardDirty:\s*true\s*\}\)/);
  assert.match(controller, /已恢复内置示例/);
});

test("runtime starts with static storage and exposes authentication only for LAN writes", () => {
  const controller = readFileSync(
    join(editorRoot, "ui", "workbench-controller.mjs"),
    "utf8",
  );
  const app = readFileSync(join(editorRoot, "app.mjs"), "utf8");
  const inspector = readFileSync(join(editorRoot, "ui", "inspector.mjs"), "utf8");
  assert.match(controller, /from "\.\.\/static-api-client\.mjs"/);
  assert.match(controller, /if \(!health\.online\)/);
  assert.match(app, /createRuntimeApiClient/);
  assert.match(controller, /withWriteAuthentication/);
  assert.match(controller, /authentication-required/);
  assert.match(controller, /loginDialog/);
  assert.match(inspector, />保存到浏览器</);
});
