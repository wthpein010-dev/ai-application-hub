import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const macRoot = join(
  root,
  "projects",
  "codex-multi-thread-workbench",
  "download",
  "mac",
);
const splitter = join(root, "scripts", "split-codex-multi-thread-workbench-mac.mjs");
const activator = join(root, "scripts", "activate-codex-multi-thread-workbench-macos.mjs");
const workflowPath = join(
  root,
  ".github",
  "workflows",
  "build-codex-multi-thread-workbench.yml",
);
const sourceVerifier = join(
  root,
  "scripts",
  "verify-codex-multi-thread-workbench-source.mjs",
);
const execFileAsync = promisify(execFile);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30 + name.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    localRecords.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    name.copy(central, 46);
    centralRecords.push(central);
    localOffset += local.length;
  }
  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localRecords, centralDirectory, end]);
}

function machO(architecture) {
  const bytes = Buffer.alloc(32);
  bytes.writeUInt32LE(0xfeedfacf, 0);
  bytes.writeInt32LE(architecture === "arm64" ? 0x0100000c : 0x01000007, 4);
  bytes.writeUInt32LE(2, 12);
  return bytes;
}

function workbenchPlist({ displayName = "Codex 多线程工作台", version = "2.3.0" } = {}) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>${displayName}</string>
<key>CFBundleExecutable</key><string>CodexThreadWorkbench</string>
<key>CFBundleIdentifier</key><string>dev.wthpein010.codex-thread-workbench</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
</dict></plist>`, "utf8");
}

function macAppZip(architecture, {
  bundle = "CodexThreadWorkbench.app",
  executableArchitecture = architecture,
  displayName,
  version,
} = {}) {
  return createStoredZip([
    { name: `${bundle}/Contents/Info.plist`, data: workbenchPlist({ displayName, version }) },
    {
      name: `${bundle}/Contents/MacOS/CodexThreadWorkbench`,
      data: machO(executableArchitecture),
      mode: 0o100755,
    },
  ]);
}

async function temporaryDirectory(t, prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(directory, { force: true, recursive: true }));
  return directory;
}

async function runNode(script, args) {
  try {
    const result = await execFileAsync(process.execPath, [script, ...args], { cwd: root });
    return { code: 0, ...result };
  } catch (error) {
    return {
      code: typeof error.code === "number" ? error.code : 1,
      stderr: error.stderr || error.message,
      stdout: error.stdout || "",
    };
  }
}

async function writeArchitectureRelease(download, architecture, archive) {
  await mkdir(join(download, "parts", architecture), { recursive: true });
  const partPath = join(download, "parts", architecture, "part-000.bin");
  await writeFile(partPath, archive);
  await writeFile(
    join(download, `manifest-${architecture}.json`),
    `${JSON.stringify({
      version: 1,
      fileName: `CodexThreadWorkbench-macOS-${architecture}.app.zip`,
      totalSize: archive.byteLength,
      chunkSize: archive.byteLength,
      sha256: sha256(archive),
      parts: [{
        index: 0,
        path: `parts/${architecture}/part-000.bin`,
        size: archive.byteLength,
        sha256: sha256(archive),
      }],
    })}\n`,
  );
}

async function writeActivationTargets(directory) {
  const audit = join(directory, "macos-downloads.json");
  const matrix = join(directory, "platform-matrix.md");
  await writeFile(audit, '{"version":1,"downloads":[]}\n');
  await writeFile(
    matrix,
    "| `codex-multi-thread-workbench` | Codex 多线程工作台 | 原生双平台 | Windows | macOS：待真实 runner 验证 | pending |\n",
  );
  return { audit, matrix };
}

test("Mac page offers independently verified Apple silicon and Intel downloads", async () => {
  const [html, controller] = await Promise.all([
    readFile(join(macRoot, "index.html"), "utf8"),
    readFile(join(macRoot, "download.js"), "utf8"),
  ]);

  assert.match(html, /Codex 多线程工作台/);
  assert.match(html, /v2\.3\.0/);
  assert.doesNotMatch(html, /v2\.2\.1/);
  assert.match(html, /Apple\s*(?:芯片|silicon)/i);
  assert.match(html, /Intel/i);
  assert.match(html, /macOS\s*13\+/i);
  assert.match(html, /未公证/);
  assert.match(html, /data-manifest="\.\/manifest-arm64\.json"/);
  assert.match(html, /data-manifest="\.\/manifest-x64\.json"/);
  assert.equal((html.match(/data-role="architecture"/g) || []).length, 2);

  assert.match(controller, /from\s+["']\.\.\/download-core\.js["']/);
  assert.match(controller, /CodexThreadWorkbench-macOS-\$\{architecture\}\.app\.zip/);
  assert.match(controller, /maxAttempts:\s*3/);
  assert.match(controller, /application\/zip/);
  assert.match(controller, /link\.download\s*=\s*manifest\.fileName/);
});

test("Mac splitter creates architecture-isolated manifests from exact package names", async (t) => {
  const directory = await temporaryDirectory(t, "multi-workbench-mac-split-");
  const output = join(directory, "download");

  for (const [architecture, payload] of [
    ["arm64", Buffer.concat([Buffer.from("PK"), Buffer.alloc(97, 0x41)])],
    ["x64", Buffer.concat([Buffer.from("PK"), Buffer.alloc(131, 0x58)])],
  ]) {
    const fileName = `CodexThreadWorkbench-macOS-${architecture}.app.zip`;
    const archive = join(directory, fileName);
    await writeFile(archive, payload);
    const result = await runNode(splitter, [archive, output, architecture, "64"]);
    assert.equal(result.code, 0, result.stderr);

    const manifest = JSON.parse(
      await readFile(join(output, `manifest-${architecture}.json`), "utf8"),
    );
    assert.equal(manifest.fileName, fileName);
    assert.equal(manifest.totalSize, payload.byteLength);
    assert.equal(manifest.sha256, sha256(payload));
    assert.deepEqual(
      manifest.parts.map((part) => part.path),
      manifest.parts.map((_, index) =>
        `parts/${architecture}/part-${String(index).padStart(3, "0")}.bin`),
    );
    const rebuilt = Buffer.concat(
      await Promise.all(
        manifest.parts.map((part) => readFile(join(output, ...part.path.split("/")))),
      ),
    );
    assert.deepEqual(rebuilt, payload);
  }

  const oldName = join(directory, "CodexConfirmationBar-macOS-arm64.app.zip");
  await writeFile(oldName, Buffer.from("PK-old-product"));
  const rejected = await runNode(splitter, [oldName, output, "arm64", "64"]);
  assert.notEqual(rejected.code, 0);
  assert.match(rejected.stderr, /CodexThreadWorkbench-macOS-arm64\.app\.zip/);
});

test("Mac audit activation refuses a partial release and records both verified manifests", async (t) => {
  const directory = await temporaryDirectory(t, "multi-workbench-mac-activate-");
  const download = join(directory, "mac");
  await mkdir(download, { recursive: true });
  const { audit, matrix } = await writeActivationTargets(directory);

  const arm64 = macAppZip("arm64");
  await writeArchitectureRelease(download, "arm64", arm64);

  const partial = await runNode(activator, [download, audit, matrix]);
  assert.notEqual(partial.code, 0);
  assert.match(partial.stderr, /manifest-x64\.json/);

  const x64 = macAppZip("x64");
  await writeArchitectureRelease(download, "x64", x64);

  const activated = await runNode(activator, [download, audit, matrix]);
  assert.equal(activated.code, 0, activated.stderr);
  const result = JSON.parse(await readFile(audit, "utf8"));
  const record = result.downloads.find(({ id }) => id === "codex-multi-thread-workbench");
  assert.deepEqual(record.artifacts.arm64.bytes, arm64.byteLength);
  assert.deepEqual(record.artifacts.arm64.sha256, sha256(arm64));
  assert.deepEqual(record.artifacts.x64.bytes, x64.byteLength);
  assert.deepEqual(record.artifacts.x64.sha256, sha256(x64));
  assert.match(await readFile(matrix, "utf8"), /arm64\/x64/);
  assert.match(await readFile(matrix, "utf8"), /manifest-arm64\.json/);
  assert.match(await readFile(matrix, "utf8"), /manifest-x64\.json/);
  assert.doesNotMatch(await readFile(matrix, "utf8"), /待真实 runner 验证/);
});

test("Mac ZIP validation rejects malformed archives, wrong bundles, and wrong architectures", async (t) => {
  const { validateWorkbenchMacZip } = await import(
    "../scripts/lib/validated-workbench-macos-zip.mjs"
  );
  assert.doesNotThrow(() => validateWorkbenchMacZip(macAppZip("arm64"), "arm64"));
  assert.doesNotThrow(() => validateWorkbenchMacZip(macAppZip("x64"), "x64"));

  const invalid = [
    ["PK junk", Buffer.from("PK-not-a-zip"), /central directory|end of central directory/i],
    ["empty ZIP", createStoredZip([]), /no entries/i],
    ["wrong bundle", macAppZip("arm64", { bundle: "Other.app" }), /CodexThreadWorkbench\.app/i],
    ["wrong product", macAppZip("arm64", { displayName: "Other Product" }), /display name|identity/i],
    ["wrong version", macAppZip("arm64", { version: "2.2.1" }), /version/i],
    ["wrong architecture", macAppZip("arm64", { executableArchitecture: "x64" }), /arm64|cputype/i],
  ];
  for (const [label, archive, message] of invalid) {
    assert.throws(() => validateWorkbenchMacZip(archive, "arm64"), message, label);
  }

  for (const [label, archive] of invalid) {
    const directory = await temporaryDirectory(t, `multi-workbench-invalid-${label.replaceAll(" ", "-")}-`);
    const download = join(directory, "mac");
    await mkdir(download, { recursive: true });
    const { audit, matrix } = await writeActivationTargets(directory);
    await writeArchitectureRelease(download, "arm64", archive);
    await writeArchitectureRelease(download, "x64", macAppZip("x64"));
    const result = await runNode(activator, [download, audit, matrix]);
    assert.notEqual(result.code, 0, `${label} must not activate`);
    assert.deepEqual(JSON.parse(await readFile(audit, "utf8")).downloads, []);
    assert.match(await readFile(matrix, "utf8"), /待真实 runner 验证/);
  }
});

test("public Mac audit workflow checks out and enables every selected Workbench verifier", async () => {
  const [workflow, audit] = await Promise.all([
    readFile(join(root, ".github", "workflows", "audit-macos-downloads.yml"), "utf8"),
    readFile(join(root, "scripts", "audit-public-macos-downloads.sh"), "utf8"),
  ]);
  const verifiers = [
    "scripts/test-codex-confirmation-bar-macos-package.sh",
    "build/codex-thread-workbench/scripts/test-macos-package.sh",
  ];
  for (const verifier of verifiers) {
    assert.match(audit, new RegExp(verifier.replaceAll("/", "\\/")));
    assert.equal(
      workflow.split(verifier).length - 1,
      3,
      `${verifier} must be in trigger paths, sparse checkout, and chmod`,
    );
  }
});

test("legacy Confirmation Bar workflow builds from its immutable v2.1.8 snapshot", async () => {
  const workflow = await readFile(
    join(root, ".github", "workflows", "build-codex-thread-workbench.yml"),
    "utf8",
  );
  const buildJob = workflow.slice(0, workflow.indexOf("  publish-pages-parts:"));
  const publicationJob = workflow.slice(workflow.indexOf("  publish-pages-parts:"));
  assert.match(buildJob, /uses:\s*actions\/checkout@v4[\s\S]*?ref:\s*fb3be183efb7ec195f4ebee426f9fbe679d9c768/);
  assert.match(buildJob, /architecture:\s*arm64/);
  assert.match(buildJob, /architecture:\s*x64/);
  assert.match(buildJob, /CodexConfirmationBar-macOS-\$\{\{ matrix\.architecture \}\}\.app\.zip/);
  assert.doesNotMatch(buildJob, /CodexThreadWorkbench-macOS-(?:arm64|x64)\.app\.zip/);
  assert.doesNotMatch(publicationJob, /ref:\s*fb3be183efb7ec195f4ebee426f9fbe679d9c768/);
});

test("independent workflow verifies real apps before safely publishing both architectures", async () => {
  const [workflow, packageVerifier, legacyVerifier, publicAudit, project] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(join(root, "build", "codex-thread-workbench", "scripts", "test-macos-package.sh"), "utf8"),
    readFile(join(root, "scripts", "test-codex-confirmation-bar-macos-package.sh"), "utf8"),
    readFile(join(root, "scripts", "audit-public-macos-downloads.sh"), "utf8"),
    readFile(
      join(root, "build", "codex-thread-workbench", "src", "CodexThreadWorkbench", "CodexThreadWorkbench.csproj"),
      "utf8",
    ),
  ]);

  const workflowTrigger = workflow.slice(0, workflow.indexOf("\npermissions:"));
  assert.match(
    workflowTrigger,
    /- "scripts\/lib\/validated-workbench-macos-zip\.mjs"/,
    "changes to the ZIP validator must trigger the independent build workflow",
  );
  assert.match(project, /<Version>2\.3\.0<\/Version>/);
  assert.match(project, /<AssemblyName>CodexThreadWorkbench<\/AssemblyName>/);
  assert.match(
    workflow,
    /WORKBENCH_SOURCE_COMMIT:\s*8e2126ba93a835e2e0e2864d83165b9358d995a1/,
  );
  assert.match(workflow, /runtime:\s*osx-arm64\s+runner:\s*macos-14/);
  assert.match(workflow, /runtime:\s*osx-x64\s+runner:\s*macos-15-intel/);
  assert.match(workflow, /dotnet test CodexThreadWorkbench\.sln --configuration Release/);
  assert.equal((workflow.match(/scripts\/publish-macos\.sh/g) || []).length, 2);
  assert.equal((workflow.match(/scripts\/test-macos-package\.sh/g) || []).length, 2);
  assert.match(workflow, /CodexThreadWorkbench-macOS-arm64\.app\.zip/);
  assert.match(workflow, /CodexThreadWorkbench-macOS-x64\.app\.zip/);
  assert.match(workflow, /needs:\s*build-macos/);
  assert.match(workflow, /activate-codex-multi-thread-workbench-macos\.mjs/);
  assert.match(workflow, /node scripts\/macos-download-manifest\.mjs --check/);
  assert.doesNotMatch(workflow, /node --test tests\/macos-download-manifest\.test\.mjs/);
  assert.match(workflow, /git fetch --no-tags origin "\$\{GITHUB_REF_NAME\}"/);
  assert.match(workflow, /remote_tip="\$\(git rev-parse FETCH_HEAD\)"/);
  assert.match(workflow, /if \[\[ "\$\{remote_tip\}" != "\$\{GITHUB_SHA\}" \]\]/);
  assert.match(workflow, /exit 1/);
  assert.doesNotMatch(workflow, /git pull --rebase/);
  assert.ok(workflow.indexOf("git fetch --no-tags") < workflow.indexOf("git commit -m"));
  assert.ok(workflow.indexOf("git commit -m") < workflow.indexOf('git push origin "HEAD:${GITHUB_REF_NAME}"'));
  assert.match(workflow, /git push origin "HEAD:\$\{GITHUB_REF_NAME\}"/);
  assert.doesNotMatch(workflow, /git push[^\n]*--force/);
  assert.doesNotMatch(
    workflow,
    /^\s+- "projects\/codex-multi-thread-workbench\/download\/mac\/\*\*"$/m,
    "generated manifests and parts must not retrigger their own publishing workflow",
  );

  const publicationJob = workflow.slice(workflow.indexOf("  publish-pages-parts:"));
  for (const requiredWorkflow of [
    ".github/workflows/audit-macos-downloads.yml",
    ".github/workflows/build-codex-thread-workbench.yml",
  ]) {
    assert.match(
      publicationJob,
      new RegExp(requiredWorkflow.replaceAll(".", "\\.").replaceAll("/", "\\/")),
      `${requiredWorkflow} must be present in the publishing sparse checkout because the Mac contract tests read it`,
    );
  }

  assert.match(packageVerifier, /codesign --verify --deep --strict/);
  assert.match(packageVerifier, /"\$\{executable\}" --smoke-test/);
  assert.match(packageVerifier, /"\$\{executable\}"[^\n]*launch\.log[^\n]*&/);
  assert.match(packageVerifier, /kill -0 "\$\{app_pid\}"/);

  assert.match(legacyVerifier, /CodexConfirmationBar\.app/);
  assert.match(legacyVerifier, /Codex 待确认悬浮助手/);
  assert.match(publicAudit, /codex-multi-thread-workbench/);
  assert.match(publicAudit, /test-codex-confirmation-bar-macos-package\.sh/);
  assert.match(publicAudit, /build\/codex-thread-workbench\/scripts\/test-macos-package\.sh/);
});

test("independent workflow executable-verifies the immutable source tree before Release tests", async () => {
  const expectedCommit = "8e2126ba93a835e2e0e2864d83165b9358d995a1";
  const expectedTree = "108cc3f9271d83573f010ba8f4c7dd67b70b41b9";
  const helperPath = "scripts/verify-codex-multi-thread-workbench-source.mjs";
  const workflow = await readFile(workflowPath, "utf8");
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "HEAD:build/codex-thread-workbench"],
    { cwd: root },
  );
  assert.equal(stdout.trim(), expectedTree);

  assert.match(workflow, new RegExp(`WORKBENCH_SOURCE_COMMIT:\\s*${expectedCommit}`));
  assert.match(workflow, new RegExp(`WORKBENCH_SOURCE_TREE:\\s*${expectedTree}`));
  assert.equal(
    workflow.split(helperPath).length - 1,
    3,
    "the verifier must be in trigger paths, build sparse checkout, and the build command",
  );
  const verificationIndex = workflow.indexOf(
    'node ../../scripts/verify-codex-multi-thread-workbench-source.mjs "${GITHUB_SHA}" "${WORKBENCH_SOURCE_TREE}"',
  );
  assert.ok(verificationIndex >= 0, "the workflow must execute the source-tree verifier");
  assert.ok(
    verificationIndex < workflow.indexOf("dotnet test CodexThreadWorkbench.sln --configuration Release"),
    "source identity must be verified before Release tests or builds",
  );

  const { verifyWorkbenchSourceTree } = await import(pathToFileURL(sourceVerifier));
  assert.equal(
    await verifyWorkbenchSourceTree({ repoRoot: root, commit: "HEAD", expectedTree }),
    expectedTree,
  );
  await assert.rejects(
    verifyWorkbenchSourceTree({
      repoRoot: root,
      commit: "HEAD",
      expectedTree: "0000000000000000000000000000000000000000",
    }),
    /does not match expected tree/i,
  );
});

test("public Mac manifests remain unavailable until the real workflow writes both", () => {
  assert.equal(existsSync(join(macRoot, "manifest-arm64.json")), true);
  assert.equal(existsSync(join(macRoot, "manifest-x64.json")), true);
});
