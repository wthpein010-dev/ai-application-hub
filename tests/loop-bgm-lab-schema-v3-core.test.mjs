import test from "node:test";
import assert from "node:assert/strict";

import {
  confirmLegacyCandidateSource,
  exportProjectJson,
  importProjectJson,
  recordCreateRun,
  updateExperimentReview,
  updateRunOutputs,
  validateProject,
} from "../projects/loop-bgm-lab/core/project-state.mjs";
import {
  compareCandidate,
  recommendNextVariant,
  validateLicenseEntry,
} from "../projects/loop-bgm-lab/core/candidate-score.mjs";
import { createDailyPlan } from "../projects/loop-bgm-lab/core/prompt-engine.mjs";
import {
  exportProjectHandoffMarkdown,
  importProjectDocument,
} from "../projects/loop-bgm-lab/core/portable-handoff.mjs";

const CANDIDATE_HASH = "b".repeat(64);
const LICENSE_HASH = CANDIDATE_HASH;

function analysisFixture() {
  return {
    durationSeconds: 64,
    sampleRate: 44100,
    channelCount: 2,
    peak: 0.8,
    rms: 0.2,
    tempo: { bpm: 112, confidence: 0.9 },
    key: { name: "D minor", tonic: "D", mode: "minor", confidence: 0.8, chroma: [0.01, 0.02, 0.24, 0.02, 0.03, 0.18, 0.02, 0.17, 0.03, 0.12, 0.02, 0.14] },
    spectrum: { centroidHz: 1800, brightness: 0.4 },
    loop: { score: 0.88, components: { envelope: 0.9, chroma: 0.9, centroid: 0.85, boundary: 0.82 } },
    warnings: [],
  };
}

function referenceBasisFixture() {
  const analysis = analysisFixture();
  return {
    durationSeconds: analysis.durationSeconds,
    rms: analysis.rms,
    tempo: analysis.tempo,
    key: { name: analysis.key.name, tonic: analysis.key.tonic, mode: analysis.key.mode, confidence: analysis.key.confidence },
    spectrum: { brightness: analysis.spectrum.brightness },
    loop: { score: analysis.loop.score },
  };
}

function candidateFixture(candidateSource) {
  const analysis = analysisFixture();
  const referenceBasis = referenceBasisFixture();
  const comparison = compareCandidate(referenceBasis, analysis);
  return {
    id: "candidate-1",
    displayName: "Candidate 1",
    batchId: "batch-1",
    hash: CANDIDATE_HASH,
    analysis,
    referenceBasis,
    comparison,
    similarityClass: "too-close",
    advice: recommendNextVariant(comparison),
    candidateSource,
  };
}

function experimentFixture(candidate, overrides = {}) {
  return {
    id: "experiment-1",
    runId: null,
    batchId: candidate.batchId,
    candidateId: candidate.id,
    candidateHash: candidate.hash,
    generatedUrl: null,
    subjectiveScore: null,
    reviewNote: "",
    disposition: "unrated",
    referenceBasis: candidate.referenceBasis,
    comparison: candidate.comparison,
    advice: candidate.advice,
    generationConditions: null,
    outputIndex: null,
    ...overrides,
  };
}

function licenseFixture(overrides = {}) {
  return {
    id: "license-1",
    source: "OpenGameArt",
    sourceUrl: "https://opengameart.org/content/example",
    license: "CC BY 4.0",
    licenseIdentifier: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    evidenceUrl: "https://opengameart.org/content/example",
    evidenceCheckedAt: "2026-09-02",
    deliveryStatus: "original",
    scopeNote: "Covers the exact downloaded audio bytes.",
    rightsChainStatus: "independently-verified",
    fileSha256: LICENSE_HASH,
    attributionText: "Example by Example Author, CC BY 4.0",
    author: "Example Author",
    downloadedAt: "2026-09-02",
    ...overrides,
  };
}

