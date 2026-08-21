import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(root, "projects", "codex-thread-workbench", "video");

test("legacy Workbench video page redirects to the Confirmation Bar video", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  assert.match(
    html,
    /http-equiv="refresh"[^>]+codex-confirmation-bar\/video\/index\.html/,
  );
  assert.match(
    html,
    /rel="canonical"[^>]+projects\/codex-confirmation-bar\/video\//,
  );
  assert.match(html, /href="\.\.\/\.\.\/codex-confirmation-bar\/video\/index\.html"/);
  assert.match(
    html,
    /location\.replace\("\.\.\/\.\.\/codex-confirmation-bar\/video\/index\.html"\)/,
  );
});
