export const DEMO_REFERENCE_LICENSE = Object.freeze({
  source: "循环乐工房内置原创合成素材",
  sourceUrl: "https://github.com/wthpein010-dev/ai-application-hub/blob/main/projects/loop-bgm-lab/assets/demo-reference.LICENSE.md",
  license: "CC0-1.0",
  sha256: "F6168016F3659617D48662CCA4D8013EB6EAC2B21F3B7E17F7D23108B4985D5F",
});

export const STORY_DURATION_MS = 72_000;
export const STORY_FINISH_TOLERANCE_MS = 250;

export const STORY_MILESTONES = Object.freeze([
  { id: "reference-analysis", scheduledMs: 7_000, deadlineMs: 7_750 },
  { id: "style-variants", scheduledMs: 14_000, deadlineMs: 14_750 },
  { id: "manual-suno-boundary", scheduledMs: 22_000, deadlineMs: 22_750 },
  { id: "candidate-analysis", scheduledMs: 30_000, deadlineMs: 30_750 },
  { id: "risk-class", scheduledMs: 39_000, deadlineMs: 39_750 },
  { id: "license-ledger", scheduledMs: 47_000, deadlineMs: 47_750 },
  { id: "json-handoff", scheduledMs: 55_000, deadlineMs: 55_750 },
  { id: "markdown-handoff", scheduledMs: 63_000, deadlineMs: 63_750 },
].map(Object.freeze));

function requireFiniteNumber(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
}

export function validateRecordingMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") throw new Error("recording metadata must be an object");
  if (metadata.schemaVersion !== 1) throw new Error("recording metadata schemaVersion must be 1");
  if (metadata.targetDurationMs !== STORY_DURATION_MS) throw new Error("recording target duration must be 72000 ms");
  requireFiniteNumber(metadata.actualDurationMs, "actualDurationMs");
  requireFiniteNumber(metadata.finishDriftMs, "finishDriftMs");
  if (Math.abs(metadata.finishDriftMs) > STORY_FINISH_TOLERANCE_MS) {
    throw new Error(`recording finish drift ${metadata.finishDriftMs} ms exceeds ${STORY_FINISH_TOLERANCE_MS} ms`);
  }
  if (metadata.finishDriftMs !== metadata.actualDurationMs - STORY_DURATION_MS) {
    throw new Error("finishDriftMs must match actualDurationMs - targetDurationMs");
  }
  requireFiniteNumber(metadata.storyStartOffsetMs, "storyStartOffsetMs");
  requireFiniteNumber(metadata.storyEndOffsetMs, "storyEndOffsetMs");
  if (metadata.storyStartOffsetMs < 0) throw new Error("storyStartOffsetMs cannot be negative");
  if (Math.abs(metadata.storyEndOffsetMs - metadata.storyStartOffsetMs - metadata.actualDurationMs) > 2) {
    throw new Error("story clock offsets do not match actualDurationMs");
  }
  if (metadata.externalOpenCount !== 1) throw new Error("recorder must intercept exactly one external open");
  if (metadata.cleanupObserved !== true) throw new Error("recorder must observe unload cleanup before teardown");
  if (!Array.isArray(metadata.milestones) || metadata.milestones.length !== STORY_MILESTONES.length) {
    throw new Error("recording metadata must include every story milestone");
  }

  for (let index = 0; index < STORY_MILESTONES.length; index += 1) {
    const expected = STORY_MILESTONES[index];
    const actual = metadata.milestones[index];
    if (!actual || actual.id !== expected.id || actual.scheduledMs !== expected.scheduledMs || actual.deadlineMs !== expected.deadlineMs) {
      throw new Error(`recording milestone ${expected.id} does not match the story schedule`);
    }
    requireFiniteNumber(actual.actualMs, `${expected.id}.actualMs`);
    requireFiniteNumber(actual.driftMs, `${expected.id}.driftMs`);
    if (actual.actualMs < expected.scheduledMs - 25 || actual.actualMs > expected.deadlineMs) {
      throw new Error(`recording milestone ${expected.id} missed its deadline window`);
    }
    if (actual.driftMs !== actual.actualMs - expected.scheduledMs) {
      throw new Error(`recording milestone ${expected.id} drift is inconsistent`);
    }
  }
  return metadata;
}
