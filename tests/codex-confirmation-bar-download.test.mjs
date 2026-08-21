import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const splitterPath = join(root, "scripts", "split-codex-confirmation-bar.mjs");
const downloadRoot = join(root, "projects", "codex-confirmation-bar", "download");
const coreUrl = new URL("../projects/codex-confirmation-bar/download/download-core.js", import.meta.url);
const manifestPath = join(downloadRoot, "manifest.json");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const response = (bytes, ok = true, status = ok ? 200 : 503) => ({
  ok,
  status,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});

function makeManifest(chunks, overrides = {}) {
  const parts = chunks.map((bytes, index) => ({
    index,
    path: `parts/v2.0.0/part-${String(index).padStart(3, "0")}.bin`,
    size: bytes.byteLength,
    sha256: sha256(bytes),
  }));
  const archive = Buffer.concat(chunks.map((bytes) => Buffer.from(bytes)));
  return {
    version: 1,
    releaseVersion: "2.0.0",
    product: "Codex Confirmation Bar",
    platform: "windows-x64",
    fileName: "CodexConfirmationBar-Windows-x64.zip",
    totalSize: archive.byteLength,
    chunkSize: Math.max(...chunks.map((bytes) => bytes.byteLength)),
    sha256: sha256(archive),
    parts,
    ...overrides,
  };
}

test("splitter accepts an explicit release contract and emits deterministic ordered parts", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "confirmation-bar-split-"));
  try {
    const archive = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const source = join(fixtureRoot, "Fixture.zip");
    const output = join(fixtureRoot, "download");
    writeFileSync(source, archive);
    const result = spawnSync(process.execPath, [
      splitterPath,
      "--source", source,
      "--output", output,
      "--file-name", "Fixture.zip",
      "--version", "9.8.7",
      "--product", "Fixture Product",
      "--platform", "windows-x64",
      "--expected-size", String(archive.byteLength),
      "--expected-sha256", sha256(archive),
      "--chunk-size", "4",
    ], { encoding: "utf8" });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"));
    assert.equal(manifest.releaseVersion, "9.8.7");
    assert.equal(manifest.product, "Fixture Product");
    assert.equal(manifest.fileName, "Fixture.zip");
    assert.deepEqual(manifest.parts.map((part) => part.index), [0, 1, 2]);
    assert.deepEqual(manifest.parts.map((part) => part.path), [
      "parts/v9.8.7/part-000.bin",
      "parts/v9.8.7/part-001.bin",
      "parts/v9.8.7/part-002.bin",
    ]);
    assert.deepEqual(manifest.parts.map((part) => part.size), [4, 4, 1]);
    for (const part of manifest.parts) {
      const bytes = readFileSync(join(output, ...part.path.split("/")));
      assert.equal(bytes.byteLength, part.size);
      assert.equal(sha256(bytes), part.sha256);
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("published manifest fixes the v2 Windows archive and five verified 8 MiB parts", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.releaseVersion, "2.0.0");
  assert.equal(manifest.product, "Codex Confirmation Bar");
  assert.equal(manifest.platform, "windows-x64");
  assert.equal(manifest.fileName, "CodexConfirmationBar-Windows-x64.zip");
  assert.equal(manifest.totalSize, 41_537_626);
  assert.equal(manifest.chunkSize, 8_388_608);
  assert.equal(manifest.sha256, "56F9966448039F21233241C03F3FAF2F2E32194193B27F4D74CB2CFFAFB11000");
  assert.deepEqual(manifest.parts.map((part) => part.index), [0, 1, 2, 3, 4]);
  assert.deepEqual(manifest.parts.map((part) => part.size), [8_388_608, 8_388_608, 8_388_608, 8_388_608, 7_983_194]);
  assert.deepEqual(manifest.parts.map((part) => part.path), Array.from(
    { length: 5 },
    (_, index) => `parts/v2.0.0/part-${String(index).padStart(3, "0")}.bin`,
  ));

  const chunks = [];
  for (const part of manifest.parts) {
    const bytes = await readFile(join(downloadRoot, ...part.path.split("/")));
    assert.equal(bytes.byteLength, part.size);
    assert.equal(sha256(bytes), part.sha256);
    chunks.push(bytes);
  }
  const archive = Buffer.concat(chunks);
  assert.equal(archive.byteLength, manifest.totalSize);
  assert.equal(sha256(archive), manifest.sha256);
});

