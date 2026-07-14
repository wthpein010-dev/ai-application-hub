import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const hub = readFileSync(join(root, "index.html"), "utf8");
assert.match(hub, /app-20260706-restore-games\.js\?v=20260714-web-media-collector-video/);
const runtimeScript = hub.match(/<script\s+src="\.\/([^"?]+)(?:\?[^\"]*)?"><\/script>/)?.[1] || "app.js";
const app = readFileSync(join(root, runtimeScript), "utf8");
const project = join(root, "projects", "\u670b\u53cb\u5708\u53d1\u56fe\u795e\u5668", "01_\u4f5c\u54c1\u4f53\u9a8c\u5165\u53e3", "\u7f51\u9875\u7d20\u6750\u4e00\u952e\u6536\u684c\u9762\u7248");
const pagePath = join(project, "index.html");
const SOURCE_VIDEO_ROUTE = "./projects/\\u670b\\u53cb\\u5708\\u53d1\\u56fe\\u795e\\u5668/01_\\u4f5c\\u54c1\\u4f53\\u9a8c\\u5165\\u53e3/\\u7f51\\u9875\\u7d20\\u6750\\u4e00\\u952e\\u6536\\u684c\\u9762\\u7248/\\u89c6\\u9891\\u8d44\\u6e90/\\u6f14\\u793a\\u89c6\\u9891.html";

test("web media collector opens a browser-readable project page", () => {
  assert.equal(existsSync(pagePath), true, "the project needs an index.html entry page");

  const page = readFileSync(pagePath, "utf8");
  assert.match(page, /网页素材一键收桌面版/);
  assert.match(page, /Windows/);
  assert.match(page, /macOS/);
  assert.match(page, /\.\.\/\.\.\/\.\.\/index\.html/);
});

test("web media collector publishes a tutorial player and MP4", () => {
  assert.equal(existsSync(join(project, "\u89c6\u9891\u8d44\u6e90", "\u6f14\u793a\u89c6\u9891.html")), true);
  assert.equal(existsSync(join(project, "\u89c6\u9891\u8d44\u6e90", "web-media-collector-tutorial.mp4")), true);
  assert.ok(app.includes(SOURCE_VIDEO_ROUTE));
  assert.ok(app.includes('id: "web-media-collector",'));
  assert.ok(app.includes('if (normalized.id === "web-media-collector") {'));
  assert.equal(app.split(SOURCE_VIDEO_ROUTE).length - 1, 2);
});

test("hub routes the web media collector to its project page instead of Markdown", () => {
  assert.match(app, /id: "web-media-collector",[\s\S]{0,1200}entry: "\.\/projects\/朋友圈发图神器\/01_作品体验入口\/网页素材一键收桌面版\/index\.html"/);
  assert.match(app, /if \(normalized\.id === "web-media-collector"\)[\s\S]{0,800}normalized\.entry = "\.\/projects\/朋友圈发图神器\/01_作品体验入口\/网页素材一键收桌面版\/index\.html"/);
  assert.doesNotMatch(app, /web-media-collector[\s\S]{0,1200}entry: "[^"\n]*README\.md"/);
});
