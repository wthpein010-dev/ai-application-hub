import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const hub = readFileSync(join(root, "index.html"), "utf8");
const runtimeScript = hub.match(/<script\s+src="\.\/([^"?]+)(?:\?[^"]*)?"><\/script>/)?.[1] || "app-20260706-restore-games.js";
const app = readFileSync(join(root, runtimeScript), "utf8");

function sliceFor(marker, length = 1400) {
  const start = app.indexOf(marker);
  assert.ok(start >= 0, `missing marker: ${marker}`);
  return app.slice(start, start + length);
}

test("Windows and macOS platform actions can use explicit labels", () => {
  assert.match(app, /const windowsLabel = platformLabel\(app, "windows", "Wins下载"\);/);
  assert.match(app, /const macLabel = platformLabel\(app, "mac", "Mac下载"\);/);
  assert.match(app, /data-action="download"[\s\S]{0,160}\$\{escapeHtml\(windowsLabel\)\}/);
  assert.match(app, /data-action="mac"[\s\S]{0,160}\$\{escapeHtml\(macLabel\)\}/);
});

test("web media collector does not expose source notes as fake installers", () => {
  const catalog = sliceFor('id: "web-media-collector",');
  const normalized = sliceFor('if (normalized.id === "web-media-collector") {');

  for (const section of [catalog, normalized]) {
    assert.match(section, /windows:\s*""/);
    assert.match(section, /mac:\s*""/);
    assert.doesNotMatch(section, /README\.md",\s*label:\s*"(?:Windows|macOS)说明"/);
  }
});
