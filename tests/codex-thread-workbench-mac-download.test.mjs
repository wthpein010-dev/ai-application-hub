import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  extractValidatedZip,
  readZipEntries,
} from "./helpers/zip-central-directory.mjs";

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
const activator = join(
  root,
  "scripts",
  "activate-codex-confirmation-bar-macos.mjs",
);

function plistString(xml, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `<key>\\s*${escaped}\\s*</key>\\s*<string>([^<]*)</string>`,
  ).exec(xml);
  assert.ok(match, `Info.plist should contain ${key}`);
  return match[1].trim();
}

async function reconstructPublishedArchive(architecture, destination) {
  const manifest = JSON.parse(
    await readFile(join(macRoot, `manifest-${architecture}.json`), "utf8"),
  );
  const chunks = await Promise.all(
    manifest.parts.map(async (part) => {
      const bytes = await readFile(join(macRoot, ...part.path.split("/")));
      assert.equal(bytes.byteLength, part.size, `${part.path} byte count`);
      assert.equal(sha256(bytes), part.sha256, `${part.path} SHA-256`);
      return bytes;
    }),
  );
  const archive = Buffer.concat(chunks);
  assert.equal(archive.byteLength, manifest.totalSize);
  assert.equal(sha256(archive), manifest.sha256);
  await writeFile(destination, archive);
  return manifest;
}

test("Mac download page offers Apple silicon and Intel packages", () => {
  const html = readFileSync(join(macRoot, "index.html"), "utf8");

  assert.match(html, /Codex 待确认悬浮助手/);
  assert.match(html, /v2\.3\.3/);
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
  const publishJob = workflow.slice(workflow.indexOf("  publish-pages-parts:"));
  const publisherPath = join(
    root,
    "scripts",
    "publish-codex-confirmation-bar-macos.sh",
  );

  assert.match(workflow, /runtime:\s*osx-arm64\s+runner:\s*macos-14/);
  assert.match(workflow, /runtime:\s*osx-x64\s+runner:\s*macos-15-intel/);
  assert.match(workflow, /branches:\s*- release\/codex-confirmation-v233/);
  assert.match(workflow, /ref:\s*\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /CodexConfirmationBar-macOS-arm64\.app\.zip/);
  assert.match(workflow, /CodexConfirmationBar-macOS-x64\.app\.zip/);
  assert.match(workflow, /scripts\/publish-codex-confirmation-bar-macos\.sh/);
  assert.match(workflow, /scripts\/test-codex-confirmation-bar-macos-package\.sh/);
  assert.doesNotMatch(
    workflow.slice(0, workflow.indexOf("  publish-pages-parts:")),
    /build\/codex-thread-workbench\/scripts\/(?:publish-macos|test-macos-package)\.sh/,
  );
  assert.match(workflow, /needs:\s*build-macos/);
  assert.match(workflow, /manifest-arm64\.json/);
  assert.match(workflow, /manifest-x64\.json/);
  assert.match(workflow, /activate-codex-confirmation-bar-macos\.mjs/);
  assert.match(
    publishJob,
    /^\s+app-20260706-restore-games\.js\s*$/m,
    "the publication checkout must include the app catalog used by the Mac manifest audit",
  );
  assert.match(workflow, /git fetch --no-tags origin "\$\{GITHUB_REF_NAME\}"/);
  assert.match(workflow, /remote_tip="\$\(git rev-parse FETCH_HEAD\)"/);
  assert.match(workflow, /"\$\{remote_tip\}" != "\$\{GITHUB_SHA\}"/);
  assert.match(workflow, /refusing to publish stale artifacts/i);
  assert.doesNotMatch(workflow, /git pull --rebase/);
  assert.doesNotMatch(workflow, /git push[^\n]+--force/);
  assert.ok(
    workflow.indexOf('remote_tip="$(git rev-parse FETCH_HEAD)"')
      < workflow.indexOf("git commit -m"),
    "the remote tip gate must run before the bot creates its publication commit",
  );
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

  const publisher = readFileSync(publisherPath, "utf8");
  assert.match(publisher, /CodexConfirmationBar-macOS-arm64\.app\.zip/);
  assert.match(publisher, /CodexConfirmationBar-macOS-x64\.app\.zip/);
  assert.match(
    publisher,
    /mv "\$\{macos_directory\}\/CodexThreadWorkbench" "\$\{macos_directory\}\/CodexConfirmationBar"/,
  );
  assert.doesNotMatch(publisher, /-p:AssemblyName=/);
  assert.match(publisher, /CodexConfirmationBar\.app/);
  assert.match(publisher, /Contents\/MacOS\/CodexConfirmationBar|macos_directory\}\/CodexConfirmationBar/);
  assert.match(publisher, /<string>Codex 待确认悬浮助手<\/string>/);
  assert.match(publisher, /<string>dev\.wthpein010\.codex-confirmation-bar<\/string>/);
  assert.match(publisher, /<string>\$\{project_version\}<\/string>/);
  assert.match(publisher, /codesign --force --deep --sign -/);
  assert.match(publisher, /ditto -c -k --sequesterRsrc --keepParent/);
  assert.doesNotMatch(publisher, /CodexThreadWorkbench\.app/);
  assert.doesNotMatch(publisher, /dev\.wthpein010\.codex-thread-workbench/);
});

