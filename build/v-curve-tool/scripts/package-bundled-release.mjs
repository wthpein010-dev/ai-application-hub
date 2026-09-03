import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stageBundledRelease } from "./bundled-release.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const releaseDirectory = path.join(projectRoot, "release");
const archiveScript = path.join(projectRoot, "scripts", "bundled-archive.ps1");
const levelsDirectory = path.resolve(
  process.argv[2] ?? "E:\\Mahjong\\PawsHomeClient\\Assets\\Editor\\Res\\Config\\Gameplay\\Editorlevel",
);
const staged = await stageBundledRelease({
  releaseDirectory,
  levelsDirectory,
  version: packageJson.version,
});
const zipPath = path.join(releaseDirectory, staged.names.zip);
const zipChecksumPath = path.join(releaseDirectory, staged.names.zipChecksum);
await rm(zipPath, { force: true });
await rm(zipChecksumPath, { force: true });

const compression = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-File",
    archiveScript,
    "-Mode",
    "Compress",
    "-Source",
    staged.bundleDirectory,
    "-Destination",
    zipPath,
  ],
  { stdio: "inherit", windowsHide: true },
);
if (compression.status !== 0) {
  throw new Error(`压缩开箱即用包失败，PowerShell 退出码 ${compression.status}`);
}

const zipBytes = await readFile(zipPath);
const zipSha256 = createHash("sha256").update(zipBytes).digest("hex");
await writeFile(zipChecksumPath, `${zipSha256}  ${staged.names.zip}\n`, "utf8");

console.log(JSON.stringify({
  levelsDirectory,
  sourceFileCount: staged.sourceFileCount,
  bundleDirectory: staged.bundleDirectory,
  executableSha256: staged.executableSha256,
  zip: zipPath,
  zipBytes: zipBytes.length,
  zipSha256,
  zipChecksum: zipChecksumPath,
}, null, 2));
