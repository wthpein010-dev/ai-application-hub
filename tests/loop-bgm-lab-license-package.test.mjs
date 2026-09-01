import test from "node:test";
import assert from "node:assert/strict";

import {
  LICENSE_PACKAGE_FORMAT,
  LICENSE_PACKAGE_VERSION,
  MAX_LICENSE_PACKAGE_BYTES,
  MAX_LICENSE_PACKAGE_ENTRIES,
  adaptExternalManifestV3,
  exportLicensePackageJson,
  normalizeLicensePackage,
  parseLicensePackageJson,
  planLicensePackageImport,
} from "../projects/loop-bgm-lab/core/license-package.mjs";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function entryFixture(overrides = {}) {
  return {
    fileSha256: HASH_A,
    sourceUrl: "https://opengameart.org/content/happy-clappy-loop",
    author: "OwlishMedia",
    license: "CC0-1.0",
    evidenceUrl: "https://opengameart.org/content/happy-clappy-loop",
    evidenceCheckedAt: "2026-09-01",
    deliveryStatus: "original",
    attributionRequired: false,
    attributionText: "Happy Clappy Loop — OwlishMedia — CC0 1.0",
    rightsChainStatus: "source-declaration-only",
    ...overrides,
  };
}

function packageFixture(entries = [entryFixture()]) {
  return {
    format: LICENSE_PACKAGE_FORMAT,
    version: LICENSE_PACKAGE_VERSION,
    entries,
  };
}

function externalManifestFixture() {
  return {
    schemaVersion: 3,
    verifiedDate: "2026-09-01",
    collection: {
      workCount: 2,
      fileCount: 2,
    },
    licenseReview: {
      rightsChainAssurance: "Source-page declarations only; uploader ownership and third-party rights were not independently verified.",
      commercialReleaseGate: "Review before release.",
    },
    privacyReview: {
      cookiesTokensOrCredentialsIncluded: false,
      absoluteLocalPathsIncluded: false,
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
          suggestedCredit: "Happy Clappy Loop — OwlishMedia — https://opengameart.org/content/happy-clappy-loop — CC0 1.0",
        },
        files: [{
          path: "audio/HappyClappyLoop.wav",
          originalFile: "HappyClappyLoop.wav",
          downloadUrl: "https://opengameart.org/sites/default/files/HappyClappyLoop.wav",
          finalUrl: "https://opengameart.org/sites/default/files/HappyClappyLoop.wav",
          etag: "public-etag",
          lastModifiedHttp: "Wed, 27 Aug 2025 10:00:00 GMT",
          httpContentType: "audio/wav",
          sha256: HASH_A.toUpperCase(),
          deliveryStatus: "original-attachment",
        }],
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
        files: [{
          path: "audio/pompelo-110-preview-hq.mp3",
          originalFile: "pompelo_110.wav",
          downloadUrl: "https://cdn.freesound.org/previews/example-preview.mp3",
          finalUrl: "https://cdn.freesound.org/previews/example-preview.mp3",
          etag: "public-etag-2",
          lastModifiedHttp: "Mon, 01 Sep 2026 10:00:00 GMT",
          httpContentType: "audio/mpeg",
          sha256: HASH_B,
          deliveryStatus: "audition-only-public-hq-preview",
        }],
      },
    ],
  };
}

test("normalization accepts only the v1 schema and returns canonical detached facts", () => {
  const input = packageFixture([
    entryFixture({ fileSha256: HASH_B.toUpperCase(), author: "  OwlishMedia  " }),
    entryFixture({ fileSha256: HASH_A }),
  ]);
  const normalized = normalizeLicensePackage(input);

  assert.deepEqual(normalized, packageFixture([
    entryFixture({ fileSha256: HASH_A }),
    entryFixture({ fileSha256: HASH_B, author: "OwlishMedia" }),
  ]));
  input.entries[0].license = "Custom changed later";
  assert.equal(normalized.entries[1].license, "CC0-1.0");

  assert.throws(() => normalizeLicensePackage({ ...packageFixture(), version: 2 }), /version/i);
  assert.throws(() => normalizeLicensePackage({ ...packageFixture(), extra: true }), /unsupported|unknown/i);
  assert.throws(() => normalizeLicensePackage(packageFixture([{ ...entryFixture(), extra: true }])), /unsupported|unknown/i);
});

