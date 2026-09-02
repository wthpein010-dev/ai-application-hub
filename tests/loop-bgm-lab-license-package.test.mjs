import test from "node:test";
import assert from "node:assert/strict";

import {
  LICENSE_PACKAGE_FORMAT,
  LICENSE_PACKAGE_VERSION,
  MAX_LICENSE_PACKAGE_BYTES,
  MAX_LICENSE_PACKAGE_ENTRIES,
  adaptExternalManifestV3,
  applyLicensePackageImport,
  exportLicensePackageJson,
  normalizeLicensePackage,
  parseLicensePackageJson,
  planLicensePackageImport,
} from "../projects/loop-bgm-lab/core/license-package.mjs";
import { validateLicenseEntry } from "../projects/loop-bgm-lab/core/candidate-score.mjs";
import { validateProject } from "../projects/loop-bgm-lab/core/project-state.mjs";
import { createDailyPlan } from "../projects/loop-bgm-lab/core/prompt-engine.mjs";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const EVIDENCE_HASH = "e".repeat(64);

function entryFixture(overrides = {}) {
  return {
    id: "license-happy-clappy",
    source: "OpenGameArt",
    sourceUrl: "https://opengameart.org/content/happy-clappy-loop",
    license: "CC0 1.0",
    licenseIdentifier: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    evidenceUrl: "https://opengameart.org/content/happy-clappy-loop",
    evidenceCheckedAt: "2026-09-01",
    deliveryStatus: "original",
    scopeNote: "Exact listed source attachment only.",
    rightsChainStatus: "source-declaration-only",
    fileSha256: HASH_A,
    attributionText: "Happy Clappy Loop — OwlishMedia — CC0 1.0",
    author: "OwlishMedia",
    downloadedAt: "2026-09-01",
    ...overrides,
  };
}

function packageFixture(entries = [entryFixture()], overrides = {}) {
  return {
    format: LICENSE_PACKAGE_FORMAT,
    version: LICENSE_PACKAGE_VERSION,
    createdAt: "2026-09-02",
    entries,
    ...overrides,
  };
}

function fileFixture(overrides = {}) {
  return {
    path: "audio/source-a.wav",
    originalFile: { type: "WAV", downloadRequiresLogin: false },
    downloadUrl: "https://cdn.example.test/source-a.wav",
    finalUrl: "https://cdn.example.test/source-a.wav",
    etag: "public-etag",
    lastModifiedHttp: "Wed, 27 Aug 2025 10:00:00 GMT",
    httpContentType: "audio/wav",
    sha256: HASH_A.toUpperCase(),
    deliveryStatus: "original-attachment",
    modificationNote: "No audio edits were made.",
    ...overrides,
  };
}

function externalManifestFixture() {
  return {
    schemaVersion: 3,
    verifiedDate: "2026-09-01",
    collection: {
      workCount: 2,
      fileCount: 2,
      originalAttachmentCount: 1,
      auditionPreviewCount: 1,
      notClearedForCommercialDeployment: true,
    },
    analysis: { path: "analysis.json", schemaVersion: 3, sha256: "f".repeat(64) },
    licenseReferences: {
      "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
      "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
    },
    licenseReview: {
      scope: "Only the exact files listed in this manifest are covered.",
      rightsChainAssurance: "Source-page declarations only; uploader ownership and third-party rights were not independently verified.",
      commercialReleaseGate: "Human review is required before release.",
      previewRule: "Preview files must be replaced before production.",
    },
    privacyReview: {
      userReferenceAudioIncluded: false,
      absoluteLocalPathsIncluded: false,
      cookiesTokensOrCredentialsIncluded: false,
    },
    works: [
      {
        workId: "happy-clappy-loop",
        title: "Happy Clappy Loop",
        author: "OwlishMedia",
        sourcePage: "https://opengameart.org/content/happy-clappy-loop",
        assetLicense: {
          identifier: "CC0-1.0",
          evidenceUrl: "https://opengameart.org/content/happy-clappy-loop",
          verifiedDate: "2026-08-31",
          attributionRequired: false,
          scopeNote: "The separate paid asset pack is excluded.",
          evidenceSha256: EVIDENCE_HASH.toUpperCase(),
          suggestedCredit: "Happy Clappy Loop — OwlishMedia — https://opengameart.org/content/happy-clappy-loop — CC0 1.0",
        },
        files: [fileFixture()],
      },
      {
        workId: "pompelo-110",
        title: "pompelo_110",
        author: "fonoskop",
        sourcePage: "https://freesound.org/people/fonoskop/sounds/849565/",
        assetLicense: {
          identifier: "CC-BY-4.0",
          evidenceUrl: "https://freesound.org/people/fonoskop/sounds/849565/",
          verifiedDate: "2026-09-01",
          attributionRequired: true,
          suggestedCredit: "pompelo_110 by fonoskop — https://freesound.org/people/fonoskop/sounds/849565/ — CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/",
        },
        files: [fileFixture({
          path: "audio/pompelo-preview.mp3",
          originalFile: { type: "WAV", downloadRequiresLogin: true },
          downloadUrl: "https://cdn.example.test/pompelo-preview.mp3",
          finalUrl: "https://cdn.example.test/pompelo-preview.mp3",
          httpContentType: "audio/mpeg",
          sha256: HASH_B,
          deliveryStatus: "audition-only-public-hq-preview",
          modificationNote: undefined,
        })],
      },
    ],
  };
}

