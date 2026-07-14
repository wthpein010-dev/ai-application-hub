import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = readFileSync(join(root, "app.js"), "utf8");
const project = join(root, "projects", "朋友圈发图神器", "01_作品体验入口", "网页素材一键收桌面版");
const pagePath = join(project, "index.html");

test("web media collector opens a browser-readable project page", () => {
  assert.equal(existsSync(pagePath), true, "the project needs an index.html entry page");

  const page = readFileSync(pagePath, "utf8");
  assert.match(page, /网页素材一键收桌面版/);
  assert.match(page, /Windows/);
  assert.match(page, /macOS/);
  assert.match(page, /\.\.\/\.\.\/\.\.\/index\.html/);
});

test("hub routes the web media collector to its project page instead of Markdown", () => {
  assert.match(app, /id: "web-media-collector",[\s\S]{0,1200}entry: "\.\/projects\/朋友圈发图神器\/01_作品体验入口\/网页素材一键收桌面版\/index\.html"/);
  assert.match(app, /if \(normalized\.id === "web-media-collector"\)[\s\S]{0,800}normalized\.entry = "\.\/projects\/朋友圈发图神器\/01_作品体验入口\/网页素材一键收桌面版\/index\.html"/);
  assert.doesNotMatch(app, /web-media-collector[\s\S]{0,1200}entry: "[^"\n]*README\.md"/);
});