test("download page exposes verified progress, failure, retry, and ZIP save states", () => {
  const html = readFileSync(join(downloadRoot, "index.html"), "utf8");
  const controller = readFileSync(join(downloadRoot, "download.js"), "utf8");
  assert.match(html, /Codex Confirmation Bar/);
  assert.match(html, /v2\.0\.0/);
  for (const role of ["download-button", "retry-button", "progress", "progress-text", "status", "error", "sha256"]) {
    assert.match(html, new RegExp(`data-role=["']${role}["']`), role);
  }
  assert.match(controller, /new Blob\(\[bytes\], \{ type: "application\/zip" \}\)/);
  assert.match(controller, /URL\.revokeObjectURL/);
  assert.match(controller, /assembleDownload/);
});

test("validateManifest accepts a complete v2 manifest and rejects broken ordering", async () => {
  const { validateManifest } = await import(coreUrl);
  const manifest = makeManifest([Uint8Array.of(1, 2), Uint8Array.of(3)]);
  assert.equal(validateManifest(manifest), manifest);
  assert.throws(() => validateManifest({
    ...manifest,
    parts: [{ ...manifest.parts[0], index: 1 }, { ...manifest.parts[1], index: 0 }],
  }), /index|order|顺序/i);
});

test("validateManifest rejects duplicate paths and an incorrect size sum", async () => {
  const { validateManifest } = await import(coreUrl);
  const manifest = makeManifest([Uint8Array.of(1, 2), Uint8Array.of(3)]);
  assert.throws(() => validateManifest({
    ...manifest,
    parts: [manifest.parts[0], { ...manifest.parts[1], path: manifest.parts[0].path }],
  }), /path|路径|unique|重复/i);
  assert.throws(() => validateManifest({ ...manifest, totalSize: manifest.totalSize + 1 }), /size|length|大小|长度/i);
});

test("assembleDownload fetches strictly in order, retries HTTP failure, and reports progress", async () => {
  const { assembleDownload } = await import(coreUrl);
  const chunks = [Uint8Array.of(1, 2), Uint8Array.of(3, 4)];
  const manifest = makeManifest(chunks);
  const requested = [];
  const progress = [];
  let firstAttempts = 0;
  const result = await assembleDownload(manifest, {
    fetchImpl: async (path) => {
      requested.push(path);
      if (path === manifest.parts[0].path) {
        firstAttempts += 1;
        if (firstAttempts === 1) return response(new Uint8Array(), false);
        return response(chunks[0]);
      }
      return response(chunks[1]);
    },
    digestHex: async (bytes) => sha256(bytes),
    onProgress: (event) => progress.push(event),
  });
  assert.deepEqual(requested, [manifest.parts[0].path, manifest.parts[0].path, manifest.parts[1].path]);
  assert.deepEqual(result, Uint8Array.of(1, 2, 3, 4));
  assert.equal(progress.some((event) => event.phase === "retry"), true);
  assert.equal(progress.at(-1).phase, "verifying");
});

test("assembleDownload rejects a corrupt part before a ZIP can be saved", async () => {
  const { assembleDownload } = await import(coreUrl);
  const chunk = Uint8Array.of(10, 11);
  const manifest = makeManifest([chunk]);
  let attempts = 0;
  await assert.rejects(assembleDownload(manifest, {
    fetchImpl: async () => {
      attempts += 1;
      return response(Uint8Array.of(11, 10));
    },
    digestHex: async (bytes) => sha256(bytes),
    maxAttempts: 3,
  }), /SHA-?256|checksum|校验/i);
  assert.equal(attempts, 3);
});

test("assembleDownload rejects an incorrect final archive checksum", async () => {
  const { assembleDownload } = await import(coreUrl);
  const chunk = Uint8Array.of(12, 13);
  const manifest = makeManifest([chunk], { sha256: "F".repeat(64) });
  await assert.rejects(assembleDownload(manifest, {
    fetchImpl: async () => response(chunk),
    digestHex: async (bytes) => sha256(bytes),
  }), /archive|final|SHA-?256|完整|最终/i);
});
