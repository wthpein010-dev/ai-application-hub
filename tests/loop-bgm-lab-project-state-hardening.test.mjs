import test from "node:test";
import assert from "node:assert/strict";

import {
  exportProjectJson,
  exportProjectMarkdown,
  importProjectJson,
  transitionBatch,
  validateProject,
} from "../projects/loop-bgm-lab/core/project-state.mjs";
import { createDailyPlan } from "../projects/loop-bgm-lab/core/prompt-engine.mjs";
import { recommendNextVariant } from "../projects/loop-bgm-lab/core/candidate-score.mjs";

const REFERENCE_HASH = "a".repeat(64);
const CANDIDATE_HASH = "b".repeat(64);

function analysis({ bpm = 112, tempoConfidence = 0.9, keyConfidence = 0.8 } = {}) {
  return {
    durationSeconds: 64,
    sampleRate: 44_100,
    channelCount: 2,
    peak: 0.8,
    rms: 0.2,
    tempo: { bpm, confidence: tempoConfidence },
    key: {
      name: "D minor",
      tonic: "D",
      mode: "minor",
      confidence: keyConfidence,
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

function referenceBasis(options) {
  const value = analysis(options);
  return {
    durationSeconds: value.durationSeconds,
    rms: value.rms,
    tempo: value.tempo,
    key: {
      name: value.key.name,
      tonic: value.key.tonic,
      mode: value.key.mode,
      confidence: value.key.confidence,
    },
    spectrum: { brightness: value.spectrum.brightness },
    loop: { score: value.loop.score },
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

function advice() {
  return recommendNextVariant(comparison());
}

function completeProject() {
  const plan = transitionBatch(createDailyPlan(), "batch-1", "submitted");
  const batches = plan.batches.map((batch, index) => ({
    ...batch,
    generatedUrl: index === 0 ? "https://suno.com/song/example" : null,
    candidateHash: index === 0 ? CANDIDATE_HASH : null,
    subjectiveScore: index === 0 ? 4 : null,
    nextRoundNote: index === 0 ? "Change the melodic motif." : "",
    reviewNote: index === 0 ? "Rejected because the hook remains too close." : "",
    disposition: index === 0 ? "rejected" : "unrated",
  }));
  const candidateComparison = comparison();
  const candidateAdvice = advice();
  const frozenReferenceBasis = referenceBasis();
  const generationConditions = structuredClone(plan.batches[0].generationConditions);
  return {
    ...plan,
    sourceUrl: "https://suno.com/create",
    batches,
    references: [{ id: "reference-1", displayName: "Reference A", hash: REFERENCE_HASH, analysis: analysis() }],
    candidates: [{
      id: "candidate-1",
      displayName: "Candidate A",
      batchId: "batch-1",
      hash: CANDIDATE_HASH,
      analysis: analysis(),
      referenceBasis: frozenReferenceBasis,
      comparison: candidateComparison,
      similarityClass: "too-close",
      advice: candidateAdvice,
    }],
    experiments: [{
      id: "experiment-1",
      batchId: "batch-1",
      candidateId: "candidate-1",
      candidateHash: CANDIDATE_HASH,
      generatedUrl: "https://suno.com/song/example",
      subjectiveScore: 4,
      reviewNote: "Rejected because the hook remains too close.",
      disposition: "rejected",
      referenceBasis: frozenReferenceBasis,
      comparison: candidateComparison,
      advice: candidateAdvice,
      generationConditions,
    }],
    licenses: [{
      id: "license-1",
      source: "Freesound",
      sourceUrl: "https://freesound.org/s/1/",
      license: "CC BY-NC 4.0",
      fileSha256: "c".repeat(64),
      author: "Example Artist",
      downloadedAt: "2026-08-30",
      attributionText: "Example Artist — CC BY-NC 4.0",
    }],
    currentBestCandidate: { candidateId: "candidate-1", displayName: "Candidate A", hash: CANDIDATE_HASH },
    outstandingIssues: ["Replace the recognizable hook."],
    nextRoundSuggestion: candidateAdvice,
  };
}

test("validation rejects a fabricated too-close comparison against a 112 BPM frozen reference", () => {
  // Break caught: a portable payload can claim a self-consistent zero tempo delta instead of deriving it from evidence.
  const forged = structuredClone(completeProject());
  forged.candidates[0].analysis.tempo.bpm = 999;

  assert.throws(() => validateProject(forged), /comparison|reference/i);
  assert.throws(() => importProjectJson(JSON.stringify(forged)), /comparison|reference/i);
});

test("durable experiments preserve frozen generation conditions after current batches are rebuilt", () => {
  // Break caught: rebuilding prompt batches overwrites an already reviewed run's original prompt or style conditions.
  const project = completeProject();
  const snapshot = structuredClone(project.experiments[0].generationConditions);
  const laterStyle = {
    ...project.styleSpec,
    tempo: { target: 130, min: 127, max: 134 },
    structure: { ...project.styleSpec.structure, bars: 32 },
  };
  const later = {
    ...project,
    styleSpec: laterStyle,
    credits: createDailyPlan({ styleSpec: laterStyle }).credits,
    batches: createDailyPlan({ styleSpec: laterStyle }).batches.map((batch, index) => index === 0
      ? { ...batch, status: "submitted", generationConditions: snapshot }
      : batch),
  };

  const restored = importProjectJson(exportProjectJson(later));
  assert.deepEqual(restored.experiments[0].generationConditions, snapshot);
  assert.match(exportProjectMarkdown(restored), /"generationConditions"/);
  assert.match(exportProjectMarkdown(restored), /around 112 BPM/);

  const missingSnapshot = structuredClone(project);
  delete missingSnapshot.experiments[0].generationConditions;
  assert.throws(() => validateProject(missingSnapshot), /generationConditions/i);
});

test("portable safety rejects normalized secret-key variants and HTTPS userinfo through every persistence boundary", () => {
  const project = createDailyPlan();
  const forbiddenKeys = ["api_key", "api-key", "API KEY", "recovery_key", "recovery-key", "session-id"];

  for (const key of forbiddenKeys) {
    const unsafe = { ...project, extensions: { [key]: "private" } };
    assert.throws(() => validateProject(unsafe), /forbidden key/i, key);
    assert.throws(() => importProjectJson(JSON.stringify(unsafe)), /forbidden key/i, key);
    assert.throws(() => exportProjectJson(unsafe), /forbidden key/i, key);
    assert.throws(() => exportProjectMarkdown(unsafe), /forbidden key/i, key);
  }

  for (const sourceUrl of [
    "https://user@example.test/source",
    "https://user:password@example.test/source",
  ]) {
    const unsafe = { ...project, sourceUrl };
    assert.throws(() => validateProject(unsafe), /credentials|userinfo/i);
    assert.throws(() => importProjectJson(JSON.stringify(unsafe)), /credentials|userinfo/i);
    assert.throws(() => exportProjectJson(unsafe), /credentials|userinfo/i);
    assert.throws(() => exportProjectMarkdown(unsafe), /credentials|userinfo/i);
  }
});

test("version 1 validates every known persisted structure and cross-field identity invariant", () => {
  const project = completeProject();
  assert.deepEqual(importProjectJson(exportProjectJson(project)), validateProject(project));

  const malformed = [
    { name: "reference id", value: { ...project, references: [{ ...project.references[0], id: 42 }] } },
    { name: "reference hash", value: { ...project, references: [{ ...project.references[0], hash: "short" }] } },
    { name: "analysis", value: { ...project, references: [{ ...project.references[0], analysis: { ...project.references[0].analysis, tempo: { bpm: 112, confidence: "high" } } }] } },
    { name: "candidate batch", value: { ...project, candidates: [{ ...project.candidates[0], batchId: "missing-batch" }] } },
    { name: "candidate comparison", value: { ...project, candidates: [{ ...project.candidates[0], comparison: { similarity: 1 } }] } },
    { name: "candidate advice", value: { ...project, candidates: [{ ...project.candidates[0], advice: { ...project.candidates[0].advice, changedAxis: "everything" } }] } },
    { name: "derived similarity class", value: { ...project, candidates: [{ ...project.candidates[0], similarityClass: "distinct" }] } },
    {
      name: "derived advice",
      value: {
        ...project,
        candidates: [{ ...project.candidates[0], advice: { changedAxis: "rhythm", reason: "Valid but inconsistent.", adjustment: "Only change rhythm." } }],
        experiments: [{ ...project.experiments[0], advice: { changedAxis: "rhythm", reason: "Valid but inconsistent.", adjustment: "Only change rhythm." } }],
      },
    },
    {
      name: "analysis confidence versus comparison availability",
      value: {
        ...project,
        candidates: [{ ...project.candidates[0], analysis: analysis({ tempoConfidence: 0.29 }) }],
      },
    },
    { name: "experiment candidate", value: { ...project, experiments: [{ ...project.experiments[0], candidateId: "missing-candidate" }] } },
    { name: "experiment hash", value: { ...project, experiments: [{ ...project.experiments[0], candidateHash: REFERENCE_HASH }] } },
    { name: "generation snapshot prompt", value: { ...project, experiments: [{ ...project.experiments[0], generationConditions: { ...project.experiments[0].generationConditions, prompt: "fabricated historical prompt" } }] } },
    { name: "batch experiment evidence", value: { ...project, batches: project.batches.map((batch, index) => index === 0 ? { ...batch, generatedUrl: "https://suno.com/song/different" } : batch) } },
    { name: "credit multiplication", value: { ...project, credits: { ...project.credits, planned: 49 } } },
    { name: "credit sum", value: { ...project, batches: project.batches.map((batch, index) => index === 4 ? { ...batch, credits: 9 } : batch) } },
    { name: "duplicate ids", value: { ...project, candidates: [project.candidates[0], { ...project.candidates[0], hash: "d".repeat(64) }] } },
    { name: "best identity", value: { ...project, currentBestCandidate: { ...project.currentBestCandidate, hash: REFERENCE_HASH } } },
    { name: "calendar date", value: { ...project, ruleCheckedAt: "2026-02-30" } },
    { name: "known nested field", value: { ...project, candidates: [{ ...project.candidates[0], surprise: true }] } },
  ];

  for (const { name, value } of malformed) {
    assert.throws(() => validateProject(value), undefined, name);
    assert.throws(() => importProjectJson(JSON.stringify(value)), undefined, name);
  }
});

test("Markdown handoff preserves generation evidence, experiment history, and explicit rejection reasoning", () => {
  const markdown = exportProjectMarkdown(completeProject());

  assert.match(markdown, /Generated URL: https:\/\/suno\.com\/song\/example/);
  assert.match(markdown, /## 实验历史/);
  assert.match(markdown, /experiment-1/);
  assert.match(markdown, /Rejected because the hook remains too close\./);
  assert.match(markdown, /Disposition: rejected/);
  assert.match(markdown, /Change the melodic motif\./);
});
