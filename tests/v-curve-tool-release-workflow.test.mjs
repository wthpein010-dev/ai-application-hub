import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(root, "build", "v-curve-tool");
const workflowPath = join(root, ".github", "workflows", "build-v-curve-tool-release.yml");
const hubPackagePath = join(root, "package.json");
const hubVerificationWorkflowPath = join(
  root,
  ".github",
  "workflows",
  "verify-clickflow-publish.yml",
);
const publisherWorkflowPath = join(
  root,
  ".github",
  "workflows",
  "publish-v-curve-tool-release.yml",
);

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

test("the macOS checksum files record portable archive basenames", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const portableChecksum = '(cd "$(dirname "$archive")" && shasum -a 256 "$(basename "$archive")") > "$archive.sha256.txt"';

  assert.equal(workflow.split(portableChecksum).length - 1, 2);
  assert.doesNotMatch(workflow, /shasum -a 256 "\$archive"/u);
});

test("the publisher promotes the exact verified Mac artifact without overwriting assets", async () => {
  assert.ok(existsSync(publisherWorkflowPath), "missing immutable V curve release publisher");
  const workflow = await readFile(publisherWorkflowPath, "utf8");

  assert.match(workflow, /on:\s*\n\s*workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /\n\s*push:/u);
  assert.match(workflow, /actions:\s*read/u);
  assert.match(workflow, /contents:\s*write/u);
  assert.match(workflow, /ARTIFACT_RUN_ID:\s*"33152604613"/u);
  assert.match(workflow, /ARTIFACT_NAME:\s*v-curve-tool-macos-release/u);
  assert.match(workflow, /RELEASE_TAG:\s*v-curve-tool-v1\.2\.0/u);
  assert.match(workflow, /1700462f5f12c5aff874862e74da02d38ffea4a8/u);
  assert.match(workflow, /F992C85AFAFC207D5C2B76220D2297C6AF4829C58DC6A3794414E1208A9D22C4/u);
  assert.match(workflow, /gh run download/u);
  assert.match(workflow, /gh release view/u);
  assert.match(workflow, /gh release upload/u);
  assert.doesNotMatch(workflow, /--clobber/u);
});

test("the Hub suite includes both root and Xiang Le Ge Xiang Node tests while excluding nested Vitest", async () => {
  const packageJson = JSON.parse(await readFile(hubPackagePath, "utf8"));
  const workflow = await readFile(hubVerificationWorkflowPath, "utf8");

  assert.equal(
    packageJson.scripts.test,
    'node --test "tests/**/*.test.mjs" "projects/xiang-le-ge-xiang/tests/**/*.test.mjs"',
  );
  assert.match(workflow, /xvfb-run -a npm test/u);
  assert.doesNotMatch(workflow, /xvfb-run -a node --test(?:\s|$)/u);
});
