import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const downloadRoot = join(
  root,
  "projects",
  "codex-thread-workbench",
  "download",
);
const macRoot = join(downloadRoot, "mac");
const coreUrl = new URL(
  "../projects/codex-thread-workbench/download/download-core.js",
  import.meta.url,
);

const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex").toUpperCase();

test("legacy Mac download page redirects to the Confirmation Bar Mac download", () => {
  const html = readFileSync(join(macRoot, "index.html"), "utf8");

  assert.match(
    html,
    /http-equiv="refresh"[^>]+codex-confirmation-bar\/download\/mac\/index\.html/,
  );
  assert.match(
    html,
    /rel="canonical"[^>]+projects\/codex-confirmation-bar\/download\/mac\//,
  );
  assert.match(
    html,
    /href="\.\.\/\.\.\/\.\.\/codex-confirmation-bar\/download\/mac\/index\.html"/,
  );
  assert.match(
    html,
    /location\.replace\("\.\.\/\.\.\/\.\.\/codex-confirmation-bar\/download\/mac\/index\.html"\)/,
  );
});

test("Mac downloader reuses the verified core and retries each part three times", () => {
  const script = readFileSync(join(macRoot, "download.js"), "utf8");

  assert.match(script, /from\s+["']\.\.\/download-core\.js["']/);
  assert.match(script, /validateManifest/);
  assert.match(script, /assembleDownload/);
  assert.match(script, /sha256Hex/);
  assert.match(script, /maxAttempts:\s*3/);
  assert.match(script, /application\/zip/);
});

test("legacy workflow dispatches the v2 Confirmation Bar release workflow", () => {
  const legacyWorkflow = readFileSync(
    join(root, ".github", "workflows", "build-codex-thread-workbench.yml"),
    "utf8",
  );

  assert.match(legacyWorkflow, /workflow_dispatch:/);
  assert.match(
    legacyWorkflow,
    /uses:\s*\.\/\.github\/workflows\/build-codex-confirmation-bar\.yml/,
  );
  assert.doesNotMatch(legacyWorkflow, /build\/codex-thread-workbench/);
  assert.equal(
    existsSync(
      join(
        root,
        "build",
        "codex-confirmation-bar",
        "src",
        "CodexThreadWorkbench",
        "CodexThreadWorkbench.csproj",
      ),
    ),
    true,
  );
});

test("shared downloader accepts Mac app ZIP manifests and validates every part", async () => {
  const { assembleDownload, validateManifest } = await import(coreUrl);
  const chunks = [Uint8Array.of(1, 2, 3), Uint8Array.of(4, 5)];
  const archive = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const manifest = {
    version: 1,
    fileName: "CodexThreadWorkbench-macOS-arm64.app.zip",
    totalSize: archive.byteLength,
    chunkSize: 3,
    sha256: sha256(archive),
    parts: chunks.map((bytes, index) => ({
      index,
      path: `parts/arm64/part-${String(index).padStart(3, "0")}.bin`,
      size: bytes.byteLength,
      sha256: sha256(bytes),
    })),
  };
  const requested = [];

  assert.equal(validateManifest(manifest), manifest);
  const result = await assembleDownload(manifest, {
    fetchImpl: async (path) => {
      requested.push(path);
      const bytes = chunks[requested.length - 1];
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
    },
    digestHex: async (bytes) => sha256(bytes),
    maxAttempts: 3,
  });

  assert.deepEqual(requested, manifest.parts.map((part) => part.path));
  assert.deepEqual(result, Uint8Array.of(1, 2, 3, 4, 5));
});

for (const architecture of ["arm64", "x64"]) {
  test(`published ${architecture} manifest is ordered and uses chunks no larger than 8 MiB`, async (context) => {
    const manifestPath = join(macRoot, `manifest-${architecture}.json`);
    if (!existsSync(manifestPath)) {
      context.skip("generated after the matching macOS runner verifies the app bundle");
      return;
    }

    const { validateManifest } = await import(coreUrl);
    const manifest = validateManifest(
      JSON.parse(await readFile(manifestPath, "utf8")),
    );
    assert.equal(
      manifest.fileName,
      `CodexThreadWorkbench-macOS-${architecture}.app.zip`,
    );
    assert.ok(manifest.chunkSize <= 8_388_608);
    assert.deepEqual(
      manifest.parts.map((part) => part.index),
      manifest.parts.map((_, index) => index),
    );
    assert.equal(
      manifest.parts.reduce((total, part) => total + part.size, 0),
      manifest.totalSize,
    );
  });
}
