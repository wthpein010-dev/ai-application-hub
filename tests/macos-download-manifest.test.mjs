import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

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
const execFileAsync = promisify(execFile);
const auditScript = join(root, "scripts", "audit-public-macos-downloads.sh");
const auditWorkflow = join(root, ".github", "workflows", "audit-macos-downloads.yml");
const repairWorkflow = join(root, ".github", "workflows", "repair-codex-quota-bar-macos.yml");

function bashPath(value) {
  return value.replaceAll("\\", "/");
}

function bashExecutable() {
  if (process.env.BASH) return process.env.BASH;
  const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";
  if (process.platform === "win32" && existsSync(gitBash)) return gitBash;
  return "bash";
}

async function createFixtureZip(directory, name, entries) {
  const source = join(directory, `${name}-source`);
  const archive = join(directory, `${name}.zip`);
  await mkdir(source, { recursive: true });

  for (const [relativePath, contents] of Object.entries(entries)) {
    const target = join(source, ...relativePath.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }

  if (process.platform === "win32") {
    await execFileAsync("tar.exe", ["-a", "-cf", archive, "-C", source, "."]);
  } else {
    await execFileAsync("zip", ["-q", "-r", archive, "."], { cwd: source });
  }

  return archive;
}

async function fixtureArtifact(archive) {
  const contents = await readFile(archive);
  return {
    archiveUrl: basename(archive),
    bytes: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex").toUpperCase(),
  };
}

async function writeFixtureManifest(directory, download) {
  const path = join(directory, "manifest.json");
  await writeFile(
    path,
    `${JSON.stringify({ version: 1, downloads: [download] }, null, 2)}\n`,
  );
  return path;
}

async function runFixtureAudit({ architecture = "arm64", directory, manifestPath }) {
  try {
    const result = await execFileAsync(
      bashExecutable(),
      [
        bashPath(auditScript),
        "--arch",
        architecture,
        "--manifest",
        bashPath(manifestPath),
        "--fixture-root",
        bashPath(directory),
        "--evidence-dir",
        bashPath(join(directory, "evidence")),
      ],
      { env: process.env },
    );
    return { code: 0, stderr: result.stderr, stdout: result.stdout };
  } catch (error) {
    return {
      code: typeof error.code === "number" ? error.code : 1,
      stderr: error.stderr || error.message,
      stdout: error.stdout || "",
    };
  }
}

async function withFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "hub-macos-audit-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  return directory;
}

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

