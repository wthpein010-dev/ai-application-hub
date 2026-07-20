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
  "core/edit-history.mjs",
  "core/level-adapter.mjs",
  "core/level-validator.mjs",
  "core/play-engine.mjs",
  "core/random-assigner.mjs",
  "core/view-model.mjs",
  "core/xorshift.mjs",
  "ui/editor-tools.mjs",
  "ui/inspector.mjs",
  "ui/local-level-import.mjs",
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
  assert.doesNotMatch(text, /EditorLevels|E:\\Mahjong|maque|cookie|password/i);
  assert.match(text, /公开演示专用；坐标与牌组均为自行生成，不含真实工程关卡数据。/);
});

test("published levels contain only the index and standalone showcase", () => {
  const levels = readdirSync(join(editorRoot, "levels")).sort();
  assert.deepEqual(levels, ["index.json", "level_showcase.json"]);
  const index = JSON.parse(
    readFileSync(join(editorRoot, "levels", "index.json"), "utf8"),
  );
  const showcase = JSON.parse(
    readFileSync(join(editorRoot, "levels", "level_showcase.json"), "utf8"),
  );
  assert.match(showcase.designerNote.source, /公开演示专用/);
  assert.equal(index.levels.length, 1);
  const summary = index.levels[0];
  assert.equal(Number.isInteger(summary.id) && summary.id > 0, true);
  assert.equal(new Date(summary.modifiedAt).toISOString(), summary.modifiedAt);
  assert.equal(showcase.id, summary.id);
  assert.equal(showcase.modifiedAt, summary.modifiedAt);
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

test("static controller starts against the browser API without an authentication flow", () => {
  const controller = readFileSync(
    join(editorRoot, "ui", "workbench-controller.mjs"),
    "utf8",
  );
  const inspector = readFileSync(join(editorRoot, "ui", "inspector.mjs"), "utf8");
  assert.match(controller, /from "\.\.\/static-api-client\.mjs"/);
  assert.match(controller, /if \(!health\.online\)/);
  assert.doesNotMatch(controller, /promptLogin|submitLogin|loginDialog|authenticated/);
  assert.match(inspector, />保存到浏览器</);
});
