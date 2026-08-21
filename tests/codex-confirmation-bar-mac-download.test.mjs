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
const macRoot = join(root, "projects", "codex-confirmation-bar", "download", "mac");
const coreUrl = new URL("../projects/codex-confirmation-bar/download/download-core.js", import.meta.url);
const workflowPath = join(root, ".github", "workflows", "build-codex-confirmation-bar.yml");
const legacyWorkflowPath = join(root, ".github", "workflows", "build-codex-thread-workbench.yml");
const splitterPath = join(root, "scripts", "split-codex-confirmation-bar-mac.mjs");
const execFileAsync = promisify(execFile);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();

test("Mac download page offers both architectures with accurate signing and permission boundaries", () => {
  const html = readFileSync(join(macRoot, "index.html"), "utf8");
  assert.match(html, /Apple\s*(?:芯片|silicon)/i);
  assert.match(html, /arm64/i);
  assert.match(html, /Intel/i);
  assert.match(html, /x64/i);
  assert.match(html, /macOS\s*13\+/i);
  assert.match(html, /ad-hoc|临时签名/i);
  assert.match(html, /未经 Apple 公证/);
  assert.match(html, /辅助功能[^。]*仅[^。]*兜底/);
  assert.match(html, /data-manifest="\.\/manifest-arm64\.json"/);
  assert.match(html, /data-manifest="\.\/manifest-x64\.json"/);
  assert.equal((html.match(/data-role="architecture"/g) || []).length, 2);
});

test("Mac downloader verifies the selected v2 architecture before saving a ZIP", () => {
  const script = readFileSync(join(macRoot, "download.js"), "utf8");
  assert.match(script, /from\s+["']\.\.\/download-core\.js["']/);
  assert.match(script, /validateManifest/);
  assert.match(script, /assembleDownload/);
  assert.match(script, /sha256Hex/);
  assert.match(script, /maxAttempts:\s*3/);
  assert.match(script, /CodexConfirmationBar-macOS-\$\{architecture\}\.app\.zip/);
  assert.match(script, /nextManifest\.architecture\s*!==\s*architecture/);
  assert.match(script, /application\/zip/);
});

test("Hub workflow builds both native Macs and publishes only verified manifests and parts", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const legacyWorkflow = readFileSync(legacyWorkflowPath, "utf8");
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /architecture:\s*arm64[\s\S]*?runtime:\s*osx-arm64[\s\S]*?runner:\s*macos-14/);
  assert.match(workflow, /architecture:\s*x64[\s\S]*?runtime:\s*osx-x64[\s\S]*?runner:\s*macos-15-intel/);
  assert.match(workflow, /CodexConfirmationBar-macOS-arm64\.app\.zip/);
  assert.match(workflow, /CodexConfirmationBar-macOS-x64\.app\.zip/);
  assert.match(workflow, /scripts\/test-macos-package\.sh/);
  assert.match(workflow, /needs:\s*macos/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(workflow, /split-codex-confirmation-bar-mac\.mjs/);
  assert.match(workflow, /tests\/codex-confirmation-bar-download\.test\.mjs/);
  assert.match(workflow, /tests\/codex-confirmation-bar-mac-download\.test\.mjs/);
  assert.match(workflow, /tests\/codex-confirmation-bar-video\.test\.mjs/);
  assert.match(workflow, /manifest-arm64\.json/);
  assert.match(workflow, /manifest-x64\.json/);
  assert.match(workflow, /git pull --rebase origin/);
  assert.doesNotMatch(workflow, /git push[^\n]+--force/);
  assert.match(legacyWorkflow, /uses:\s*\.\/\.github\/workflows\/build-codex-confirmation-bar\.yml/);
  assert.doesNotMatch(legacyWorkflow, /build\/codex-thread-workbench/);
  assert.equal(existsSync(join(root, "build", "codex-confirmation-bar", "src", "CodexThreadWorkbench", "CodexThreadWorkbench.csproj")), true);
});

test("Windows workflow smoke-tests the packaged app and publishes versioned SHA-256 evidence", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  assert.match(workflow, /npm install --global @openai\/codex/);
  assert.match(workflow, /npm prefix --global/);
  assert.match(workflow, /codex-win32-x64/);
  assert.match(workflow, /CodexConfirmationBar\.exe[^\n]*--smoke-test/);
  assert.match(workflow, /Start-Process[^\n]+-Wait[^\n]+-PassThru/);
  assert.match(workflow, /RedirectStandardError/);
  assert.match(workflow, /Get-Content[^\n]+smokeErrorPath/);
  assert.match(workflow, /\.ExitCode/);
  assert.match(workflow, /FileVersion[^\n]*2\.0\.0/);
  assert.match(workflow, /ProductVersion[^\n]*2\.0\.0/);
  assert.ok(
    (workflow.match(/Get-FileHash[^\n]+SHA256/g) || []).length >= 2,
    "workflow must hash both the final EXE and ZIP",
  );
  assert.match(workflow, /SHA256SUMS\.txt/);
  assert.match(
    workflow,
    /CodexConfirmationBar-Windows-x64\.zip[\s\S]*?SHA256SUMS\.txt/,
  );
});

