import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateManifest } from "../projects/codex-multi-thread-workbench/download/download-core.js";

const PUBLIC_ROOT = "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-multi-thread-workbench/download/mac/";
const ARCHITECTURES = ["arm64", "x64"];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();

async function verifiedArtifact(downloadDirectory, architecture) {
  const manifestPath = join(downloadDirectory, `manifest-${architecture}.json`);
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const expectedName = `CodexThreadWorkbench-macOS-${architecture}.app.zip`;
  if (manifest.fileName !== expectedName) throw new Error(`${manifestPath} must name ${expectedName}.`);

  const chunks = [];
  for (const part of manifest.parts) {
    const partPath = resolve(downloadDirectory, ...part.path.split("/"));
    const relative = partPath.slice(resolve(downloadDirectory).length + 1);
    if (relative.startsWith("..") || resolve(relative) === partPath) throw new Error(`Unsafe part path ${part.path}.`);
    const bytes = await readFile(partPath);
    if (bytes.byteLength !== part.size) throw new Error(`${part.path} byte count does not match its manifest.`);
    if (sha256(bytes) !== part.sha256) throw new Error(`${part.path} SHA-256 does not match its manifest.`);
    chunks.push(bytes);
  }
  const archive = Buffer.concat(chunks);
  if (archive.byteLength !== manifest.totalSize || sha256(archive) !== manifest.sha256) {
    throw new Error(`${manifestPath} does not reconstruct to its declared archive.`);
  }
  if (archive.subarray(0, 2).toString("ascii") !== "PK") throw new Error(`${manifestPath} does not reconstruct a ZIP archive.`);
  return manifest;
}

export async function activateMacRelease({ downloadDirectory, auditPath, matrixPath }) {
  const manifests = Object.fromEntries(
    await Promise.all(ARCHITECTURES.map(async (architecture) => [
      architecture,
      await verifiedArtifact(downloadDirectory, architecture),
    ])),
  );
  const audit = JSON.parse(await readFile(auditPath, "utf8"));
  if (audit.version !== 1 || !Array.isArray(audit.downloads)) throw new Error("Mac audit manifest must use version 1.");

  const record = {
    id: "codex-multi-thread-workbench",
    name: "Codex 多线程工作台",
    kind: "native",
    catalogUrl: PUBLIC_ROOT,
    artifacts: Object.fromEntries(ARCHITECTURES.map((architecture) => [architecture, {
      url: PUBLIC_ROOT,
      bytes: manifests[architecture].totalSize,
      sha256: manifests[architecture].sha256,
      manifestUrl: `${PUBLIC_ROOT}manifest-${architecture}.json`,
    }])),
  };
  const index = audit.downloads.findIndex(({ id }) => id === record.id);
  if (index >= 0) audit.downloads[index] = record;
  else audit.downloads.push(record);

  const matrix = await readFile(matrixPath, "utf8");
  const rowPattern = /^\| `codex-multi-thread-workbench` \|.*$/gm;
  const matches = matrix.match(rowPattern) || [];
  if (matches.length !== 1) throw new Error("Platform matrix must contain exactly one codex-multi-thread-workbench row.");
  const row = "| `codex-multi-thread-workbench` | Codex 多线程工作台 | 原生双平台 | Windows： [Wins下载](https://wthpein010-dev.github.io/ai-application-hub/projects/codex-multi-thread-workbench/download/) | macOS： [Mac下载](https://wthpein010-dev.github.io/ai-application-hub/projects/codex-multi-thread-workbench/download/mac/)，arm64/x64 | [项目页](https://wthpein010-dev.github.io/ai-application-hub/projects/codex-multi-thread-workbench/index.html)；`projects/codex-multi-thread-workbench/download/manifest.json`、`projects/codex-multi-thread-workbench/download/mac/manifest-arm64.json`、`projects/codex-multi-thread-workbench/download/mac/manifest-x64.json` |";

  await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  await writeFile(matrixPath, matrix.replace(rowPattern, row), "utf8");
  return record;
}

async function main() {
  const [downloadArgument, auditArgument, matrixArgument] = process.argv.slice(2);
  if (!downloadArgument || !auditArgument || !matrixArgument) {
    console.error("Usage: node scripts/activate-codex-multi-thread-workbench-macos.mjs <download-directory> <audit-manifest> <platform-matrix>");
    process.exitCode = 64;
    return;
  }
  try {
    const record = await activateMacRelease({
      downloadDirectory: resolve(downloadArgument),
      auditPath: resolve(auditArgument),
      matrixPath: resolve(matrixArgument),
    });
    console.log(`Activated verified macOS artifacts for ${record.id}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
