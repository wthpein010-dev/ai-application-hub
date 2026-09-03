import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { extractValidatedZip, readZipEntries } from "./helpers/zip-central-directory.mjs";

const coreUrl = new URL(
  "../projects/codex-thread-workbench/download/download-core.js",
  import.meta.url
);
const manifestUrl = new URL(
  "../projects/codex-thread-workbench/download/manifest.json",
  import.meta.url
);
const pageUrl = new URL(
  "../projects/codex-thread-workbench/download/index.html",
  import.meta.url
);
const downloadRoot = dirname(fileURLToPath(manifestUrl));

const sha256 = bytes =>
  createHash("sha256").update(bytes).digest("hex").toUpperCase();

const response = (bytes, ok = true, status = ok ? 200 : 503) => ({
  ok,
  status,
  arrayBuffer: async () =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
});

const makeManifest = (chunks, overrides = {}) => {
  const parts = chunks.map((bytes, index) => ({
    index,
    path: `parts/part-${String(index).padStart(3, "0")}.bin`,
    size: bytes.byteLength,
    sha256: sha256(bytes)
  }));
  const archive = Buffer.concat(chunks.map(bytes => Buffer.from(bytes)));

  return {
    version: 1,
    fileName: "CodexConfirmationBar-Windows-x64.zip",
    totalSize: archive.byteLength,
    chunkSize: Math.max(...chunks.map(bytes => bytes.byteLength)),
    sha256: sha256(archive),
    parts,
    ...overrides
  };
};

test("published manifest fixes the confirmation-overlay archive contract and ordered five-part layout", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.version, 1);
  assert.equal(manifest.fileName, "CodexConfirmationBar-Windows-x64.zip");
  assert.equal(manifest.totalSize, 41_562_042);
  assert.equal(manifest.chunkSize, 8_388_608);
  assert.equal(manifest.parts.length, 5);
  assert.deepEqual(
    manifest.parts.map(part => part.index),
    [0, 1, 2, 3, 4]
  );
  assert.deepEqual(
    manifest.parts.map(part => part.path),
    Array.from(
      { length: 5 },
      (_, index) => `parts/v2.3.3-confirmation-overlay-e7d1928/part-${String(index).padStart(3, "0")}.bin`
    )
  );
  assert.deepEqual(
    manifest.parts.map(part => part.size),
    [
      8_388_608,
      8_388_608,
      8_388_608,
      8_388_608,
      8_007_610
    ]
  );
  assert.equal(
    manifest.parts.reduce((sum, part) => sum + part.size, 0),
    manifest.totalSize
  );
  assert.equal(
    manifest.sha256,
    "E7D1928EA27BCAE0737F9CFF14CEE5D909154BCABCA693610616357ADE7A11A7"
  );
});

test("Windows download page identifies the Confirmation Bar v2 release", async () => {
  const html = await readFile(pageUrl, "utf8");

  assert.match(html, /Codex 待确认悬浮助手/);
  assert.match(html, /v2\.3\.3/);
  assert.match(html, /CodexConfirmationBar-Windows-x64\.zip/);
  assert.match(html, /41\.6 MB/);
  assert.match(html, /5 个/);
  assert.match(html, /E7D1928EA27BCAE0737F9CFF14CEE5D909154BCABCA693610616357ADE7A11A7/);
});

