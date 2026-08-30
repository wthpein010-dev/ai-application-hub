import test from "node:test";
import assert from "node:assert/strict";

import { createDailyPlan } from "../projects/loop-bgm-lab/core/prompt-engine.mjs";
import * as ProjectState from "../projects/loop-bgm-lab/core/project-state.mjs";

const HASH = "b".repeat(64);

function analysis() {
  return {
    durationSeconds: 64,
    sampleRate: 44_100,
    channelCount: 2,
    peak: 0.8,
    rms: 0.2,
    tempo: { bpm: 112, confidence: 0.9 },
    key: {
      name: "D minor",
      tonic: "D",
      mode: "minor",
      confidence: 0.8,
      chroma: [0.01, 0.02, 0.24, 0.02, 0.03, 0.18, 0.02, 0.17, 0.03, 0.12, 0.02, 0.14],
    },
    spectrum: { centroidHz: 1_800, brightness: 0.4 },
    loop: {
      score: 0.88,
      components: { envelope: 0.9, chroma: 0.9, centroid: 0.85, boundary: 0.82 },
    },
    warnings: [],
  };
}

function referenceBasis() {
  return {
    durationSeconds: 64,
    rms: 0.2,
    tempo: { bpm: 112, confidence: 0.9 },
    key: { name: "D minor", tonic: "D", mode: "minor", confidence: 0.8 },
    spectrum: { brightness: 0.4 },
    loop: { score: 0.88 },
  };
}

function comparison() {
  return {
    components: {
      tempo: { available: true, weight: 0.25, score: 1, deltaBpm: 0 },
      key: { available: true, weight: 0.2, score: 1, relationship: "same-key" },
      brightness: { available: true, weight: 0.15, score: 1, delta: 0 },
      dynamics: { available: true, weight: 0.1, score: 1, delta: 0 },
      loop: { available: true, weight: 0.2, score: 1, delta: 0 },
      duration: { available: true, weight: 0.1, score: 1, deltaSeconds: 0 },
    },
    coverage: 1,
    similarity: 1,
    coreMatches: true,
  };
}

const ADVICE = {
  kind: "variant",
  changedAxis: "melodyTimbre",
  reason: "核心特征整体过近，不能把零差值虚构成某一项的最大差异。",
  adjustment: "下一轮只调整 melodyTimbre：重新设计旋律动机与配器层次，避免沿用可识别的主导轮廓，其他变量保持不变。",
};

function attachCandidate(project, {
  candidateId,
  experimentId,
  displayName,
  hash = HASH,
} = {}) {
  const batch = project.batches[0];
  const run = project.runs.find(item => item.id === batch.currentRunId);
  assert.ok(run, "the current batch must point to an archived run before a candidate can attach");
  const candidate = {
    id: candidateId,
    displayName,
    batchId: batch.id,
    hash,
    analysis: analysis(),
    referenceBasis: referenceBasis(),
    comparison: comparison(),
    similarityClass: "too-close",
    advice: ADVICE,
  };
  const experiment = {
    id: experimentId,
    runId: run.id,
    batchId: batch.id,
    candidateId,
    candidateHash: hash,
    generatedUrl: null,
    subjectiveScore: null,
    reviewNote: "",
    disposition: "unrated",
    referenceBasis: referenceBasis(),
    comparison: comparison(),
    advice: ADVICE,
    generationConditions: structuredClone(run.generationConditions),
  };
  return ProjectState.validateProject({
    ...project,
    batches: project.batches.map(item => item.id === batch.id
      ? { ...item, currentCandidateId: candidateId, candidateHash: hash }
      : item),
    candidates: [...project.candidates, candidate],
    experiments: [...project.experiments, experiment],
  });
}

test("successive same-batch generations archive distinct immutable runs and reset a changed current card", () => {
  // Break caught: rebuilding prompts keeps the first run snapshot/status/current candidate and rewrites later provenance.
  assert.equal(typeof ProjectState.rebuildPromptQueue, "function");
  let project = ProjectState.transitionBatch(createDailyPlan(), "batch-1", "submitted");
  project = attachCandidate(project, {
    candidateId: "candidate-1",
    experimentId: "experiment-1",
    displayName: "First run",
  });
  const firstRun = structuredClone(project.runs[0]);
  const laterStyle = {
    ...project.styleSpec,
    tempo: { target: 126, min: 123, max: 130 },
  };

  const rebuilt = ProjectState.rebuildPromptQueue(project, laterStyle);
  assert.equal(rebuilt.batches[0].status, "planned");
  assert.equal(rebuilt.batches[0].currentRunId, null);
  assert.equal(rebuilt.batches[0].currentCandidateId, null);
  assert.equal(rebuilt.batches[0].candidateHash, null);
  assert.equal(rebuilt.batches[0].generationConditions, null);
  assert.equal(rebuilt.batches[0].generatedUrl, null);
  assert.equal(rebuilt.batches[0].subjectiveScore, null);
  assert.equal(rebuilt.batches[0].reviewNote, "");
  assert.equal(rebuilt.batches[0].disposition, "unrated");
  assert.deepEqual(rebuilt.runs, [firstRun]);
  assert.equal(rebuilt.experiments[0].runId, firstRun.id);

  const secondSubmitted = ProjectState.transitionBatch(rebuilt, "batch-1", "submitted");
  assert.equal(secondSubmitted.runs.length, 2);
  assert.notEqual(secondSubmitted.runs[1].id, firstRun.id);
  assert.equal(firstRun.generationConditions.styleSpec.tempo.target, 112);
  assert.equal(secondSubmitted.runs[1].generationConditions.styleSpec.tempo.target, 126);
  const completed = attachCandidate(secondSubmitted, {
    candidateId: "candidate-2",
    experimentId: "experiment-2",
    displayName: "Second run",
  });
  assert.deepEqual(completed.experiments.map(item => item.runId), completed.runs.map(item => item.id));
  assert.equal(completed.experiments[0].generationConditions.styleSpec.tempo.target, 112);
  assert.equal(completed.experiments[1].generationConditions.styleSpec.tempo.target, 126);
});

