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

test("card action links include project-specific accessible labels", () => {
  assert.match(app, /const webActionLabel = `\$\{app\.name\} 演示`;/);
  assert.match(app, /const videoActionLabel = `\$\{app\.name\} 视频`;/);
  assert.match(app, /const windowsActionLabel = `\$\{app\.name\} Wins下载`;/);
  assert.match(app, /const macActionLabel = `\$\{app\.name\} Mac下载`;/);
  assert.match(app, /data-action="web"[\s\S]{0,220}aria-label="\$\{escapeHtml\(webActionLabel\)\}"/);
  assert.match(app, /data-action="video"[\s\S]{0,220}aria-label="\$\{escapeHtml\(videoActionLabel\)\}"/);
  assert.match(app, /data-action="download"[\s\S]{0,220}aria-label="\$\{escapeHtml\(windowsActionLabel\)\}"/);
  assert.match(app, /data-action="mac"[\s\S]{0,220}aria-label="\$\{escapeHtml\(macActionLabel\)\}"/);
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