function externalProject(kind = "external") {
  const project = createDailyPlan();
  const license = licenseFixture(kind === "local-original"
    ? { rightsChainStatus: "user-declared-original" }
    : {});
  const candidate = candidateFixture({
    kind,
    licenseId: license.id,
    fileSha256: license.fileSha256,
  });
  return {
    ...project,
    candidates: [candidate],
    experiments: [experimentFixture(candidate)],
    licenses: [license],
  };
}

function sunoProject() {
  let project = recordCreateRun(createDailyPlan(), "batch-1");
  project = updateRunOutputs(project, project.runs[0].id, [{
    generatedUrl: "https://suno.com/song/example",
    subjectiveScore: 4,
    reviewNote: "Good direction",
    disposition: "accepted",
  }]);
  const run = project.runs[0];
  const candidate = candidateFixture({ kind: "suno", runId: run.id, outputIndex: 0 });
  const experiment = experimentFixture(candidate, {
    runId: run.id,
    outputIndex: 0,
    generatedUrl: run.outputs[0].generatedUrl,
    subjectiveScore: run.outputs[0].subjectiveScore,
    reviewNote: run.outputs[0].reviewNote,
    disposition: run.outputs[0].disposition,
    generationConditions: run.generationConditions,
  });
  return {
    ...project,
    batches: project.batches.map(batch => batch.id === candidate.batchId ? {
      ...batch,
      currentCandidateId: candidate.id,
      candidateHash: candidate.hash,
      generatedUrl: experiment.generatedUrl,
      subjectiveScore: experiment.subjectiveScore,
      reviewNote: experiment.reviewNote,
      disposition: experiment.disposition,
    } : batch),
    candidates: [candidate],
    experiments: [experiment],
  };
}

function legacyProject() {
  const project = sunoProject();
  project.candidates[0].candidateSource = {
    kind: "legacy-unknown",
    legacyRunId: project.runs[0].id,
  };
  return validateProject(project);
}

test("new projects use schema v3 and strict candidateSource variants survive JSON and Markdown round trips", async () => {
  assert.equal(createDailyPlan().version, 3);

  for (const kind of ["external", "local-original"]) {
    const project = externalProject(kind);
    const validated = validateProject(project);
    assert.deepEqual(validated.candidates[0].candidateSource, {
      kind,
      licenseId: "license-1",
      fileSha256: LICENSE_HASH,
    });
    assert.deepEqual(importProjectJson(exportProjectJson(project)), validated);
    assert.deepEqual((await importProjectDocument(await exportProjectHandoffMarkdown(project))).project, validated);
  }
});

test("schema v2 migration marks every candidate legacy-unknown without inferring Suno", () => {
  const legacy = structuredClone(sunoProject());
  legacy.version = 2;
  delete legacy.candidates[0].candidateSource;

  const restored = importProjectJson(JSON.stringify(legacy));
  assert.equal(restored.version, 3);
  assert.deepEqual(restored.candidates[0].candidateSource, {
    kind: "legacy-unknown",
    legacyRunId: legacy.experiments[0].runId,
  });
  assert.notEqual(restored.candidates[0].candidateSource.kind, "suno");
});

test("schema v3 rejects future versions and candidateSource fields outside the selected variant", () => {
  const future = { ...createDailyPlan(), version: 4 };
  assert.throws(() => importProjectJson(JSON.stringify(future)), /version|future/i);

  const project = externalProject();
  project.candidates[0].candidateSource.runId = "run-1";
  assert.throws(() => validateProject(project), /candidateSource|unsupported/i);
});

test("external and local-original candidates require an existing license with an exact file hash match", () => {
  for (const kind of ["external", "local-original"]) {
    const missingLicense = externalProject(kind);
    missingLicense.candidates[0].candidateSource.licenseId = "license-missing";
    assert.throws(() => validateProject(missingLicense), /licenseId.*existing license/i);

    const wrongHash = externalProject(kind);
    wrongHash.candidates[0].candidateSource.fileSha256 = "c".repeat(64);
    assert.throws(() => validateProject(wrongHash), /fileSha256.*license/i);
  }
});

