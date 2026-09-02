import test from "node:test";
import assert from "node:assert/strict";

import {
  bindExperimentOutput,
  exportProjectJson,
  exportProjectMarkdown,
  importProjectJson,
  rebuildPromptQueue,
  transitionBatch,
  updateExperimentReview,
  updateRunOutputs,
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
    currentCandidateId: index === 0 ? "candidate-1" : null,
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
      candidateSource: { kind: "legacy-unknown", legacyRunId: plan.runs[0].id },
    }],
    runs: [{
      ...plan.runs[0],
      outputs: [{
        generatedUrl: "https://suno.com/song/example",
        subjectiveScore: 4,
        reviewNote: "Rejected because the hook remains too close.",
        disposition: "rejected",
      }],
    }],
    experiments: [{
      id: "experiment-1",
      runId: plan.runs[0].id,
      batchId: "batch-1",
      candidateId: "candidate-1",
      candidateHash: CANDIDATE_HASH,
      outputIndex: 0,
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
      licenseIdentifier: "CC-BY-NC-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
      evidenceUrl: "https://freesound.org/s/1/",
      evidenceCheckedAt: "2026-08-30",
      deliveryStatus: "original",
      scopeNote: "Covers the exact downloaded audio bytes.",
      rightsChainStatus: "independently-verified",
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
  const later = rebuildPromptQueue(project, laterStyle);

  const restored = importProjectJson(exportProjectJson(later));
  assert.equal(restored.batches[0].status, "planned");
  assert.equal(restored.batches[0].currentRunId, null);
  assert.equal(restored.batches[0].currentCandidateId, null);
  assert.equal(restored.runs[0].id, project.runs[0].id);
  assert.deepEqual(restored.experiments[0].generationConditions, snapshot);
  assert.match(exportProjectMarkdown(restored), /"generationConditions"/);
  assert.match(exportProjectMarkdown(restored), /around 112 BPM/);

  const missingSnapshot = structuredClone(project);
  delete missingSnapshot.experiments[0].generationConditions;
  assert.throws(() => validateProject(missingSnapshot), /generationConditions/i);
});

test("a candidate can bind to one run output and all review evidence must remain synchronized", () => {
  const project = completeProject();

  const valid = validateProject(project);
  assert.equal(valid.experiments[0].outputIndex, 0);
  const mismatchedUrl = structuredClone(project);
  mismatchedUrl.experiments[0].generatedUrl = "https://suno.com/song/different";
  assert.throws(() => validateProject(mismatchedUrl), /output|generatedUrl/i);
  const mismatchedReview = structuredClone(project);
  mismatchedReview.runs[0].outputs[0].reviewNote = "Different review";
  assert.throws(() => importProjectJson(JSON.stringify(mismatchedReview)), /output|reviewNote|experiment/i);
  const missingOutput = structuredClone(project);
  missingOutput.runs[0].outputs = [];
  assert.throws(() => validateProject(missingOutput), /outputIndex|output/i);
});

test("binding and review APIs synchronize the selected output, experiment, and current batch", () => {
  const project = completeProject();
  project.runs[0].outputs.push({
    generatedUrl: "https://suno.com/song/example-b",
    subjectiveScore: null,
    reviewNote: "",
    disposition: "unrated",
  });
  project.experiments[0].outputIndex = null;
  project.experiments[0].generatedUrl = null;
  project.experiments[0].subjectiveScore = null;
  project.experiments[0].reviewNote = "";
  project.experiments[0].disposition = "unrated";
  project.batches[0].generatedUrl = null;
  project.batches[0].subjectiveScore = null;
  project.batches[0].reviewNote = "";
  project.batches[0].disposition = "unrated";

  const bound = bindExperimentOutput(project, "experiment-1", 1);
  assert.equal(bound.experiments[0].outputIndex, 1);
  assert.equal(bound.experiments[0].generatedUrl, "https://suno.com/song/example-b");
  assert.equal(bound.batches[0].generatedUrl, "https://suno.com/song/example-b");

  const reviewed = updateExperimentReview(bound, "experiment-1", {
    subjectiveScore: 5,
    reviewNote: "Best loop of this Create pair.",
    disposition: "accepted",
  });
  assert.equal(reviewed.runs[0].outputs[1].subjectiveScore, 5);
  assert.equal(reviewed.experiments[0].reviewNote, "Best loop of this Create pair.");
  assert.equal(reviewed.batches[0].disposition, "accepted");

  const outputEdited = updateRunOutputs(reviewed, reviewed.runs[0].id, [
    reviewed.runs[0].outputs[0],
    {
      generatedUrl: "https://suno.com/song/example-b-final",
      subjectiveScore: 3,
      reviewNote: "The revised link is usable but less lively.",
      disposition: "accepted",
    },
  ]);
  assert.equal(outputEdited.experiments[0].generatedUrl, "https://suno.com/song/example-b-final");
  assert.equal(outputEdited.experiments[0].subjectiveScore, 3);
  assert.equal(outputEdited.batches[0].reviewNote, "The revised link is usable but less lively.");

  const unbound = bindExperimentOutput(outputEdited, "experiment-1", null);
  assert.equal(unbound.experiments[0].outputIndex, null);
});

