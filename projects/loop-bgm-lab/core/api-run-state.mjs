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
const URL_CREDENTIAL_PARTS = Object.freeze([
  "cookie", "token", "accesstoken", "apikey", "apisecret", "clientsecret",
  "authorization", "proxyauthorization", "session", "sessionsecret", "recoverykey", "password", "secret",
]);
const BASE_POLL_DELAY_MS = 2_000;
const MAX_POLL_DELAY_MS = 30_000;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
// IANA IPv4/IPv6 Special-Purpose Address registries, last verified 2025-10-09.
// These are non-globally-reachable or terminated blocks; more-specific global
// exceptions are checked first. This is literal parsing only and never performs DNS.
const IANA_IPV4_GLOBAL_EXCEPTIONS = Object.freeze(["192.0.0.9/32", "192.0.0.10/32"]);
const IANA_IPV4_NON_GLOBAL_CIDRS = Object.freeze([
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
  "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16",
  "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
]);
const IANA_IPV6_GLOBAL_EXCEPTIONS = Object.freeze([
  "2001:1::1/128", "2001:1::2/128", "2001:1::3/128", "2001:3::/32",
  "2001:4:112::/48", "2001:20::/28", "2001:30::/28",
]);
const IANA_IPV6_NON_GLOBAL_CIDRS = Object.freeze([
  "::/128", "::1/128", "64:ff9b:1::/48", "100::/64", "100:0:0:1::/64",
  "2001::/23", "2001:2::/48", "2001:10::/28", "2001:db8::/32", "2002::/16",
  "3fff::/20", "5f00::/16", "fc00::/7", "fe80::/10", "ff00::/8",
]);

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

