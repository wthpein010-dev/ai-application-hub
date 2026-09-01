import {
  exportProjectJson,
  exportProjectMarkdown,
  importProjectJson,
} from "./project-state.mjs";

export const MAX_PROJECT_DOCUMENT_BYTES = 48 * 1024 * 1024;
export const MAX_EMBEDDED_PROJECT_BYTES = 16 * 1024 * 1024;

const BEGIN_MARKER = "<!-- LOOP-BGM-LAB-PORTABLE-STATE-BEGIN";
const END_MARKER = "<!-- LOOP-BGM-LAB-PORTABLE-STATE-END -->";
const CODE_FENCE = "```loop-bgm-lab-state";
const METADATA_KEYS = ["version", "encoding", "byteLength", "sha256"];
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const SHA256 = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new TypeError(message);
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value);
}

function assertDocumentTextAndLimit(text) {
  if (typeof text !== "string") fail("project document must be text");
  if (utf8Bytes(text).byteLength > MAX_PROJECT_DOCUMENT_BYTES) {
    fail("project document exceeds 48 MiB");
  }
  return text;
}

function assertEmbeddedLength(bytes, byteLength) {
  if (bytes.byteLength > MAX_EMBEDDED_PROJECT_BYTES) {
    fail("embedded project exceeds 16 MiB");
  }
  if (bytes.byteLength !== byteLength) {
    fail("Markdown handoff embedded byte length mismatch");
  }
}

async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") fail("Web Crypto SHA-256 is unavailable");
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function encodeBase64Url(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  const encoded = typeof globalThis.btoa === "function"
    ? globalThis.btoa(binary)
    : Buffer.from(bytes).toString("base64");
  return encoded.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeCanonicalBase64Url(payload) {
  const lines = payload.split("\n");
  if (!payload || lines.some(line => line.length === 0 || line.length > 96 || !BASE64URL.test(line))) {
    fail("Markdown handoff payload is not valid unpadded base64url");
  }
  const compact = lines.join("");
  if (compact.length % 4 === 1) fail("Markdown handoff payload is not valid base64url");
  const estimatedLength = Math.floor(compact.length * 3 / 4);
  if (estimatedLength > MAX_EMBEDDED_PROJECT_BYTES + 2) fail("embedded project exceeds 16 MiB");
  const padded = compact.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (compact.length % 4)) % 4);
  let binary;
  try {
    binary = typeof globalThis.atob === "function"
      ? globalThis.atob(padded)
      : Buffer.from(padded, "base64").toString("binary");
  } catch {
    fail("Markdown handoff payload is not valid base64url");
  }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (encodeBase64Url(bytes) !== compact) fail("Markdown handoff payload is not canonical base64url");
  return bytes;
}

function wrapBase64Url(encoded, width) {
  const lines = [];
  for (let offset = 0; offset < encoded.length; offset += width) lines.push(encoded.slice(offset, offset + width));
  return lines.join("\n");
}

function redactReservedMarkers(markdown) {
  return markdown
    .replaceAll(BEGIN_MARKER, "[reserved portable-state marker text was redacted]")
    .replaceAll(END_MARKER, "[reserved portable-state end marker text was redacted]")
    .replaceAll("LOOP-BGM-LAB-PORTABLE-STATE-BEGIN", "[reserved portable-state begin marker text was redacted]")
    .replaceAll("LOOP-BGM-LAB-PORTABLE-STATE-END", "[reserved portable-state end marker text was redacted]");
}

function beginMetadata(byteLength, sha256) {
  return [
    BEGIN_MARKER,
    "version=1",
    "encoding=base64url",
    `byteLength=${byteLength}`,
    `sha256=${sha256}`,
    "-->",
  ].join("\n");
}

