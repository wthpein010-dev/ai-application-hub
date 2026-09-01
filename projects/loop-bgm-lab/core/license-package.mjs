import {
  assertHttpsUrl,
  assertPortableValue,
  isPlainObject,
  normalizePortableKey,
} from "./portable-safety.mjs";

export const LICENSE_PACKAGE_FORMAT = "loop-bgm-license-package";
export const LICENSE_PACKAGE_VERSION = 1;
export const MAX_LICENSE_PACKAGE_BYTES = 1_048_576;
export const MAX_LICENSE_PACKAGE_ENTRIES = 256;

const MAX_FIELD_LENGTH = 8_192;
const PACKAGE_KEYS = new Set(["format", "version", "entries"]);
const ENTRY_KEYS = [
  "fileSha256",
  "sourceUrl",
  "author",
  "license",
  "evidenceUrl",
  "evidenceCheckedAt",
  "deliveryStatus",
  "attributionRequired",
  "attributionText",
  "rightsChainStatus",
];
const ENTRY_KEY_SET = new Set(ENTRY_KEYS);
const DELIVERY_STATUSES = new Set(["original", "preview-only", "unknown"]);
const RIGHTS_CHAIN_STATUSES = new Set(["source-declaration-only", "independently-verified", "unknown"]);
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SECRET_KEY_PARTS = ["cookie", "token", "apikey", "recoverykey", "session", "password", "secret", "authorization"];
const SECRET_VALUE = /(?:^|[?&#;\s("'`])(?:cookie|token|api(?:[_-]?key)|recovery(?:[_-]?key)|session|password|secret)\s*[:=]/i;
const SHA256 = /^[a-fA-F0-9]{64}$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

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

function assertExactKeys(value, allowed, field) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${field} contains an unsupported or unknown field: ${key}`);
  }
  for (const key of allowed) {
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

function normalizeNullableString(value, field) {
  if (value === null) return null;
  return normalizeRequiredString(value, field);
}

function normalizeDate(value, field) {
  const normalized = normalizeRequiredString(value, field);
  const dateOnly = DATE_ONLY.exec(normalized);
  if (dateOnly) {
    const [year, month, day] = dateOnly.slice(1).map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
      fail(`${field} must be a valid ISO date`);
    }
    return normalized;
  }
  if (!DATE_TIME.test(normalized) || !Number.isFinite(Date.parse(normalized))) {
    fail(`${field} must be a valid ISO date or UTC timestamp`);
  }
  return normalized;
}

function normalizeEntry(entry, field = "entry") {
  assertStrictObject(entry, field);
  assertExactKeys(entry, ENTRY_KEY_SET, field);

  const fileSha256 = normalizeRequiredString(entry.fileSha256, `${field}.fileSha256`);
  if (!SHA256.test(fileSha256)) fail(`${field}.fileSha256 must be a 64-character SHA-256`);
  const sourceUrl = normalizeRequiredString(entry.sourceUrl, `${field}.sourceUrl`);
  const evidenceUrl = normalizeRequiredString(entry.evidenceUrl, `${field}.evidenceUrl`);
  assertHttpsUrl(sourceUrl, `${field}.sourceUrl`);
  assertHttpsUrl(evidenceUrl, `${field}.evidenceUrl`);
  const deliveryStatus = normalizeRequiredString(entry.deliveryStatus, `${field}.deliveryStatus`);
  if (!DELIVERY_STATUSES.has(deliveryStatus)) fail(`${field}.deliveryStatus is unsupported`);
  const rightsChainStatus = normalizeRequiredString(entry.rightsChainStatus, `${field}.rightsChainStatus`);
  if (!RIGHTS_CHAIN_STATUSES.has(rightsChainStatus)) fail(`${field}.rightsChainStatus is unsupported`);
  if (typeof entry.attributionRequired !== "boolean") fail(`${field}.attributionRequired must be boolean`);

  return {
    fileSha256: fileSha256.toLowerCase(),
    sourceUrl,
    author: normalizeNullableString(entry.author, `${field}.author`),
    license: normalizeRequiredString(entry.license, `${field}.license`),
    evidenceUrl,
    evidenceCheckedAt: normalizeDate(entry.evidenceCheckedAt, `${field}.evidenceCheckedAt`),
    deliveryStatus,
    attributionRequired: entry.attributionRequired,
    attributionText: normalizeNullableString(entry.attributionText, `${field}.attributionText`),
    rightsChainStatus,
  };
}

function normalizeEntries(entries, field) {
  if (!Array.isArray(entries)) fail(`${field} must be an array`);
  if (entries.length > MAX_LICENSE_PACKAGE_ENTRIES) fail(`${field} exceeds the entry limit`);
  const normalized = entries.map((entry, index) => normalizeEntry(entry, `${field}[${index}]`));
  normalized.sort((left, right) => left.fileSha256.localeCompare(right.fileSha256));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].fileSha256 === normalized[index].fileSha256) {
      fail(`${field} fileSha256 values must be unique`);
    }
  }
  return normalized;
}

function redactEmbeddedAttributionUrls(value, field) {
  if (value === null) return null;
  return value.replace(/https?:\/\/[^\s]+/gi, url => {
    assertHttpsUrl(url, `${field} embedded URL`);
    return "PUBLIC_HTTPS_URL";
  });
}

export function normalizeLicensePackage(input) {
  assertNoDangerousOrSecretValues(input);
  assertStrictObject(input, "license package");
  assertExactKeys(input, PACKAGE_KEYS, "license package");
  if (input.format !== LICENSE_PACKAGE_FORMAT) fail(`license package format must be ${LICENSE_PACKAGE_FORMAT}`);
  if (input.version !== LICENSE_PACKAGE_VERSION) fail(`license package version must be ${LICENSE_PACKAGE_VERSION}`);

  const normalized = {
    format: LICENSE_PACKAGE_FORMAT,
    version: LICENSE_PACKAGE_VERSION,
    entries: normalizeEntries(input.entries, "license package.entries"),
  };
  assertPortableValue({
    ...normalized,
    entries: normalized.entries.map((entry, index) => ({
      ...entry,
      attributionText: redactEmbeddedAttributionUrls(
        entry.attributionText,
        `license package.entries[${index}].attributionText`,
      ),
    })),
  });
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
  return ENTRY_KEYS
    .filter(key => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
    .sort();
}

function normalizedLicenseIdentifier(value) {
  return value.trim().toUpperCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
}

function licenseRestrictions(license) {
  const normalized = normalizedLicenseIdentifier(license);
  if (/^CC0(?:-1\.0)?$/.test(normalized)) return { known: true, shareAlike: false, nonCommercial: false };
  const match = /^CC-BY((?:-(?:NC|SA)){0,2})-(?:3\.0|4\.0)$/.exec(normalized);
  if (!match) return { known: false, shareAlike: false, nonCommercial: false };
  const components = match[1].split("-").filter(Boolean);
  if (new Set(components).size !== components.length) return { known: false, shareAlike: false, nonCommercial: false };
  return {
    known: true,
    shareAlike: components.includes("SA"),
    nonCommercial: components.includes("NC"),
  };
}

function summarizeBlockers(entries) {
  const reasonCounts = {
    "preview-only": 0,
    "share-alike": 0,
    noncommercial: 0,
    unknown: 0,
  };
  const blockedEntries = [];
  for (const entry of entries) {
    const restrictions = licenseRestrictions(entry.license);
    const reasons = [];
    if (entry.deliveryStatus === "preview-only") reasons.push("preview-only");
    if (restrictions.shareAlike) reasons.push("share-alike");
    if (restrictions.nonCommercial) reasons.push("noncommercial");
    if (!restrictions.known || entry.deliveryStatus === "unknown" || entry.rightsChainStatus === "unknown") {
      reasons.push("unknown");
    }
    for (const reason of reasons) reasonCounts[reason] += 1;
    if (reasons.length > 0) blockedEntries.push({ fileSha256: entry.fileSha256, reasons });
  }
  return {
    blocked: blockedEntries.length > 0,
    reasonCounts,
    entries: blockedEntries,
  };
}

export function planLicensePackageImport(existingEntries, incomingPackage) {
  const existing = normalizeEntries(existingEntries, "existingEntries");
  const incoming = normalizeLicensePackage(incomingPackage);
  const existingByHash = new Map(existing.map(entry => [entry.fileSha256, entry]));
  const additions = [];
  const skipped = [];
  const conflicts = [];

  for (const entry of incoming.entries) {
    const current = existingByHash.get(entry.fileSha256);
    if (!current) {
      additions.push(entry);
    } else if (entryFingerprint(current) === entryFingerprint(entry)) {
      skipped.push(entry.fileSha256);
    } else {
      conflicts.push({
        fileSha256: entry.fileSha256,
        differingFields: differingFields(current, entry),
      });
    }
  }

  return {
    canCommit: conflicts.length === 0,
    additions: conflicts.length === 0 ? additions : [],
    skipped,
    conflicts,
    blockingSummary: summarizeBlockers(incoming.entries),
  };
}

function mapDeliveryStatus(value) {
  if (value === "original-attachment") return "original";
  if (value === "audition-only-public-hq-preview") return "preview-only";
  return "unknown";
}

function mapRightsChainStatus(value) {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("source-page declarations only") && normalized.includes("not independently verified")) {
    return "source-declaration-only";
  }
  if (normalized.includes("independently verified") && !normalized.includes("not independently verified")) {
    return "independently-verified";
  }
  return "unknown";
}

function optionalAttribution(assetLicense) {
  for (const field of ["suggestedCredit", "preferredCreditFromAuthor"]) {
    if (typeof assetLicense[field] === "string" && assetLicense[field].trim().length > 0) {
      return assetLicense[field];
    }
  }
  return null;
}

export function adaptExternalManifestV3(manifest) {
  assertNoDangerousOrSecretValues(manifest, "external manifest", new WeakSet(), false);
  assertStrictObject(manifest, "external manifest");
  if (manifest.schemaVersion !== 3) fail("external manifest schemaVersion must be 3");
  if (!Array.isArray(manifest.works)) fail("external manifest.works must be an array");
  const rightsChainStatus = mapRightsChainStatus(manifest.licenseReview?.rightsChainAssurance);
  const entries = [];

  manifest.works.forEach((work, workIndex) => {
    const field = `external manifest.works[${workIndex}]`;
    assertStrictObject(work, field);
    assertStrictObject(work.assetLicense, `${field}.assetLicense`);
    if (!Array.isArray(work.files) || work.files.length === 0) fail(`${field}.files must be a non-empty array`);
    work.files.forEach((file, fileIndex) => {
      assertStrictObject(file, `${field}.files[${fileIndex}]`);
      entries.push({
        fileSha256: file.sha256,
        sourceUrl: work.sourcePage,
        author: work.author ?? null,
        license: work.assetLicense.identifier,
        evidenceUrl: work.assetLicense.evidenceUrl,
        evidenceCheckedAt: work.assetLicense.verifiedDate,
        deliveryStatus: mapDeliveryStatus(file.deliveryStatus),
        attributionRequired: work.assetLicense.attributionRequired,
        attributionText: optionalAttribution(work.assetLicense),
        rightsChainStatus,
      });
    });
  });

  return normalizeLicensePackage({
    format: LICENSE_PACKAGE_FORMAT,
    version: LICENSE_PACKAGE_VERSION,
    entries,
  });
}