test("Mac manifests are either both absent or both publish verified v2.3.3 bundles", async (context) => {
  const architectures = ["arm64", "x64"];
  const present = architectures.map((architecture) =>
    existsSync(join(macRoot, `manifest-${architecture}.json`))
  );
  assert.equal(
    new Set(present).size,
    1,
    "the two architecture manifests must be published atomically",
  );

  if (!present[0]) {
    for (const architecture of architectures) {
      assert.equal(
        existsSync(join(macRoot, "parts", architecture)),
        false,
        `stale ${architecture} parts must not remain while its manifest is unavailable`,
      );
    }
    context.diagnostic("Mac downloads are fail-closed until the real runners publish both architectures.");
    return;
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "confirmation-bar-mac-release-"));
  try {
    for (const architecture of architectures) {
      const archivePath = join(temporaryRoot, `${architecture}.app.zip`);
      const extractionRoot = join(temporaryRoot, architecture);
      const manifest = await reconstructPublishedArchive(architecture, archivePath);
      assert.equal(
        manifest.fileName,
        `CodexConfirmationBar-macOS-${architecture}.app.zip`,
      );
      extractValidatedZip(
        archivePath,
        readZipEntries(archivePath),
        extractionRoot,
        { maxEntryBytes: 256 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024 },
      );
      const plist = await readFile(
        join(
          extractionRoot,
          "CodexConfirmationBar.app",
          "Contents",
          "Info.plist",
        ),
        "utf8",
      );
      assert.equal(plistString(plist, "CFBundleShortVersionString"), "2.3.3");
      assert.equal(plistString(plist, "CFBundleVersion"), "2.3.3");
      assert.equal(
        plistString(plist, "CFBundleIdentifier"),
        "dev.wthpein010.codex-confirmation-bar",
      );
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Mac activation updates the audit manifest from both verified architecture manifests", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "confirmation-bar-mac-activation-"));
  const downloadDirectory = join(temporaryRoot, "download", "mac");
  const auditPath = join(temporaryRoot, "audit.json");
  const matrixPath = join(temporaryRoot, "matrix.md");
  const matrixRow = "| `codex-thread-workbench` | old row |";
  const fixtures = {
    arm64: Buffer.from("verified arm64 confirmation bar"),
    x64: Buffer.from("verified x64 confirmation bar"),
  };

  try {
    for (const [architecture, bytes] of Object.entries(fixtures)) {
      const partDirectory = join(downloadDirectory, "parts", architecture);
      await mkdir(partDirectory, { recursive: true });
      await writeFile(join(partDirectory, "part-000.bin"), bytes);
      await writeFile(
        join(downloadDirectory, `manifest-${architecture}.json`),
        `${JSON.stringify({
          version: 1,
          fileName: `CodexConfirmationBar-macOS-${architecture}.app.zip`,
          totalSize: bytes.byteLength,
          chunkSize: 8_388_608,
          sha256: sha256(bytes),
          parts: [{
            index: 0,
            path: `parts/${architecture}/part-000.bin`,
            size: bytes.byteLength,
            sha256: sha256(bytes),
          }],
        }, null, 2)}\n`,
      );
    }
    await writeFile(
      auditPath,
      `${JSON.stringify({
        version: 1,
        downloads: [{
          id: "codex-thread-workbench",
          name: "stale",
          kind: "native",
          catalogUrl: "https://example.test/stale/",
          artifacts: {},
        }],
      }, null, 2)}\n`,
    );
    await writeFile(matrixPath, `# Matrix\n\n${matrixRow}\n`);

    const { activateMacRelease } = await import(pathToFileURL(activator));
    const record = await activateMacRelease({
      downloadDirectory,
      auditPath,
      matrixPath,
    });
    const audit = JSON.parse(await readFile(auditPath, "utf8"));
    const matrix = await readFile(matrixPath, "utf8");

    assert.deepEqual(audit.downloads.find(({ id }) => id === record.id), record);
    assert.equal(record.name, "Codex 待确认悬浮助手");
    assert.equal(record.artifacts.arm64.bytes, fixtures.arm64.byteLength);
    assert.equal(record.artifacts.arm64.sha256, sha256(fixtures.arm64));
    assert.equal(record.artifacts.x64.bytes, fixtures.x64.byteLength);
    assert.equal(record.artifacts.x64.sha256, sha256(fixtures.x64));
    assert.match(matrix, /codex-thread-workbench[^\n]+arm64\/x64/u);
    assert.match(matrix, /manifest-arm64\.json/u);
    assert.match(matrix, /manifest-x64\.json/u);
    assert.doesNotMatch(matrix, /\| `codex-thread-workbench` \| old row \|/u);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
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
    "CodexConfirmationBar-macOS-arm64.app.zip",
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
      `CodexConfirmationBar-macOS-${architecture}.app.zip`,
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