test("published Windows helper archive defaults to the confirmation overlay", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const temporaryRoot = await mkdtemp(join(tmpdir(), "confirmation-bar-windows-release-"));
  const archivePath = join(temporaryRoot, manifest.fileName);
  const extractionRoot = join(temporaryRoot, "extract");

  try {
    const archive = Buffer.concat(await Promise.all(
      manifest.parts.map(({ path }) => readFile(join(downloadRoot, path))),
    ));
    assert.equal(sha256(archive), manifest.sha256);
    await writeFile(archivePath, archive);

    const entries = readZipEntries(archivePath);
    const names = entries.map(({ name }) => name);
    assert.ok(names.includes("CodexConfirmationBar.exe"));
    assert.ok(names.includes("README.md"));
    assert.ok(names.includes("Install-ConfirmationBarRecovery.ps1"));
    assert.ok(names.includes("codex-launch-profile.json"));
    assert.equal(names.includes("CodexThreadWorkbench.exe"), false);

    extractValidatedZip(archivePath, entries, extractionRoot, {
      maxEntryBytes: 256 * 1024 * 1024,
      maxTotalBytes: 512 * 1024 * 1024,
    });
    assert.deepEqual(
      JSON.parse(await readFile(join(extractionRoot, "codex-launch-profile.json"), "utf8")),
      { defaultMode: "confirmation-overlay" },
    );
    assert.match(
      await readFile(join(extractionRoot, "README.md"), "utf8"),
      /Codex 待确认悬浮助手/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("validateManifest accepts a complete manifest and rejects broken ordering", async () => {
  const { validateManifest } = await import(coreUrl);
  const chunks = [Uint8Array.of(1, 2), Uint8Array.of(3)];
  const manifest = makeManifest(chunks);

  assert.equal(validateManifest(manifest), manifest);
  assert.throws(
    () =>
      validateManifest({
        ...manifest,
        parts: [
          { ...manifest.parts[0], index: 1 },
          { ...manifest.parts[1], index: 0 }
        ]
      }),
    /index|order|顺序/i
  );
});

test("validateManifest rejects duplicate paths and an incorrect size sum", async () => {
  const { validateManifest } = await import(coreUrl);
  const chunks = [Uint8Array.of(1, 2), Uint8Array.of(3)];
  const manifest = makeManifest(chunks);

  assert.throws(
    () =>
      validateManifest({
        ...manifest,
        parts: [
          manifest.parts[0],
          { ...manifest.parts[1], path: manifest.parts[0].path }
        ]
      }),
    /path|路径|unique|重复/i
  );
  assert.throws(
    () => validateManifest({ ...manifest, totalSize: manifest.totalSize + 1 }),
    /size|length|大小|长度/i
  );
});

test("assembleDownload fetches parts strictly in manifest order and reports progress", async () => {
  const { assembleDownload } = await import(coreUrl);
  const chunks = [Uint8Array.of(1, 2), Uint8Array.of(3, 4)];
  const manifest = makeManifest(chunks);
  const requested = [];
  const progress = [];

  const result = await assembleDownload(manifest, {
    fetchImpl: async path => {
      requested.push(path);
      return response(chunks[requested.length - 1]);
    },
    digestHex: async bytes => sha256(bytes),
    onProgress: event => progress.push(event)
  });

  assert.deepEqual(requested, manifest.parts.map(part => part.path));
  assert.deepEqual(result, Uint8Array.of(1, 2, 3, 4));
  assert.deepEqual(
    progress.filter(event => event.phase === "part-complete").map(event => event.partIndex),
    [0, 1]
  );
  assert.equal(progress.at(-1).phase, "verifying");
  assert.equal(progress.at(-1).loadedBytes, manifest.totalSize);
});

test("assembleDownload retries a failed response and then continues", async () => {
  const { assembleDownload } = await import(coreUrl);
  const chunk = Uint8Array.of(4, 5, 6);
  const manifest = makeManifest([chunk]);
  let attempts = 0;

  const result = await assembleDownload(manifest, {
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1 ? response(new Uint8Array(), false) : response(chunk);
    },
    digestHex: async bytes => sha256(bytes)
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result, chunk);
});

test("assembleDownload stops after three failed HTTP attempts", async () => {
  const { assembleDownload } = await import(coreUrl);
  const chunk = Uint8Array.of(7);
  const manifest = makeManifest([chunk]);
  let attempts = 0;

  await assert.rejects(
    assembleDownload(manifest, {
      fetchImpl: async () => {
        attempts += 1;
        return response(new Uint8Array(), false, 503);
      },
      digestHex: async bytes => sha256(bytes),
      maxAttempts: 3
    }),
    /part-000|503|3/i
  );
  assert.equal(attempts, 3);
});

test("assembleDownload retries and rejects a wrong part length", async () => {
  const { assembleDownload } = await import(coreUrl);
  const chunk = Uint8Array.of(8, 9);
  const manifest = makeManifest([chunk]);
  let attempts = 0;

  await assert.rejects(
    assembleDownload(manifest, {
      fetchImpl: async () => {
        attempts += 1;
        return response(Uint8Array.of(8));
      },
      digestHex: async bytes => sha256(bytes),
      maxAttempts: 3
    }),
    /length|size|长度|大小/i
  );
  assert.equal(attempts, 3);
});

test("assembleDownload retries and rejects a wrong part checksum", async () => {
  const { assembleDownload } = await import(coreUrl);
  const chunk = Uint8Array.of(10, 11);
  const manifest = makeManifest([chunk]);
  let attempts = 0;

  await assert.rejects(
    assembleDownload(manifest, {
      fetchImpl: async () => {
        attempts += 1;
        return response(Uint8Array.of(11, 10));
      },
      digestHex: async bytes => sha256(bytes),
      maxAttempts: 3
    }),
    /SHA-?256|checksum|校验/i
  );
  assert.equal(attempts, 3);
});

test("assembleDownload rejects an incorrect final archive checksum", async () => {
  const { assembleDownload } = await import(coreUrl);
  const chunk = Uint8Array.of(12, 13);
  const manifest = makeManifest([chunk], { sha256: "F".repeat(64) });

  await assert.rejects(
    assembleDownload(manifest, {
      fetchImpl: async () => response(chunk),
      digestHex: async bytes => sha256(bytes)
    }),
    /archive|final|SHA-?256|完整|最终/i
  );
});
