import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const buildRoot = join(root, "build", "clickflow");
const workflowPath = join(root, ".github", "workflows", "build-clickflow-macos.yml");
const verificationWorkflowPath = join(
  root,
  ".github",
  "workflows",
  "verify-clickflow-publish.yml",
);
const hubBrowserGates = [
  join(root, "tests", "hub-video-pages-browser-smoke.mjs"),
  join(root, "tests", "hub-entry-pages-browser-smoke.mjs"),
];

const clickFlowRuntimeTest = process.platform === "win32" ? test.skip : test;

clickFlowRuntimeTest("the published ClickFlow build snapshot passes its real Python suite", () => {
  const required = [
    "auto_clicker.py",
    "clickflow_core.py",
    "clickflow_input.py",
    "clickflow_theme.py",
    "ClickFlow.spec",
    "requirements.txt",
    "requirements-build.txt",
    join("scripts", "build_macos.sh"),
  ];
  for (const file of required) {
    assert.equal(existsSync(join(buildRoot, file)), true, `${file} should be reproducible from the Hub`);
  }

  const result = spawnSync(
    "python",
    ["-m", "unittest", "discover", "-s", "tests", "-v"],
    { cwd: buildRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /Ran 51 tests/);
});

test("the ClickFlow source snapshot excludes generated and platform-wrong artifacts", () => {
  const listing = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "build/clickflow"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(listing.status, 0, listing.stderr);
  const files = listing.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.equal(files.some((file) => file.includes("__pycache__")), false);
  assert.equal(files.some((file) => file.endsWith(".pyc")), false);
  assert.equal(files.some((file) => file.endsWith(".exe")), false);
  assert.equal(files.some((file) => file.startsWith("release/")), false);
  assert.equal(files.some((file) => file.startsWith("dist/")), false);
});

test("the macOS workflow builds, signs, starts, and combines both native architectures", () => {
  assert.equal(existsSync(workflowPath), true);
  const workflow = readFileSync(workflowPath, "utf8");

  assert.match(workflow, /runner:\s*macos-14/);
  assert.match(workflow, /runner:\s*macos-15-intel/);
  assert.match(workflow, /expected_arch:\s*arm64/);
  assert.match(workflow, /expected_arch:\s*x86_64/);
  assert.match(workflow, /python -m unittest discover -s tests -v/);
  assert.match(workflow, /codesign --verify --deep --strict/);
  assert.match(workflow, /open -n/);
  assert.match(workflow, /ClickFlow-macOS\.zip/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(
    workflow,
    /gh release upload clickflow-v2\.0\.0 release\/ClickFlow-macOS\.zip --clobber/,
  );
});

test("the publication workflow runs the full Hub suite and ClickFlow browser acceptance", () => {
  assert.equal(existsSync(verificationWorkflowPath), true);
  const workflow = readFileSync(verificationWorkflowPath, "utf8");

  assert.match(workflow, /npm ci/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /xvfb-run -a npm test/);
  assert.match(workflow, /npm run audit:hub -- --check-external/);
  assert.match(workflow, /node tests\/hub-video-pages-browser-smoke\.mjs/);
  assert.match(workflow, /node tests\/hub-entry-pages-browser-smoke\.mjs/);
  assert.match(workflow, /node tests\/clickflow-browser-smoke\.mjs/);
  assert.match(workflow, /tests\/artifacts\/clickflow\/browser/);
  assert.match(workflow, /projects\/\*\*/);
  assert.match(workflow, /tests\/\*\*/);
  assert.match(workflow, /- "styles\.css"/);
  assert.match(workflow, /- "package\.json"/);
  assert.match(workflow, /- "package-lock\.json"/);
});

test("the Hub browser gates run with system or Playwright Chromium across operating systems", () => {
  for (const path of hubBrowserGates) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /\/Applications\/Google Chrome\.app/);
    assert.match(source, /\/usr\/bin\/google-chrome/);
    assert.match(source, /chromium\.executablePath\(\)/);
  }
});