test("v1 package normalization requires a dated envelope and emits canonical project-license entries", () => {
  const input = packageFixture([
    entryFixture({ fileSha256: HASH_B.toUpperCase(), id: "license-b" }),
    entryFixture({ fileSha256: HASH_A, id: "license-a" }),
  ]);
  const normalized = normalizeLicensePackage(input);

  assert.equal(normalized.createdAt, "2026-09-02");
  assert.deepEqual(normalized.entries.map(entry => [entry.id, entry.fileSha256]), [
    ["license-a", HASH_A],
    ["license-b", HASH_B],
  ]);
  assert.deepEqual(normalized.entries[0], validateLicenseEntry(entryFixture({ id: "license-a" })));
  assert.deepEqual(normalized.blockingSummary.entries, [
    { id: "license-a", fileSha256: HASH_A, reasons: ["rights-chain-review-required"] },
    { id: "license-b", fileSha256: HASH_B, reasons: ["rights-chain-review-required"] },
  ]);
  input.entries[0].license = "changed later";
  assert.equal(normalized.entries[1].license, "CC0 1.0");

  assert.throws(() => normalizeLicensePackage({ ...packageFixture(), version: 2 }), /version/i);
  assert.throws(() => normalizeLicensePackage({ ...packageFixture(), extra: true }), /unsupported|unknown/i);
  assert.throws(() => normalizeLicensePackage({ format: LICENSE_PACKAGE_FORMAT, version: 1, entries: [] }), /createdAt/i);
});

test("normalization rejects duplicate stable IDs and duplicate hashes independently", () => {
  assert.throws(() => normalizeLicensePackage(packageFixture([
    entryFixture({ id: "license-same", fileSha256: HASH_A }),
    entryFixture({ id: "license-same", fileSha256: HASH_B }),
  ])), /id.*unique|duplicate.*id/i);
  assert.throws(() => normalizeLicensePackage(packageFixture([
    entryFixture({ id: "license-a", fileSha256: HASH_A }),
    entryFixture({ id: "license-b", fileSha256: HASH_A }),
  ])), /hash|SHA-256.*unique|duplicate/i);
});

test("strict JSON boundaries enforce byte and entry limits", () => {
  const text = exportLicensePackageJson(packageFixture());
  assert.deepEqual(parseLicensePackageJson(text), normalizeLicensePackage(packageFixture()));
  assert.throws(() => parseLicensePackageJson("{"), /JSON/i);
  assert.throws(() => parseLicensePackageJson(" ".repeat(MAX_LICENSE_PACKAGE_BYTES + 1)), /byte|size|large/i);
  assert.throws(
    () => normalizeLicensePackage(packageFixture(Array.from({ length: MAX_LICENSE_PACKAGE_ENTRIES + 1 }, (_, index) => (
      entryFixture({ id: `license-${index}`, fileSha256: index.toString(16).padStart(64, "0") })
    )))),
    /entries|limit|many/i,
  );
});

