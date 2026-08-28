import assert from "node:assert/strict";
import { extractFile } from "@electron/asar";
import {
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  artifactNames,
  assertMatchingArtifactBytes,
  assertPortableArchitectures,
  checksumLine,
  readPeMachine,
} from "./windows-artifact.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const releasePath = path.join(projectRoot, "release");
const names = artifactNames(packageJson.version);
const entries = await readdir(releasePath, { withFileTypes: true });
const rootExecutables = entries
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"))
  .map((entry) => entry.name)
  .sort();

assert.deepEqual(
  rootExecutables,
  [names.exe],
  "release 根目录必须只包含一个命名正确的便携 EXE",
);

const executablePath = path.join(releasePath, names.exe);
const innerExecutablePath = path.join(
  releasePath,
  "win-unpacked",
  `${packageJson.build.productName}.exe`,
);
const asarPath = path.join(releasePath, "win-unpacked", "resources", "app.asar");
const rendererRelativePath = "dist/V曲线对比工具.html";
const rendererPath = path.join(projectRoot, rendererRelativePath);
const checksumPath = path.join(releasePath, names.checksum);
const [bytes, info, innerBytes, rendererBytes] = await Promise.all([
  readFile(executablePath),
  stat(executablePath),
  readFile(innerExecutablePath),
  readFile(rendererPath),
]);
const minimumBytes = 70 * 1024 * 1024;
const maximumBytes = 250 * 1024 * 1024;

assert.ok(info.size >= minimumBytes, "便携 EXE 体积过小，可能缺少 Electron 运行时");
assert.ok(info.size <= maximumBytes, "便携 EXE 体积异常，可能打包了无关文件");

const bootstrapperMachine = readPeMachine(bytes);
const appMachine = readPeMachine(innerBytes);
assertPortableArchitectures({ bootstrapperMachine, appMachine });
const rendererSha256 = assertMatchingArtifactBytes(
  rendererBytes,
  extractFile(asarPath, rendererRelativePath),
);

const line = checksumLine(bytes, names.exe);
await writeFile(checksumPath, line, "utf8");
assert.equal(await readFile(checksumPath, "utf8"), line, "SHA-256 校验文件回读不一致");

console.log(JSON.stringify({
  executable: executablePath,
  embeddedApp: innerExecutablePath,
  checksum: checksumPath,
  bytes: info.size,
  bootstrapperMachine: `0x${bootstrapperMachine.toString(16)}`,
  appMachine: `0x${appMachine.toString(16)}`,
  rendererSha256,
  sha256: line.slice(0, 64),
}, null, 2));
