import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowUrl = new URL("../.github/workflows/build-gamespec-relay-release.yml", import.meta.url);

test("release workflow builds and launches every native target", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  for (const runner of ["windows-latest", "macos-15-intel", "macos-14"]) {
    assert.match(workflow, new RegExp(`runs-on:\\s*${runner}`));
  }
  assert.ok((workflow.match(/--smoke-test/g) || []).length >= 3);
  assert.match(workflow, /file "\$APP_BIN" \| grep -q "x86_64"/);
  assert.match(workflow, /file "\$APP_BIN" \| grep -q "arm64"/);
  assert.ok((workflow.match(/codesign --verify --deep --strict/g) || []).length >= 2);
});

test("release assembly emits immutable competition download assets", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /需求接力站-微软系统\.zip/);
  assert.match(workflow, /需求接力站-苹果电脑\.zip/);
  assert.match(workflow, /校验值\.txt/);
  assert.match(workflow, /mac-combined\/x64/);
  assert.match(workflow, /mac-combined\/arm64/);
  assert.match(workflow, /sha256sum/);
  assert.match(workflow, /gh release view "\$TAG"/);
  assert.match(workflow, /refusing to replace immutable assets/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /--target "\$GITHUB_SHA"/);
});

test("release workflow is limited to the GameSpec Relay version tag", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /gamespec-relay-v\*/);
  assert.doesNotMatch(workflow, /branches:\s*\n\s*-\s*main/);
  assert.match(workflow, /--title "需求接力站 \$VERSION"/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /release:[\s\S]*permissions:\s*\n\s*contents:\s*write/);
});
