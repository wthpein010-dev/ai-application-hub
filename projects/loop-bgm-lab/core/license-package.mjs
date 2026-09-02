import { validateLicenseEntry } from "./candidate-score.mjs";
import {
  assertHttpsUrl,
  assertPortableValue,
  isPlainObject,
  normalizePortableKey,
} from "./portable-safety.mjs";
import { validateProject } from "./project-state.mjs";

export const LICENSE_PACKAGE_FORMAT = "loop-bgm-license-package";
export const LICENSE_PACKAGE_VERSION = 1;
export const MAX_LICENSE_PACKAGE_BYTES = 1_048_576;
export const MAX_LICENSE_PACKAGE_ENTRIES = 256;

const MAX_FIELD_LENGTH = 8_192;
const PACKAGE_KEYS = new Set(["format", "version", "createdAt", "entries", "blockingSummary"]);
const PACKAGE_REQUIRED_KEYS = new Set(["format", "version", "createdAt", "entries"]);
const MANIFEST_KEYS = new Set([
  "schemaVersion", "verifiedDate", "collection", "analysis", "licenseReferences",
  "licenseReview", "privacyReview", "works",
]);
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SECRET_KEY_PARTS = ["cookie", "token", "apikey", "recoverykey", "session", "password", "secret", "authorization"];
const SECRET_VALUE = /(?:^|[?&#;\s("'`])(?:cookie|token|api(?:[_-]?key)|recovery(?:[_-]?key)|session|password|secret)\s*[:=]/i;
const HASH_PATTERN = /^[a-fA-F0-9]{64}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MEDIA_PATH = /\.(?:aac|aif|aiff|flac|m4a|mp3|oga|ogg|opus|wav|wma|zip)$/i;
const DOWNLOAD_PATH = /\/(?:attachments?|downloads?|files?)(?:\/|$)/i;
const SIGNED_PARAMETER_NAMES = new Set([
  "expires", "signature", "keypairid", "policy", "download", "responsecontentdisposition",
]);
const BLOCKER_ORDER = [
  "unknown-license",
  "missing-evidence",
  "preview-only",
  "noncommercial",
  "share-alike-review-required",
  "no-derivatives-review-required",
  "missing-attribution",
  "rights-chain-review-required",
];
const SOURCE_DECLARATION_STATEMENT = "Source-page declarations only; uploader ownership and third-party rights were not independently verified.";
const VERIFIED_RIGHTS_STATEMENT = "Rights chain independently verified.";

function fail(message) {
  throw new TypeError(message);
}

function byteLength(text) {
  return new TextEncoder().encode(text).byteLength;
}

function assertStrictObject(value, field) {
  if (!isPlainObject(value)) fail(`${field} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${field} must be a plain object`);
}

function isSecretKey(key) {
  const normalized = normalizePortableKey(key);
  return normalized.length > 0 && SECRET_KEY_PARTS.some(part => normalized.includes(part));
}

function assertNoDangerousOrSecretValues(value, path = "package", seen = new WeakSet(), rejectSecrets = true) {
  if (typeof value === "string") {
    if (rejectSecrets && SECRET_VALUE.test(value)) fail(`${path} cannot contain a secret-like value`);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) fail("Circular values are not allowed");
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoDangerousOrSecretValues(item, `${path}[${index}]`, seen, rejectSecrets));
  } else {
    assertStrictObject(value, path);
    for (const [key, child] of Object.entries(value)) {
      if (DANGEROUS_KEYS.has(key)) fail(`Dangerous key is not allowed: ${key}`);
      if (rejectSecrets && isSecretKey(key)) fail(`Secret-like field is not allowed: ${key}`);
      assertNoDangerousOrSecretValues(child, `${path}.${key}`, seen, rejectSecrets);
    }
  }
  seen.delete(value);
}

