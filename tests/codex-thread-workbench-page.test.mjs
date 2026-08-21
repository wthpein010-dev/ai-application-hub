import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(root, ...relativePath.split("/")), "utf8");
}

test("the Workbench catalog identity is retired in favor of Confirmation Bar", () => {
  const runtime = read("app-20260706-restore-games.js");
  assert.match(runtime, /id:\s*"codex-confirmation-bar"/);
  assert.doesNotMatch(runtime, /id:\s*"codex-thread-workbench"/);
  assert.match(runtime, /Codex 待确认悬浮助手/);
});

test("legacy Workbench pages redirect to all canonical v2 surfaces", () => {
  const routes = [
    ["projects/codex-thread-workbench/index.html", "../codex-confirmation-bar/index.html", "/projects/codex-confirmation-bar/"],
    ["projects/codex-thread-workbench/video/index.html", "../../codex-confirmation-bar/video/index.html", "/projects/codex-confirmation-bar/video/"],
    ["projects/codex-thread-workbench/download/index.html", "../../codex-confirmation-bar/download/index.html", "/projects/codex-confirmation-bar/download/"],
    ["projects/codex-thread-workbench/download/mac/index.html", "../../../codex-confirmation-bar/download/mac/index.html", "/projects/codex-confirmation-bar/download/mac/"],
  ];

  for (const [path, relativeTarget, canonicalPath] of routes) {
    const html = read(path);
    assert.match(html, new RegExp(`http-equiv=["']refresh["'][^>]+${relativeTarget.replaceAll(".", "\\.")}`, "i"), path);
    assert.match(html, new RegExp(`rel=["']canonical["'][^>]+${canonicalPath.replaceAll("/", "\\/")}`, "i"), path);
    assert.match(html, new RegExp(`href=["']${relativeTarget.replaceAll(".", "\\.")}["']`, "i"), path);
    assert.match(html, new RegExp(`location\\.replace\\(["']${relativeTarget.replaceAll(".", "\\.")}["']\\)`), path);
  }
});