function normalizedUrlPart(value) {
  let decoded = String(value);
  for (let index = 0; index < 2; index += 1) {
    try {
      const next = decodeURIComponent(decoded.replace(/\+/g, " "));
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseIpv4(hostname) {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null;
  const parsed = parts.map(Number);
  return parsed.every(part => part >= 0 && part <= 255) ? parsed : null;
}

function parseIpv6(hostname) {
  const doubleColon = hostname.indexOf("::");
  if (doubleColon !== hostname.lastIndexOf("::")) return null;
  const left = doubleColon === -1 ? hostname : hostname.slice(0, doubleColon);
  const right = doubleColon === -1 ? "" : hostname.slice(doubleColon + 2);
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  if (leftParts.concat(rightParts).some(part => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
  if (doubleColon === -1 && leftParts.length !== 8) return null;
  if (doubleColon !== -1 && leftParts.length + rightParts.length >= 8) return null;
  return [...leftParts, ...Array(8 - leftParts.length - rightParts.length).fill("0"), ...rightParts]
    .map(part => Number.parseInt(part, 16));
}

function matchesIpv4Cidr(parts, cidr) {
  const [network, prefixText] = cidr.split("/");
  const networkParts = parseIpv4(network);
  const prefix = Number(prefixText);
  if (!networkParts || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const fullBytes = Math.floor(prefix / 8);
  const remainder = prefix % 8;
  for (let index = 0; index < fullBytes; index += 1) {
    if (parts[index] !== networkParts[index]) return false;
  }
  if (remainder === 0) return true;
  const mask = (0xff << (8 - remainder)) & 0xff;
  return (parts[fullBytes] & mask) === (networkParts[fullBytes] & mask);
}

function matchesIpv6Cidr(groups, cidr) {
  const [network, prefixText] = cidr.split("/");
  const networkGroups = parseIpv6(network);
  const prefix = Number(prefixText);
  if (!networkGroups || !Number.isInteger(prefix) || prefix < 0 || prefix > 128) return false;
  const fullGroups = Math.floor(prefix / 16);
  const remainder = prefix % 16;
  for (let index = 0; index < fullGroups; index += 1) {
    if (groups[index] !== networkGroups[index]) return false;
  }
  if (remainder === 0) return true;
  const mask = (0xffff << (16 - remainder)) & 0xffff;
  return (groups[fullGroups] & mask) === (networkGroups[fullGroups] & mask);
}

function matchesAnyIpv4Cidr(parts, cidrs) {
  return cidrs.some(cidr => matchesIpv4Cidr(parts, cidr));
}

function matchesAnyIpv6Cidr(groups, cidrs) {
  return cidrs.some(cidr => matchesIpv6Cidr(groups, cidr));
}

function isNonGlobalIpv4(parts) {
  if (matchesAnyIpv4Cidr(parts, IANA_IPV4_GLOBAL_EXCEPTIONS)) return false;
  return matchesAnyIpv4Cidr(parts, IANA_IPV4_NON_GLOBAL_CIDRS);
}

function isNonGlobalIpv6(groups) {
  if (groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff) {
    return isNonGlobalIpv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]);
  }
  if (matchesAnyIpv6Cidr(groups, IANA_IPV6_GLOBAL_EXCEPTIONS)) return false;
  return matchesAnyIpv6Cidr(groups, IANA_IPV6_NON_GLOBAL_CIDRS);
}

function isNonGlobalIpLiteral(hostname) {
  const ipv4 = parseIpv4(hostname);
  if (ipv4) return isNonGlobalIpv4(ipv4);
  const ipv6 = parseIpv6(hostname);
  return ipv6 ? isNonGlobalIpv6(ipv6) : false;
}

function isLocalHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.+$/, "").replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || isNonGlobalIpLiteral(normalized);
}

function hasCredentialUrlParameter(parsed) {
  for (const [name, value] of parsed.searchParams) {
    const normalizedName = normalizedUrlPart(name);
    const normalizedValue = normalizedUrlPart(value);
    if (URL_CREDENTIAL_PARTS.some(part => normalizedName.includes(part) || normalizedValue.includes(part))
      || /^bearer\s+/i.test(value)) {
      return true;
    }
  }
  return false;
}

function assertSafeUrlParts(parsed, field) {
  if (parsed.username || parsed.password) throw new TypeError(`URL userinfo is not allowed in API run field: ${field}`);
  if (isLocalHostname(parsed.hostname)) throw new TypeError(`Unsafe local URL is not allowed in API run field: ${field}`);
  if (hasCredentialUrlParameter(parsed)) throw new TypeError(`Forbidden credential-like URL parameter in API run field: ${field}`);
  if (parsed.search || parsed.hash) throw new TypeError(`API run URL fields must not contain a query or fragment: ${field}`);
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
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new TypeError(`API run ${field} must be a public HTTPS URL`);
  }
  assertSafeUrlParts(parsed, field);
}

function isUnsafeUrl(value) {
  if (/(?:^|[\s("'`=])(?:blob|file):/i.test(value)) return true;
  try {
    const parsed = new URL(value);
    return isLocalHostname(parsed.hostname);
  } catch {
    return /https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?(?:[/?#.]|$)/i.test(value);
  }
}

function assertSafeScalar(value, field) {
  if (typeof value !== "string") return;
  if (isAbsolutePath(value)) throw new TypeError(`Absolute path is not allowed in API run field: ${field}`);
  if (isUnsafeUrl(value)) throw new TypeError(`Unsafe local URL is not allowed in API run field: ${field}`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {}
  if (parsed) {
    if (parsed.username || parsed.password) throw new TypeError(`URL userinfo is not allowed in API run field: ${field}`);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") assertSafeUrlParts(parsed, field);
  }
  if (/(?:^|[?&#;\s("'`])(?:cookie|token|access(?:[_-]?token)|api(?:[_-]?(?:key|secret))|client(?:[_-]?secret)|recovery(?:[_-]?key)|session|password|secret|authorization)\s*[:=]/i.test(value)
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
  if (typeof value.id !== "string" || !OPAQUE_ID.test(value.id)) throw new TypeError("API run id must be a safe opaque ID");
  if (typeof value.batchId !== "string" || !OPAQUE_ID.test(value.batchId)) throw new TypeError("API run batchId must be a safe opaque ID");
  if (!API_RUN_STATUSES.includes(value.status)) throw new TypeError("API run status is invalid");
  if (value.jobId !== null && (typeof value.jobId !== "string" || !OPAQUE_ID.test(value.jobId))) {
    throw new TypeError("API run jobId must be a safe opaque ID or null");
  }
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
    jobId: input.jobId ?? null,
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
