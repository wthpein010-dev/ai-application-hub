import test from "node:test";
import assert from "node:assert/strict";

import {
  classifySimilarity,
  compareCandidate,
  createExperimentRecord,
  recommendNextVariant,
  validateLicenseEntry
} from "../projects/loop-bgm-lab/core/candidate-score.mjs";
import { importProjectJson, validateProject } from "../projects/loop-bgm-lab/core/project-state.mjs";
import { createDailyPlan } from "../projects/loop-bgm-lab/core/prompt-engine.mjs";

const reference = {
  durationSeconds: 60,
  rms: 0.2,
  tempo: { bpm: 120, confidence: 0.9 },
  key: { name: "D minor", tonic: "D", mode: "minor", confidence: 0.8 },
  spectrum: { brightness: 0.5 },
  loop: { score: 0.8 }
};

test("compareCandidate reports hand-derived component scores, deltas, weights, and normalized similarity", () => {
  const comparison = compareCandidate(reference, {
    durationSeconds: 72,
    rms: 0.25,
    tempo: { bpm: 126, confidence: 0.9 },
    key: { name: "D minor", tonic: "D", mode: "minor", confidence: 0.8 },
    spectrum: { brightness: 0.7 },
    loop: { score: 0.6 }
  });

  assert.deepEqual(comparison.components.tempo, { available: true, weight: 0.25, score: 0.75, deltaBpm: 6 });
  assert.deepEqual(comparison.components.key, { available: true, weight: 0.2, score: 1, relationship: "same-key" });
  assert.deepEqual(comparison.components.brightness, { available: true, weight: 0.15, score: 0.8, delta: 0.2 });
  assert.deepEqual(comparison.components.dynamics, { available: true, weight: 0.1, score: 0.9, delta: 0.05 });
  assert.deepEqual(comparison.components.loop, { available: true, weight: 0.2, score: 0.8, delta: -0.2 });
  assert.deepEqual(comparison.components.duration, { available: true, weight: 0.1, score: 0.8, deltaSeconds: 12 });
  assert.equal(comparison.coverage, 1);
  assert.equal(comparison.similarity, 0.8375);
  assert.equal(comparison.coreMatches, false);
});

test("compareCandidate excludes missing or zero-confidence features from coverage without non-finite numbers", () => {
  const comparison = compareCandidate(reference, {
    durationSeconds: 60,
    rms: 0.2,
    tempo: { bpm: 120, confidence: 0 },
    key: { name: "D minor", tonic: "D", mode: "minor", confidence: 0 },
    spectrum: {},
    loop: { score: 0.8 }
  });

  assert.deepEqual(comparison.components.tempo, { available: false, weight: 0.25, score: 0, deltaBpm: null });
  assert.deepEqual(comparison.components.key, { available: false, weight: 0.2, score: 0, relationship: "unavailable" });
  assert.deepEqual(comparison.components.brightness, { available: false, weight: 0.15, score: 0, delta: null });
  assert.equal(comparison.coverage, 0.4);
  assert.equal(comparison.similarity, 1);
  assert.equal(classifySimilarity(comparison), "insufficient");
  assert.ok(Object.values(comparison.components).every(component => Number.isFinite(component.score)));
});

test("classifySimilarity uses inclusive coverage and score thresholds with all core matches required for too-close", () => {
  const closeCore = { coverage: 0.7, similarity: 0.86, coreMatches: true };
  const closeWithoutCore = { coverage: 0.7, similarity: 0.86, coreMatches: false };

  assert.equal(classifySimilarity({ coverage: 0.6999, similarity: 1, coreMatches: true }), "insufficient");
  assert.equal(classifySimilarity(closeCore), "too-close");
  assert.equal(classifySimilarity(closeWithoutCore), "review");
  assert.equal(classifySimilarity({ coverage: 1, similarity: 0.75, coreMatches: false }), "review");
  assert.equal(classifySimilarity({ coverage: 1, similarity: 0.7499, coreMatches: true }), "distinct");
});

test("compareCandidate derives too-close only when each real core feature matches", () => {
  const same = compareCandidate(reference, reference);
  const tooFast = compareCandidate(reference, { ...reference, tempo: { bpm: 125, confidence: 0.9 } });
  const parallelKey = compareCandidate(reference, { ...reference, key: { name: "D major", tonic: "D", mode: "major", confidence: 0.8 } });
  const brighter = compareCandidate(reference, { ...reference, spectrum: { brightness: 0.7 } });

  assert.equal(same.coreMatches, true);
  assert.equal(classifySimilarity(same), "too-close");
  for (const comparison of [tooFast, parallelKey, brighter]) {
    assert.equal(comparison.coreMatches, false);
    assert.equal(classifySimilarity(comparison), "review");
  }
});

test("recommendNextVariant limits every iteration to one existing prompt-engine axis in Chinese", () => {
  const recommendation = recommendNextVariant(compareCandidate(reference, {
    ...reference,
    tempo: { bpm: 144, confidence: 0.9 }
  }));

  assert.deepEqual(Object.keys(recommendation).sort(), ["adjustment", "changedAxis", "reason"]);
  assert.equal(recommendation.changedAxis, "rhythm");
  assert.match(recommendation.reason, /[\u3400-\u9fff]/);
  assert.match(recommendation.adjustment, /[\u3400-\u9fff]/);
  assert.ok(["melodyTimbre", "rhythm", "percussion", "loopStructure"].includes(recommendation.changedAxis));
  assert.doesNotMatch(`${recommendation.reason} ${recommendation.adjustment}`, /法律|侵权|保证|免责/);
});