test("the Mac audit manifest rejects combined archive URL drift", () => {
  const invalidManifest = structuredClone(manifest);
  invalidManifest.downloads[0].archiveUrl = "https://example.com/CodexQuotaBar-macOS.zip";

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

test("the native audit script enforces product checks and refreshes stale downloads", async () => {
  const script = await readFile(auditScript, "utf8");
  assert.match(script, /curl --fail --location --retry 3/);
  assert.match(script, /Cache-Control: no-cache/);
  assert.match(script, /Pragma: no-cache/);
  assert.match(script, /audit_nonce=/);
  assert.match(script, /integrity_attempt/);
  assert.match(script, /ditto -x -k/);
  assert.match(script, /plutil -lint/);
  assert.match(script, /codesign --verify --deep --strict/);
  assert.match(script, /test-macos-package\.sh/);
  assert.match(script, /ffmpeg-static\/ffmpeg/);
  assert.match(script, /--smoke-test/);
  assert.match(script, /node --check/);
  assert.match(script, /open -n/);
  assert.match(script, /sleep 5/);
});

test("the Quota Bar repair launches the app bundle like Finder", async () => {
  const workflow = await readFile(repairWorkflow, "utf8");
  assert.match(workflow, /open -n "\$app"/);
  assert.match(workflow, /pgrep -f "\$launcher"/);
});

test("the native audit workflow covers both Mac architectures and emits evidence", async () => {
  const workflow = await readFile(auditWorkflow, "utf8");

  const runners = [...workflow.matchAll(/^\s+runner:\s+(macos-[^\s]+)$/gm)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(runners, ["macos-14", "macos-15-intel"]);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /^\s+- main$/m);
  assert.match(workflow, /audit\/mac-downloads-20260807/);
  assert.match(workflow, /docs\/audits\/evidence\/2026-08-07-macos-download-manifest\.json/);
  assert.match(workflow, /downloads\/CodexQuotaBar-macOS\.zip/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /macos-download-audit-\$\{\{ matrix\.arch \}\}/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
});

test("the audit script rejects an archive with the wrong digest", async (t) => {
  const directory = await withFixture(t);
  const archive = await createFixtureZip(directory, "wrong-digest", {
    "manifest.json": JSON.stringify({ manifest_version: 3, name: "Fixture" }),
    "background.js": "console.log('fixture');\n",
  });
  const artifact = await fixtureArtifact(archive);
  const manifestPath = await writeFixtureManifest(directory, {
    id: "feishu-downloader",
    name: "Fixture extension",
    kind: "extension",
    catalogUrl: artifact.archiveUrl,
    ...artifact,
    sha256: "0".repeat(64),
    extension: { browser: "chromium", format: "zip" },
  });

  const result = await runFixtureAudit({ directory, manifestPath });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /SHA-256 mismatch/i);
});

test("the audit script rejects a native app without its executable", async (t) => {
  const directory = await withFixture(t);
  const archive = await createFixtureZip(directory, "missing-executable", {
    "CodexQuotaBar-macOS/arm64/CodexQuotaBar.app/Contents/Info.plist": "fixture",
  });
  const artifact = await fixtureArtifact(archive);
  const manifestPath = await writeFixtureManifest(directory, {
    id: "codex-quota-bar",
    name: "Fixture native app",
    kind: "native",
    catalogUrl: artifact.archiveUrl,
    ...artifact,
    architectures: ["arm64", "x64"],
  });

  const result = await runFixtureAudit({ directory, manifestPath });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /missing executable/i);
});

test("the audit script rejects a native artifact with wrong architecture metadata", async (t) => {
  const directory = await withFixture(t);
  const archive = await createFixtureZip(directory, "wrong-architecture", {
    "CodexQuotaBar-macOS/arm64/CodexQuotaBar.app/Contents/Info.plist": "fixture",
    "CodexQuotaBar-macOS/arm64/CodexQuotaBar.app/Contents/MacOS/CodexQuotaBar": "fixture",
  });
  const artifact = await fixtureArtifact(archive);
  const manifestPath = await writeFixtureManifest(directory, {
    id: "codex-quota-bar",
    name: "Fixture native app",
    kind: "native",
    catalogUrl: artifact.archiveUrl,
    ...artifact,
    architectures: ["x64"],
  });

  const result = await runFixtureAudit({ directory, manifestPath });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /does not declare architecture arm64/i);
});

test("the audit script rejects a Chromium extension without manifest.json", async (t) => {
  const directory = await withFixture(t);
  const archive = await createFixtureZip(directory, "missing-extension-manifest", {
    "background.js": "console.log('fixture');\n",
  });
  const artifact = await fixtureArtifact(archive);
  const manifestPath = await writeFixtureManifest(directory, {
    id: "feishu-downloader",
    name: "Fixture extension",
    kind: "extension",
    catalogUrl: artifact.archiveUrl,
    ...artifact,
    extension: { browser: "chromium", format: "zip" },
  });

  const result = await runFixtureAudit({ directory, manifestPath });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /missing manifest\.json/i);
});

test("the audit script accepts a valid extension fixture without native Mac tools", async (t) => {
  const directory = await withFixture(t);
  const archive = await createFixtureZip(directory, "valid-extension", {
    "manifest.json": JSON.stringify({ manifest_version: 3, name: "Fixture" }),
    "background.js": "console.log('fixture');\n",
  });
  const artifact = await fixtureArtifact(archive);
  const manifestPath = await writeFixtureManifest(directory, {
    id: "feishu-downloader",
    name: "Fixture extension",
    kind: "extension",
    catalogUrl: artifact.archiveUrl,
    ...artifact,
    extension: { browser: "chromium", format: "zip" },
  });

  const result = await runFixtureAudit({ directory, manifestPath });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Verified feishu-downloader/);

  const evidence = JSON.parse(
    await readFile(join(directory, "evidence", "macos-download-audit-arm64.json"), "utf8"),
  );
  assert.equal(evidence.status, "passed");
  assert.deepEqual(evidence.downloads.map((item) => item.id), ["feishu-downloader"]);
});
