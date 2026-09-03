const FILE_NAME_KEY = /(?:file.?name|filename|originalName|localFile)/i;
const RAW_MEDIA_WORD = /^(?:raw|binary|audio|samples?|channels?|buffers?|pcm|waveform)$/i;
const NON_URL_FILE_NAME = /(?:^|[\\/\s("'`=])[^\\/\s"'`=]+\.[a-z][a-z0-9]{0,9}(?=$|[?#\s)"'`,;])/i;
const EMBEDDED_URI_REFERENCE = /(^|[^A-Za-z0-9+.-])((?:https?|ftp):(?=\S)|data:[^,\r\n]*,|javascript:|vbscript:|file:|blob:|mailto:(?=\S)|urn:(?=\S))/gi;
const SECRET_VALUE = /(?:^|[?&#;\s("'`])(?:cookie|token|api(?:[_-]?key)|recovery(?:[_-]?key)|session|password|secret)\s*[:=]/i;
const SECRET_KEY_PARTS = ["cookie", "token", "apikey", "recoverykey", "session", "password", "secret", "authorization"];
const MEDIA_PATH = /\.(?:aac|aif|aiff|flac|m4a|mp3|oga|ogg|opus|wav|wma|zip)$/i;
const DOWNLOAD_PATH = /\/(?:attachments?|downloads?|files?)(?:\/|$)/i;
const SIGNED_PARAMETER_NAMES = new Set([
  "expires", "signature", "sig", "keypairid", "policy", "download", "responsecontentdisposition",
]);
const IPV4_GLOBAL_EXCEPTIONS = ["192.0.0.9/32", "192.0.0.10/32", "192.88.99.2/32"];
const IPV4_NON_GLOBAL_CIDRS = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
  "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16",
  "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
];
const IPV6_GLOBAL_EXCEPTIONS = [
  "2001:1::1/128", "2001:1::2/128", "2001:1::3/128", "2001:3::/32",
  "2001:4:112::/48", "2001:20::/28", "2001:30::/28",
];
const IPV6_NON_GLOBAL_CIDRS = [
  "::/128", "::1/128", "64:ff9b:1::/48", "100::/64", "100:0:0:1::/64",
  "2001::/23", "2001:2::/48", "2001:10::/28", "2001:db8::/32", "2002::/16",
  "3fff::/20", "5f00::/16", "fc00::/7", "fe80::/10", "fec0::/10", "ff00::/8",
];

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

function decodedParameterName(name) {
  return decodeRepeatedly(name);
}

