import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const [distArgument = "dist", platform = process.platform] = process.argv.slice(2);
const dist = resolve(distArgument);
assert.equal(existsSync(dist), true, `Missing distribution directory: ${dist}`);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const files = walk(dist);
const names = files.map((file) => file.replaceAll("\\", "/"));
if (platform === "windows") {
  assert.equal(names.some((name) => /GameSpec-Relay-Windows-x64\.exe$/i.test(name)), true, "Windows portable executable is missing");
  assert.equal(names.some((name) => /win-unpacked\/GameSpec Relay\.exe$/i.test(name)), true, "Unpacked Windows executable is missing");
} else {
  assert.equal(names.some((name) => /GameSpec-Relay-macOS-(arm64|x64)\.zip$/i.test(name)), true, "macOS ZIP is missing");
  assert.equal(names.some((name) => /GameSpec Relay\.app\/Contents\/MacOS\/GameSpec Relay$/i.test(name)), true, "macOS app executable is missing");
}

assert.equal(
  names.some((name) => /resources\/app\/projects\/gamespec-relay\/app\/index\.html$/i.test(name)),
  true,
  "Shared GameSpec Relay web app is missing",
);
for (const file of files) assert.ok(statSync(file).size > 0, `Distribution contains an empty file: ${file}`);
console.log(`GameSpec Relay ${platform} package verified: ${files.length} files`);
