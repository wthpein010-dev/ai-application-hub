const FILE_NAME_KEY = /(?:file.?name|filename|originalName|localFile)/i;
const RAW_MEDIA_WORD = /^(?:raw|binary|audio|samples?|channels?|buffers?|pcm|waveform)$/i;
const NON_URL_FILE_NAME = /(?:^|[\\/\s("'`=])[^\\/\s"'`=]+\.[a-z][a-z0-9]{0,9}(?=$|[?#\s)"'`,;])/i;
const LOCAL_URL = /(?:file|blob):/i;
const SECRET_VALUE = /(?:^|[?&#;\s("'`])(?:cookie|token|api(?:[_-]?key)|recovery(?:[_-]?key)|session|password|secret)\s*[:=]/i;
const SECRET_KEY_PARTS = ["cookie", "token", "apikey", "recoverykey", "session", "password", "secret", "authorization"];

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message) {
  throw new TypeError(message);
}

export function normalizePortableKey(key) {
  return String(key).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isSecretKey(key) {
  const normalized = normalizePortableKey(key);
  return normalized.length > 0 && SECRET_KEY_PARTS.some(part => normalized.includes(part));
}

function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function looksLikeUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export function assertHttpsUrl(value, field = "URL") {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${field} must be a valid HTTPS URL`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${field} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== "https:") fail(`${field} must use HTTPS`);
  if (parsed.username || parsed.password) fail(`${field} must not contain credentials or userinfo`);
  if (SECRET_VALUE.test(value)) fail(`${field} cannot contain a secret-like value`);
  return value;
}

function containsAbsolutePath(value) {
  return /[a-zA-Z]:[\\/][^\s"'`]*/.test(value)
    || /\\\\[^\\\s"'`]+\\[^\s"'`]*/.test(value)
    || /\/\/[^/\s"'`]+\/[^\s"'`]*/.test(value)
    || /(?:^|[\s("'`=:])\/(?!\/)[^\s"'`]*/.test(value);
}

function isExplicitAnalysisPath(path) {
  return (path[0] === "references" || path[0] === "candidates") && path.includes("analysis");
}

function isExplicitChromaPath(path) {
  return isExplicitAnalysisPath(path) && path.at(-2) === "key" && path.at(-1) === "chroma";
}

function isRawMediaKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .some(word => RAW_MEDIA_WORD.test(word));
}

export function assertPortableValue(value, key = "", path = [], seen = new WeakSet()) {
  const currentPath = key ? [...path, key] : path;
  if (isSecretKey(key)) fail(`Forbidden key: ${key}`);
  if (FILE_NAME_KEY.test(key)) fail(`Portable state cannot contain a file name key: ${key}`);
  const explicitAnalysisScalar = isExplicitAnalysisPath(currentPath) && (key === "sampleRate" || key === "channelCount");
  if (typeof value === "string") {
    if (SECRET_VALUE.test(value)) fail(`Portable state cannot contain a secret-like value in ${key || "value"}`);
    if (isHttpsUrl(value)) {
      assertHttpsUrl(value, key || "URL");
    } else if (looksLikeUrl(value) && !LOCAL_URL.test(value)) {
      assertHttpsUrl(value, key || "URL");
    } else {
      if (containsAbsolutePath(value)) fail(`Absolute path is not allowed in portable state: ${key || "value"}`);
      if (LOCAL_URL.test(value)) fail(`Portable state cannot contain file: or blob: URLs in ${key || "value"}`);
      if (NON_URL_FILE_NAME.test(value)) fail(`Portable state cannot contain a non-URL file name in ${key || "value"}`);
    }
  }
  if (isRawMediaKey(key) && !explicitAnalysisScalar) {
    fail(`Forbidden key for raw audio or binary data; absolute path and file payloads are not portable: ${key}`);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) fail("Circular values are not allowed");
    if (key === "chroma") {
      if (!isExplicitChromaPath(currentPath)
        || value.length !== 12
        || value.some(item => typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 1)) {
        fail("analysis.key.chroma must be an explicit 12-value feature vector");
      }
    } else if (value.length > 0 && value.every(item => typeof item === "number")) {
      fail(`Unknown numeric array is not portable at ${currentPath.join(".") || "project"}`);
    }
    seen.add(value);
    value.forEach(item => assertPortableValue(item, "", currentPath, seen));
    seen.delete(value);
    return;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) fail("Circular values are not allowed");
    seen.add(value);
    for (const [childKey, childValue] of Object.entries(value)) {
      assertPortableValue(childValue, childKey, currentPath, seen);
    }
    seen.delete(value);
    return;
  }
  if (value !== null && typeof value === "number" && !Number.isFinite(value)) fail("Only finite numbers are allowed");
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    fail("Only plain JSON values are allowed");
  }
}