test("validateLicenseEntry preserves HTTPS sources and distinguishes CC0, CC-BY, NC, and unknown without clearance claims", () => {
  const cc0 = validateLicenseEntry({
    id: "license-cc0-a",
    source: "Freesound",
    sourceUrl: "https://freesound.org/sounds/1",
    license: "CC0",
    fileSha256: "a".repeat(64)
  });
  const ccBy = validateLicenseEntry({
    id: "license-by-a",
    source: "OpenGameArt",
    sourceUrl: "https://opengameart.org/content/a",
    license: "CC-BY 4.0",
    fileSha256: "b".repeat(64),
    attributionText: "Example Artist — CC BY 4.0"
  });
  const nc = validateLicenseEntry({
    id: "license-nc-a",
    source: "Example",
    sourceUrl: "https://example.test/nc",
    license: "CC BY-NC 4.0",
    fileSha256: "c".repeat(64)
  });
  const unknown = validateLicenseEntry({
    id: "license-unknown-a",
    source: "Example",
    sourceUrl: "https://example.test/unknown",
    license: "Custom license",
    fileSha256: "d".repeat(64)
  });

  assert.equal(cc0.sourceUrl, "https://freesound.org/sounds/1");
  assert.equal(cc0.category, "cc0");
  assert.equal(ccBy.category, "cc-by");
  assert.equal(nc.category, "nc");
  assert.equal(unknown.category, "unknown");
  for (const entry of [cc0, ccBy, nc, unknown]) {
    assert.match(entry.useWarning, /[\u3400-\u9fff]/);
    assert.match(entry.attributionWarning, /[\u3400-\u9fff]/);
    assert.doesNotMatch(`${entry.useWarning} ${entry.attributionWarning}`, /法律保证|侵权免责|已获法律许可/);
  }
  assert.throws(() => validateLicenseEntry({ ...cc0, sourceUrl: "http://example.test" }), /HTTPS/);
  assert.throws(() => validateLicenseEntry({ ...ccBy, attributionText: "" }), /attribution/i);
  assert.throws(() => validateLicenseEntry({ ...cc0, fileSha256: "not-a-hash" }), /SHA-256/);
});

test("experiment records are detached and deeply immutable while project validation preserves them and valid licenses through JSON", () => {
  const source = { id: "run-1", comparison: { similarity: 0.8 }, metadata: { labels: ["baseline"] } };
  const record = createExperimentRecord(source);
  source.comparison.similarity = 0;
  source.metadata.labels.push("mutated");

  assert.equal(record.comparison.similarity, 0.8);
  assert.deepEqual(record.metadata.labels, ["baseline"]);
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.comparison), true);
  assert.throws(() => createExperimentRecord({ localPath: "C:\\music.wav" }), /absolute path/i);
  assert.throws(() => createExperimentRecord({ localPath: ["C:\\private\\audio.wav"] }), /absolute path/i);
  assert.throws(() => createExperimentRecord({ metadata: { localPath: [["/private/audio.wav"]] } }), /absolute path/i);
  assert.throws(() => createExperimentRecord({ localPath: "\\\\server\\share\\audio.wav" }), /absolute path/i);
  assert.throws(() => createExperimentRecord({ token: "secret" }), /forbidden key/i);

  const project = validateProject({
    ...createDailyPlan(),
    experiments: [record],
    licenses: [{
      id: "license-cc0-a",
      source: "Freesound",
      sourceUrl: "https://freesound.org/sounds/1",
      license: "CC0",
      fileSha256: "a".repeat(64)
    }]
  });
  const restored = importProjectJson(JSON.stringify(project));

  assert.deepEqual(restored, project);
  assert.deepEqual(project.experiments, [{ id: "run-1", comparison: { similarity: 0.8 }, metadata: { labels: ["baseline"] } }]);
  assert.equal(Object.isFrozen(project.experiments[0]), true);
  assert.equal(Object.isFrozen(project.experiments[0].comparison), true);
  assert.equal(Object.isFrozen(project.experiments[0].metadata.labels), true);
  assert.equal(Object.isFrozen(restored.experiments[0]), true);
  assert.equal(Object.isFrozen(restored.experiments[0].metadata.labels), true);
  assert.equal(project.licenses[0].category, "cc0");
});

test("path-labelled experiment values still validate nested forbidden keys without blocking ordinary HTTPS metadata", () => {
  assert.throws(() => createExperimentRecord({ localPath: { token: "secret" } }), /forbidden key/i);
  assert.throws(() => createExperimentRecord({ localPath: [{ apiKey: "secret" }] }), /forbidden key/i);
  assert.doesNotThrow(() => createExperimentRecord({ metadata: { sourceUrl: "https://example.test/audio" } }));
});

test("compareCandidate never exposes non-finite numeric leaves for extreme finite features", () => {
  const extreme = Number.MAX_VALUE;
  const comparison = compareCandidate({
    durationSeconds: Number.MIN_VALUE,
    rms: extreme,
    tempo: { bpm: extreme, confidence: 1 },
    key: { name: "D minor", tonic: "D", mode: "minor", confidence: 1 },
    spectrum: { brightness: extreme },
    loop: { score: extreme }
  }, {
    durationSeconds: extreme,
    rms: -extreme,
    tempo: { bpm: -extreme, confidence: 1 },
    key: { name: "D minor", tonic: "D", mode: "minor", confidence: 1 },
    spectrum: { brightness: -extreme },
    loop: { score: -extreme }
  });

  const assertFiniteNumbers = value => {
    if (typeof value === "number") assert.equal(Number.isFinite(value), true);
    if (Array.isArray(value)) value.forEach(assertFiniteNumbers);
    if (value && typeof value === "object") Object.values(value).forEach(assertFiniteNumbers);
  };
  assertFiniteNumbers(comparison);
});