function assertKnownAndRequiredKeys(value, allowed, required, field) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${field} contains an unsupported or unknown field: ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${field}.${key} is required`);
  }
}

function normalizeRequiredString(value, field) {
  if (typeof value !== "string") fail(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length === 0) fail(`${field} must not be empty`);
  if (normalized.length > MAX_FIELD_LENGTH) fail(`${field} is too long`);
  return normalized;
}

function normalizeDate(value, field) {
  const normalized = normalizeRequiredString(value, field);
  const match = DATE_PATTERN.exec(normalized);
  if (!match) fail(`${field} must be a valid YYYY-MM-DD date`);
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    fail(`${field} must be a valid YYYY-MM-DD date`);
  }
  return normalized;
}

function decodeRepeatedly(value) {
  let decoded = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

function assertPublicEvidencePageUrl(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const normalized = normalizeRequiredString(value, field);
  assertHttpsUrl(normalized, field);
  const parsed = new URL(normalized);
  const decodedPath = decodeRepeatedly(parsed.pathname);
  if (MEDIA_PATH.test(decodedPath) || DOWNLOAD_PATH.test(decodedPath)) {
    fail(`${field} must be a public evidence page, not a media or download URL`);
  }
  for (const parameterName of parsed.searchParams.keys()) {
    const normalizedName = normalizePortableKey(decodeRepeatedly(parameterName));
    if (SIGNED_PARAMETER_NAMES.has(normalizedName)
      || normalizedName.startsWith("xamz")
      || normalizedName.startsWith("xgoog")) {
      fail(`${field} must be a public evidence page without signed download parameters`);
    }
  }
  return normalized;
}

function assertBoundedStrings(value, field, seen = new WeakSet()) {
  if (typeof value === "string") {
    if (value.length > MAX_FIELD_LENGTH) fail(`${field} is too long`);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) fail("Circular values are not allowed");
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertBoundedStrings(item, `${field}[${index}]`, seen));
  } else {
    for (const [key, child] of Object.entries(value)) assertBoundedStrings(child, `${field}.${key}`, seen);
  }
  seen.delete(value);
}

function normalizeEntry(entry, field = "entry") {
  assertStrictObject(entry, field);
  assertBoundedStrings(entry, field);
  const normalized = validateLicenseEntry(entry);
  assertPublicEvidencePageUrl(normalized.sourceUrl, `${field}.sourceUrl`);
  assertPublicEvidencePageUrl(normalized.licenseUrl, `${field}.licenseUrl`, { nullable: true });
  assertPublicEvidencePageUrl(normalized.evidenceUrl, `${field}.evidenceUrl`, { nullable: true });
  return normalized;
}

function normalizeEntries(entries, field) {
  if (!Array.isArray(entries)) fail(`${field} must be an array`);
  if (entries.length > MAX_LICENSE_PACKAGE_ENTRIES) fail(`${field} exceeds the entry limit`);
  const normalized = entries.map((entry, index) => normalizeEntry(entry, `${field}[${index}]`));
  normalized.sort((left, right) => left.fileSha256.localeCompare(right.fileSha256) || left.id.localeCompare(right.id));
  const ids = new Set();
  const hashes = new Set();
  for (const entry of normalized) {
    if (ids.has(entry.id)) fail(`${field} id values must be unique`);
    if (hashes.has(entry.fileSha256)) fail(`${field} file SHA-256 values must be unique`);
    ids.add(entry.id);
    hashes.add(entry.fileSha256);
  }
  return normalized;
}

function summarizeBlockers(entries) {
  const reasonCounts = Object.fromEntries(BLOCKER_ORDER.map(reason => [reason, 0]));
  const blockedEntries = [];
  for (const entry of entries) {
    const reasons = [...entry.publicationBlockers];
    for (const reason of reasons) {
      if (!Object.hasOwn(reasonCounts, reason)) reasonCounts[reason] = 0;
      reasonCounts[reason] += 1;
    }
    if (reasons.length > 0) {
      blockedEntries.push({ id: entry.id, fileSha256: entry.fileSha256, reasons });
    }
  }
  return { blocked: blockedEntries.length > 0, reasonCounts, entries: blockedEntries };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function normalizeLicensePackage(input) {
  assertNoDangerousOrSecretValues(input);
  assertStrictObject(input, "license package");
  assertKnownAndRequiredKeys(input, PACKAGE_KEYS, PACKAGE_REQUIRED_KEYS, "license package");
  if (input.format !== LICENSE_PACKAGE_FORMAT) fail(`license package format must be ${LICENSE_PACKAGE_FORMAT}`);
  if (input.version !== LICENSE_PACKAGE_VERSION) fail(`license package version must be ${LICENSE_PACKAGE_VERSION}`);

  const entries = normalizeEntries(input.entries, "license package.entries");
  const normalized = {
    format: LICENSE_PACKAGE_FORMAT,
    version: LICENSE_PACKAGE_VERSION,
    createdAt: normalizeDate(input.createdAt, "license package.createdAt"),
    entries,
    blockingSummary: summarizeBlockers(entries),
  };
  if (Object.hasOwn(input, "blockingSummary")
    && stableJson(input.blockingSummary) !== stableJson(normalized.blockingSummary)) {
    fail("license package.blockingSummary is stale or inconsistent with canonical license evidence");
  }
  assertPortableValue(normalized);
  if (byteLength(JSON.stringify(normalized)) > MAX_LICENSE_PACKAGE_BYTES) {
    fail("license package exceeds the byte limit");
  }
  return normalized;
}

export function parseLicensePackageJson(text) {
  if (typeof text !== "string") fail("license package JSON must be text");
  if (byteLength(text) > MAX_LICENSE_PACKAGE_BYTES) fail("license package JSON exceeds the byte limit");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`license package JSON is invalid: ${error instanceof Error ? error.message : "parse failed"}`);
  }
  return normalizeLicensePackage(parsed);
}

export function exportLicensePackageJson(input) {
  const normalized = normalizeLicensePackage(input);
  const text = `${JSON.stringify(normalized, null, 2)}\n`;
  if (byteLength(text) > MAX_LICENSE_PACKAGE_BYTES) fail("license package JSON exceeds the byte limit");
  return text;
}

function entryFingerprint(entry) {
  return JSON.stringify(entry);
}

function differingFields(left, right) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter(key => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
    .sort();
}

function licensesBaseline(entries) {
  return `canonical-license-json-v1:${stableJson(entries)}`;
}

export function planLicensePackageImport(existingEntries, incomingPackage) {
  const existing = normalizeEntries(existingEntries, "existingEntries");
  const incoming = normalizeLicensePackage(incomingPackage);
  const existingByHash = new Map(existing.map(entry => [entry.fileSha256, entry]));
  const existingById = new Map(existing.map(entry => [entry.id, entry]));
  const additions = [];
  const skipped = [];
  const conflicts = [];

  for (const entry of incoming.entries) {
    const hashMatch = existingByHash.get(entry.fileSha256);
    const idMatch = existingById.get(entry.id);
    if (hashMatch) {
      if (entryFingerprint(hashMatch) === entryFingerprint(entry)) {
        skipped.push({ id: entry.id, fileSha256: entry.fileSha256 });
      } else {
        conflicts.push({
          identity: { id: entry.id, fileSha256: entry.fileSha256 },
          reason: "same file SHA-256 has conflicting canonical license facts",
          differingFields: differingFields(hashMatch, entry),
        });
      }
    } else if (idMatch) {
      conflicts.push({
        identity: { id: entry.id, fileSha256: entry.fileSha256 },
        reason: "stable license id already identifies a different file SHA-256",
        differingFields: differingFields(idMatch, entry),
      });
    } else {
      additions.push(entry);
    }
  }

  return {
    canCommit: conflicts.length === 0,
    existingLicensesBaseline: licensesBaseline(existing),
    additions: conflicts.length === 0 ? additions : [],
    skipped,
    conflicts,
    blockingSummary: incoming.blockingSummary,
  };
}

export function applyLicensePackageImport(project, plan) {
  assertStrictObject(plan, "license import plan");
  if (plan.canCommit !== true || !Array.isArray(plan.conflicts) || plan.conflicts.length !== 0) {
    fail("license import plan has conflicts and cannot commit");
  }
  const additions = normalizeEntries(plan.additions, "license import plan.additions");
  const validated = validateProject(project);
  const currentBaseline = licensesBaseline(normalizeEntries(validated.licenses, "project.licenses"));
  if (typeof plan.existingLicensesBaseline !== "string"
    || plan.existingLicensesBaseline !== currentBaseline) {
    fail("license import plan is stale because the license baseline changed");
  }
  return validateProject({
    ...validated,
    licenses: [...validated.licenses, ...additions],
  });
}

function mapDeliveryStatus(value) {
  if (value === "original-attachment") return "original";
  if (value === "audition-only-public-hq-preview") return "preview-only";
  return "unknown";
}

function mapRightsChainStatus(value) {
  if (value === "source-declaration-only" || value === SOURCE_DECLARATION_STATEMENT) {
    return "source-declaration-only";
  }
  if (value === "independently-verified" || value === VERIFIED_RIGHTS_STATEMENT) {
    return "independently-verified";
  }
  return "unknown";
}

function optionalAttribution(assetLicense) {
  for (const field of ["suggestedCredit", "preferredCreditFromAuthor"]) {
    if (typeof assetLicense[field] === "string" && assetLicense[field].trim().length > 0) {
      const portableCredit = assetLicense[field]
        .replace(/https?:\/\/[^\s]+/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      return portableCredit.length > 0 ? portableCredit : null;
    }
  }
  return null;
}

function nullableTrimmedString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sourceLabel(sourceUrl) {
  const hostname = new URL(sourceUrl).hostname.toLowerCase();
  if (hostname === "opengameart.org" || hostname.endsWith(".opengameart.org")) return "OpenGameArt";
  if (hostname === "freesound.org" || hostname.endsWith(".freesound.org")) return "Freesound";
  return hostname;
}

function combinedScope(manifestScope, assetScope) {
  const parts = [manifestScope, assetScope]
    .map(nullableTrimmedString)
    .filter((value, index, values) => value !== null && values.indexOf(value) === index);
  return parts.length > 0 ? parts.join(" ") : null;
}

function assertSafeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${field} must be a non-negative integer`);
}

