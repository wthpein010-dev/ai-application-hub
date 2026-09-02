import test from "node:test";
import assert from "node:assert/strict";

import {
  compareCandidate,
  recommendNextVariant,
  validateLicenseEntry,
} from "../projects/loop-bgm-lab/core/candidate-score.mjs";
import {
  exportProjectJson,
  importProjectJson,
  recordCreateRun,
  updateRunOutputs,
  validateProject,
} from "../projects/loop-bgm-lab/core/project-state.mjs";
import { createDailyPlan } from "../projects/loop-bgm-lab/core/prompt-engine.mjs";

const HASH = "a".repeat(64);

function analysisFixture() {
  return {
    durationSeconds: 64,
    sampleRate: 44100,
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
    spectrum: { centroidHz: 1800, brightness: 0.4 },
    loop: {
      score: 0.88,
      components: { envelope: 0.9, chroma: 0.9, centroid: 0.85, boundary: 0.82 },
    },
    warnings: [],
  };
}

function referenceBasisFixture() {
  const analysis = analysisFixture();
  return {
    durationSeconds: analysis.durationSeconds,
    rms: analysis.rms,
    tempo: analysis.tempo,
    key: {
      name: analysis.key.name,
      tonic: analysis.key.tonic,
      mode: analysis.key.mode,
      confidence: analysis.key.confidence,
    },
    spectrum: { brightness: analysis.spectrum.brightness },
    loop: { score: analysis.loop.score },
  };
}

function licenseFixture(overrides = {}) {
  return {
    id: "license-1",
    source: "OpenGameArt",
    sourceUrl: "https://opengameart.org/content/example",
    license: "CC0 1.0",
    licenseIdentifier: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    evidenceUrl: "https://opengameart.org/content/example",
    evidenceCheckedAt: "2026-09-02",
    deliveryStatus: "original",
    scopeNote: "Covers the exact downloaded audio bytes.",
    rightsChainStatus: "independently-verified",
    fileSha256: HASH,
    author: "Example Author",
    downloadedAt: "2026-09-02",
    ...overrides,
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
    hash: HASH,
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
    subjectiveScore: 4,
    reviewNote: "Auditioned in context.",
    disposition: "accepted",
    referenceBasis: candidate.referenceBasis,
    comparison: candidate.comparison,
    advice: candidate.advice,
    generationConditions: null,
    outputIndex: null,
    ...overrides,
  };
}

function licensedProject({ sourceKind = "external", license = licenseFixture(), disposition = "accepted" } = {}) {
  const base = createDailyPlan();
  const candidate = candidateFixture({
    kind: sourceKind,
    licenseId: license.id,
    fileSha256: license.fileSha256,
  });
  return {
    ...base,
    candidates: [candidate],
    experiments: [experimentFixture(candidate, { disposition })],
    licenses: [license],
    currentBestCandidate: {
      candidateId: candidate.id,
      displayName: candidate.displayName,
      hash: candidate.hash,
    },
  };
}

