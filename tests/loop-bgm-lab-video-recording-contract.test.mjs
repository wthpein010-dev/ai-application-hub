import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  captureWorkspacePaths,
  createCaptureWorkspace,
  parseCaptureWorkspaceArgument,
} from "../scripts/loop-bgm-lab-capture-workspace.mjs";
import {
  DEMO_REFERENCE_LICENSE,
  STORY_DURATION_MS,
  STORY_MILESTONES,
  validateRecordingMetadata,
} from "../scripts/loop-bgm-lab-video-contract.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function validMetadata() {
  const actualDurationMs = STORY_DURATION_MS + 12;
  const storyStartOffsetMs = 1_240;
  return {
    schemaVersion: 1,
    targetDurationMs: STORY_DURATION_MS,
    actualDurationMs,
    finishDriftMs: actualDurationMs - STORY_DURATION_MS,
    storyStartOffsetMs,
    storyEndOffsetMs: storyStartOffsetMs + actualDurationMs,
    externalOpenCount: 1,
    cleanupObserved: true,
    milestones: STORY_MILESTONES.map((milestone) => ({
      ...milestone,
      actualMs: milestone.scheduledMs + 12,
      driftMs: 12,
    })),
  };
}

test("checked-in synthetic reference has an honest adjacent CC0-1.0 notice", () => {
  const assetPath = join(root, "projects", "loop-bgm-lab", "assets", "demo-reference.wav");
  const noticePath = join(root, "projects", "loop-bgm-lab", "assets", "demo-reference.LICENSE.md");
  const hash = createHash("sha256").update(readFileSync(assetPath)).digest("hex").toUpperCase();
  const notice = readFileSync(noticePath, "utf8");
  const page = readFileSync(join(root, "projects", "loop-bgm-lab", "index.html"), "utf8");

  assert.deepEqual(DEMO_REFERENCE_LICENSE, {
    source: "循环乐工房内置原创合成素材",
    sourceUrl: "https://github.com/wthpein010-dev/ai-application-hub/blob/main/projects/loop-bgm-lab/assets/demo-reference.LICENSE.md",
    license: "CC0-1.0",
    sha256: "F6168016F3659617D48662CCA4D8013EB6EAC2B21F3B7E17F7D23108B4985D5F",
  });
  assert.equal(hash, DEMO_REFERENCE_LICENSE.sha256);
  assert.match(notice, /scripts\/build-loop-bgm-demo-wav\.mjs/u);
  assert.match(notice, /CC0-1\.0/u);
  assert.match(notice, new RegExp(DEMO_REFERENCE_LICENSE.sha256, "u"));
  assert.match(page, /demo-reference\.LICENSE\.md/u);
  assert.match(page, /循环乐工房内置原创合成素材/u);
  assert.doesNotMatch(notice, /OpenGameArt|original-synthetic-demo|0{64}/u);
  assert.doesNotMatch(page, /original-synthetic-demo|0{64}/u);
});

test("recording metadata proves one fixed story clock and bounded milestone drift", () => {
  assert.equal(STORY_DURATION_MS, 72_000);
  assert.deepEqual(
    STORY_MILESTONES.map(({ id, scheduledMs }) => [id, scheduledMs]),
    [
      ["reference-analysis", 7_000],
      ["style-variants", 14_000],
      ["manual-suno-boundary", 22_000],
      ["candidate-analysis", 30_000],
      ["risk-class", 39_000],
      ["license-ledger", 47_000],
      ["json-handoff", 55_000],
      ["markdown-handoff", 63_000],
    ],
  );
  assert.deepEqual(validateRecordingMetadata(validMetadata()), validMetadata());

  const lateMilestone = validMetadata();
  lateMilestone.milestones[2].actualMs = lateMilestone.milestones[2].deadlineMs + 1;
  lateMilestone.milestones[2].driftMs = lateMilestone.milestones[2].actualMs - lateMilestone.milestones[2].scheduledMs;
  assert.throws(() => validateRecordingMetadata(lateMilestone), /manual-suno-boundary.*deadline/u);

  const lateFinish = validMetadata();
  lateFinish.actualDurationMs = 72_301;
  lateFinish.finishDriftMs = 301;
  lateFinish.storyEndOffsetMs = lateFinish.storyStartOffsetMs + lateFinish.actualDurationMs;
  assert.throws(() => validateRecordingMetadata(lateFinish), /finish drift/u);
});

test("concurrent recorder runs receive isolated validated capture workspaces", async () => {
  const roots = await Promise.all([createCaptureWorkspace(), createCaptureWorkspace()]);
  try {
    assert.notEqual(roots[0], roots[1]);
    for (const rootPath of roots) {
      const paths = captureWorkspacePaths(rootPath);
      assert.equal(paths.root, rootPath);
      assert.equal(paths.rawPath, join(rootPath, "loop-bgm-lab-demo.webm"));
      assert.equal(paths.metadataPath, join(rootPath, "recording.json"));
      assert.deepEqual(parseCaptureWorkspaceArgument(["--capture-root", rootPath]), paths);
    }
    assert.throws(() => parseCaptureWorkspaceArgument([]), /--capture-root/u);
    assert.throws(() => parseCaptureWorkspaceArgument(["--capture-root", dirname(roots[0])]), /dedicated capture directory/u);
  } finally {
    await Promise.all(roots.map(rootPath => rm(rootPath, { recursive: true, force: true })));
  }
});

test("recorder and builder consume the shared provenance and measured trim contract", () => {
  const recorder = readFileSync(join(root, "scripts", "record-loop-bgm-lab-video.mjs"), "utf8");
  const builder = readFileSync(join(root, "scripts", "build-loop-bgm-lab-video.mjs"), "utf8");
  const app = readFileSync(join(root, "projects", "loop-bgm-lab", "app.js"), "utf8");

  assert.match(recorder, /DEMO_REFERENCE_LICENSE/u);
  assert.match(recorder, /createCaptureWorkspace/u);
  assert.match(recorder, /validateRecordingMetadata/u);
  assert.doesNotMatch(recorder, /OpenGameArt|original-synthetic-demo|"0"\.repeat/u);
  assert.match(builder, /validateRecordingMetadata/u);
  assert.match(builder, /parseCaptureWorkspaceArgument/u);
  assert.match(builder, /storyStartOffsetMs/u);
  assert.doesNotMatch(builder, /-sseof/u);
  assert.match(app, /SHA-256：\$\{entry\.fileSha256\}/u, "the public ledger must visibly expose the recorded hash");
});
