import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const downloadRoot = join(root, "projects", "codex-multi-thread-workbench", "download");
const manifest = JSON.parse(await readFile(join(downloadRoot, "manifest.json"), "utf8"));
const core = await import(pathToFileURL(join(downloadRoot, "download-core.js")));
globalThis.crypto ??= webcrypto;

const EXPECTED = {
  fileName: "CodexThreadWorkbench-Windows-x64.zip",
  releaseDirectory: "v2.3.0-8e2126b",
  totalSize: 41_563_474,
  sha256: "0540F0DC2FDB5CDEEC22E205BC4BBF89A7FEAA502EA474745E701B4F1F8F2098",
};

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex").toUpperCase();

test("Windows v2.3.0 manifest is ordered and pinned to the verified archive", () => {
  core.validateManifest(manifest);
  assert.equal(manifest.fileName, EXPECTED.fileName);
  assert.equal(manifest.totalSize, EXPECTED.totalSize);
  assert.equal(manifest.sha256, EXPECTED.sha256);
  assert.equal(manifest.chunkSize, 8_388_608);
  assert.equal(manifest.parts.length, 5);
  assert.deepEqual(manifest.parts.map(part => part.index), [0, 1, 2, 3, 4]);
  assert.deepEqual(
    manifest.parts.map(part => part.path),
    [0, 1, 2, 3, 4].map(index =>
      `parts/${EXPECTED.releaseDirectory}/part-${String(index).padStart(3, "0")}.bin`),
  );
  assert.equal(manifest.parts.reduce((sum, part) => sum + part.size, 0), manifest.totalSize);
});

test("all Windows parts reassemble to the exact published ZIP", async () => {
  const parts = new Map();
  for (const part of manifest.parts) {
    const bytes = await readFile(join(downloadRoot, ...part.path.split("/")));
    assert.equal(bytes.byteLength, part.size);
    assert.equal(sha256(bytes), part.sha256);
    parts.set(part.path, bytes);
  }

  const archive = await core.assembleDownload(manifest, {
    fetchImpl: async path => ({ ok: true, status: 200, arrayBuffer: async () => parts.get(path) }),
    digestHex: async bytes => sha256(bytes),
  });
  assert.equal(archive.byteLength, EXPECTED.totalSize);
  assert.equal(sha256(archive), EXPECTED.sha256);
  assert.equal(Buffer.from(archive.subarray(0, 2)).toString("ascii"), "PK");
});

test("download controller retries a failed part before succeeding", async () => {
  const first = manifest.parts[0];
  const bytes = await readFile(join(downloadRoot, ...first.path.split("/")));
  const smallManifest = {
    ...manifest,
    totalSize: bytes.byteLength,
    sha256: sha256(bytes),
    parts: [{ ...first, index: 0, path: "part.bin" }],
  };
  let attempts = 0;
  const events = [];
  const archive = await core.assembleDownload(smallManifest, {
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) return { ok: false, status: 503 };
      return { ok: true, status: 200, arrayBuffer: async () => bytes };
    },
    digestHex: async payload => sha256(payload),
    onProgress: event => events.push(event.phase),
    maxAttempts: 3,
  });
  assert.equal(attempts, 2);
  assert.equal(archive.byteLength, bytes.byteLength);
  assert.ok(events.includes("retry"));
});

test("Windows download page identifies the desktop Workbench and visible retry flow", async () => {
  const [html, controller, splitter] = await Promise.all([
    readFile(join(downloadRoot, "index.html"), "utf8"),
    readFile(join(downloadRoot, "download.js"), "utf8"),
    readFile(join(root, "scripts", "split-codex-multi-thread-workbench.mjs"), "utf8"),
  ]);
  assert.match(html, /Codex 多线程工作台/);
  assert.match(html, /v2\.3\.0/);
  assert.doesNotMatch(html, /v2\.2\.1/);
  assert.match(html, /CodexThreadWorkbench-Windows-x64\.zip/);
  assert.match(html, /data-role="progress"/);
  assert.match(html, /data-role="retry-button"/);
  assert.match(controller, /maxAttempts:\s*3/);
  assert.match(controller, /link\.download\s*=\s*manifest\.fileName/);
  assert.match(splitter, new RegExp(EXPECTED.fileName.replaceAll(".", "\\.")));
  assert.match(splitter, new RegExp(EXPECTED.releaseDirectory.replaceAll(".", "\\.")));
  assert.match(splitter, /41_563_474/);
  assert.match(splitter, new RegExp(EXPECTED.sha256));
});