function parseMetadata(metadataText) {
  const lines = metadataText.split("\n");
  if (lines.length !== METADATA_KEYS.length) fail("Markdown handoff metadata must contain exactly four keys");
  const metadata = {};
  lines.forEach((line, index) => {
    const expectedKey = METADATA_KEYS[index];
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*)=(.*)$/);
    if (!match || match[1] !== expectedKey || Object.hasOwn(metadata, match[1])) {
      fail(`Unknown or incorrectly ordered Markdown handoff metadata key: ${match?.[1] ?? ""}`);
    }
    metadata[match[1]] = match[2];
  });
  if (metadata.version !== "1") fail(`Unsupported Markdown handoff version: ${metadata.version}`);
  if (metadata.encoding !== "base64url") fail(`Unsupported Markdown handoff encoding: ${metadata.encoding}`);
  if (!/^(0|[1-9][0-9]*)$/.test(metadata.byteLength)) fail("Markdown handoff byteLength is invalid");
  const byteLength = Number(metadata.byteLength);
  if (!Number.isSafeInteger(byteLength)) fail("Markdown handoff byteLength is invalid");
  if (!SHA256.test(metadata.sha256)) fail("Markdown handoff sha256 is invalid");
  return { byteLength, sha256: metadata.sha256 };
}

function extractUniqueTrailingEnvelope(text) {
  const beginCount = (text.match(/LOOP-BGM-LAB-PORTABLE-STATE-BEGIN/g) || []).length;
  const endCount = (text.match(/LOOP-BGM-LAB-PORTABLE-STATE-END/g) || []).length;
  if (beginCount !== 1 || endCount !== 1) fail("Markdown handoff must contain exactly one envelope marker pair");
  const beginIndex = text.indexOf(BEGIN_MARKER);
  const endIndex = text.indexOf(END_MARKER);
  if (beginIndex < 0 || endIndex < 0 || endIndex <= beginIndex) {
    fail("Markdown handoff envelope markers are missing or out of order");
  }
  const envelope = text.slice(beginIndex).trimEnd();
  const beginLine = `${BEGIN_MARKER}\n`;
  if (!envelope.startsWith(beginLine)) fail("Markdown handoff envelope structure is invalid");
  const metadataEnd = envelope.indexOf("\n-->\n", beginLine.length);
  if (metadataEnd < 0) fail("Markdown handoff envelope structure is invalid");
  const metadata = parseMetadata(envelope.slice(beginLine.length, metadataEnd));
  const fenceStart = metadataEnd + "\n-->\n".length;
  const fenceLine = `${CODE_FENCE}\n`;
  if (!envelope.startsWith(fenceLine, fenceStart)) fail("Markdown handoff state code fence is invalid");
  const payloadStart = fenceStart + fenceLine.length;
  const payloadEnd = envelope.indexOf("\n```\n", payloadStart);
  if (payloadEnd < 0) fail("Markdown handoff state code fence is invalid");
  const endStart = payloadEnd + "\n```\n".length;
  if (envelope.slice(endStart) !== END_MARKER) fail("Markdown handoff envelope end marker is invalid");
  return { ...metadata, payload: envelope.slice(payloadStart, payloadEnd) };
}

export async function exportProjectHandoffMarkdown(project) {
  const canonicalJson = exportProjectJson(project);
  const bytes = utf8Bytes(canonicalJson);
  if (bytes.byteLength > MAX_EMBEDDED_PROJECT_BYTES) fail("embedded project exceeds 16 MiB");
  const sha256 = await sha256Hex(bytes);
  const readable = redactReservedMarkers(exportProjectMarkdown(project)).trimEnd();
  const payload = wrapBase64Url(encodeBase64Url(bytes), 96);
  const markdown = `${readable}\n\n${beginMetadata(bytes.byteLength, sha256)}\n${CODE_FENCE}\n${payload}\n\`\`\`\n${END_MARKER}\n`;
  assertDocumentTextAndLimit(markdown);
  return markdown;
}

export async function importProjectDocument(text) {
  const normalized = assertDocumentTextAndLimit(text).replace(/^\uFEFF/, "");
  if (normalized.trimStart().startsWith("{")) {
    return { project: importProjectJson(normalized.trimStart()), format: "json" };
  }
  const lineNormalized = normalized.replace(/\r\n/g, "\n");
  const envelope = extractUniqueTrailingEnvelope(lineNormalized);
  const bytes = decodeCanonicalBase64Url(envelope.payload);
  assertEmbeddedLength(bytes, envelope.byteLength);
  if (await sha256Hex(bytes) !== envelope.sha256) fail("Markdown handoff SHA-256 mismatch");
  let json;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("Markdown handoff payload is not valid UTF-8");
  }
  return { project: importProjectJson(json), format: "markdown" };
}
