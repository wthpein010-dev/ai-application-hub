import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workflow = join(root, ".github", "workflows", "build-pureshrink-release.yml");

test("PureShrink release workflow builds on native Windows and macOS runners", () => {
  assert.equal(existsSync(workflow), true);
  const yaml = readFileSync(workflow, "utf8");

  assert.match(yaml, /windows-latest/);
  assert.match(yaml, /macos-15-intel/);
  assert.match(yaml, /macos-14/);
  assert.match(yaml, /arch:\s*x64/);
  assert.match(yaml, /arch:\s*arm64/);
  assert.match(yaml, /test "\$\(uname -m\)" = "x86_64"/);
  assert.match(yaml, /test "\$\(uname -m\)" = "arm64"/);
  assert.match(yaml, /file "\$APP_BIN"/);
  assert.match(yaml, /file "\$FFMPEG_PATH"/);
  assert.match(yaml, /npm ci/);
  assert.match(yaml, /npm run test/);
  assert.match(yaml, /verify-package\.mjs/);
});

test("PureShrink release workflow creates the two public download assets", () => {
  const yaml = readFileSync(workflow, "utf8");

  assert.match(yaml, /pureshrink-v\*/);
  assert.match(yaml, /PureShrink-Windows-x64\.zip/);
  assert.match(yaml, /PureShrink-macOS\.zip/);
  assert.match(yaml, /contents:\s*write/);
  assert.match(yaml, /gh release create/);
  assert.doesNotMatch(yaml, /workflow_dispatch|--clobber|gh release upload/);
  assert.match(yaml, /sha256sum/);
});

test("PureShrink release waits for every native build before publishing", () => {
  const yaml = readFileSync(workflow, "utf8");
  const releaseBlock = yaml.slice(yaml.indexOf("\n  release:"));

  assert.match(releaseBlock, /needs:\s*\[[^\]]*windows[^\]]*mac_x64[^\]]*mac_arm64[^\]]*\]/);
  assert.match(releaseBlock, /actions\/download-artifact@v4/);
  assert.match(releaseBlock, /arm64/);
  assert.match(releaseBlock, /x64/);
});

test("PureShrink release waits for Windows smoke exit and exercises the native runner", () => {
  const yaml = readFileSync(workflow, "utf8");
  const windowsBlock = yaml.slice(
    yaml.indexOf("\n  windows:"),
    yaml.indexOf("\n  mac_x64:"),
  );

  assert.match(windowsBlock, /Start-Process[\s\S]*-PassThru\s+-Wait/);
  assert.match(windowsBlock, /native-processing-proof\.mjs/);
});