test("strict JSON boundaries enforce byte and entry limits before returning data", () => {
  const text = exportLicensePackageJson(packageFixture());
  assert.deepEqual(parseLicensePackageJson(text), normalizeLicensePackage(packageFixture()));
  assert.throws(() => parseLicensePackageJson("{"), /JSON/i);
  assert.throws(() => parseLicensePackageJson(" ".repeat(MAX_LICENSE_PACKAGE_BYTES + 1)), /byte|size|large/i);
  assert.throws(
    () => normalizeLicensePackage(packageFixture(Array.from({ length: MAX_LICENSE_PACKAGE_ENTRIES + 1 }, (_, index) => (
      entryFixture({ fileSha256: index.toString(16).padStart(64, "0") })
    )))),
    /entries|limit|many/i,
  );

  const oversizedObject = packageFixture(Array.from({ length: MAX_LICENSE_PACKAGE_ENTRIES }, (_, index) => (
    entryFixture({
      fileSha256: index.toString(16).padStart(64, "0"),
      attributionText: "x".repeat(8_192),
    })
  )));
  assert.throws(() => normalizeLicensePackage(oversizedObject), /byte|size|large/i);
});

test("portable safety rejects dangerous keys, local paths, file names, and secret-like fields or URLs", () => {
  const dangerous = JSON.stringify(packageFixture()).replace(
    '"entries":[',
    '"__proto__":{"polluted":true},"entries":[',
  );
  assert.throws(() => parseLicensePackageJson(dangerous), /dangerous|proto/i);

  for (const entry of [
    entryFixture({ attributionText: "C:\\Users\\Wu\\Downloads\\song.mp3" }),
    entryFixture({ attributionText: "original-master.wav" }),
    entryFixture({ sourceUrl: "https://example.com/source?api_key=private" }),
    { ...entryFixture(), recoveryToken: "private" },
  ]) {
    assert.throws(() => normalizeLicensePackage(packageFixture([entry])), /path|file name|secret|unsupported/i);
  }
});

test("entry validation requires exact public facts and never accepts a filename as identity", () => {
  for (const entry of [
    entryFixture({ fileSha256: "not-a-hash" }),
    entryFixture({ sourceUrl: "http://example.com/source" }),
    entryFixture({ evidenceUrl: "file:///tmp/evidence" }),
    entryFixture({ evidenceCheckedAt: "09/01/2026" }),
    entryFixture({ deliveryStatus: "downloaded" }),
    entryFixture({ rightsChainStatus: "probably-fine" }),
    entryFixture({ author: "" }),
  ]) {
    assert.throws(() => normalizeLicensePackage(packageFixture([entry])), /SHA-256|HTTPS|date|deliveryStatus|rightsChainStatus|author/i);
  }
});

test("export is canonical and reparses without changing the normalized package", () => {
  const input = packageFixture([
    entryFixture({ fileSha256: HASH_C, author: null, attributionText: null }),
    entryFixture({ fileSha256: HASH_A }),
  ]);
  const first = exportLicensePackageJson(input);
  const second = exportLicensePackageJson(structuredClone(input));

  assert.equal(first, second);
  assert.equal(first.endsWith("\n"), true);
  assert.deepEqual(parseLicensePackageJson(first), normalizeLicensePackage(input));
  assert.ok(Buffer.byteLength(first, "utf8") <= MAX_LICENSE_PACKAGE_BYTES);
});

test("import plan skips same-SHA same-facts entries and adds only new exact hashes", () => {
  const existing = [entryFixture()];
  const same = entryFixture();
  const newEntry = entryFixture({
    fileSha256: HASH_B,
    sourceUrl: "https://example.com/another-source",
    evidenceUrl: "https://example.com/another-source",
  });
  const plan = planLicensePackageImport(existing, packageFixture([same, newEntry]));

  assert.equal(plan.canCommit, true);
  assert.deepEqual(plan.skipped, [HASH_A]);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.additions, [normalizeLicensePackage(packageFixture([newEntry])).entries[0]]);
});

