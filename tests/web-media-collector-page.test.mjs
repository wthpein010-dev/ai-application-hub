import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const hub = readFileSync(join(root, "index.html"), "utf8");
assert.match(hub, /app-20260706-restore-games\.js\?v=20260716-button-order/);
const runtimeScript = hub.match(/<script\s+src="\.\/([^"?]+)(?:\?[^\"]*)?"><\/script>/)?.[1] || "app.js";
const app = readFileSync(join(root, runtimeScript), "utf8");
const project = join(root, "projects", "\u670b\u53cb\u5708\u53d1\u56fe\u795e\u5668", "01_\u4f5c\u54c1\u4f53\u9a8c\u5165\u53e3", "\u7f51\u9875\u7d20\u6750\u4e00\u952e\u6536\u684c\u9762\u7248");
const pagePath = join(project, "index.html");
const playerPath = join(project, "\u89c6\u9891\u8d44\u6e90", "\u6f14\u793a\u89c6\u9891.html");
const legacyPlaceholderPath = join(project, "\u89c6\u9891\u8d44\u6e90", "\u6f14\u793a\u89c6\u9891\u5360\u4f4d.html");
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
  assert.equal(existsSync(playerPath), true);
  assert.equal(existsSync(legacyPlaceholderPath), true);
  assert.equal(existsSync(join(project, "\u89c6\u9891\u8d44\u6e90", "web-media-collector-tutorial.mp4")), true);

  const player = readFileSync(playerPath, "utf8");
  const legacyPlaceholder = readFileSync(legacyPlaceholderPath, "utf8");
  const openingVideoTag = player.match(/<video\b[^>]*>/i)?.[0] || "";

  assert.match(player, /id="introVideo"/);
  assert.match(player, /preload="none"/);
  assert.match(player, /data-src="\.\/web-media-collector-tutorial\.mp4"/);
  assert.match(player, /id="loadVideo"/);
  assert.match(player, /video\.src\s*=\s*video\.dataset\.src/);
  assert.match(player, /addEventListener\(\s*["']click["'][\s\S]{0,800}once:\s*true/);
  assert.doesNotMatch(openingVideoTag, /\ssrc\s*=/i);
  assert.ok(legacyPlaceholder.includes('href="./&#x6F14;&#x793A;&#x89C6;&#x9891;.html"'));
  assert.doesNotMatch(legacyPlaceholder, /http-equiv="refresh"/i);

  const catalogRouteStart = app.indexOf('id: "web-media-collector",');
  const normalizedRouteStart = app.indexOf('if (normalized.id === "web-media-collector") {');
  assert.ok(catalogRouteStart >= 0);
  assert.ok(normalizedRouteStart >= 0);
  assert.ok(app.slice(catalogRouteStart, catalogRouteStart + 1200).includes(SOURCE_VIDEO_ROUTE));
  assert.ok(app.slice(normalizedRouteStart, normalizedRouteStart + 800).includes(SOURCE_VIDEO_ROUTE));
});

test("hub routes the web media collector to its project page instead of Markdown", () => {
  assert.match(app, /id: "web-media-collector",[\s\S]{0,1200}entry: "\.\/projects\/朋友圈发图神器\/01_作品体验入口\/网页素材一键收桌面版\/index\.html"/);
  assert.match(app, /if \(normalized\.id === "web-media-collector"\)[\s\S]{0,800}normalized\.entry = "\.\/projects\/朋友圈发图神器\/01_作品体验入口\/网页素材一键收桌面版\/index\.html"/);
  assert.doesNotMatch(app, /web-media-collector[\s\S]{0,1200}entry: "[^"\n]*README\.md"/);
});
