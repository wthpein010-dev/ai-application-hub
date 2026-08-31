export const API_RUN_STATUSES = Object.freeze([
  "queued",
  "generating",
  "ready",
  "downloading",
  "downloaded",
  "failed",
  "cancelled",
]);

const RUN_FIELDS = Object.freeze([
  "id",
  "batchId",
  "status",
  "jobId",
  "createdAt",
  "updatedAt",
  "attempts",
  "nextPollAt",
  "generatedUrl",
  "downloadSha256",
  "errorCode",
  "error",
]);
const CREATE_FIELDS = Object.freeze([
  "id", "batchId", "jobId", "createdAt", "updatedAt", "attempts", "nextPollAt",
  "generatedUrl", "downloadSha256", "errorCode", "error",
]);
const PATCH_FIELDS = Object.freeze([
  "jobId", "updatedAt", "attempts", "nextPollAt", "generatedUrl", "downloadSha256", "errorCode", "error",
]);
const TRANSITIONS = Object.freeze({
  queued: Object.freeze(["generating", "failed", "cancelled"]),
  generating: Object.freeze(["ready", "failed", "cancelled"]),
  ready: Object.freeze(["downloading", "failed", "cancelled"]),
  downloading: Object.freeze(["downloaded", "failed", "cancelled"]),
  downloaded: Object.freeze([]),
  failed: Object.freeze([]),
  cancelled: Object.freeze([]),
});
const SECRET_KEY_PARTS = Object.freeze(["cookie", "token", "apikey", "recoverykey", "session", "password", "secret", "authorization"]);
const BASE_POLL_DELAY_MS = 2_000;
const MAX_POLL_DELAY_MS = 30_000;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizedKey(key) {
  return String(key).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function assertSafeKey(key) {
  const normalized = normalizedKey(key);
  if (SECRET_KEY_PARTS.some(part => normalized.includes(part))) {
    throw new TypeError(`Forbidden API run field: ${key}`);
  }
}

function isAbsolutePath(value) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return false;
  return /[a-z]:[\\/]/i.test(value)
    || /\\\\[^\\\s]/.test(value)
    || /(?:^|[\s("'`=:])\/(?!\/)[^\s"'`]*/.test(value)
    || /\/\/[^/\s]/.test(value);
}

function assertNullablePublicHttpsUrl(value, field) {
  if (value === null) return;
  if (typeof value !== "string") throw new TypeError(`API run ${field} must be a string or null`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`API run ${field} must be a public HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password
    || ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname.toLowerCase())) {
    throw new TypeError(`API run ${field} must be a public HTTPS URL`);
  }
}

function isUnsafeUrl(value) {
  if (/(?:^|[\s("'`=])(?:blob|file):/i.test(value)) return true;
  try {
    const parsed = new URL(value);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname.toLowerCase());
  } catch {
    return /https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?(?:[/?#]|$)/i.test(value);
  }
}

function assertSafeScalar(value, field) {
  if (typeof value !== "string") return;
  if (isAbsolutePath(value)) throw new TypeError(`Absolute path is not allowed in API run field: ${field}`);
  if (isUnsafeUrl(value)) throw new TypeError(`Unsafe local URL is not allowed in API run field: ${field}`);
  if (/(?:^|[?&#;\s("'`])(?:cookie|token|api(?:[_-]?key)|recovery(?:[_-]?key)|session|password|secret|authorization)\s*[:=]/i.test(value)
    || /\bbearer\s+\S+/i.test(value)) {
    throw new TypeError(`Forbidden secret-like value in API run field: ${field}`);
  }
}

function assertAllowedKeys(value, allowed, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be a plain object`);
  for (const [key, fieldValue] of Object.entries(value)) {
    assertSafeKey(key);
    if (!allowed.includes(key)) throw new TypeError(`Unsupported API run field: ${key}`);
    assertSafeScalar(fieldValue, key);
  }
}

function assertRunValue(value) {
  assertAllowedKeys(value, RUN_FIELDS, "API run");
  if (typeof value.id !== "string" || value.id.length === 0) throw new TypeError("API run id must be a non-empty string");
  if (typeof value.batchId !== "string" || value.batchId.length === 0) throw new TypeError("API run batchId must be a non-empty string");
  if (!API_RUN_STATUSES.includes(value.status)) throw new TypeError("API run status is invalid");
  if (value.jobId !== null && typeof value.jobId !== "string") throw new TypeError("API run jobId must be a string or null");
  if (typeof value.createdAt !== "string" || value.createdAt.length === 0) throw new TypeError("API run createdAt must be a string");
  if (typeof value.updatedAt !== "string" || value.updatedAt.length === 0) throw new TypeError("API run updatedAt must be a string");
  if (!Number.isInteger(value.attempts) || value.attempts < 0) throw new TypeError("API run attempts must be a non-negative integer");
  if (value.nextPollAt !== null && (!Number.isFinite(value.nextPollAt) || value.nextPollAt < 0)) {
    throw new TypeError("API run nextPollAt must be a non-negative finite number or null");
  }
  assertNullablePublicHttpsUrl(value.generatedUrl, "generatedUrl");
  if (value.downloadSha256 !== null && (typeof value.downloadSha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(value.downloadSha256))) {
    throw new TypeError("API run downloadSha256 must be a SHA-256 hash or null");
  }
  if (value.errorCode !== null && (typeof value.errorCode !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.errorCode))) {
    throw new TypeError("API run errorCode must be a safe code or null");
  }
  if (value.error !== null && typeof value.error !== "string") throw new TypeError("API run error must be a string or null");
}

function detachedRun(value) {
  return Object.fromEntries(RUN_FIELDS.map(key => [key, value[key]]));
}

export function createApiRun(input) {
  assertAllowedKeys(input, CREATE_FIELDS, "API run input");
  if (typeof input.id !== "string" || input.id.length === 0) throw new TypeError("API run id must be a non-empty string");
  if (typeof input.batchId !== "string" || input.batchId.length === 0) throw new TypeError("API run batchId must be a non-empty string");
  if (typeof input.createdAt !== "string" || input.createdAt.length === 0) throw new TypeError("API run createdAt must be a string");
  if (input.updatedAt !== undefined && (typeof input.updatedAt !== "string" || input.updatedAt.length === 0)) {
    throw new TypeError("API run updatedAt must be a string");
  }
  const run = detachedRun({
    id: input.id,
    batchId: input.batchId,
    status: "queued",
    jobId: null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
    attempts: input.attempts ?? 0,
    nextPollAt: input.nextPollAt ?? null,
    generatedUrl: input.generatedUrl ?? null,
    downloadSha256: input.downloadSha256 ?? null,
    errorCode: input.errorCode ?? null,
    error: input.error ?? null,
  });
  assertRunValue(run);
  return run;
}

export function transitionApiRun(run, nextStatus, patch = {}) {
  assertRunValue(run);
  if (!API_RUN_STATUSES.includes(nextStatus) || !TRANSITIONS[run.status].includes(nextStatus)) {
    throw new RangeError(`Invalid API run status transition: ${run.status} -> ${nextStatus}`);
  }
  assertAllowedKeys(patch, PATCH_FIELDS, "API run patch");
  const next = detachedRun({ ...run, ...patch, status: nextStatus });
  assertRunValue(next);
  return next;
}

export function scheduleNextPoll(run, options = {}) {
  assertRunValue(run);
  if (run.status !== "generating") throw new RangeError("Only generating API runs can be polled");
  if (!isPlainObject(options) || !Number.isFinite(options.now)) throw new TypeError("Poll scheduling requires a finite now value");
  const retryAfterMs = options.retryAfterMs;
  const backoffDelay = Math.min(MAX_POLL_DELAY_MS, BASE_POLL_DELAY_MS * (2 ** run.attempts));
  const delayMs = Number.isFinite(retryAfterMs) && retryAfterMs >= 0 && retryAfterMs <= MAX_POLL_DELAY_MS
    ? retryAfterMs
    : backoffDelay;
  const nextPollAt = options.now + delayMs;
  if (!Number.isFinite(nextPollAt)) throw new RangeError("Poll time must remain finite");
  return { attempts: run.attempts + 1, delayMs, nextPollAt };
}