test("Markdown explicitly lists every frozen run snapshot, including a submitted run without a candidate", () => {
  // Break caught: Markdown only shows mutable batch prompts, so a candidate-less submission loses its true basis.
  const submitted = ProjectState.transitionBatch(createDailyPlan(), "batch-1", "submitted");
  const restored = ProjectState.importProjectJson(ProjectState.exportProjectJson(submitted));
  const run = restored.runs[0];
  const markdown = ProjectState.exportProjectMarkdown(restored);

  assert.equal(restored.candidates.length, 0);
  assert.equal(restored.experiments.length, 0);
  assert.equal(restored.runs.length, 1);
  assert.match(markdown, /## 生成运行快照/);
  assert.match(markdown, new RegExp(`### ${run.id}`));
  assert.match(markdown, /Batch: batch-1/);
  assert.match(markdown, /Axis: baseline/);
  assert.match(markdown, /Status: submitted/);
  assert.match(markdown, /Source: https:\/\/suno\.com\/create/);
  assert.match(markdown, /Prompt: Instrumental upbeat/);
  assert.match(markdown, /Exclude: vocals/);
  assert.match(markdown, /"styleSpec"/);
  assert.match(markdown, /"target":112/);
});

test("legacy version-1 JSON migrates frozen conditions into run identities without losing the current candidate", () => {
  let current = ProjectState.transitionBatch(createDailyPlan(), "batch-1", "submitted");
  current = attachCandidate(current, {
    candidateId: "candidate-1",
    experimentId: "experiment-1",
    displayName: "Legacy candidate",
  });
  const expectedConditions = structuredClone(current.experiments[0].generationConditions);
  const legacy = structuredClone(current);
  delete legacy.runs;
  delete legacy.batches[0].currentRunId;
  delete legacy.batches[0].currentCandidateId;
  delete legacy.experiments[0].runId;

  const migrated = ProjectState.importProjectJson(JSON.stringify(legacy));

  assert.equal(migrated.runs.length, 1);
  assert.equal(migrated.batches[0].currentRunId, migrated.runs[0].id);
  assert.equal(migrated.batches[0].currentCandidateId, "candidate-1");
  assert.equal(migrated.experiments[0].runId, migrated.runs[0].id);
  assert.deepEqual(migrated.runs[0].generationConditions, expectedConditions);
});

test("encoded and prefixed secret URL parameter names are rejected across every portable boundary", () => {
  // Break caught: URLSearchParams names such as %74oken or access_token bypass raw secret-value scanning.
  const ordinary = { ...createDailyPlan(), sourceUrl: "https://example.test/song?topic=tokenization#preview=1" };
  assert.deepEqual(ProjectState.importProjectJson(ProjectState.exportProjectJson(ordinary)), ProjectState.validateProject(ordinary));
  assert.doesNotThrow(() => ProjectState.exportProjectMarkdown(ordinary));

  for (const sourceUrl of [
    "https://example.test/song?%74oken=private",
    "https://example.test/song?access_token=private",
    "https://example.test/song#%74oken=private",
    "https://example.test/song#access_token=private",
  ]) {
    const unsafe = { ...createDailyPlan(), sourceUrl };
    assert.throws(() => ProjectState.validateProject(unsafe), /secret/i, sourceUrl);
    assert.throws(() => ProjectState.importProjectJson(JSON.stringify(unsafe)), /secret/i, sourceUrl);
    assert.throws(() => ProjectState.exportProjectJson(unsafe), /secret/i, sourceUrl);
    assert.throws(() => ProjectState.exportProjectMarkdown(unsafe), /secret/i, sourceUrl);
  }
});

test("duplicate candidate hashes keep exact current-card and current-best identity by candidate ID", () => {
  // Break caught: hash-based findLast/current rendering selects the wrong candidate when two files hash identically.
  assert.equal(typeof ProjectState.rebuildPromptQueue, "function");
  let project = ProjectState.transitionBatch(createDailyPlan(), "batch-1", "submitted");
  project = attachCandidate(project, {
    candidateId: "candidate-1",
    experimentId: "experiment-1",
    displayName: "First identity",
  });
  project = ProjectState.rebuildPromptQueue(project, {
    ...project.styleSpec,
    tempo: { target: 126, min: 123, max: 130 },
  });
  project = ProjectState.transitionBatch(project, "batch-1", "submitted");
  project = attachCandidate(project, {
    candidateId: "candidate-2",
    experimentId: "experiment-2",
    displayName: "Second identity",
  });
  project = ProjectState.validateProject({
    ...project,
    currentBestCandidate: {
      candidateId: "candidate-1",
      displayName: "First identity",
      hash: HASH,
    },
  });

  assert.equal(project.candidates[0].hash, project.candidates[1].hash);
  assert.equal(project.batches[0].currentCandidateId, "candidate-2");
  assert.equal(project.batches[0].candidateHash, HASH);
  assert.equal(project.currentBestCandidate.candidateId, "candidate-1");
  assert.equal(ProjectState.importProjectJson(ProjectState.exportProjectJson(project)).batches[0].currentCandidateId, "candidate-2");
});
