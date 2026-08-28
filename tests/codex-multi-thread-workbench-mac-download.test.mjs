import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

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
const execFileAsync = promisify(execFile);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();

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

test("Mac page offers independently verified Apple silicon and Intel downloads", async () => {
  const [html, controller] = await Promise.all([
    readFile(join(macRoot, "index.html"), "utf8"),
    readFile(join(macRoot, "download.js"), "utf8"),
  ]);

  assert.match(html, /Codex 多线程工作台/);
  assert.match(html, /v2\.2\.1/);
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
  const audit = join(directory, "macos-downloads.json");
  const matrix = join(directory, "platform-matrix.md");
  await mkdir(download, { recursive: true });
  await writeFile(audit, '{"version":1,"downloads":[]}\n');
  await writeFile(
    matrix,
    "| `codex-multi-thread-workbench` | Codex 多线程工作台 | 原生双平台 | Windows | macOS：待真实 runner 验证 | pending |\n",
  );

  const arm64 = Buffer.from("PK-arm64-real-runner-output");
  await mkdir(join(download, "parts", "arm64"), { recursive: true });
  await writeFile(join(download, "parts", "arm64", "part-000.bin"), arm64);
  await writeFile(
    join(download, "manifest-arm64.json"),
    `${JSON.stringify({
      version: 1,
      fileName: "CodexThreadWorkbench-macOS-arm64.app.zip",
      totalSize: arm64.byteLength,
      chunkSize: arm64.byteLength,
      sha256: sha256(arm64),
      parts: [{
        index: 0,
        path: "parts/arm64/part-000.bin",
        size: arm64.byteLength,
        sha256: sha256(arm64),
      }],
    })}\n`,
  );

  const partial = await runNode(activator, [download, audit, matrix]);
  assert.notEqual(partial.code, 0);
  assert.match(partial.stderr, /manifest-x64\.json/);

  const x64 = Buffer.from("PK-x64-real-runner-output");
  await mkdir(join(download, "parts", "x64"), { recursive: true });
  await writeFile(join(download, "parts", "x64", "part-000.bin"), x64);
  await writeFile(
    join(download, "manifest-x64.json"),
    `${JSON.stringify({
      version: 1,
      fileName: "CodexThreadWorkbench-macOS-x64.app.zip",
      totalSize: x64.byteLength,
      chunkSize: x64.byteLength,
      sha256: sha256(x64),
      parts: [{
        index: 0,
        path: "parts/x64/part-000.bin",
        size: x64.byteLength,
        sha256: sha256(x64),
      }],
    })}\n`,
  );

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

  assert.match(project, /<Version>2\.2\.1<\/Version>/);
  assert.match(project, /<AssemblyName>CodexThreadWorkbench<\/AssemblyName>/);
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
  assert.match(workflow, /git pull --rebase origin "\$\{GITHUB_REF_NAME\}"/);
  assert.match(workflow, /git push origin "HEAD:\$\{GITHUB_REF_NAME\}"/);
  assert.doesNotMatch(workflow, /git push[^\n]*--force/);
  assert.doesNotMatch(
    workflow,
    /^\s+- "projects\/codex-multi-thread-workbench\/download\/mac\/\*\*"$/m,
    "generated manifests and parts must not retrigger their own publishing workflow",
  );

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

test("public Mac manifests remain unavailable until the real workflow writes both", () => {
  assert.equal(existsSync(join(macRoot, "manifest-arm64.json")), true);
  assert.equal(existsSync(join(macRoot, "manifest-x64.json")), true);
});
