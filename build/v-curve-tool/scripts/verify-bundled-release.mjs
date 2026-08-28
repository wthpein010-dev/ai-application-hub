import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { bundleArtifactNames } from "./bundled-release.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const names = bundleArtifactNames(packageJson.version);
const releaseDirectory = path.join(projectRoot, "release");
const archiveScript = path.join(projectRoot, "scripts", "bundled-archive.ps1");
const sourceLevels = path.resolve(
  process.argv[2] ?? "E:\\Mahjong\\PawsHomeClient\\Assets\\Editor\\Res\\Config\\Gameplay\\Editorlevel",
);
const zipPath = path.join(releaseDirectory, names.zip);
const zipChecksumPath = path.join(releaseDirectory, names.zipChecksum);
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "vcurve-bundle-verify-"));
let portableProcess;
let browser;

async function manifest(directory, root = directory) {
  const result = {};
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, await manifest(absolutePath, root));
    } else if (entry.isFile()) {
      const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");
      const bytes = await readFile(absolutePath);
      result[relativePath] = {
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }
  }
  return result;
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error("无法分配 Chromium 调试端口");
  return port;
}

async function connectWithRetry(endpoint, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await chromium.connectOverCDP(endpoint);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError ?? new Error(`无法连接 ${endpoint}`);
}

try {
  const zipBytes = await readFile(zipPath);
  const zipSha256 = createHash("sha256").update(zipBytes).digest("hex");
  assert.equal(
    await readFile(zipChecksumPath, "utf8"),
    `${zipSha256}  ${names.zip}\n`,
    "ZIP SHA-256 校验文件不匹配",
  );

  const extraction = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-File",
      archiveScript,
      "-Mode",
      "Expand",
      "-Source",
      zipPath,
      "-Destination",
      temporaryDirectory,
    ],
    { stdio: "inherit", windowsHide: true },
  );
  assert.equal(extraction.status, 0, "ZIP 新鲜解压失败");

  const bundleDirectory = path.join(temporaryDirectory, names.directory);
  const extractedLevels = path.join(bundleDirectory, "Editorlevel");
  const executablePath = path.join(bundleDirectory, names.executable);
  const [sourceManifest, extractedManifest, executableBytes, executableInfo] = await Promise.all([
    manifest(sourceLevels),
    manifest(extractedLevels),
    readFile(executablePath),
    stat(executablePath),
  ]);
  assert.deepEqual(extractedManifest, sourceManifest, "解压后的 Editorlevel 与源目录不一致");
  assert.equal(Object.keys(sourceManifest).length, 62, "用户指定的 Editorlevel 当前应包含 62 个文件");
  const executableSha256 = createHash("sha256").update(executableBytes).digest("hex");
  assert.equal(
    await readFile(path.join(bundleDirectory, names.executableChecksum), "utf8"),
    `${executableSha256}  ${names.executable}\n`,
    "解压后的 EXE SHA-256 校验文件不匹配",
  );

  const port = await freePort();
  portableProcess = spawn(
    executablePath,
    [`--remote-debugging-port=${port}`],
    {
      cwd: bundleDirectory,
      detached: false,
      env: { ...process.env, V_CURVE_E2E: "1" },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  browser = await connectWithRetry(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.waitForEvent("page");
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.waitForFunction(() => (
    document.querySelector("#analysis-status")?.textContent.includes("分析完成")
  ), null, { timeout: 120_000 });
  const state = await page.evaluate(() => ({
    summary: document.querySelector("#import-summary")?.textContent,
    status: document.querySelector("#analysis-status")?.textContent,
    selected: document.querySelector("#level-select")?.selectedOptions?.[0]?.textContent,
  }));
  assert.match(state.summary, /已导入 31 个关卡 · 忽略 31 个文件 · 5 项警告/);
  assert.match(state.selected, /level_0020 · 368 砖 · 21 层/);
  assert.match(state.status, /level_0020 分析完成 · 300 seeds/);
  assert.deepEqual(consoleErrors, []);

  console.log(JSON.stringify({
    zip: zipPath,
    zipBytes: zipBytes.length,
    zipSha256,
    extractedBundle: bundleDirectory,
    sourceFiles: Object.keys(sourceManifest).length,
    executableBytes: executableInfo.size,
    executableSha256,
    state,
    consoleErrors,
  }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (portableProcess && portableProcess.exitCode === null) {
    spawnSync("taskkill.exe", ["/PID", String(portableProcess.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const resolvedTemp = path.resolve(temporaryDirectory);
  if (path.dirname(resolvedTemp) === path.resolve(os.tmpdir())) {
    await rm(resolvedTemp, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 250,
    });
  }
}