test("public evidence URLs reject media files and signed download parameters", () => {
  const forbiddenUrls = [
    "https://cdn.example.test/master.mp3",
    "https://cdn.example.test/master%2Ewav",
    "https://cdn.example.test/download",
    "https://cdn.example.test/object?Expires=999999",
    "https://cdn.example.test/object?Signature=abc",
    "https://cdn.example.test/object?Key-Pair-Id=K",
    "https://cdn.example.test/object?X-Amz-Credential=abc",
  ];
  for (const field of ["sourceUrl", "evidenceUrl", "licenseUrl"]) {
    for (const url of forbiddenUrls) {
      assert.throws(
        () => normalizeLicensePackage(packageFixture([entryFixture({ [field]: url })])),
        /public evidence page|media|signed|download/i,
        `${field}: ${url}`,
      );
    }
  }
});

test("portable safety rejects dangerous keys, local paths, file-name fields, and secret URLs", () => {
  const dangerous = JSON.stringify(packageFixture()).replace(
    '"entries":[',
    '"__proto__":{"polluted":true},"entries":[',
  );
  assert.throws(() => parseLicensePackageJson(dangerous), /dangerous|proto/i);

  const syntheticAbsolutePath = ["C:", "synthetic", "source.mp3"].join("\\");
  for (const entry of [
    entryFixture({ attributionText: syntheticAbsolutePath }),
    entryFixture({ sourceUrl: "https://example.com/source?api_key=private" }),
    { ...entryFixture(), recoveryToken: "private" },
    { ...entryFixture(), originalFile: "master.wav" },
  ]) {
    assert.throws(() => normalizeLicensePackage(packageFixture([entry])), /path|file name|secret|unsupported/i);
  }
});

test("blocker summary delegates all release decisions to the canonical validator", () => {
  const entries = [
    entryFixture({ id: "license-source", fileSha256: HASH_A }),
    entryFixture({ id: "license-attribution", fileSha256: HASH_B, license: "CC BY 4.0", licenseIdentifier: "CC-BY-4.0", attributionText: null, rightsChainStatus: "independently-verified" }),
    entryFixture({ id: "license-preview", fileSha256: HASH_C, deliveryStatus: "preview-only", rightsChainStatus: "independently-verified" }),
    entryFixture({ id: "license-sa", fileSha256: HASH_D, license: "CC BY-SA 4.0", licenseIdentifier: "CC-BY-SA-4.0", attributionText: "Required credit", rightsChainStatus: "independently-verified" }),
    entryFixture({ id: "license-nd", fileSha256: "1".repeat(64), license: "CC BY-ND 4.0", licenseIdentifier: "CC-BY-ND-4.0", attributionText: "Required credit", rightsChainStatus: "independently-verified" }),
    entryFixture({ id: "license-nc", fileSha256: "2".repeat(64), license: "CC BY-NC 4.0", licenseIdentifier: "CC-BY-NC-4.0", attributionText: "Required credit", rightsChainStatus: "independently-verified" }),
  ];
  const summary = normalizeLicensePackage(packageFixture(entries)).blockingSummary;

  assert.equal(summary.blocked, true);
  assert.deepEqual(summary.reasonCounts, {
    "unknown-license": 0,
    "missing-evidence": 0,
    "preview-only": 1,
    noncommercial: 1,
    "share-alike-review-required": 1,
    "no-derivatives-review-required": 1,
    "missing-attribution": 1,
    "rights-chain-review-required": 1,
  });
  assert.deepEqual(summary.entries.map(item => [item.id, item.reasons]), [
    ["license-nd", ["no-derivatives-review-required"]],
    ["license-nc", ["noncommercial"]],
    ["license-source", ["rights-chain-review-required"]],
    ["license-attribution", ["missing-attribution"]],
    ["license-preview", ["preview-only"]],
    ["license-sa", ["share-alike-review-required"]],
  ]);

  const reorderedSummary = {
    entries: summary.entries.map(({ id, fileSha256, reasons }) => ({ reasons, fileSha256, id })),
    reasonCounts: Object.fromEntries(Object.entries(summary.reasonCounts).reverse()),
    blocked: summary.blocked,
  };
  assert.doesNotThrow(() => normalizeLicensePackage({
    ...packageFixture(entries),
    blockingSummary: reorderedSummary,
  }));
  assert.throws(() => normalizeLicensePackage({
    ...packageFixture(entries),
    blockingSummary: {
      ...summary,
      reasonCounts: { ...summary.reasonCounts, "preview-only": 0 },
    },
  }), /stale|inconsistent/i);
});