test("reviewing one bound candidate synchronizes every experiment bound to the same output", () => {
  const project = completeProject();
  const secondHash = "d".repeat(64);
  project.candidates.push({
    ...project.candidates[0],
    id: "candidate-2",
    displayName: "Candidate B",
    hash: secondHash,
  });
  project.experiments.push({
    ...project.experiments[0],
    id: "experiment-2",
    candidateId: "candidate-2",
    candidateHash: secondHash,
  });

  const reviewed = updateExperimentReview(project, "experiment-2", {
    subjectiveScore: 2,
    reviewNote: "Both imports point to the same weak output.",
    disposition: "rejected",
  });

  assert.equal(reviewed.runs[0].outputs[0].subjectiveScore, 2);
  assert.equal(reviewed.experiments[0].reviewNote, "Both imports point to the same weak output.");
  assert.equal(reviewed.experiments[1].reviewNote, "Both imports point to the same weak output.");
  assert.equal(reviewed.batches[0].subjectiveScore, 2);
});

test("schema v1 migration preserves runs and reviews without inventing output bindings", () => {
  const legacy = structuredClone(completeProject());
  legacy.version = 1;
  legacy.runs[0].generatedUrl = legacy.runs[0].outputs[0].generatedUrl;
  delete legacy.runs[0].outputs;
  delete legacy.experiments[0].outputIndex;

  const restored = importProjectJson(JSON.stringify(legacy));
  assert.equal(restored.version, 3);
  assert.equal(restored.styleSpec.version, 1);
  assert.deepEqual(restored.runs[0].outputs[0], {
    generatedUrl: "https://suno.com/song/example",
    subjectiveScore: 4,
    reviewNote: "Rejected because the hook remains too close.",
    disposition: "rejected",
  });
  assert.equal(Object.hasOwn(restored.experiments[0], "outputIndex"), false);
  assert.equal(Object.hasOwn(restored.runs[0], "generatedUrl"), false);

  const oldest = structuredClone(legacy);
  delete oldest.runs;
  delete oldest.experiments[0].runId;
  const restoredOldest = importProjectJson(JSON.stringify(oldest));
  assert.equal(restoredOldest.runs.length, 1);
  assert.equal(restoredOldest.experiments[0].runId, restoredOldest.runs[0].id);
  assert.equal(Object.hasOwn(restoredOldest.experiments[0], "outputIndex"), false);
});

test("schema v1 migration rejects a third unique legacy output instead of truncating evidence", () => {
  const legacy = structuredClone(completeProject());
  legacy.version = 1;
  legacy.runs[0].generatedUrl = "https://suno.com/song/from-run";
  delete legacy.runs[0].outputs;
  delete legacy.experiments[0].outputIndex;
  legacy.experiments[0].generatedUrl = "https://suno.com/song/from-experiment";
  legacy.batches[0].generatedUrl = "https://suno.com/song/from-batch";

  assert.throws(
    () => importProjectJson(JSON.stringify(legacy)),
    /more than two unique|超过两个/i,
  );
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

test("schema version 3 validates every known persisted structure and cross-field identity invariant", () => {
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

test("portable boundaries reject future official API secrets while accepting public readiness metadata", () => {
  const unsafeFutureApiFixtures = [
    { authorization: "Bearer should-not-persist" },
    { "Proxy-Authorization": "Basic should-not-persist" },
    { api_secret: "should-not-persist" },
    { clientSecret: "should-not-persist" },
    { sessionSecret: "should-not-persist" },
    { headers: { Authorization: "Bearer nested-secret" } },
  ];

  for (const futureApi of unsafeFutureApiFixtures) {
    const unsafe = structuredClone(createDailyPlan());
    unsafe.extensions = { futureApi: { nested: [futureApi] } };

    assert.throws(() => validateProject(unsafe), /secret|forbidden/i);
    assert.throws(() => exportProjectJson(unsafe), /secret|forbidden/i);
    assert.throws(() => exportProjectMarkdown(unsafe), /secret|forbidden/i);
  }

  const safe = structuredClone(createDailyPlan());
  safe.extensions = {
    futureApi: {
      authenticationDocumented: false,
      officialEvidenceUrl: "https://platform.suno.com/",
      sourceHeadersVerifiedAt: "2026-09-01",
      contractVersion: "public-v1",
    },
  };

  assert.doesNotThrow(() => validateProject(safe));
  assert.doesNotThrow(() => exportProjectJson(safe));
  assert.doesNotThrow(() => exportProjectMarkdown(safe));
});
