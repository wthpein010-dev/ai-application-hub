import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
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
const execFileAsync = promisify(execFile);

test("Mac download page offers Apple silicon and Intel packages", () => {
  const html = readFileSync(join(macRoot, "index.html"), "utf8");

  assert.match(html, /Apple\s*(?:芯片|silicon)/i);
  assert.match(html, /arm64/i);
  assert.match(html, /Intel/i);
  assert.match(html, /x64/i);
  assert.match(html, /macOS\s*13\+/i);
  assert.match(html, /未公证/);
  assert.match(html, /data-manifest="\.\/manifest-arm64\.json"/);
  assert.match(html, /data-manifest="\.\/manifest-x64\.json"/);
  assert.equal((html.match(/data-role="architecture"/g) || []).length, 2);
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

test("Hub workflow builds and verifies both Mac architectures before publishing", () => {
  const workflow = readFileSync(
    join(root, ".github", "workflows", "build-codex-thread-workbench.yml"),
    "utf8",
  );

  assert.match(workflow, /runtime:\s*osx-arm64\s+runner:\s*macos-14/);
  assert.match(workflow, /runtime:\s*osx-x64\s+runner:\s*macos-15-intel/);
  assert.equal((workflow.match(/scripts\/test-macos-package\.sh/g) || []).length, 2);
  assert.match(workflow, /needs:\s*build-macos/);
  assert.match(workflow, /manifest-arm64\.json/);
  assert.match(workflow, /manifest-x64\.json/);
  assert.match(workflow, /git pull --rebase origin/);
  assert.doesNotMatch(workflow, /git push[^\n]+--force/);
  assert.equal(
    existsSync(
      join(
        root,
        "build",
        "codex-thread-workbench",
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

test("Mac artifact splitter creates ordered architecture-specific 8 MiB parts", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "workbench-mac-split-"));
  const archivePath = join(
    temporaryRoot,
    "CodexThreadWorkbench-macOS-arm64.app.zip",
  );
  const outputRoot = join(temporaryRoot, "download");
  const archive = Buffer.alloc(8_388_608 + 17, 0x5a);

  try {
    await writeFile(archivePath, archive);
    await execFileAsync(process.execPath, [
      join(root, "scripts", "split-workbench-mac.mjs"),
      archivePath,
      outputRoot,
      "arm64",
    ]);

    const manifest = JSON.parse(
      await readFile(join(outputRoot, "manifest-arm64.json"), "utf8"),
    );
    assert.equal(manifest.fileName, archivePath.split(/[\\/]/).at(-1));
    assert.equal(manifest.totalSize, archive.byteLength);
    assert.equal(manifest.chunkSize, 8_388_608);
    assert.equal(manifest.sha256, sha256(archive));
    assert.deepEqual(
      manifest.parts.map((part) => part.path),
      ["parts/arm64/part-000.bin", "parts/arm64/part-001.bin"],
    );
    assert.deepEqual(
      manifest.parts.map((part) => part.size),
      [8_388_608, 17],
    );
    assert.equal(
      sha256(await readFile(join(outputRoot, manifest.parts[1].path))),
      manifest.parts[1].sha256,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
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