test("import planning is idempotent and blocks both same-hash and same-ID conflicts", () => {
  const existing = [validateLicenseEntry(entryFixture())];
  const addition = entryFixture({ id: "license-new", fileSha256: HASH_B, sourceUrl: "https://example.com/source/new", evidenceUrl: "https://example.com/source/new" });
  const ok = planLicensePackageImport(existing, packageFixture([entryFixture(), addition]));
  assert.equal(ok.canCommit, true);
  assert.deepEqual(ok.skipped, [{ id: "license-happy-clappy", fileSha256: HASH_A }]);
  assert.deepEqual(ok.conflicts, []);
  assert.equal(ok.additions[0].id, "license-new");

  const hashConflict = planLicensePackageImport(existing, packageFixture([
    entryFixture({ license: "Custom license", licenseIdentifier: "LicenseRef-Unknown" }), addition,
  ]));
  assert.equal(hashConflict.canCommit, false);
  assert.deepEqual(hashConflict.additions, []);
  assert.deepEqual(hashConflict.conflicts[0].identity, { id: "license-happy-clappy", fileSha256: HASH_A });

  const idConflict = planLicensePackageImport(existing, packageFixture([entryFixture({ fileSha256: HASH_B })]));
  assert.equal(idConflict.canCommit, false);
  assert.deepEqual(idConflict.additions, []);
  assert.match(idConflict.conflicts[0].reason, /id/i);
});

test("atomic apply returns a newly validated project only for a successful plan", () => {
  const project = createDailyPlan();
  const beforeProject = structuredClone(project);
  const plan = planLicensePackageImport(project.licenses, packageFixture());
  const beforePlan = structuredClone(plan);

  const applied = applyLicensePackageImport(project, plan);
  assert.deepEqual(project, beforeProject);
  assert.deepEqual(plan, beforePlan);
  assert.notEqual(applied, project);
  assert.equal(applied.licenses.length, 1);
  assert.deepEqual(applied, validateProject(applied));

  const conflict = planLicensePackageImport(applied.licenses, packageFixture([
    entryFixture({ license: "Custom license", licenseIdentifier: "LicenseRef-Unknown" }),
  ]));
  const beforeApplied = structuredClone(applied);
  assert.throws(() => applyLicensePackageImport(applied, conflict), /conflict|commit/i);
  assert.deepEqual(applied, beforeApplied);
});

test("apply locks only the normalized license baseline between preflight and commit", () => {
  const project = createDailyPlan();
  const plan = planLicensePackageImport(project.licenses, packageFixture());
  const unrelatedEdit = validateProject({
    ...project,
    extensions: { reviewNote: "Unrelated project metadata changed after preflight." },
  });
  const applied = applyLicensePackageImport(unrelatedEdit, plan);
  assert.equal(applied.extensions.reviewNote, "Unrelated project metadata changed after preflight.");
  assert.equal(applied.licenses.length, 1);

  const changedLicenses = validateProject({
    ...project,
    licenses: [entryFixture({ id: "license-concurrent" })],
  });
  const beforeProject = structuredClone(changedLicenses);
  const beforePlan = structuredClone(plan);
  assert.throws(() => applyLicensePackageImport(changedLicenses, plan), /stale.*plan|license.*baseline/i);
  assert.deepEqual(changedLicenses, beforeProject);
  assert.deepEqual(plan, beforePlan);
});

