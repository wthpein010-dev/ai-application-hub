import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { validateMacDownloadManifest } from "../scripts/macos-download-manifest.mjs";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apps = loadDefaultAppsFromRuntime(
  await readFile(join(root, "app-20260706-restore-games.js"), "utf8"),
);
const manifest = JSON.parse(
  await readFile(
    join(
      root,
      "docs",
      "audits",
      "evidence",
      "2026-08-07-macos-download-manifest.json",
    ),
    "utf8",
  ),
);

test("the Mac audit manifest covers every public Mac action exactly once", () => {
  const result = validateMacDownloadManifest({ apps, manifest });
  assert.deepEqual(result.native.map((item) => item.id), [
    "codex-quota-bar",
    "codex-thread-workbench",
    "clickflow",
    "pureshrink",
  ]);
  assert.deepEqual(result.extension.map((item) => item.id), ["feishu-downloader"]);
});

test("the Mac audit manifest rejects unknown record fields", () => {
  const invalidManifest = structuredClone(manifest);
  invalidManifest.downloads[0].unexpected = true;

  assert.throws(() => validateMacDownloadManifest({ apps, manifest: invalidManifest }));
});

test("the Mac audit manifest rejects duplicate IDs", () => {
  const invalidManifest = structuredClone(manifest);
  invalidManifest.downloads.push(structuredClone(invalidManifest.downloads[0]));

  assert.throws(() => validateMacDownloadManifest({ apps, manifest: invalidManifest }));
});

test("the Mac audit manifest rejects missing catalog actions", () => {
  const invalidManifest = structuredClone(manifest);
  invalidManifest.downloads = invalidManifest.downloads.filter(
    (item) => item.id !== "pureshrink",
  );

  assert.throws(() => validateMacDownloadManifest({ apps, manifest: invalidManifest }));
});

test("the Mac audit manifest rejects catalog URL drift", () => {
  const invalidManifest = structuredClone(manifest);
  invalidManifest.downloads[0].catalogUrl = "https://example.com/CodexQuotaBar-macOS.zip";

  assert.throws(() => validateMacDownloadManifest({ apps, manifest: invalidManifest }));
});

test("the Mac audit manifest rejects non-HTTPS public URLs", () => {
  const invalidManifest = structuredClone(manifest);
  invalidManifest.downloads[0].catalogUrl = "http://example.com/CodexQuotaBar-macOS.zip";

  assert.throws(() => validateMacDownloadManifest({ apps, manifest: invalidManifest }));
});

test("the Mac audit manifest rejects invalid artifact digests", () => {
  const invalidManifest = structuredClone(manifest);
  invalidManifest.downloads[0].sha256 = "not-a-sha256-digest";

  assert.throws(() => validateMacDownloadManifest({ apps, manifest: invalidManifest }));
});

test("the Mac audit manifest rejects invalid artifact sizes", () => {
  const invalidManifest = structuredClone(manifest);
  invalidManifest.downloads[0].bytes = 0;

  assert.throws(() => validateMacDownloadManifest({ apps, manifest: invalidManifest }));
});
