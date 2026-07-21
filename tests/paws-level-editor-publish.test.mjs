import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const page = readFileSync(join(root, "index.html"), "utf8");

function loadDefaults() {
  const start = runtime.indexOf("const defaultApps = [");
  const closing = /\r?\n\];\r?\n\r?\nlet apps/.exec(runtime.slice(start));
  const source = runtime
    .slice(start, start + closing.index + 3)
    .replace("const defaultApps =", "globalThis.defaultApps =")
    .replace(/\bHUB_BRIEF\b/g, '""');
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  return context.globalThis.defaultApps;
}

test("hub publishes one 关卡3D编辑器 engineering card", () => {
  const matches = loadDefaults().filter((app) => app.id === "paws-level-editor");
  assert.equal(matches.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(matches[0].platforms)),
    { web: "./projects/paws-level-editor/index.html", windows: "", mac: "" },
  );
  assert.equal(matches[0].name, "关卡3D编辑器");
  assert.equal(matches[0].status, "engineering");
  assert.equal(matches[0].video, "./projects/paws-level-editor/video/index.html");
  assert.match(matches[0].brief, /30 个工程关卡/);
  assert.match(matches[0].brief, /AI 生成/);
  assert.equal(matches[0].tags.includes("AI关卡"), true);
});

test("stored app merge iterates current defaults so an old browser sees new cards", () => {
  const loader = runtime.slice(runtime.indexOf("function loadApps"), runtime.indexOf("function normalizeApp"));
  assert.match(loader, /return defaultApps\.map\(app => normalizeApp\(storedById\.get\(app\.id\) \|\| app\)\)/);
});

test("home page cache key changes for the published runtime", () => {
  assert.match(page, /app-20260706-restore-games\.js\?v=20260720-workbench-mac-video/);
});