test("one same-SHA facts conflict blocks the whole plan without partial additions", () => {
  const existing = [entryFixture()];
  const conflicting = entryFixture({ license: "CC-BY-4.0", attributionRequired: true });
  const unrelatedNew = entryFixture({
    fileSha256: HASH_B,
    sourceUrl: "https://example.com/new",
    evidenceUrl: "https://example.com/new",
  });
  const plan = planLicensePackageImport(existing, packageFixture([conflicting, unrelatedNew]));

  assert.equal(plan.canCommit, false);
  assert.deepEqual(plan.additions, []);
  assert.deepEqual(plan.skipped, []);
  assert.deepEqual(plan.conflicts, [{
    fileSha256: HASH_A,
    differingFields: ["attributionRequired", "license"],
  }]);
});

test("same source URL or attribution cannot associate facts when SHA-256 differs", () => {
  const existing = [entryFixture()];
  const differentHash = entryFixture({ fileSha256: HASH_B });
  const plan = planLicensePackageImport(existing, packageFixture([differentHash]));

  assert.equal(plan.canCommit, true);
  assert.deepEqual(plan.skipped, []);
  assert.equal(plan.additions[0].fileSha256, HASH_B);
});

test("blocking summary identifies preview-only, ShareAlike, noncommercial, and unknown facts", () => {
  const entries = [
    entryFixture({ fileSha256: HASH_A, deliveryStatus: "preview-only" }),
    entryFixture({ fileSha256: HASH_B, license: "CC-BY-SA-3.0", attributionRequired: true }),
    entryFixture({ fileSha256: HASH_C, license: "CC-BY-NC-4.0", attributionRequired: true }),
    entryFixture({ fileSha256: "d".repeat(64), license: "Custom license", rightsChainStatus: "unknown" }),
  ];
  const plan = planLicensePackageImport([], packageFixture(entries));

  assert.equal(plan.canCommit, true);
  assert.deepEqual(plan.blockingSummary.reasonCounts, {
    "preview-only": 1,
    "share-alike": 1,
    noncommercial: 1,
    unknown: 1,
  });
  assert.equal(plan.blockingSummary.blocked, true);
  assert.deepEqual(plan.blockingSummary.entries, [
    { fileSha256: HASH_A, reasons: ["preview-only"] },
    { fileSha256: HASH_B, reasons: ["share-alike"] },
    { fileSha256: HASH_C, reasons: ["noncommercial"] },
    { fileSha256: "d".repeat(64), reasons: ["unknown"] },
  ]);
});

test("schema v3 adapter maps only public license facts and drops transport, path, and filename metadata", () => {
  const adapted = adaptExternalManifestV3(externalManifestFixture());

  assert.deepEqual(adapted, packageFixture([
    entryFixture({
      evidenceCheckedAt: "2026-08-31",
      attributionText: "Happy Clappy Loop — OwlishMedia — https://opengameart.org/content/happy-clappy-loop — CC0 1.0",
    }),
    entryFixture({
      fileSha256: HASH_B,
      sourceUrl: "https://freesound.org/people/fonoskop/sounds/849565/",
      author: "fonoskop",
      license: "CC-BY-4.0",
      evidenceUrl: "https://freesound.org/people/fonoskop/sounds/849565/",
      deliveryStatus: "preview-only",
      attributionRequired: true,
      attributionText: "pompelo_110 by fonoskop — https://freesound.org/people/fonoskop/sounds/849565/ — CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/",
    }),
  ]));

  const serialized = JSON.stringify(adapted);
  for (const forbidden of [
    "path", "downloadUrl", "finalUrl", "originalFile", "etag", "lastModifiedHttp", "httpContentType",
    "HappyClappyLoop.wav", "pompelo_110.wav", "example-preview.mp3",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("schema v3 adapter rejects unsupported versions, malformed works, and secret-like selected facts", () => {
  assert.throws(() => adaptExternalManifestV3({ ...externalManifestFixture(), schemaVersion: 4 }), /schemaVersion/i);

  const noFiles = externalManifestFixture();
  noFiles.works[0].files = [];
  assert.throws(() => adaptExternalManifestV3(noFiles), /files/i);

  const secretEvidence = externalManifestFixture();
  secretEvidence.works[0].assetLicense.evidenceUrl = "https://example.com/license?token=private";
  assert.throws(() => adaptExternalManifestV3(secretEvidence), /secret/i);
});