test("apply rejects missing or forged license baselines without mutation", () => {
  const project = createDailyPlan();
  const plan = planLicensePackageImport(project.licenses, packageFixture());
  const malformedPlans = [
    (() => {
      const missing = structuredClone(plan);
      delete missing.existingLicensesBaseline;
      return missing;
    })(),
    { ...structuredClone(plan), existingLicensesBaseline: "forged-baseline" },
  ];

  for (const malformedPlan of malformedPlans) {
    const beforeProject = structuredClone(project);
    const beforePlan = structuredClone(malformedPlan);
    assert.throws(() => applyLicensePackageImport(project, malformedPlan), /stale.*plan|license.*baseline/i);
    assert.deepEqual(project, beforeProject);
    assert.deepEqual(malformedPlan, beforePlan);
  }
});

test("schema-v3 adapter preserves canonical public evidence and strips transport identity", () => {
  const adapted = adaptExternalManifestV3(externalManifestFixture());
  const original = adapted.entries.find(entry => entry.fileSha256 === HASH_A);
  const preview = adapted.entries.find(entry => entry.fileSha256 === HASH_B);

  assert.equal(adapted.createdAt, "2026-09-01");
  assert.equal(original.id, `license-${HASH_A}`);
  assert.equal(original.source, "OpenGameArt");
  assert.equal(original.licenseIdentifier, "CC0-1.0");
  assert.equal(original.licenseUrl, "https://creativecommons.org/publicdomain/zero/1.0/");
  assert.equal(original.evidenceUrl, "https://opengameart.org/content/happy-clappy-loop");
  assert.equal(original.evidenceCheckedAt, "2026-08-31");
  assert.equal(original.evidenceSha256, EVIDENCE_HASH);
  assert.match(original.scopeNote, /Only the exact files listed/);
  assert.match(original.scopeNote, /paid asset pack is excluded/);
  assert.equal(original.modificationNote, "No audio edits were made.");
  assert.deepEqual(original.publicationBlockers, ["rights-chain-review-required"]);
  assert.equal(preview.source, "Freesound");
  assert.equal(preview.deliveryStatus, "preview-only");
  assert.deepEqual(preview.publicationBlockers, ["preview-only", "rights-chain-review-required"]);

  const serialized = JSON.stringify(adapted);
  for (const forbidden of ["path", "downloadUrl", "finalUrl", "originalFile", "etag", "lastModifiedHttp", "httpContentType", "source-a.wav", "pompelo-preview.mp3", "cdn.example.test"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("schema-v3 adapter accepts only exact canonical rights-chain enums", () => {
  for (const [value, expected] of [
    ["source-declaration-only", "source-declaration-only"],
    ["independently-verified", "independently-verified"],
  ]) {
    const manifest = externalManifestFixture();
    manifest.licenseReview.rightsChainAssurance = value;
    assert.equal(adaptExternalManifestV3(manifest).entries[0].rightsChainStatus, expected);
  }
});

test("schema-v3 adapter never promotes ambiguous or negated rights-chain prose", () => {
  const exactSource = externalManifestFixture();
  assert.equal(adaptExternalManifestV3(exactSource).entries[0].rightsChainStatus, "source-declaration-only");

  for (const ambiguous of ["No file was independently verified.", "Some files were independently verified.", "Independently verified, except where noted."]) {
    const manifest = externalManifestFixture();
    manifest.licenseReview.rightsChainAssurance = ambiguous;
    const adapted = adaptExternalManifestV3(manifest);
    assert.equal(adapted.entries[0].rightsChainStatus, "unknown", ambiguous);
    assert.ok(adapted.entries[0].publicationBlockers.includes("rights-chain-review-required"), ambiguous);
  }
});

test("schema-v3 adapter rejects structural drift, inconsistent counts, and non-page URLs", () => {
  assert.throws(() => adaptExternalManifestV3({ ...externalManifestFixture(), schemaVersion: 4 }), /schemaVersion/i);
  assert.throws(() => adaptExternalManifestV3({ ...externalManifestFixture(), unexpected: true }), /unsupported|unknown/i);

  const wrongCount = externalManifestFixture();
  wrongCount.collection.fileCount = 99;
  assert.throws(() => adaptExternalManifestV3(wrongCount), /fileCount|count/i);

  const directEvidence = externalManifestFixture();
  directEvidence.works[0].assetLicense.evidenceUrl = "https://cdn.example.test/evidence.pdf?Expires=9&Signature=x";
  assert.throws(() => adaptExternalManifestV3(directEvidence), /public evidence page|signed|download/i);
});
