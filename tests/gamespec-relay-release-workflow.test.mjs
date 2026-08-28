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

  assert.match(workflow, /youxi-xuqiu-kaigongtai-windows-x64\.zip/);
  assert.match(workflow, /youxi-xuqiu-kaigongtai-macos\.zip/);
  assert.match(workflow, /sha256sum\.txt/);
  assert.match(workflow, /mac-combined\/x64/);
  assert.match(workflow, /mac-combined\/arm64/);
  assert.match(workflow, /sha256sum/);
  assert.match(workflow, /gh release view "\$TAG"/);
  assert.match(workflow, /refusing to replace immutable assets/);
  assert.match(workflow, /gh release create/);
});

test("release workflow supports a safe retry without moving the immutable tag", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /gamespec-relay-v\*/);
  assert.match(workflow, /workflow_dispatch:[\s\S]*tag:[\s\S]*required:\s*true/);
  assert.match(workflow, /TAG="\$\{\{ inputs\.tag \|\| github\.ref_name \}\}"/);
  assert.match(workflow, /case "\$TAG" in[\s\S]*gamespec-relay-v\*/);
  assert.match(workflow, /--verify-tag/);
  assert.doesNotMatch(workflow, /--target "\$GITHUB_SHA"/);
  assert.doesNotMatch(workflow, /branches:\s*\n\s*-\s*main/);
  assert.match(workflow, /--title "游戏需求开工台 \$VERSION"/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /release:[\s\S]*permissions:\s*\n\s*contents:\s*write/);
});