function validateManifestCounts(manifest) {
  assertStrictObject(manifest.collection, "external manifest.collection");
  for (const field of ["workCount", "fileCount", "originalAttachmentCount", "auditionPreviewCount"]) {
    assertSafeInteger(manifest.collection[field], `external manifest.collection.${field}`);
  }
  const fileCount = manifest.works.reduce((sum, work) => sum + (Array.isArray(work.files) ? work.files.length : 0), 0);
  const originalCount = manifest.works.reduce((sum, work) => sum + (Array.isArray(work.files)
    ? work.files.filter(file => file?.deliveryStatus === "original-attachment").length
    : 0), 0);
  const previewCount = manifest.works.reduce((sum, work) => sum + (Array.isArray(work.files)
    ? work.files.filter(file => file?.deliveryStatus === "audition-only-public-hq-preview").length
    : 0), 0);
  if (manifest.collection.workCount !== manifest.works.length) fail("external manifest.collection.workCount is inconsistent");
  if (manifest.collection.fileCount !== fileCount) fail("external manifest.collection.fileCount is inconsistent");
  if (manifest.collection.originalAttachmentCount !== originalCount) fail("external manifest.collection.originalAttachmentCount is inconsistent");
  if (manifest.collection.auditionPreviewCount !== previewCount) fail("external manifest.collection.auditionPreviewCount is inconsistent");
}

