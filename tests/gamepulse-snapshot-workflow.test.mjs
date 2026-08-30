import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workflow = readFileSync(
  join(root, ".github", "workflows", "snapshot-gamepulse-rankings.yml"),
  "utf8",
);

test("GamePulse snapshot workflow is scheduled and cannot trigger itself", () => {
  assert.match(workflow, /schedule:\s*[\s\S]*cron:\s*["']20 23 \* \* \*["']/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s{2}push:/m);
  assert.match(workflow, /cancel-in-progress:\s*false/);
});

test("GamePulse snapshot workflow publishes only validated data and rebuilds legacy Pages", () => {
  assert.match(workflow, /permissions:\s*[\s\S]*contents:\s*write/);
  assert.match(workflow, /permissions:\s*[\s\S]*pages:\s*write/);
  assert.match(workflow, /node scripts\/update-gamepulse-snapshot\.mjs/);
  assert.match(workflow, /target="projects\/gamepulse-mini-radar\/data\/rankings\.json"/);
  assert.match(workflow, /git add -- "\$target"/);
  assert.match(workflow, /git diff --cached --check/);
  assert.match(workflow, /repos\/\$GITHUB_REPOSITORY\/pages\/builds/);
  const rebuildStep = workflow.slice(workflow.indexOf("- name: Request a legacy GitHub Pages rebuild"));
  assert.doesNotMatch(rebuildStep, /^\s*if:/m);
});
