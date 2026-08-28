import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(root, "build", "v-curve-tool");
const workflowPath = join(root, ".github", "workflows", "build-v-curve-tool-release.yml");

test("the tracked V curve source builds both native macOS architectures", async () => {
  assert.ok(existsSync(join(sourceRoot, "package.json")), "missing tracked V curve source snapshot");
  const packageJson = JSON.parse(await readFile(join(sourceRoot, "package.json"), "utf8"));

  assert.equal(packageJson.version, "1.2.0");
  assert.equal(packageJson.scripts["build:mac:arm64"], "npm run build && electron-builder --mac zip --arm64");
  assert.equal(packageJson.scripts["build:mac:x64"], "npm run build && electron-builder --mac zip --x64");
  assert.deepEqual(packageJson.build.mac.extraResources, [{
    from: "bundled-levels/Editorlevel",
    to: "Editorlevel",
  }]);
});

test("the tracked source contains the confirmed opening level payload", async () => {
  const levelsDirectory = join(sourceRoot, "bundled-levels", "Editorlevel");
  assert.ok(existsSync(levelsDirectory), "missing tracked Editorlevel payload");
  const names = await readdir(levelsDirectory);

  assert.equal(names.length, 62);
  assert.equal(names.filter((name) => name.endsWith(".json")).length, 31);
  assert.equal(names.filter((name) => name.endsWith(".meta")).length, 31);
  assert.ok(names.some((name) => /^level_0020.*\.json$/u.test(name)), "level_0020 must be bundled");
});

test("the release workflow builds and launches V curve on Apple silicon and Intel", async () => {
  assert.ok(existsSync(workflowPath), "missing V curve native release workflow");
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /push:[\s\S]*feat\/v-curve-tool-20260828/u);
  assert.match(workflow, /runner:\s*macos-14/u);
  assert.match(workflow, /runner:\s*macos-15-intel/u);
  assert.match(workflow, /npm run build:mac:\$\{\{ matrix\.arch \}\}/u);
  assert.match(workflow, /codesign --verify --deep --strict/u);
  assert.match(workflow, /open -n/u);
  assert.match(workflow, /V-Curve-Comparison-Tool-1\.2\.0-macOS\.zip/u);
  assert.match(workflow, /actions\/upload-artifact@v4/u);
});

test("the release workflow uploads the ad-hoc signed macOS applications", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const sign = 'codesign --force --deep --sign - "$app"';
  const verify = 'codesign --verify --deep --strict "$app"';
  const rearchive = 'ditto -c -k --sequesterRsrc --keepParent "$app" "$archive"';

  assert.ok(workflow.includes(sign), "the built app must receive an ad-hoc signature");
  assert.ok(workflow.includes(verify), "the ad-hoc signature must be strictly verified");
  assert.ok(workflow.includes(rearchive), "the signed app must replace the unsigned builder archive");
  assert.ok(workflow.indexOf(sign) < workflow.indexOf(verify));
  assert.ok(workflow.indexOf(verify) < workflow.indexOf(rearchive));
});