export function adaptExternalManifestV3(manifest) {
  assertNoDangerousOrSecretValues(manifest, "external manifest", new WeakSet(), false);
  assertStrictObject(manifest, "external manifest");
  assertKnownAndRequiredKeys(manifest, MANIFEST_KEYS, MANIFEST_KEYS, "external manifest");
  if (manifest.schemaVersion !== 3) fail("external manifest schemaVersion must be 3");
  const verifiedDate = normalizeDate(manifest.verifiedDate, "external manifest.verifiedDate");
  if (!Array.isArray(manifest.works)) fail("external manifest.works must be an array");
  assertStrictObject(manifest.licenseReferences, "external manifest.licenseReferences");
  assertStrictObject(manifest.licenseReview, "external manifest.licenseReview");
  validateManifestCounts(manifest);

  const rightsChainStatus = mapRightsChainStatus(manifest.licenseReview.rightsChainAssurance);
  const entries = [];
  manifest.works.forEach((work, workIndex) => {
    const field = `external manifest.works[${workIndex}]`;
    assertStrictObject(work, field);
    normalizeRequiredString(work.workId, `${field}.workId`);
    const author = normalizeRequiredString(work.author, `${field}.author`);
    const sourceUrl = assertPublicEvidencePageUrl(work.sourcePage, `${field}.sourcePage`);
    assertStrictObject(work.assetLicense, `${field}.assetLicense`);
    if (!Array.isArray(work.files) || work.files.length === 0) fail(`${field}.files must be a non-empty array`);

    const licenseIdentifier = normalizeRequiredString(work.assetLicense.identifier, `${field}.assetLicense.identifier`);
    const licenseUrlValue = Object.hasOwn(manifest.licenseReferences, licenseIdentifier)
      ? manifest.licenseReferences[licenseIdentifier]
      : null;
    const licenseUrl = assertPublicEvidencePageUrl(
      licenseUrlValue,
      `${field}.assetLicense.licenseUrl`,
      { nullable: true },
    );
    const evidenceUrl = assertPublicEvidencePageUrl(work.assetLicense.evidenceUrl, `${field}.assetLicense.evidenceUrl`);
    const evidenceCheckedAt = normalizeDate(work.assetLicense.verifiedDate, `${field}.assetLicense.verifiedDate`);
    const scopeNote = combinedScope(manifest.licenseReview.scope, work.assetLicense.scopeNote);

    work.files.forEach((file, fileIndex) => {
      const fileField = `${field}.files[${fileIndex}]`;
      assertStrictObject(file, fileField);
      const fileSha256 = normalizeRequiredString(file.sha256, `${fileField}.sha256`).toLowerCase();
      if (!HASH_PATTERN.test(fileSha256)) fail(`${fileField}.sha256 must be a SHA-256 hash`);
      const entry = {
        id: `license-${fileSha256}`,
        source: sourceLabel(sourceUrl),
        sourceUrl,
        license: licenseIdentifier,
        licenseIdentifier,
        licenseUrl,
        evidenceUrl,
        evidenceCheckedAt,
        deliveryStatus: mapDeliveryStatus(file.deliveryStatus),
        scopeNote,
        rightsChainStatus,
        fileSha256,
        attributionText: optionalAttribution(work.assetLicense),
        author,
        downloadedAt: verifiedDate,
      };
      const evidenceSha256 = nullableTrimmedString(work.assetLicense.evidenceSha256);
      if (evidenceSha256 !== null) entry.evidenceSha256 = evidenceSha256;
      const modificationNote = nullableTrimmedString(
        file.modificationNote ?? work.modificationNote ?? work.assetLicense.modificationNote,
      );
      if (modificationNote !== null) entry.modificationNote = modificationNote;
      entries.push(entry);
    });
  });

  return normalizeLicensePackage({
    format: LICENSE_PACKAGE_FORMAT,
    version: LICENSE_PACKAGE_VERSION,
    createdAt: verifiedDate,
    entries,
  });
}