function sunoProject({ sourceKind = "suno" } = {}) {
  let project = recordCreateRun(createDailyPlan(), "batch-1");
  project = updateRunOutputs(project, project.runs[0].id, [{
    generatedUrl: "https://suno.com/song/example",
    subjectiveScore: 4,
    reviewNote: "Auditioned in context.",
    disposition: "accepted",
  }]);
  const run = project.runs[0];
  const candidate = candidateFixture(sourceKind === "legacy-unknown"
    ? { kind: "legacy-unknown", legacyRunId: run.id }
    : { kind: "suno", runId: run.id, outputIndex: 0 });
  const experiment = experimentFixture(candidate, {
    runId: run.id,
    outputIndex: 0,
    generatedUrl: run.outputs[0].generatedUrl,
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
    currentBestCandidate: {
      candidateId: candidate.id,
      displayName: candidate.displayName,
      hash: candidate.hash,
    },
  };
}

test("license v3 derives canonical restrictions from licenseIdentifier and preserves evidence facts", () => {
  const entry = validateLicenseEntry(licenseFixture({
    license: "Creative Commons Attribution-ShareAlike 4.0 International",
    licenseIdentifier: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attributionText: "Example by Example Author, CC BY-SA 4.0",
    evidenceSha256: "b".repeat(64),
    modificationNote: "No modifications in this research copy.",
  }));

  assert.equal(entry.category, "cc-by-sa");
  assert.deepEqual(entry.licenseFlags, {
    by: true,
    nc: false,
    sa: true,
    nd: false,
    cc0: false,
    previewOnly: false,
    unknown: false,
  });
  assert.deepEqual(entry.publicationBlockers, ["share-alike-review-required"]);
  assert.equal(entry.evidenceSha256, "b".repeat(64));
  assert.equal(entry.modificationNote, "No modifications in this research copy.");
});

test("missing attribution on a BY license is a blocker instead of a validation crash", () => {
  const entry = validateLicenseEntry(licenseFixture({
    license: "CC BY 4.0",
    licenseIdentifier: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  }));

  assert.equal(entry.category, "cc-by");
  assert.deepEqual(entry.publicationBlockers, ["missing-attribution"]);
  assert.equal(entry.publicationBlocked, true);
});

test("license v3 keeps preview, unknown delivery, evidence, rights, NC, SA, and ND blockers explicit", () => {
  const cases = [
    [
      { deliveryStatus: "preview-only" },
      ["preview-only"],
    ],
    [
      { deliveryStatus: "unknown" },
      ["missing-evidence"],
    ],
    [
      { evidenceUrl: null, evidenceCheckedAt: null, licenseUrl: null, scopeNote: null },
      ["missing-evidence"],
    ],
    [
      { rightsChainStatus: "source-declaration-only" },
      ["rights-chain-review-required"],
    ],
    [
      { rightsChainStatus: "unknown" },
      ["rights-chain-review-required"],
    ],
    [
      {
        license: "CC BY-NC-SA 4.0",
        licenseIdentifier: "CC-BY-NC-SA-4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
        attributionText: "Example by Example Author, CC BY-NC-SA 4.0",
      },
      ["noncommercial", "share-alike-review-required"],
    ],
    [
      {
        license: "CC BY-ND 4.0",
        licenseIdentifier: "CC-BY-ND-4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-nd/4.0/",
        attributionText: "Example by Example Author, CC BY-ND 4.0",
      },
      ["no-derivatives-review-required"],
    ],
    [
      { license: "Custom License", licenseIdentifier: "LicenseRef-Unknown", licenseUrl: null },
      ["unknown-license", "missing-evidence"],
    ],
  ];

  for (const [overrides, expected] of cases) {
    assert.deepEqual(validateLicenseEntry(licenseFixture(overrides)).publicationBlockers, expected);
  }
});

test("only the explicit canonical Creative Commons identifier allowlist is classified as known", () => {
  const known = [
    ["CC0-1.0", "cc0"],
    ["CC-BY-3.0", "cc-by"],
    ["CC-BY-4.0", "cc-by"],
    ["CC-BY-SA-3.0", "cc-by-sa"],
    ["CC-BY-SA-4.0", "cc-by-sa"],
    ["CC-BY-NC-3.0", "cc-by-nc"],
    ["CC-BY-NC-4.0", "cc-by-nc"],
    ["CC-BY-ND-3.0", "cc-by-nd"],
    ["CC-BY-ND-4.0", "cc-by-nd"],
    ["CC-BY-NC-SA-3.0", "cc-by-nc-sa"],
    ["CC-BY-NC-SA-4.0", "cc-by-nc-sa"],
    ["CC-BY-NC-ND-3.0", "cc-by-nc-nd"],
    ["CC-BY-NC-ND-4.0", "cc-by-nc-nd"],
  ];
  for (const [licenseIdentifier, category] of known) {
    const entry = validateLicenseEntry(licenseFixture({
      license: `Human evidence for ${licenseIdentifier}`,
      licenseIdentifier,
      ...(licenseIdentifier === "CC0-1.0"
        ? {}
        : { attributionText: `Example by Example Author, ${licenseIdentifier}` }),
    }));
    assert.equal(entry.category, category, licenseIdentifier);
    assert.equal(entry.licenseIdentifier, licenseIdentifier, licenseIdentifier);
    assert.equal(entry.licenseFlags.unknown, false, licenseIdentifier);
  }

  for (const licenseIdentifier of [
    "CC-BY-999.0",
    "CC-BY-SA-NC-4.0",
    "CC-BY-ND-NC-4.0",
    "CC BY 4.0",
    "cc-by-4.0",
    "CC-BY-4",
  ]) {
    const entry = validateLicenseEntry(licenseFixture({
      license: "Creative Commons Attribution 4.0 International",
      licenseIdentifier,
      attributionText: "Example by Example Author, CC BY 4.0",
    }));
    assert.equal(entry.category, "unknown", licenseIdentifier);
    assert.equal(entry.licenseFlags.unknown, true, licenseIdentifier);
    assert.ok(entry.publicationBlockers.includes("unknown-license"), licenseIdentifier);
  }
});

test("license v3 rejects stale caller-supplied derived classification and blocker fields", () => {
  const normalized = validateLicenseEntry(licenseFixture());
  assert.throws(
    () => validateLicenseEntry({ ...normalized, category: "cc-by" }),
    /category.*inconsistent/i,
  );
  assert.throws(
    () => validateLicenseEntry({ ...normalized, publicationBlockers: ["preview-only"] }),
    /publicationBlockers.*inconsistent/i,
  );
  assert.throws(
    () => validateLicenseEntry({ ...normalized, licenseFlags: { ...normalized.licenseFlags, nc: true } }),
    /licenseFlags.*inconsistent/i,
  );
  assert.throws(
    () => validateLicenseEntry({ ...normalized, useWarning: "Stale warning" }),
    /useWarning.*inconsistent/i,
  );
  assert.throws(
    () => validateLicenseEntry({ ...normalized, attributionWarning: "Stale warning" }),
    /attributionWarning.*inconsistent/i,
  );
});

test("project license validation rejects transport URLs, private hosts, and encoded local identity", () => {
  const encodeLayers = (value, count) => Array.from({ length: count })
    .reduce(encoded => encodeURIComponent(encoded), value);
  const encodedLocalPath = encodeURIComponent(["Z:", "portable-test", "sample.mp3"].join("\\"));
  const deeplyEncodedLocalPath = encodeLayers("Z%3A%5Cportable-test%5Csample%2Emp3", 4);
  const deeplyEncodedMediaSuffix = encodeLayers("%2Emp3", 3);
  const deeplyEncodedSignature = encodeLayers("%53ignature", 4);
  const nestedMediaUrl = encodeURIComponent("https://cdn.example.test/audio/master.mp3");
  const forbiddenUrls = [
    "https://cdn.example.test/audio/master.mp3",
    "https://cdn.example.test/%ZZ/audio/master%2Emp3",
    `https://cdn.example.test/audio/master${deeplyEncodedMediaSuffix}`,
    "https://cdn.example.test/download/master",
    "https://cdn.example.test/object?Signature=abc",
    "https://storage.example.test/blob?sv=2024-11-04&se=2026-09-02T10%3A00Z&sp=r&sig=abc",
    "https://storage.example.test/blob#sig=abc",
    "https://storage.example.test/blob?redirect=sig%3Dabc",
    "https://cdn.example.test/object#Signature=abc",
    "https://cdn.example.test/object?Signature%3Dabc",
    "https://cdn.example.test/object#Signature%3Dabc",
    "https://cdn.example.test/object?redirect=Signature%3Dabc",
    "https://cdn.example.test/object#redirect=Signature%3Dabc",
    "https://cdn.example.test/object?note=ok%3BSignature%3Dabc",
    "https://cdn.example.test/object#note=ok%3BSignature%3Dabc",
    "https://example.test/evidence?payload=data%3Aaudio%2Fmpeg%3Bbase64%2CAAAA",
    "https://example.test/evidence?payload=da%09ta%3Aaudio%2Fmpeg%3Bbase64%2CAAAA",
    "https://example.test/evidence?payload=dat%0Aa%3Aaudio%2Fmpeg%3Bbase64%2CAAAA",
    "https://example.test/evidence?payload=%2500data%253Aaudio%252Fmpeg%253Bbase64%252CAAAA",
    "https://example.test/evidence?payload=ok%2Fjavascript%3Aalert(1)",
    "https://example.test/evidence?payload=ok%5Cjavascript%3Aalert(1)",
    "https://example.test/evidence?payload=%5Bjavascript%3Aalert(1)%5D",
    "https://example.test/evidence?payload=%7Bdata%3Atext%2Fplain%2Cx%7D",
    "https://example.test/evidence?next=javascript%3Aalert(1)",
    "https://example.test/evidence?next=java%09script%3Aalert(1)",
    "https://example.test/evidence?next=vbscr%0Dipt%3Aalert(1)",
    "https://example.test/evidence?contact=mailto%3Aartist%40example.test",
    "https://example.test/evidence?mirror=ftp%3A%2F%2Fexample.test%2Fitem",
    "https://example.test/evidence?mirror=ftp%3Aexample.test%2Fitem",
    "https://example.test/evidence?next=http%3Aexample.org%2Fpath",
    "https://example.test/evidence?next=https%3Aexample.org%2Fpath",
    "https://example.test/evidence?contact=mailto%3Apostmaster",
    "https://example.test/evidence?contact=mailto%3A%3Fsubject%3Dtest",
    "https://example.test/evidence?payload=data%3Aaudio%2Fx*custom%2CAAAA",
    "https://example.test/evidence?payload=data%3Atext%2Fplain%3Bfoo%3Dbar%20baz%2CAAAA",
    "https://example.test/evidence?payload=data%3Ax%2CAAAA",
    "https://example.test/evidence?identifier=urn%3Auuid%3A1234",
    "https://example.test/evidence?identifier=u%09rn%3Auuid%3A1234",
    "https://example.test/evidence?q=%FF",
    "https://example.test/evidence?%FF=value",
    "https://example.test/evidence?ok=1%C0%AFsig%3Dabc",
    "https://example.test/evidence?q=javascript%C0%BAalert%281%29",
    `https://example.test/evidence?source=${encodedLocalPath}`,
    `https://example.test/evidence?source=${deeplyEncodedLocalPath}`,
    "https://example.test/evidence?source=Z%253A%255Cprivate%255Csample%252Emp3%25ZZ",
    `https://example.test/evidence?${deeplyEncodedSignature}=abc`,
    `https://example.test/evidence#source=${encodedLocalPath}`,
    `https://example.test/evidence?redirect=${nestedMediaUrl}`,
    "https://localhost/evidence",
    "https://localhost../evidence",
    "https://127.0.0.1/evidence",
    "https://192.168.1.20/evidence",
    "https://[::1]/evidence",
    "https://[fc00::1]/evidence",
    "https://[fe80::1]/evidence",
    "https://[::ffff:192.168.1.20]/evidence",
    "https://198.51.100.20/evidence",
    "https://203.0.113.20/evidence",
    "https://[2001:db8::1]/evidence",
    "https://[fec0::1]/evidence",
    "https://[ff02::1]/evidence",
  ];

  for (const field of ["sourceUrl", "licenseUrl", "evidenceUrl"]) {
    for (const url of forbiddenUrls) {
      const project = licensedProject({ license: licenseFixture({ [field]: url }) });
      assert.throws(
        () => validateProject(project),
        /public evidence page|media|download|signed|local|private|path|nested|scheme|encoding/i,
        `${field}: ${url}`,
      );
      assert.throws(
        () => exportProjectJson(project),
        /public evidence page|media|download|signed|local|private|path|nested|scheme|encoding/i,
        `export ${field}: ${url}`,
      );
    }
  }
});

test("license evidence timestamps reject nonexistent UTC calendar dates", () => {
  assert.throws(
    () => validateLicenseEntry(licenseFixture({ evidenceCheckedAt: "2026-02-30T00:00:00Z" })),
    /valid ISO date|UTC timestamp/i,
  );
  assert.equal(
    validateLicenseEntry(licenseFixture({ evidenceCheckedAt: "2024-02-29T23:59:59.123Z" })).evidenceCheckedAt,
    "2024-02-29T23:59:59.123Z",
  );
});

test("schema v2 license migration records unknown delivery and rights without inventing evidence", () => {
  const legacy = createDailyPlan();
  legacy.version = 2;
  legacy.licenses = [{
    id: "license-legacy",
    source: "OpenGameArt",
    sourceUrl: "https://opengameart.org/content/example",
    license: "CC BY 4.0",
    fileSha256: HASH,
    attributionText: "Example by Example Author, CC BY 4.0",
    author: "Example Author",
    downloadedAt: "2026-09-01",
  }];

  const [migrated] = importProjectJson(JSON.stringify(legacy)).licenses;
  assert.equal(migrated.deliveryStatus, "unknown");
  assert.equal(migrated.rightsChainStatus, "unknown");
  assert.equal(migrated.evidenceUrl, null);
  assert.equal(migrated.evidenceCheckedAt, null);
  assert.ok(migrated.publicationBlockers.includes("missing-evidence"));
  assert.ok(migrated.publicationBlockers.includes("rights-chain-review-required"));
});

test("schema v2 migration preserves a recorded preview-only restriction", () => {
  const legacy = createDailyPlan();
  legacy.version = 2;
  legacy.licenses = [{
    id: "license-preview",
    source: "Freesound",
    sourceUrl: "https://freesound.org/people/example/sounds/1/",
    license: "CC BY 4.0",
    fileSha256: HASH,
    attributionText: "Example by Example Author, CC BY 4.0",
    author: "Example Author",
    downloadedAt: "2026-09-01",
    previewOnly: true,
  }];

  const [migrated] = importProjectJson(JSON.stringify(legacy)).licenses;
  assert.equal(migrated.deliveryStatus, "preview-only");
  assert.equal(migrated.licenseFlags.previewOnly, true);
  assert.ok(migrated.publicationBlockers.includes("preview-only"));
});

test("candidate source kind cannot impersonate the other rights-chain declaration", () => {
  assert.throws(
    () => validateProject(licensedProject({
      sourceKind: "local-original",
      license: licenseFixture({ rightsChainStatus: "independently-verified" }),
    })),
    /local-original.*user-declared-original/i,
  );
  assert.throws(
    () => validateProject(licensedProject({
      sourceKind: "external",
      license: licenseFixture({ rightsChainStatus: "user-declared-original" }),
    })),
    /external.*user-declared-original/i,
  );
});

test("publication state separates ready, review, and blocked from research-favorite selection", async () => {
  const { deriveCandidatePublicationState } = await import(
    "../projects/loop-bgm-lab/core/candidate-publication.mjs"
  );

  const ready = deriveCandidatePublicationState(licensedProject(), "candidate-1");
  assert.deepEqual(ready, {
    status: "ready",
    candidateId: "candidate-1",
    sourceKind: "external",
    licenseId: "license-1",
    blockers: [],
    reviewReasons: [],
    isResearchFavorite: true,
  });

  const review = deriveCandidatePublicationState(
    licensedProject({ disposition: "unrated" }),
    "candidate-1",
  );
  assert.equal(review.status, "review");
  assert.deepEqual(review.blockers, []);
  assert.deepEqual(review.reviewReasons, ["experiment-not-accepted"]);
  assert.equal(review.isResearchFavorite, true);

  const blocked = deriveCandidatePublicationState(licensedProject({
    license: licenseFixture({
      deliveryStatus: "preview-only",
      rightsChainStatus: "source-declaration-only",
    }),
  }), "candidate-1");
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.blockers, ["preview-only", "rights-chain-review-required"]);
  assert.equal(blocked.isResearchFavorite, true);
});

