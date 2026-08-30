import { createExperimentRecord, validateLicenseEntry } from "./candidate-score.mjs";

const PROJECT_VERSION = 1;
const STATUS_VALUES = new Set(["planned", "submitted", "downloaded", "reviewed", "rejected"]);
const TRANSITIONS = {
  planned: new Set(["planned", "submitted", "rejected"]),
  submitted: new Set(["submitted", "downloaded", "rejected"]),
  downloaded: new Set(["downloaded", "reviewed", "rejected"]),
  reviewed: new Set(["reviewed"]),
  rejected: new Set(["rejected"])
};
const PROJECT_KEYS = new Set([
  "version", "toolVersion", "ruleCheckedAt", "styleSpec", "credits", "batches",
  "sourceUrl", "references", "candidates", "experiments", "licenses", "currentBestCandidate",
  "outstandingIssues", "nextRoundSuggestion", "extensions"
]);
const BATCH_KEYS = new Set([
  "id", "changedAxis", "prompt", "excludePrompt", "expectedDifference", "credits",
  "status", "generatedUrl", "candidateHash", "subjectiveScore", "nextRoundNote"
]);
const BATCH_PATCH_KEYS = new Set(["generatedUrl", "candidateHash", "subjectiveScore", "nextRoundNote"]);
const STYLE_KEYS = new Set(["version", "intent", "tempo", "key", "mood", "instruments", "structure", "mix", "exclusions"]);
const SECRET_KEY = /(cookie|token|apiKey|recoveryKey|session)/i;
const FILE_NAME_KEY = /(?:file.?name|filename|originalName|localFile)/i;
const RAW_MEDIA_WORD = /^(?:raw|binary|audio|samples?|channels?|buffers?|pcm|waveform)$/i;
const NON_URL_FILE_NAME = /(?:^|[\\/\s("'`=])[^\\/\s"'`=]+\.[a-z][a-z0-9]{0,9}(?=$|[?#\s)"'`,;])/i;
const LOCAL_URL = /(?:file|blob):/i;
const SECRET_VALUE = /\b(?:cookie|token|api.?key|recovery.?key|session)\s*[:=]/i;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message) {
  throw new TypeError(message);
}

function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
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

function assertSafeValue(value, key = "", path = [], seen = new WeakSet()) {
  const currentPath = key ? [...path, key] : path;
  if (SECRET_KEY.test(key)) {
    fail(`Forbidden key: ${key}`);
  }
  if (FILE_NAME_KEY.test(key)) fail(`Portable state cannot contain a file name key: ${key}`);
  const explicitAnalysisScalar = isExplicitAnalysisPath(currentPath) && (key === "sampleRate" || key === "channelCount");
  if (typeof value === "string" && !isHttpsUrl(value)) {
    if (containsAbsolutePath(value)) fail(`Absolute path is not allowed in portable state: ${key || "value"}`);
    if (LOCAL_URL.test(value)) fail(`Portable state cannot contain file: or blob: URLs in ${key || "value"}`);
    if (NON_URL_FILE_NAME.test(value)) fail(`Portable state cannot contain a non-URL file name in ${key || "value"}`);
    if (SECRET_VALUE.test(value)) fail(`Portable state cannot contain a secret-like value in ${key || "value"}`);
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
    value.forEach(item => assertSafeValue(item, "", currentPath, seen));
    seen.delete(value);
    return;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) fail("Circular values are not allowed");
    seen.add(value);
    for (const [childKey, childValue] of Object.entries(value)) {
      assertSafeValue(childValue, childKey, currentPath, seen);
    }
    seen.delete(value);
  }
}

function markdownText(value) {
  const urls = [];
  const protectedUrls = String(value).replace(/https?:\/\/[^\s"\\]+/g, url => {
    const marker = `\u0000loop-bgm-url-${urls.length}\u0000`;
    urls.push(url);
    return marker;
  });
  const redacted = protectedUrls
    .replace(/[a-zA-Z]:[\\/][^\s]*/g, "[redacted local path]")
    .replace(/(^|[^A-Za-z0-9:])\/(?!\/)[^\s"\\]+/g, "$1[redacted local path]");
  return redacted.replace(/\u0000loop-bgm-url-(\d+)\u0000/g, (_, index) => urls[Number(index)]);
}

function assertString(value, field, { nullable = false } = {}) {
  if ((nullable && value === null) || typeof value === "string") return;
  fail(`${field} must be a string${nullable ? " or null" : ""}`);
}

function assertNumber(value, field, { nullable = false } = {}) {
  if ((nullable && value === null) || (typeof value === "number" && Number.isFinite(value))) return;
  fail(`${field} must be a finite number${nullable ? " or null" : ""}`);
}

function assertArrayOfStrings(value, field) {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    fail(`${field} must be an array of strings`);
  }
}

function validateStyleSpec(styleSpec) {
  if (!isPlainObject(styleSpec)) fail("styleSpec must be an object");
  for (const key of Object.keys(styleSpec)) {
    if (!STYLE_KEYS.has(key)) fail(`Unsupported styleSpec field: ${key}`);
  }
  if (styleSpec.version !== PROJECT_VERSION) fail("styleSpec.version must be 1");
  assertString(styleSpec.intent, "styleSpec.intent");
  assertString(styleSpec.key, "styleSpec.key");
  assertArrayOfStrings(styleSpec.mood, "styleSpec.mood");
  assertArrayOfStrings(styleSpec.instruments, "styleSpec.instruments");
  assertArrayOfStrings(styleSpec.mix, "styleSpec.mix");
  assertArrayOfStrings(styleSpec.exclusions, "styleSpec.exclusions");
  if (!isPlainObject(styleSpec.tempo)) fail("styleSpec.tempo must be an object");
  for (const key of ["target", "min", "max"]) assertNumber(styleSpec.tempo[key], `styleSpec.tempo.${key}`);
  if (!isPlainObject(styleSpec.structure)) fail("styleSpec.structure must be an object");
  assertNumber(styleSpec.structure.bars, "styleSpec.structure.bars");
  if (typeof styleSpec.structure.loopable !== "boolean") fail("styleSpec.structure.loopable must be boolean");
  assertString(styleSpec.structure.intro, "styleSpec.structure.intro");
  assertString(styleSpec.structure.outro, "styleSpec.structure.outro");
}

function validateBatch(batch) {
  if (!isPlainObject(batch)) fail("batch must be an object");
  for (const key of Object.keys(batch)) {
    if (!BATCH_KEYS.has(key)) fail(`Unsupported batch field: ${key}`);
  }
  for (const key of ["id", "changedAxis", "prompt", "excludePrompt", "expectedDifference", "status"]) {
    assertString(batch[key], `batch.${key}`);
  }
  if (!STATUS_VALUES.has(batch.status)) fail(`Unsupported batch status: ${batch.status}`);
  assertNumber(batch.credits, "batch.credits");
  assertString(batch.generatedUrl, "batch.generatedUrl", { nullable: true });
  assertString(batch.candidateHash, "batch.candidateHash", { nullable: true });
  assertNumber(batch.subjectiveScore, "batch.subjectiveScore", { nullable: true });
  assertString(batch.nextRoundNote, "batch.nextRoundNote");
}

function cloneJson(value) {
  return JSON.parse(stableStringify(value));
}

export function stableStringify(value) {
  const seen = new WeakSet();
  const normalize = input => {
    if (input === null || typeof input === "string" || typeof input === "boolean") return input;
    if (typeof input === "number") {
      if (!Number.isFinite(input)) fail("Only finite numbers can be serialized");
      return input;
    }
    if (Array.isArray(input)) return input.map(normalize);
    if (!isPlainObject(input)) fail("Only plain JSON values can be serialized");
    if (seen.has(input)) fail("Circular values cannot be serialized");
    seen.add(input);
    const output = {};
    for (const key of Object.keys(input).sort()) {
      if (typeof input[key] !== "undefined") output[key] = normalize(input[key]);
    }
    seen.delete(input);
    return output;
  };
  return JSON.stringify(normalize(value));
}

export function validateProject(input) {
  if (!isPlainObject(input)) fail("project must be an object");
  assertSafeValue(input);
  if (input.version !== PROJECT_VERSION) fail("project.version must be 1");
  assertString(input.toolVersion, "toolVersion");
  assertString(input.ruleCheckedAt, "ruleCheckedAt");
  validateStyleSpec(input.styleSpec);
  if (!isPlainObject(input.credits)) fail("credits must be an object");
  for (const key of ["planned", "perBatch", "batchCount"]) assertNumber(input.credits[key], `credits.${key}`);
  if (!Array.isArray(input.batches) || input.batches.length !== 5) fail("project must contain exactly five batches");
  input.batches.forEach(validateBatch);
  const ids = input.batches.map(batch => batch.id);
  if (new Set(ids).size !== ids.length) fail("batch ids must be unique");
  if (typeof input.experiments !== "undefined" && !Array.isArray(input.experiments)) fail("experiments must be an array");
  if (typeof input.licenses !== "undefined" && !Array.isArray(input.licenses)) fail("licenses must be an array");
  const validatedLicenses = Array.isArray(input.licenses) ? input.licenses.map(validateLicenseEntry) : null;
  if (validatedLicenses && new Set(validatedLicenses.map(entry => entry.id)).size !== validatedLicenses.length) {
    fail("license ids must be unique");
  }

  const output = {};
  for (const key of PROJECT_KEYS) {
    if (key !== "extensions" && key !== "experiments" && Object.hasOwn(input, key)) output[key] = cloneJson(input[key]);
  }
  const unknown = {};
  for (const [key, value] of Object.entries(input)) {
    if (!PROJECT_KEYS.has(key)) unknown[key] = cloneJson(value);
  }
  const suppliedExtensions = input.extensions ? cloneJson(input.extensions) : {};
  if (!isPlainObject(suppliedExtensions)) fail("extensions must be an object");
  output.extensions = { ...suppliedExtensions, ...unknown };
  if (Array.isArray(input.experiments)) output.experiments = input.experiments.map(createExperimentRecord);
  if (validatedLicenses) output.licenses = validatedLicenses;
  return output;
}

export function transitionBatch(plan, batchId, status, patch = {}) {
  const validated = validateProject(plan);
  if (!STATUS_VALUES.has(status)) fail(`Unsupported batch status: ${status}`);
  if (!isPlainObject(patch)) fail("batch patch must be an object");
  for (const key of Object.keys(patch)) {
    if (!BATCH_PATCH_KEYS.has(key)) fail(`Unsupported batch patch field: ${key}`);
  }
  assertSafeValue(patch);
  const index = validated.batches.findIndex(batch => batch.id === batchId);
  if (index < 0) fail(`Unknown batch: ${batchId}`);
  const current = validated.batches[index];
  if (!TRANSITIONS[current.status].has(status)) fail(`Invalid status transition: ${current.status} -> ${status}`);
  const next = { ...current, ...patch, status };
  validateBatch(next);
  validated.batches[index] = next;
  return validated;
}

export function exportProjectJson(project) {
  return stableStringify(validateProject(project));
}

export function importProjectJson(text) {
  if (typeof text !== "string") fail("project JSON must be text");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("project JSON is invalid");
  }
  return validateProject(parsed);
}

export function exportProjectMarkdown(project) {
  const safe = validateProject(project);
  const lines = [
    "# 循环乐工房项目交接",
    "",
    `- Schema version: ${safe.version}`,
    `- Tool version: ${markdownText(safe.toolVersion)}`,
    `- Rule checked: ${markdownText(safe.ruleCheckedAt)}`,
    `- Planned credits: ${safe.credits.planned} (${safe.credits.batchCount} × ${safe.credits.perBatch})`,
    `- Local plan based on rules checked on ${markdownText(safe.ruleCheckedAt)}; not an actual account balance.`,
    "",
    "## 风格画像",
    "",
    `- Key: ${markdownText(safe.styleSpec.key)}`,
    `- Tempo: ${safe.styleSpec.tempo.target} BPM (${safe.styleSpec.tempo.min}–${safe.styleSpec.tempo.max})`,
    `- Structure: ${safe.styleSpec.structure.bars}-bar loop`,
    "",
    "## 提示词批次",
    ""
  ];
  for (const batch of safe.batches) {
    lines.push(`### ${markdownText(batch.id)} — ${markdownText(batch.changedAxis)}`);
    lines.push(`- Status: ${markdownText(batch.status)}`);
    lines.push(`- Planned credits: ${batch.credits}`);
    lines.push(`- Expected difference: ${markdownText(batch.expectedDifference)}`);
    lines.push(`- Prompt: ${markdownText(batch.prompt)}`);
    lines.push(`- Exclude: ${markdownText(batch.excludePrompt)}`);
    if (batch.candidateHash) lines.push(`- Candidate hash: ${markdownText(batch.candidateHash)}`);
    if (batch.subjectiveScore !== null) lines.push(`- Subjective score: ${batch.subjectiveScore}`);
    if (batch.nextRoundNote) lines.push(`- Next-round note: ${markdownText(batch.nextRoundNote)}`);
    lines.push("");
  }
  const appendJsonSection = (title, value) => {
    if (typeof value === "undefined") return;
    lines.push(`## ${title}`, "", "```json", markdownText(stableStringify(value)), "```", "");
  };
  if (safe.sourceUrl) appendJsonSection("生成来源", safe.sourceUrl);
  appendJsonSection("参考记录", safe.references);
  appendJsonSection("候选记录", safe.candidates);
  appendJsonSection("授权台账", safe.licenses);
  appendJsonSection("尚存问题", safe.outstandingIssues);
  appendJsonSection("下一轮建议", safe.nextRoundSuggestion);
  if (isPlainObject(safe.currentBestCandidate)) {
    const { displayName, hash } = safe.currentBestCandidate;
    lines.push("## 当前最佳候选", "");
    if (typeof displayName === "string") lines.push(`- ${markdownText(displayName)}`);
    if (typeof hash === "string") lines.push(`- Hash: ${markdownText(hash)}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