test("Mac splitter creates ordered architecture-specific 8 MiB parts with v2 metadata", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "confirmation-bar-mac-split-"));
  const archivePath = join(temporaryRoot, "CodexConfirmationBar-macOS-arm64.app.zip");
  const outputRoot = join(temporaryRoot, "download");
  const archive = Buffer.alloc(8_388_608 + 17, 0x5a);
  try {
    await writeFile(archivePath, archive);
    await execFileAsync(process.execPath, [
      splitterPath,
      "--source", archivePath,
      "--output", outputRoot,
      "--architecture", "arm64",
      "--version", "2.0.0",
      "--product", "Codex Confirmation Bar",
    ]);
    const manifest = JSON.parse(await readFile(join(outputRoot, "manifest-arm64.json"), "utf8"));
    assert.equal(manifest.releaseVersion, "2.0.0");
    assert.equal(manifest.product, "Codex Confirmation Bar");
    assert.equal(manifest.platform, "macos-arm64");
    assert.equal(manifest.architecture, "arm64");
    assert.equal(manifest.fileName, "CodexConfirmationBar-macOS-arm64.app.zip");
    assert.equal(manifest.totalSize, archive.byteLength);
    assert.equal(manifest.chunkSize, 8_388_608);
    assert.equal(manifest.sha256, sha256(archive));
    assert.deepEqual(manifest.parts.map((part) => part.path), ["parts/arm64/part-000.bin", "parts/arm64/part-001.bin"]);
    assert.deepEqual(manifest.parts.map((part) => part.size), [8_388_608, 17]);
    assert.equal(sha256(await readFile(join(outputRoot, manifest.parts[1].path))), manifest.parts[1].sha256);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("shared downloader accepts a Mac v2 manifest and verifies all parts in order", async () => {
  const { assembleDownload, validateManifest } = await import(coreUrl);
  const chunks = [Uint8Array.of(1, 2, 3), Uint8Array.of(4, 5)];
  const archive = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const manifest = {
    version: 1,
    releaseVersion: "2.0.0",
    product: "Codex Confirmation Bar",
    platform: "macos-arm64",
    architecture: "arm64",
    fileName: "CodexConfirmationBar-macOS-arm64.app.zip",
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
      return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    },
    digestHex: async (bytes) => sha256(bytes),
    maxAttempts: 3,
  });
  assert.deepEqual(requested, manifest.parts.map((part) => part.path));
  assert.deepEqual(result, Uint8Array.of(1, 2, 3, 4, 5));
});

for (const architecture of ["arm64", "x64"]) {
  test(`published ${architecture} manifest and parts reconstruct the exact verified app ZIP`, async (context) => {
    const manifestPath = join(macRoot, `manifest-${architecture}.json`);
    if (!existsSync(manifestPath)) {
      context.skip("generated only after the matching macOS runner verifies the app bundle");
      return;
    }
    const { validateManifest } = await import(coreUrl);
    const manifest = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")));
    assert.equal(manifest.releaseVersion, "2.0.0");
    assert.equal(manifest.product, "Codex Confirmation Bar");
    assert.equal(manifest.platform, `macos-${architecture}`);
    assert.equal(manifest.architecture, architecture);
    assert.equal(manifest.fileName, `CodexConfirmationBar-macOS-${architecture}.app.zip`);
    const chunks = [];
    for (const part of manifest.parts) {
      const bytes = await readFile(join(macRoot, ...part.path.split("/")));
      assert.equal(bytes.byteLength, part.size);
      assert.equal(sha256(bytes), part.sha256);
      chunks.push(bytes);
    }
    const archive = Buffer.concat(chunks);
    assert.equal(archive.byteLength, manifest.totalSize);
    assert.equal(sha256(archive), manifest.sha256);
  });
}
