import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

export const SOURCE_URL = "https://gamepulse-mini-radar.polite-chord-7994.chatgpt.site/api/rankings?refresh=1";
const MAX_BYTES = 2 * 1024 * 1024;
const sourceIds = ["wechat", "popular", "grossing", "overseas"];
const sourceStatuses = new Set(["fresh", "cached", "error"]);
const storageModes = new Set(["d1", "seed-fallback"]);
const dangerousKeys = new Set(["__proto__", "prototype", "constructor"]);

function fail(message) {
  throw new Error(`GamePulse snapshot rejected: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function inspectTree(value, depth = 0, budget = { nodes: 0 }) {
  budget.nodes += 1;
  if (budget.nodes > 12_000) fail("payload contains too many values");
  if (depth > 16) fail("payload is nested too deeply");
  if (typeof value === "string" && value.length > 8_000) fail("payload contains an oversized string");
  if (Array.isArray(value)) {
    if (value.length > 2_000) fail("payload contains an oversized array");
    value.forEach((item) => inspectTree(item, depth + 1, budget));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (dangerousKeys.has(key)) fail(`unsafe key ${key}`);
    inspectTree(item, depth + 1, budget);
  }
}

function text(value, label, maximum = 300) {
  if (typeof value !== "string") fail(`${label} must be text`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) fail(`${label} has an invalid length`);
  return normalized;
}

function optionalText(value, label, maximum = 300) {
  if (value === undefined || value === null || value === "") return "";
  return text(value, label, maximum);
}

function dateText(value, label) {
  const normalized = text(value, label, 80);
  if (Number.isNaN(Date.parse(normalized))) fail(`${label} is not a date`);
  return normalized;
}

function rank(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    fail(`${label} must be a positive integer`);
  }
  return value;
}

function sanitizeGame(game, sourceId, rankField) {
  if (!isRecord(game)) fail(`${sourceId} contains an invalid game`);
  const sourceRank = rank(game[rankField], `${sourceId} rank`);
  return {
    rank: sourceRank,
    title: text(game.title, `${sourceId} title`, 180),
    developer: text(game.developer, `${sourceId} developer`, 220),
    category: text(game.category, `${sourceId} category`, 100),
    subCategory: text(game.subCategory, `${sourceId} subCategory`, 120),
    sourceLabel: text(game.sourceLabel, `${sourceId} sourceLabel`, 180),
    verifiedAt: dateText(game.verifiedAt, `${sourceId} verifiedAt`),
  };
}

function sourceTopTen(games, sourceId, rankField) {
  if (!Array.isArray(games) || games.length > 100) fail(`${sourceId} games must be a bounded array`);
  const byRank = new Map();
  for (const game of games) {
    const value = game?.[rankField];
    if (!Number.isSafeInteger(value) || value < 1 || value > 10) continue;
    if (byRank.has(value)) fail(`${sourceId} contains duplicate rank ${value}`);
    byRank.set(value, sanitizeGame(game, sourceId, rankField));
  }
  const result = Array.from({ length: 10 }, (_, index) => byRank.get(index + 1));
  if (result.some((item) => !item)) fail(`${sourceId} must contain complete ranks 1 through 10`);
  return result;
}

function sanitizeHealth(items) {
  if (!Array.isArray(items) || items.length !== sourceIds.length) {
    fail("sourceHealth must contain all four sources");
  }
  const byId = new Map();
  for (const item of items) {
    if (!isRecord(item) || !sourceIds.includes(item.id) || byId.has(item.id)) {
      fail("sourceHealth contains an invalid or duplicate source");
    }
    if (!sourceStatuses.has(item.status)) fail(`${item.id} has an invalid status`);
    byId.set(item.id, {
      id: item.id,
      label: text(item.label, `${item.id} health label`, 120),
      status: item.status,
      checkedAt: dateText(item.checkedAt, `${item.id} checkedAt`),
      message: optionalText(item.message, `${item.id} health message`, 500),
    });
  }
  return sourceIds.map((id) => byId.get(id));
}

export function buildPublishedSnapshot(payload, options = {}) {
  inspectTree(payload);
  if (!isRecord(payload) || !isRecord(payload.snapshot)) fail("missing snapshot object");
  if (!("history" in payload)) fail("missing history object");
  if (typeof payload.stale !== "boolean") fail("stale must be boolean");
  if (!storageModes.has(payload.storage)) fail("storage must be d1 or seed-fallback");

  const snapshot = payload.snapshot;
  if (!Array.isArray(snapshot.domestic) || !Array.isArray(snapshot.overseas)) {
    fail("snapshot rankings must be arrays");
  }
  if (typeof snapshot.stale !== "boolean") fail("snapshot stale must be boolean");
  const mirroredAt = dateText(options.mirroredAt || new Date().toISOString(), "mirroredAt");
  const health = sanitizeHealth(payload.sourceHealth);

  return {
    schemaVersion: 1,
    state: "ready",
    mirroredAt,
    sourceUpdatedAt: dateText(snapshot.updatedAt, "snapshot updatedAt"),
    displayDate: text(snapshot.displayDate, "snapshot displayDate", 40),
    stale: payload.stale || snapshot.stale || health.some((item) => item.status !== "fresh"),
    storage: payload.storage,
    sourceUrl: SOURCE_URL.replace("?refresh=1", ""),
    sourceHealth: health,
    rankings: {
      wechat: sourceTopTen(snapshot.domestic, "wechat", "wechatRank"),
      popular: sourceTopTen(snapshot.domestic, "popular", "popularRank"),
      grossing: sourceTopTen(snapshot.domestic, "grossing", "grossingRank"),
      overseas: sourceTopTen(snapshot.overseas, "overseas", "rank"),
    },
  };
}

async function responseJson(response) {
  if (!response?.ok) fail(`source returned HTTP ${response?.status ?? "unknown"}`);
  const contentType = response.headers?.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) fail("source did not return JSON");
  const contentLength = Number(response.headers?.get("content-length") || 0);
  if (contentLength > MAX_BYTES) fail("source response is larger than 2 MiB");

  const chunks = [];
  let total = 0;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          fail("source response is larger than 2 MiB");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    const value = new Uint8Array(await response.arrayBuffer());
    total = value.byteLength;
    chunks.push(value);
  }
  if (!total || total > MAX_BYTES) fail("source response has an invalid size");
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    fail("source response is not valid UTF-8");
  }
  try {
    return JSON.parse(decoded);
  } catch {
    fail("source returned invalid JSON");
  }
}

async function fetchSameOrigin(fetchImpl, sourceUrl) {
  const initial = new URL(sourceUrl);
  const expectedOrigin = initial.origin;
  const redirectStatuses = new Set([301, 302, 303, 307, 308]);
  const signal = AbortSignal.timeout(45_000);
  let current = initial;

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetchImpl(current.href, {
      headers: {
        accept: "application/json",
        "user-agent": "AI-Application-Hub-GamePulse-Snapshot/1.0",
      },
      redirect: "manual",
      signal,
    });
    if (!redirectStatuses.has(response.status)) {
      if (response.url && new URL(response.url).origin !== expectedOrigin) {
        fail("source redirected to another origin");
      }
      return response;
    }
    if (redirects === 3) fail("source redirected too many times");
    const location = response.headers?.get("location");
    if (!location) fail("source returned a redirect without a location");
    const next = new URL(location, current);
    if (next.origin !== expectedOrigin) fail("source redirected to another origin");
    current = next;
  }
  fail("source redirected too many times");
}

export async function updateSnapshot(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const sourceUrl = options.sourceUrl || SOURCE_URL;
  const targetPath = options.targetPath || join(
    dirname(dirname(fileURLToPath(import.meta.url))),
    "projects",
    "gamepulse-mini-radar",
    "data",
    "rankings.json",
  );
  const response = await fetchSameOrigin(fetchImpl, sourceUrl);
  const published = buildPublishedSnapshot(await responseJson(response), {
    mirroredAt: options.mirroredAt,
  });
  const tempPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(targetPath), { recursive: true });
  try {
    await writeFile(tempPath, `${JSON.stringify(published, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  return published;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) {
  updateSnapshot()
    .then((snapshot) => {
      console.log(`Updated GamePulse snapshot for ${snapshot.displayDate}.`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