test("publication state explicitly blocks legacy and Suno candidates with no exact license evidence", async () => {
  const { deriveCandidatePublicationState } = await import(
    "../projects/loop-bgm-lab/core/candidate-publication.mjs"
  );

  const legacy = deriveCandidatePublicationState(sunoProject({ sourceKind: "legacy-unknown" }), "candidate-1");
  assert.equal(legacy.status, "blocked");
  assert.deepEqual(legacy.blockers, ["source-unconfirmed", "missing-license-evidence"]);
  assert.equal(legacy.sourceKind, "legacy-unknown");
  assert.equal(legacy.isResearchFavorite, true);

  const suno = deriveCandidatePublicationState(sunoProject(), "candidate-1");
  assert.equal(suno.status, "blocked");
  assert.deepEqual(suno.blockers, ["missing-license-evidence"]);
  assert.equal(suno.sourceKind, "suno");
});

test("user-declared local original can be ready while source declarations still require rights review", async () => {
  const { deriveCandidatePublicationState } = await import(
    "../projects/loop-bgm-lab/core/candidate-publication.mjs"
  );

  const local = deriveCandidatePublicationState(licensedProject({
    sourceKind: "local-original",
    license: licenseFixture({ rightsChainStatus: "user-declared-original" }),
  }), "candidate-1");
  assert.equal(local.status, "ready");
  assert.deepEqual(local.blockers, []);

  const declared = deriveCandidatePublicationState(licensedProject({
    license: licenseFixture({ rightsChainStatus: "source-declaration-only" }),
  }), "candidate-1");
  assert.equal(declared.status, "blocked");
  assert.deepEqual(declared.blockers, ["rights-chain-review-required"]);
});