function decodeAsciiPercentOnce(value) {
  return value.replace(/%([0-7][0-9a-f])/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function normalizeUriInspection(value) {
  let decoded = String(value);
  for (let index = 0; index < 8; index += 1) {
    const next = decodeAsciiPercentOnce(decoded);
    if (next === decoded) return decoded.replace(/[\u0009\u000a\u000d]/g, "");
    decoded = next;
  }
  const next = decodeAsciiPercentOnce(decoded);
  if (next !== decoded) fail("URL value uses excessive nested encoding");
  return decoded.replace(/[\u0009\u000a\u000d]/g, "");
}

function decodeRepeatedly(value) {
  return normalizeUriInspection(String(value).replace(/\+/g, " "));
}

function hasEmbeddedUri(value, { allowLeadingHttps = false } = {}) {
  const inspected = normalizeUriInspection(value).trim();
  EMBEDDED_URI_REFERENCE.lastIndex = 0;
  let match;
  while ((match = EMBEDDED_URI_REFERENCE.exec(inspected)) !== null) {
    const referenceIndex = match.index + match[1].length;
    if (allowLeadingHttps && referenceIndex === 0 && match[2].toLowerCase() === "https:") continue;
    return true;
  }
  return false;
}

function assertValidUrlEncoding(parsed, field) {
  for (const component of [parsed.pathname, parsed.search.slice(1), parsed.hash.slice(1)]) {
    try {
      decodeURIComponent(component);
    } catch {
      fail(`${field} contains invalid percent or UTF-8 encoding`);
    }
  }
}

function assertNoSecretParameters(parsed, field) {
  const parameterSets = [parsed.searchParams];
  if (parsed.hash.length > 1) parameterSets.push(new URLSearchParams(parsed.hash.slice(1)));
  for (const parameters of parameterSets) {
    for (const name of parameters.keys()) {
      if (isSecretKey(decodedParameterName(name))) {
        fail(`${field} cannot contain a secret-like parameter name`);
      }
    }
  }
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
  assertValidUrlEncoding(parsed, field);
  assertNoSecretParameters(parsed, field);
  if (SECRET_VALUE.test(value)) fail(`${field} cannot contain a secret-like value`);
  return value;
}

function containsAbsolutePath(value) {
  return /[a-zA-Z]:[\\/][^\s"'`]*/.test(value)
    || /\\\\[^\\\s"'`]+\\[^\s"'`]*/.test(value)
    || /\/\/[^/\s"'`]+\/[^\s"'`]*/.test(value)
    || /(?:^|[\s("'`=:])\/(?!\/)[^\s"'`]*/.test(value);
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

function isNonGlobalIpv4(parts) {
  if (IPV4_GLOBAL_EXCEPTIONS.some(cidr => matchesIpv4Cidr(parts, cidr))) return false;
  return IPV4_NON_GLOBAL_CIDRS.some(cidr => matchesIpv4Cidr(parts, cidr));
}

function isNonGlobalIpv6(groups) {
  if (groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff) {
    return isNonGlobalIpv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]);
  }
  if (IPV6_GLOBAL_EXCEPTIONS.some(cidr => matchesIpv6Cidr(groups, cidr))) return false;
  return IPV6_NON_GLOBAL_CIDRS.some(cidr => matchesIpv6Cidr(groups, cidr));
}

function isNonGlobalIpLiteral(hostname) {
  const ipv4 = parseIpv4(hostname);
  if (ipv4) return isNonGlobalIpv4(ipv4);
  const ipv6 = parseIpv6(hostname);
  return ipv6 ? isNonGlobalIpv6(ipv6) : false;
}

function isLocalOrPrivateHostname(hostname) {
  const normalized = String(hostname).toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) return true;
  return isNonGlobalIpLiteral(normalized);
}

function assertPortableUrlComponent(value, field) {
  const decoded = decodeRepeatedly(value);
  if (decoded.split(/[?&#;,\s]+/).some(part => {
    const assignment = part.indexOf("=");
    return assignment > 0 && isSignedParameterName(part.slice(0, assignment));
  })) {
    fail(`${field} must be a public evidence page without signed download parameters`);
  }
  if (hasEmbeddedUri(decoded)) fail(`${field} cannot contain nested URLs or URI schemes`);
  if (containsAbsolutePath(decoded)) fail(`${field} cannot contain a local or absolute path`);
  if (SECRET_VALUE.test(decoded)) fail(`${field} cannot contain a secret-like value`);
  if (NON_URL_FILE_NAME.test(decoded)) fail(`${field} cannot contain a file name or media transport value`);
}

function isSignedParameterName(name) {
  const decodedName = decodeRepeatedly(name).split("=", 1)[0];
  const normalized = normalizePortableKey(decodedName);
  return SIGNED_PARAMETER_NAMES.has(normalized)
    || normalized.startsWith("xamz")
    || normalized.startsWith("xgoog");
}

export function assertPublicEvidencePageUrl(value, field = "URL", { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const normalized = typeof value === "string" ? value.trim() : value;
  assertHttpsUrl(normalized, field);
  const parsed = new URL(normalized);
  if (isLocalOrPrivateHostname(parsed.hostname)) {
    fail(`${field} must use a public host, not a local or private address`);
  }
  const decodedPath = decodeRepeatedly(parsed.pathname);
  if (MEDIA_PATH.test(decodedPath) || DOWNLOAD_PATH.test(decodedPath)) {
    fail(`${field} must be a public evidence page, not a media or download URL`);
  }
  for (const [parameterName, parameterValue] of parsed.searchParams) {
    if (isSignedParameterName(parameterName)) {
      fail(`${field} must be a public evidence page without signed download parameters`);
    }
    assertPortableUrlComponent(parameterValue, field);
  }
  if (parsed.hash.length > 1) {
    const fragment = parsed.hash.slice(1);
    for (const [parameterName, parameterValue] of new URLSearchParams(fragment)) {
      if (isSignedParameterName(parameterName)) {
        fail(`${field} must be a public evidence page without signed download parameters`);
      }
      assertPortableUrlComponent(parameterValue, field);
    }
    assertPortableUrlComponent(fragment, field);
  }
  return normalized;
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
    const httpsValue = isHttpsUrl(value);
    if (hasEmbeddedUri(value, { allowLeadingHttps: httpsValue })) {
      fail(`Portable state cannot contain embedded or non-HTTPS URI schemes in ${key || "value"}`);
    }
    if (httpsValue) {
      assertHttpsUrl(value, key || "URL");
    } else if (looksLikeUrl(value)) {
      assertHttpsUrl(value, key || "URL");
    } else {
      if (containsAbsolutePath(value)) fail(`Absolute path is not allowed in portable state: ${key || "value"}`);
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