test("Suno candidates bind exactly to their experiment run and output", () => {
  assert.doesNotThrow(() => validateProject(sunoProject()));

  const wrongRun = sunoProject();
  wrongRun.candidates[0].candidateSource.runId = "run-missing";
  assert.throws(() => validateProject(wrongRun), /candidateSource.*runId|existing run/i);

  const wrongOutput = sunoProject();
  wrongOutput.candidates[0].candidateSource.outputIndex = 1;
  assert.throws(() => validateProject(wrongOutput), /candidateSource.*outputIndex|existing run output/i);

  const mismatchedExperiment = sunoProject();
  mismatchedExperiment.experiments[0].outputIndex = null;
  assert.throws(() => validateProject(mismatchedExperiment), /candidateSource|experiment|outputIndex/i);
});

test("license derivation distinguishes ShareAlike and blocks SA, ND, preview-only, unknown, and NC publication", () => {
  const fixtures = [
    ["CC0 1.0", { licenseIdentifier: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" }, "cc0", [], false],
    ["CC BY 4.0", { licenseIdentifier: "CC-BY-4.0" }, "cc-by", [], false],
    ["CC BY-SA 4.0", { licenseIdentifier: "CC-BY-SA-4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" }, "cc-by-sa", ["share-alike-review-required"], true],
    ["CC BY-NC-SA 4.0", { licenseIdentifier: "CC-BY-NC-SA-4.0", licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/" }, "cc-by-nc-sa", ["noncommercial", "share-alike-review-required"], true],
    ["CC BY-ND 4.0", { licenseIdentifier: "CC-BY-ND-4.0", licenseUrl: "https://creativecommons.org/licenses/by-nd/4.0/" }, "cc-by-nd", ["no-derivatives-review-required"], true],
    ["CC BY 4.0", { licenseIdentifier: "CC-BY-4.0", deliveryStatus: "preview-only" }, "cc-by", ["preview-only"], true],
    ["Custom License", { licenseIdentifier: "LicenseRef-Unknown", licenseUrl: null }, "unknown", ["unknown-license", "missing-evidence"], true],
  ];

  for (const [license, extra, category, blockers, publicationBlocked] of fixtures) {
    const entry = validateLicenseEntry(licenseFixture({ license, ...extra }));
    assert.equal(entry.category, category, license);
    assert.deepEqual(entry.publicationBlockers, blockers, license);
    assert.equal(entry.publicationBlocked, publicationBlocked, license);
    assert.equal(entry.licenseFlags.sa, blockers.includes("share-alike-review-required"), license);
    assert.equal(entry.licenseFlags.nd, blockers.includes("no-derivatives-review-required"), license);
    assert.equal(entry.licenseFlags.previewOnly, blockers.includes("preview-only"), license);
  }
});

test("external experiments allow null Suno evidence and review updates never mutate a Suno batch", () => {
  const project = validateProject(externalProject());
  const beforeBatches = structuredClone(project.batches);

  const reviewed = updateExperimentReview(project, "experiment-1", {
    subjectiveScore: 3,
    reviewNote: "Useful external direction",
    disposition: "accepted",
  });

  assert.deepEqual(reviewed.batches, beforeBatches);
  assert.equal(reviewed.experiments[0].runId, null);
  assert.equal(reviewed.experiments[0].outputIndex, null);
  assert.equal(reviewed.experiments[0].generatedUrl, null);
  assert.equal(reviewed.experiments[0].generationConditions, null);
  assert.equal(reviewed.experiments[0].subjectiveScore, 3);

  for (const [field, value] of [
    ["runId", "run-1"],
    ["outputIndex", 0],
    ["generatedUrl", "https://suno.com/song/not-external"],
    ["generationConditions", sunoProject().runs[0].generationConditions],
  ]) {
    const invalid = externalProject();
    invalid.experiments[0][field] = value;
    assert.throws(() => validateProject(invalid), /external|local-original|must be null/i, field);
  }
});

test("explicit legacy confirmation can bind an exact Suno run output without mutating its input", () => {
  const original = legacyProject();
  const snapshot = structuredClone(original);
  const run = original.runs[0];

  const confirmed = confirmLegacyCandidateSource(original, "candidate-1", {
    kind: "suno",
    runId: run.id,
    outputIndex: 0,
  });

  assert.deepEqual(original, snapshot);
  assert.deepEqual(confirmed.candidates[0].candidateSource, {
    kind: "suno",
    runId: run.id,
    outputIndex: 0,
  });
  assert.equal(confirmed.experiments[0].runId, run.id);
  assert.equal(confirmed.experiments[0].outputIndex, 0);
  assert.equal(confirmed.experiments[0].generatedUrl, run.outputs[0].generatedUrl);
  assert.deepEqual(confirmed.experiments[0].generationConditions, run.generationConditions);
  assert.equal(confirmed.batches[0].currentRunId, run.id);
  assert.equal(confirmed.batches[0].currentCandidateId, "candidate-1");
});

test("explicit legacy confirmation can convert to external or local evidence and clears only current Suno mirrors", () => {
  for (const kind of ["external", "local-original"]) {
    const original = legacyProject();
    original.licenses.push(licenseFixture(kind === "local-original"
      ? { rightsChainStatus: "user-declared-original" }
      : {}));
    const validated = validateProject(original);
    const snapshot = structuredClone(validated);

    const confirmed = confirmLegacyCandidateSource(validated, "candidate-1", {
      kind,
      licenseId: "license-1",
      fileSha256: CANDIDATE_HASH,
    });

    assert.deepEqual(validated, snapshot, `${kind} input mutation`);
    assert.deepEqual(confirmed.candidates[0].candidateSource, {
      kind,
      licenseId: "license-1",
      fileSha256: CANDIDATE_HASH,
    });
    assert.deepEqual(
      Object.fromEntries(["runId", "outputIndex", "generatedUrl", "generationConditions"]
        .map(field => [field, confirmed.experiments[0][field]])),
      { runId: null, outputIndex: null, generatedUrl: null, generationConditions: null },
    );
    assert.equal(confirmed.experiments[0].subjectiveScore, 4);
    assert.equal(confirmed.experiments[0].disposition, "accepted");
    assert.deepEqual(confirmed.runs, validated.runs);
    assert.equal(confirmed.batches[0].status, "planned");
    assert.equal(confirmed.batches[0].currentRunId, null);
    assert.equal(confirmed.batches[0].currentCandidateId, null);
    assert.equal(confirmed.batches[0].candidateHash, null);
    assert.equal(confirmed.batches[0].generatedUrl, null);
    assert.equal(confirmed.batches[0].subjectiveScore, null);
    assert.equal(confirmed.batches[0].reviewNote, "");
    assert.equal(confirmed.batches[0].disposition, "unrated");
  }
});

test("legacy confirmation rejects guessed, mismatched, or repeated provenance with zero input mutation", () => {
  const project = legacyProject();
  project.licenses.push(licenseFixture());
  const validated = validateProject(project);

  const invalidConfirmations = [
    { kind: "suno", runId: "run-missing", outputIndex: 0 },
    { kind: "suno", runId: validated.runs[0].id, outputIndex: 1 },
    { kind: "external", licenseId: "license-1", fileSha256: "c".repeat(64) },
    { kind: "external", licenseId: "license-missing", fileSha256: CANDIDATE_HASH },
    { kind: "legacy-unknown", legacyRunId: validated.runs[0].id },
  ];

  for (const confirmation of invalidConfirmations) {
    const snapshot = structuredClone(validated);
    assert.throws(
      () => confirmLegacyCandidateSource(validated, "candidate-1", confirmation),
      /confirmation|candidateSource|run|output|license|hash|legacy/i,
    );
    assert.deepEqual(validated, snapshot);
  }

  const once = confirmLegacyCandidateSource(validated, "candidate-1", {
    kind: "external",
    licenseId: "license-1",
    fileSha256: CANDIDATE_HASH,
  });
  assert.throws(
    () => confirmLegacyCandidateSource(once, "candidate-1", {
      kind: "external",
      licenseId: "license-1",
      fileSha256: CANDIDATE_HASH,
    }),
    /only legacy-unknown|already confirmed/i,
  );
});
