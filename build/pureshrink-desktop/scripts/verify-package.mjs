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
  assert.equal(names.some((name) => /PureShrink-Windows-x64\.exe$/i.test(name)), true);
  assert.equal(names.some((name) => /win-unpacked\/PureShrink\.exe$/i.test(name)), true);
} else {
  assert.equal(names.some((name) => /PureShrink-macOS-(arm64|x64)\.zip$/i.test(name)), true);
  assert.equal(names.some((name) => /PureShrink\.app\/Contents\/MacOS\/PureShrink$/i.test(name)), true);
}

assert.equal(
  names.some((name) => /resources\/app\/index\.html$/i.test(name)),
  true,
  "Shared PureShrink web app is missing",
);
assert.equal(
  names.some((name) => /resources\/app\/video\/pureshrink-demo\.mp4$/i.test(name)),
  true,
  "Local tutorial video is missing",
);
assert.equal(
  names.some((name) => /resources\/app\/video\/pureshrink-demo\.vtt$/i.test(name)),
  true,
  "Local tutorial captions are missing",
);
assert.equal(
  names.some((name) => /ffmpeg(?:\.exe)?$/i.test(name)),
  true,
  "Bundled FFmpeg binary is missing",
);

const nonEmpty = files.filter((file) => statSync(file).size > 0);
assert.equal(nonEmpty.length, files.length, "Distribution contains empty files");
console.log(`PureShrink ${platform} package verified: ${files.length} files`);
