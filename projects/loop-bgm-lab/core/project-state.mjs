import {
  classifySimilarity,
  compareCandidate,
  createExperimentRecord,
  recommendNextVariant,
  validateLicenseEntry,
} from "./candidate-score.mjs";
import { assertHttpsUrl, assertPortableValue, isPlainObject } from "./portable-safety.mjs";
import { createPromptVariants, normalizeStyleSpec } from "./prompt-engine.mjs";

const PROJECT_VERSION = 3;
const STYLE_SPEC_VERSION = 1;
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
  "sourceUrl", "references", "candidates", "runs", "experiments", "licenses", "currentBestCandidate",
  "outstandingIssues", "nextRoundSuggestion", "extensions"
]);
const BATCH_KEYS = new Set([
  "id", "changedAxis", "prompt", "excludePrompt", "expectedDifference", "credits",
  "status", "generatedUrl", "currentRunId", "generationConditions", "currentCandidateId", "candidateHash", "subjectiveScore", "nextRoundNote",
  "reviewNote", "disposition"
]);
const BATCH_PATCH_KEYS = new Set([
  "generatedUrl", "candidateHash", "subjectiveScore", "nextRoundNote", "reviewNote", "disposition"
]);
const STYLE_KEYS = new Set(["version", "intent", "tempo", "key", "mood", "instruments", "structure", "mix", "exclusions"]);
const TEMPO_KEYS = new Set(["target", "min", "max"]);
const STRUCTURE_KEYS = new Set(["bars", "loopable", "intro", "outro"]);
const CREDIT_KEYS = new Set(["planned", "perBatch", "batchCount"]);
const REFERENCE_KEYS = new Set(["id", "displayName", "hash", "analysis"]);
const CANDIDATE_KEYS = new Set(["id", "displayName", "batchId", "hash", "analysis", "referenceBasis", "comparison", "similarityClass", "advice", "candidateSource"]);
const CANDIDATE_SOURCE_KINDS = new Set(["suno", "external", "local-original", "legacy-unknown"]);
const CANDIDATE_SOURCE_KEYS = Object.freeze({
  suno: new Set(["kind", "runId", "outputIndex"]),
  external: new Set(["kind", "licenseId", "fileSha256"]),
  "local-original": new Set(["kind", "licenseId", "fileSha256"]),
  "legacy-unknown": new Set(["kind", "legacyRunId"]),
});
const RUN_KEYS = new Set(["id", "sourceUrl", "status", "outputs", "generationConditions"]);
const RUN_OUTPUT_KEYS = new Set(["generatedUrl", "subjectiveScore", "reviewNote", "disposition"]);
const EXPERIMENT_KEYS = new Set([
  "id", "runId", "batchId", "candidateId", "candidateHash", "generatedUrl", "subjectiveScore",
  "reviewNote", "disposition", "referenceBasis", "comparison", "advice", "generationConditions", "outputIndex"
]);
const EXPERIMENT_REQUIRED_KEYS = new Set([...EXPERIMENT_KEYS].filter(key => key !== "outputIndex"));
const ANALYSIS_KEYS = new Set(["durationSeconds", "sampleRate", "channelCount", "peak", "rms", "tempo", "key", "spectrum", "loop", "warnings"]);
const ANALYSIS_TEMPO_KEYS = new Set(["bpm", "confidence"]);
const ANALYSIS_KEY_KEYS = new Set(["name", "tonic", "mode", "confidence", "chroma"]);
const SPECTRUM_KEYS = new Set(["centroidHz", "brightness"]);
const LOOP_KEYS = new Set(["score", "components"]);
const LOOP_COMPONENT_KEYS = new Set(["envelope", "chroma", "centroid", "boundary"]);
const COMPARISON_BASIS_KEYS = new Set(["durationSeconds", "rms", "tempo", "key", "spectrum", "loop"]);
const COMPARISON_BASIS_TEMPO_KEYS = new Set(["bpm", "confidence"]);
const COMPARISON_BASIS_KEY_KEYS = new Set(["name", "tonic", "mode", "confidence"]);
const COMPARISON_BASIS_SPECTRUM_KEYS = new Set(["brightness"]);
const COMPARISON_BASIS_LOOP_KEYS = new Set(["score"]);
const GENERATION_CONDITIONS_KEYS = new Set(["batchId", "changedAxis", "prompt", "excludePrompt", "styleSpec"]);
const WARNING_KEYS = new Set(["code", "message"]);
const COMPARISON_KEYS = new Set(["components", "coverage", "similarity", "coreMatches"]);
const COMPARISON_COMPONENT_NAMES = ["tempo", "key", "brightness", "dynamics", "loop", "duration"];
const COMPARISON_WEIGHTS = Object.freeze({ tempo: 0.25, key: 0.2, brightness: 0.15, dynamics: 0.1, loop: 0.2, duration: 0.1 });
const VARIANT_ADVICE_KEYS = new Set(["kind", "changedAxis", "reason", "adjustment"]);
const INSUFFICIENT_ADVICE_KEYS = new Set(["kind", "message"]);
const ADVICE_AXES = new Set(["melodyTimbre", "rhythm", "percussion", "loopStructure"]);
const SIMILARITY_CLASSES = new Set(["insufficient", "too-close", "review", "distinct"]);
const DISPOSITION_VALUES = new Set(["unrated", "accepted", "rejected"]);
const REVIEW_FIELDS = ["generatedUrl", "subjectiveScore", "reviewNote", "disposition"];
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function fail(message) {
  throw new TypeError(message);
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

function assertString(value, field, { nullable = false, nonEmpty = false } = {}) {
  if ((nullable && value === null) || (typeof value === "string" && (!nonEmpty || value.trim().length > 0))) return;
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

function assertKnownKeys(value, allowed, field) {
  if (!isPlainObject(value)) fail(`${field} must be an object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`Unsupported ${field} field: ${key}`);
  }
}

function assertRequiredKeys(value, required, field) {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${field}.${key} is required`);
  }
}

function assertInteger(value, field, { minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
}

function assertUnitNumber(value, field) {
  assertNumber(value, field);
  if (value < 0 || value > 1) fail(`${field} must be between 0 and 1`);
}

function assertDate(value, field) {
  assertString(value, field, { nonEmpty: true });
  const match = value.match(DATE_PATTERN);
  if (!match) fail(`${field} must be a valid YYYY-MM-DD date`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    fail(`${field} must be a valid YYYY-MM-DD date`);
  }
}

function assertId(value, field) {
  assertString(value, field, { nonEmpty: true });
  if (!/^[a-z][a-z0-9-]{0,79}$/i.test(value)) fail(`${field} must be a portable identifier`);
}

function assertHash(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) fail(`${field} must be a SHA-256 hash`);
}

function assertDisplayName(value, field) {
  assertString(value, field, { nonEmpty: true });
  if (value.length > 120) fail(`${field} must be at most 120 characters`);
}

function assertNullableHttpsUrl(value, field) {
  if (value === null) return;
  assertHttpsUrl(value, field);
}

function validateStyleSpec(styleSpec, field = "styleSpec") {
  assertKnownKeys(styleSpec, STYLE_KEYS, field);
  assertRequiredKeys(styleSpec, STYLE_KEYS, field);
  if (styleSpec.version !== STYLE_SPEC_VERSION) fail(`${field}.version must be 1`);
  assertString(styleSpec.intent, `${field}.intent`, { nonEmpty: true });
  assertString(styleSpec.key, `${field}.key`, { nonEmpty: true });
  assertArrayOfStrings(styleSpec.mood, `${field}.mood`);
  assertArrayOfStrings(styleSpec.instruments, `${field}.instruments`);
  assertArrayOfStrings(styleSpec.mix, `${field}.mix`);
  assertArrayOfStrings(styleSpec.exclusions, `${field}.exclusions`);
  for (const [name, value] of [["mood", styleSpec.mood], ["instruments", styleSpec.instruments], ["mix", styleSpec.mix]]) {
    if (!value.length || value.some(item => item.trim().length === 0)) fail(`${field}.${name} must contain non-empty strings`);
  }
  assertKnownKeys(styleSpec.tempo, TEMPO_KEYS, `${field}.tempo`);
  assertRequiredKeys(styleSpec.tempo, TEMPO_KEYS, `${field}.tempo`);
  for (const key of ["target", "min", "max"]) assertNumber(styleSpec.tempo[key], `${field}.tempo.${key}`);
  if (styleSpec.tempo.min > styleSpec.tempo.target || styleSpec.tempo.target > styleSpec.tempo.max) {
    fail(`${field}.tempo must satisfy min <= target <= max`);
  }
  assertKnownKeys(styleSpec.structure, STRUCTURE_KEYS, `${field}.structure`);
  assertRequiredKeys(styleSpec.structure, STRUCTURE_KEYS, `${field}.structure`);
  assertInteger(styleSpec.structure.bars, `${field}.structure.bars`, { minimum: 1, maximum: 512 });
  if (![32, 64].includes(styleSpec.structure.bars)) fail(`${field}.structure.bars must be 32 or 64`);
  if (typeof styleSpec.structure.loopable !== "boolean") fail(`${field}.structure.loopable must be boolean`);
  assertString(styleSpec.structure.intro, `${field}.structure.intro`, { nonEmpty: true });
  assertString(styleSpec.structure.outro, `${field}.structure.outro`, { nonEmpty: true });
}

function validateRunOutput(value, field) {
  assertKnownKeys(value, RUN_OUTPUT_KEYS, field);
  assertRequiredKeys(value, RUN_OUTPUT_KEYS, field);
  assertHttpsUrl(value.generatedUrl, `${field}.generatedUrl`);
  assertNumber(value.subjectiveScore, `${field}.subjectiveScore`, { nullable: true });
  if (value.subjectiveScore !== null && (value.subjectiveScore < 1 || value.subjectiveScore > 5)) {
    fail(`${field}.subjectiveScore must be between 1 and 5`);
  }
  assertString(value.reviewNote, `${field}.reviewNote`);
  if (!DISPOSITION_VALUES.has(value.disposition)) fail(`${field}.disposition is unsupported`);
  if (value.disposition === "rejected" && value.reviewNote.trim().length === 0) {
    fail(`${field}.reviewNote is required for rejection`);
  }
}

function validateBatch(batch) {
  assertKnownKeys(batch, BATCH_KEYS, "batch");
  assertRequiredKeys(batch, BATCH_KEYS, "batch");
  for (const key of ["id", "changedAxis", "prompt", "excludePrompt", "expectedDifference", "status"]) {
    assertString(batch[key], `batch.${key}`, { nonEmpty: true });
  }
  assertId(batch.id, "batch.id");
  if (!STATUS_VALUES.has(batch.status)) fail(`Unsupported batch status: ${batch.status}`);
  assertInteger(batch.credits, "batch.credits", { minimum: 1 });
  assertNullableHttpsUrl(batch.generatedUrl, "batch.generatedUrl");
  if (batch.currentRunId !== null) assertId(batch.currentRunId, "batch.currentRunId");
  if (batch.generationConditions !== null) {
    validateGenerationConditions(batch.generationConditions, "batch.generationConditions", batch);
  }
  if ((batch.generatedUrl !== null || ["submitted", "downloaded", "reviewed"].includes(batch.status))
    && (batch.currentRunId === null || batch.generationConditions === null)) {
    fail("recorded batches require a current run and frozen generationConditions");
  }
  if ((batch.currentRunId === null) !== (batch.generationConditions === null)) {
    fail("batch.currentRunId and generationConditions must both be null or both be recorded");
  }
  if (batch.currentCandidateId !== null) assertId(batch.currentCandidateId, "batch.currentCandidateId");
  assertHash(batch.candidateHash, "batch.candidateHash", { nullable: true });
  if ((batch.currentCandidateId === null) !== (batch.candidateHash === null)) {
    fail("batch.currentCandidateId and candidateHash must both be null or both be recorded");
  }
  assertNumber(batch.subjectiveScore, "batch.subjectiveScore", { nullable: true });
  if (batch.subjectiveScore !== null && (batch.subjectiveScore < 1 || batch.subjectiveScore > 5)) {
    fail("batch.subjectiveScore must be between 1 and 5");
  }
  assertString(batch.nextRoundNote, "batch.nextRoundNote");
  assertString(batch.reviewNote, "batch.reviewNote");
  if (!DISPOSITION_VALUES.has(batch.disposition)) fail(`Unsupported batch disposition: ${batch.disposition}`);
  if (batch.disposition === "rejected" && batch.reviewNote.trim().length === 0) {
    fail("rejected batches require an explicit reviewNote");
  }
}

function validateAnalysis(value, field) {
  assertKnownKeys(value, ANALYSIS_KEYS, field);
  assertRequiredKeys(value, ANALYSIS_KEYS, field);
  assertNumber(value.durationSeconds, `${field}.durationSeconds`);
  if (value.durationSeconds <= 0) fail(`${field}.durationSeconds must be positive`);
  assertInteger(value.sampleRate, `${field}.sampleRate`, { minimum: 1 });
  assertInteger(value.channelCount, `${field}.channelCount`, { minimum: 1, maximum: 8 });
  for (const name of ["peak", "rms"]) {
    assertNumber(value[name], `${field}.${name}`);
    if (value[name] < 0) fail(`${field}.${name} cannot be negative`);
  }
  assertKnownKeys(value.tempo, ANALYSIS_TEMPO_KEYS, `${field}.tempo`);
  assertRequiredKeys(value.tempo, ANALYSIS_TEMPO_KEYS, `${field}.tempo`);
  assertNumber(value.tempo.bpm, `${field}.tempo.bpm`);
  if (value.tempo.bpm < 0) fail(`${field}.tempo.bpm cannot be negative`);
  assertUnitNumber(value.tempo.confidence, `${field}.tempo.confidence`);
  assertKnownKeys(value.key, ANALYSIS_KEY_KEYS, `${field}.key`);
  assertRequiredKeys(value.key, ANALYSIS_KEY_KEYS, `${field}.key`);
  for (const name of ["name", "tonic", "mode"]) assertString(value.key[name], `${field}.key.${name}`);
  if (!new Set(["major", "minor", "unknown"]).has(value.key.mode)) fail(`${field}.key.mode is unsupported`);
  assertUnitNumber(value.key.confidence, `${field}.key.confidence`);
  if (!Array.isArray(value.key.chroma) || value.key.chroma.length !== 12) fail(`${field}.key.chroma must contain 12 values`);
  value.key.chroma.forEach((item, index) => assertUnitNumber(item, `${field}.key.chroma[${index}]`));
  assertKnownKeys(value.spectrum, SPECTRUM_KEYS, `${field}.spectrum`);
  assertRequiredKeys(value.spectrum, SPECTRUM_KEYS, `${field}.spectrum`);
  assertNumber(value.spectrum.centroidHz, `${field}.spectrum.centroidHz`);
  if (value.spectrum.centroidHz < 0) fail(`${field}.spectrum.centroidHz cannot be negative`);
  assertUnitNumber(value.spectrum.brightness, `${field}.spectrum.brightness`);
  assertKnownKeys(value.loop, LOOP_KEYS, `${field}.loop`);
  assertRequiredKeys(value.loop, LOOP_KEYS, `${field}.loop`);
  assertUnitNumber(value.loop.score, `${field}.loop.score`);
  assertKnownKeys(value.loop.components, LOOP_COMPONENT_KEYS, `${field}.loop.components`);
  assertRequiredKeys(value.loop.components, LOOP_COMPONENT_KEYS, `${field}.loop.components`);
  for (const name of LOOP_COMPONENT_KEYS) assertUnitNumber(value.loop.components[name], `${field}.loop.components.${name}`);
  if (!Array.isArray(value.warnings)) fail(`${field}.warnings must be an array`);
  value.warnings.forEach((item, index) => {
    assertKnownKeys(item, WARNING_KEYS, `${field}.warnings[${index}]`);
    assertRequiredKeys(item, WARNING_KEYS, `${field}.warnings[${index}]`);
    assertString(item.code, `${field}.warnings[${index}].code`, { nonEmpty: true });
    assertString(item.message, `${field}.warnings[${index}].message`, { nonEmpty: true });
  });
}

function validateComparison(value, field) {
  assertKnownKeys(value, COMPARISON_KEYS, field);
  assertRequiredKeys(value, COMPARISON_KEYS, field);
  assertKnownKeys(value.components, new Set(COMPARISON_COMPONENT_NAMES), `${field}.components`);
  assertRequiredKeys(value.components, new Set(COMPARISON_COMPONENT_NAMES), `${field}.components`);
  for (const name of COMPARISON_COMPONENT_NAMES) {
    const item = value.components[name];
    const detailKey = name === "tempo" ? "deltaBpm" : name === "key" ? "relationship" : name === "duration" ? "deltaSeconds" : "delta";
    assertKnownKeys(item, new Set(["available", "weight", "score", detailKey]), `${field}.components.${name}`);
    assertRequiredKeys(item, new Set(["available", "weight", "score", detailKey]), `${field}.components.${name}`);
    if (typeof item.available !== "boolean") fail(`${field}.components.${name}.available must be boolean`);
    assertNumber(item.weight, `${field}.components.${name}.weight`);
    if (Math.abs(item.weight - COMPARISON_WEIGHTS[name]) > 1e-12) fail(`${field}.components.${name}.weight is inconsistent`);
    assertUnitNumber(item.score, `${field}.components.${name}.score`);
    if (name === "key") {
      if (!new Set(["unavailable", "same-key", "parallel-key", "same-mode", "different-key"]).has(item.relationship)) {
        fail(`${field}.components.key.relationship is unsupported`);
      }
      if (item.available === (item.relationship === "unavailable")) fail(`${field}.components.key availability is inconsistent`);
    } else {
      assertNumber(item[detailKey], `${field}.components.${name}.${detailKey}`, { nullable: true });
      if (item.available === (item[detailKey] === null)) fail(`${field}.components.${name} availability is inconsistent`);
    }
    if (!item.available && item.score !== 0) fail(`${field}.components.${name}.score must be 0 when unavailable`);
  }
  assertUnitNumber(value.coverage, `${field}.coverage`);
  assertUnitNumber(value.similarity, `${field}.similarity`);
  if (typeof value.coreMatches !== "boolean") fail(`${field}.coreMatches must be boolean`);
  const available = COMPARISON_COMPONENT_NAMES.filter(name => value.components[name].available);
  const availableWeight = available.reduce((sum, name) => sum + COMPARISON_WEIGHTS[name], 0);
  const expectedCoverage = availableWeight;
  const expectedSimilarity = availableWeight > 0
    ? available.reduce((sum, name) => sum + value.components[name].score * COMPARISON_WEIGHTS[name], 0) / availableWeight
    : 0;
  if (Math.abs(value.coverage - expectedCoverage) > 1e-9 || Math.abs(value.similarity - expectedSimilarity) > 1e-9) {
    fail(`${field} coverage or similarity is inconsistent with its components`);
  }
  const expectedCoreMatches = ["tempo", "key", "brightness"].every(name => value.components[name].available && value.components[name].score >= 0.85);
  if (value.coreMatches !== expectedCoreMatches) fail(`${field}.coreMatches is inconsistent`);
}

function assertNullableNonNegativeNumber(value, field) {
  assertNumber(value, field, { nullable: true });
  if (value !== null && value < 0) fail(`${field} cannot be negative`);
}

function assertNullableUnitNumber(value, field) {
  assertNumber(value, field, { nullable: true });
  if (value !== null && (value < 0 || value > 1)) fail(`${field} must be between 0 and 1`);
}

function validateReferenceBasis(value, field) {
  assertKnownKeys(value, COMPARISON_BASIS_KEYS, field);
  assertRequiredKeys(value, COMPARISON_BASIS_KEYS, field);
  assertNullableNonNegativeNumber(value.durationSeconds, `${field}.durationSeconds`);
  assertNullableNonNegativeNumber(value.rms, `${field}.rms`);
  assertKnownKeys(value.tempo, COMPARISON_BASIS_TEMPO_KEYS, `${field}.tempo`);
  assertRequiredKeys(value.tempo, COMPARISON_BASIS_TEMPO_KEYS, `${field}.tempo`);
  assertNullableNonNegativeNumber(value.tempo.bpm, `${field}.tempo.bpm`);
  assertUnitNumber(value.tempo.confidence, `${field}.tempo.confidence`);
  assertKnownKeys(value.key, COMPARISON_BASIS_KEY_KEYS, `${field}.key`);
  assertRequiredKeys(value.key, COMPARISON_BASIS_KEY_KEYS, `${field}.key`);
  for (const name of ["name", "tonic", "mode"]) assertString(value.key[name], `${field}.key.${name}`);
  assertUnitNumber(value.key.confidence, `${field}.key.confidence`);
  assertKnownKeys(value.spectrum, COMPARISON_BASIS_SPECTRUM_KEYS, `${field}.spectrum`);
  assertRequiredKeys(value.spectrum, COMPARISON_BASIS_SPECTRUM_KEYS, `${field}.spectrum`);
  assertNullableUnitNumber(value.spectrum.brightness, `${field}.spectrum.brightness`);
  assertKnownKeys(value.loop, COMPARISON_BASIS_LOOP_KEYS, `${field}.loop`);
  assertRequiredKeys(value.loop, COMPARISON_BASIS_LOOP_KEYS, `${field}.loop`);
  assertNullableUnitNumber(value.loop.score, `${field}.loop.score`);
}

function validateDerivedComparison(referenceBasis, candidate, comparison, field) {
  const expected = compareCandidate(referenceBasis, candidate.analysis);
  if (stableStringify(comparison) !== stableStringify(expected)) {
    fail(`${field} must be derived from its frozen reference basis and candidate analysis`);
  }
}

function validateGenerationConditions(value, field, batch) {
  assertKnownKeys(value, GENERATION_CONDITIONS_KEYS, field);
  assertRequiredKeys(value, GENERATION_CONDITIONS_KEYS, field);
  assertId(value.batchId, `${field}.batchId`);
  assertString(value.changedAxis, `${field}.changedAxis`, { nonEmpty: true });
  assertString(value.prompt, `${field}.prompt`, { nonEmpty: true });
  assertString(value.excludePrompt, `${field}.excludePrompt`, { nonEmpty: true });
  validateStyleSpec(value.styleSpec, `${field}.styleSpec`);
  if (value.batchId !== batch.id || value.changedAxis !== batch.changedAxis) {
    fail(`${field} batch identity or axis is inconsistent`);
  }
  const generatedBatch = createPromptVariants(value.styleSpec).find(item => item.id === value.batchId);
  if (!generatedBatch
    || generatedBatch.changedAxis !== value.changedAxis
    || generatedBatch.prompt !== value.prompt
    || generatedBatch.excludePrompt !== value.excludePrompt) {
    fail(`${field} prompt or excludePrompt is inconsistent with its frozen styleSpec`);
  }
}

function snapshotGenerationConditions(batch, styleSpec) {
  return {
    batchId: batch.id,
    changedAxis: batch.changedAxis,
    prompt: batch.prompt,
    excludePrompt: batch.excludePrompt,
    styleSpec: cloneJson(styleSpec),
  };
}

function clearCurrentProgress(batch) {
  return {
    ...batch,
    status: "planned",
    generatedUrl: null,
    currentRunId: null,
    generationConditions: null,
    currentCandidateId: null,
    candidateHash: null,
    subjectiveScore: null,
    nextRoundNote: "",
    reviewNote: "",
    disposition: "unrated",
  };
}

function nextRunId(project) {
  const used = new Set([
    ...project.batches,
    ...project.references,
    ...project.candidates,
    ...project.runs,
    ...project.experiments,
    ...project.licenses,
  ].map(item => item.id));
  let index = project.runs.reduce((maximum, run) => {
    const match = /^run-(\d+)$/.exec(run.id);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0) + 1;
  while (used.has(`run-${index}`)) index += 1;
  return `run-${index}`;
}

function appendRun(project, batchIndex, { status, generatedUrl, resetProgress = false } = {}) {
  const original = project.batches[batchIndex];
  const current = resetProgress ? clearCurrentProgress(original) : original;
  const generationConditions = snapshotGenerationConditions(current, project.styleSpec);
  const run = {
    id: nextRunId(project),
    sourceUrl: project.sourceUrl,
    status: status ?? current.status,
    outputs: (typeof generatedUrl === "undefined" ? current.generatedUrl : generatedUrl) === null ? [] : [{
      generatedUrl: typeof generatedUrl === "undefined" ? current.generatedUrl : generatedUrl,
      subjectiveScore: null,
      reviewNote: "",
      disposition: "unrated",
    }],
    generationConditions,
  };
  const batch = {
    ...current,
    status: status ?? current.status,
    generatedUrl: typeof generatedUrl === "undefined" ? current.generatedUrl : generatedUrl,
    currentRunId: run.id,
    generationConditions,
  };
  return { batch, run };
}

function validateAdvice(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (value?.kind === "evidence-insufficient") {
    assertKnownKeys(value, INSUFFICIENT_ADVICE_KEYS, field);
    assertRequiredKeys(value, INSUFFICIENT_ADVICE_KEYS, field);
    assertString(value.message, `${field}.message`, { nonEmpty: true });
    return;
  }
  assertKnownKeys(value, VARIANT_ADVICE_KEYS, field);
  assertRequiredKeys(value, VARIANT_ADVICE_KEYS, field);
  if (value.kind !== "variant") fail(`${field}.kind is unsupported`);
  if (!ADVICE_AXES.has(value.changedAxis)) fail(`${field}.changedAxis is unsupported`);
  assertString(value.reason, `${field}.reason`, { nonEmpty: true });
  assertString(value.adjustment, `${field}.adjustment`, { nonEmpty: true });
}

function validateReference(value, index) {
  const field = `references[${index}]`;
  assertKnownKeys(value, REFERENCE_KEYS, field);
  assertRequiredKeys(value, new Set(["id", "hash", "analysis"]), field);
  assertId(value.id, `${field}.id`);
  if (Object.hasOwn(value, "displayName")) assertDisplayName(value.displayName, `${field}.displayName`);
  assertHash(value.hash, `${field}.hash`);
  validateAnalysis(value.analysis, `${field}.analysis`);
}

function validateCandidateSource(value, field) {
  if (!isPlainObject(value)) fail(`${field} must be an object`);
  if (!CANDIDATE_SOURCE_KINDS.has(value.kind)) fail(`${field}.kind is unsupported`);
  const keys = CANDIDATE_SOURCE_KEYS[value.kind];
  assertKnownKeys(value, keys, field);
  assertRequiredKeys(value, new Set([...keys].filter(key => key !== "legacyRunId")), field);
  if (value.kind === "suno") {
    assertId(value.runId, `${field}.runId`);
    assertInteger(value.outputIndex, `${field}.outputIndex`, { minimum: 0, maximum: 1 });
  } else if (value.kind === "external" || value.kind === "local-original") {
    assertId(value.licenseId, `${field}.licenseId`);
    assertHash(value.fileSha256, `${field}.fileSha256`);
  } else if (Object.hasOwn(value, "legacyRunId")) {
    assertId(value.legacyRunId, `${field}.legacyRunId`);
  }
}

function validateCandidate(value, index, batchIds) {
  const field = `candidates[${index}]`;
  assertKnownKeys(value, CANDIDATE_KEYS, field);
  assertRequiredKeys(value, new Set(["id", "batchId", "hash", "analysis", "referenceBasis", "comparison", "similarityClass", "advice", "candidateSource"]), field);
  assertId(value.id, `${field}.id`);
  if (Object.hasOwn(value, "displayName")) assertDisplayName(value.displayName, `${field}.displayName`);
  assertId(value.batchId, `${field}.batchId`);
  if (!batchIds.has(value.batchId)) fail(`${field}.batchId must reference an existing batch`);
  assertHash(value.hash, `${field}.hash`);
  validateAnalysis(value.analysis, `${field}.analysis`);
  validateReferenceBasis(value.referenceBasis, `${field}.referenceBasis`);
  validateComparison(value.comparison, `${field}.comparison`);
  validateDerivedComparison(value.referenceBasis, value, value.comparison, `${field}.comparison`);
  if (!SIMILARITY_CLASSES.has(value.similarityClass)) fail(`${field}.similarityClass is unsupported`);
  const expectedClass = classifySimilarity(value.comparison);
  if (value.similarityClass !== expectedClass) fail(`${field}.similarityClass is inconsistent with comparison`);
  validateAdvice(value.advice, `${field}.advice`);
  if (stableStringify(value.advice) !== stableStringify(recommendNextVariant(value.comparison))) {
    fail(`${field}.advice is inconsistent with comparison`);
  }
  if (value.analysis.tempo.confidence < 0.30 && value.comparison.components.tempo.available) {
    fail(`${field}.comparison tempo cannot be available below the analyzer confidence threshold`);
  }
  if (value.analysis.key.confidence < 0.10 && value.comparison.components.key.available) {
    fail(`${field}.comparison key cannot be available below the analyzer confidence threshold`);
  }
  validateCandidateSource(value.candidateSource, `${field}.candidateSource`);
}

function validateRun(value, index, batchesById) {
  const field = `runs[${index}]`;
  assertKnownKeys(value, RUN_KEYS, field);
  assertRequiredKeys(value, RUN_KEYS, field);
  assertId(value.id, `${field}.id`);
  assertHttpsUrl(value.sourceUrl, `${field}.sourceUrl`);
  if (!STATUS_VALUES.has(value.status)) fail(`${field}.status is unsupported`);
  if (!Array.isArray(value.outputs)) fail(`${field}.outputs must be an array`);
  if (value.outputs.length > 2) fail(`${field}.outputs may contain at most two results`);
  value.outputs.forEach((output, outputIndex) => validateRunOutput(output, `${field}.outputs[${outputIndex}]`));
  const batch = batchesById.get(value.generationConditions?.batchId);
  if (!batch) fail(`${field}.generationConditions.batchId must reference an existing batch`);
  validateGenerationConditions(value.generationConditions, `${field}.generationConditions`, batch);
}

function validateExperiment(value, index, candidatesById, batchesById, runsById) {
  const field = `experiments[${index}]`;
  assertKnownKeys(value, EXPERIMENT_KEYS, field);
  assertRequiredKeys(value, EXPERIMENT_REQUIRED_KEYS, field);
  assertId(value.id, `${field}.id`);
  assertId(value.batchId, `${field}.batchId`);
  assertId(value.candidateId, `${field}.candidateId`);
  const batch = batchesById.get(value.batchId);
  if (!batch) fail(`${field}.batchId must reference an existing batch`);
  const candidate = candidatesById.get(value.candidateId);
  if (!candidate) fail(`${field}.candidateId must reference an existing candidate`);
  const sourceKind = candidate.candidateSource.kind;
  const isExternal = sourceKind === "external" || sourceKind === "local-original";
  if (isExternal) {
    for (const nullableField of ["runId", "outputIndex", "generatedUrl", "generationConditions"]) {
      if (value[nullableField] !== null) fail(`${field}.${nullableField} must be null for ${sourceKind} candidates`);
    }
  } else {
    assertId(value.runId, `${field}.runId`);
  }
  assertHash(value.candidateHash, `${field}.candidateHash`);
  if (candidate.batchId !== value.batchId || candidate.hash !== value.candidateHash) fail(`${field} identity fields are inconsistent`);
  assertNullableHttpsUrl(value.generatedUrl, `${field}.generatedUrl`);
  assertNumber(value.subjectiveScore, `${field}.subjectiveScore`, { nullable: true });
  if (value.subjectiveScore !== null && (value.subjectiveScore < 1 || value.subjectiveScore > 5)) fail(`${field}.subjectiveScore must be between 1 and 5`);
  assertString(value.reviewNote, `${field}.reviewNote`);
  if (!DISPOSITION_VALUES.has(value.disposition)) fail(`${field}.disposition is unsupported`);
  if (value.disposition === "rejected" && value.reviewNote.trim().length === 0) fail(`${field}.reviewNote is required for rejection`);
  validateReferenceBasis(value.referenceBasis, `${field}.referenceBasis`);
  validateComparison(value.comparison, `${field}.comparison`);
  validateDerivedComparison(value.referenceBasis, candidate, value.comparison, `${field}.comparison`);
  validateAdvice(value.advice, `${field}.advice`);
  const run = value.runId === null ? null : runsById.get(value.runId);
  if (!isExternal && !run) fail(`${field}.runId must reference an existing run`);
  if (!isExternal && Object.hasOwn(value, "outputIndex") && value.outputIndex !== null) {
    assertInteger(value.outputIndex, `${field}.outputIndex`, { minimum: 0, maximum: 1 });
    const output = run.outputs[value.outputIndex];
    if (!output) fail(`${field}.outputIndex must reference an existing run output`);
    for (const reviewField of REVIEW_FIELDS) {
      if (value[reviewField] !== output[reviewField]) {
        fail(`${field}.${reviewField} must match its bound run output`);
      }
    }
  }
  if (!isExternal) {
    if (run.generationConditions.batchId !== value.batchId
      || stableStringify(value.generationConditions) !== stableStringify(run.generationConditions)) {
      fail(`${field}.generationConditions must match its own frozen run conditions`);
    }
    if (sourceKind === "suno"
      && (value.runId !== candidate.candidateSource.runId || value.outputIndex !== candidate.candidateSource.outputIndex)) {
      fail(`${field} must match its Suno candidateSource runId and outputIndex`);
    }
  }
  if (stableStringify(value.referenceBasis) !== stableStringify(candidate.referenceBasis)
    || stableStringify(value.comparison) !== stableStringify(candidate.comparison)
    || stableStringify(value.advice) !== stableStringify(candidate.advice)) {
    fail(`${field} comparison or advice is inconsistent with its candidate`);
  }
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
  assertPortableValue(input);
  assertRequiredKeys(input, PROJECT_KEYS, "project");
  if (input.version !== PROJECT_VERSION) fail("project.version must be 3");
  assertString(input.toolVersion, "toolVersion", { nonEmpty: true });
  assertDate(input.ruleCheckedAt, "ruleCheckedAt");
  validateStyleSpec(input.styleSpec);
  assertKnownKeys(input.credits, CREDIT_KEYS, "credits");
  assertRequiredKeys(input.credits, CREDIT_KEYS, "credits");
  for (const key of CREDIT_KEYS) assertInteger(input.credits[key], `credits.${key}`, { minimum: 1 });
  if (!Array.isArray(input.batches) || input.batches.length !== 5) fail("project must contain exactly five batches");
  input.batches.forEach(validateBatch);
  if (input.credits.batchCount !== input.batches.length
    || input.credits.planned !== input.credits.perBatch * input.credits.batchCount
    || input.batches.some(batch => batch.credits !== input.credits.perBatch)
    || input.batches.reduce((sum, batch) => sum + batch.credits, 0) !== input.credits.planned) {
    fail("credits and batch totals must be exactly consistent");
  }
  const canonicalBatches = createPromptVariants(input.styleSpec);
  const immutableBatchFields = ["id", "changedAxis", "prompt", "excludePrompt", "expectedDifference", "credits"];
  input.batches.forEach((batch, index) => {
    for (const field of immutableBatchFields) {
      if (batch[field] !== canonicalBatches[index]?.[field]) fail(`batch ${index + 1} ${field} is inconsistent with styleSpec`);
    }
  });
  const batchIds = new Set(input.batches.map(batch => batch.id));
  if (batchIds.size !== input.batches.length) fail("batch ids must be unique");
  const batchesById = new Map(input.batches.map(batch => [batch.id, batch]));
  assertString(input.sourceUrl, "sourceUrl", { nonEmpty: true });
  assertNullableHttpsUrl(input.sourceUrl, "sourceUrl");
  if (!Array.isArray(input.references)) fail("references must be an array");
  if (!Array.isArray(input.candidates)) fail("candidates must be an array");
  if (!Array.isArray(input.runs)) fail("runs must be an array");
  if (!Array.isArray(input.experiments)) fail("experiments must be an array");
  if (!Array.isArray(input.licenses)) fail("licenses must be an array");
  input.references.forEach(validateReference);
  input.candidates.forEach((candidate, index) => validateCandidate(candidate, index, batchIds));
  const candidatesById = new Map(input.candidates.map(candidate => [candidate.id, candidate]));
  input.runs.forEach((run, index) => validateRun(run, index, batchesById));
  const runsById = new Map(input.runs.map(run => [run.id, run]));
  input.experiments.forEach((experiment, index) => validateExperiment(experiment, index, candidatesById, batchesById, runsById));
  const validatedLicenses = input.licenses.map(validateLicenseEntry);
  const licensesById = new Map(validatedLicenses.map(license => [license.id, license]));

  for (const candidate of input.candidates) {
    const source = candidate.candidateSource;
    if (source.kind === "external" || source.kind === "local-original") {
      const license = licensesById.get(source.licenseId);
      if (!license) fail(`candidate ${candidate.id} candidateSource.licenseId must reference an existing license`);
      if (source.fileSha256.toLowerCase() !== license.fileSha256.toLowerCase()
        || source.fileSha256.toLowerCase() !== candidate.hash.toLowerCase()) {
        fail(`candidate ${candidate.id} candidateSource.fileSha256 must exactly match its candidate and license hashes`);
      }
    } else if (source.kind === "suno") {
      const run = runsById.get(source.runId);
      if (!run) fail(`candidate ${candidate.id} candidateSource.runId must reference an existing run`);
      if (!run.outputs[source.outputIndex]) {
        fail(`candidate ${candidate.id} candidateSource.outputIndex must reference an existing run output`);
      }
      const experiment = input.experiments.find(item => item.candidateId === candidate.id);
      if (!experiment
        || experiment.runId !== source.runId
        || experiment.outputIndex !== source.outputIndex) {
        fail(`candidate ${candidate.id} candidateSource must match its experiment runId and outputIndex`);
      }
    } else if (Object.hasOwn(source, "legacyRunId") && !runsById.has(source.legacyRunId)) {
      fail(`candidate ${candidate.id} candidateSource.legacyRunId must reference an existing legacy run`);
    }
  }

  for (const batch of input.batches) {
    if (batch.currentRunId !== null) {
      const run = runsById.get(batch.currentRunId);
      if (!run
        || stableStringify(run.generationConditions) !== stableStringify(batch.generationConditions)) {
        fail(`batch ${batch.id} currentRunId or generationConditions is inconsistent with its current run`);
      }
    }
    if (batch.currentCandidateId === null) continue;
    const matchingCandidate = candidatesById.get(batch.currentCandidateId);
    if (!matchingCandidate
      || matchingCandidate.batchId !== batch.id
      || matchingCandidate.hash !== batch.candidateHash) {
      fail(`batch ${batch.id} currentCandidateId or candidateHash is inconsistent with its current candidate`);
    }
    if (matchingCandidate.candidateSource.kind === "external"
      || matchingCandidate.candidateSource.kind === "local-original") {
      fail(`batch ${batch.id} cannot use an external or local-original candidate as Suno batch state`);
    }
    const matchingExperiment = input.experiments.find(experiment => (
      experiment.candidateId === matchingCandidate.id && experiment.runId === batch.currentRunId
    ));
    if (!matchingExperiment) fail(`batch ${batch.id} current candidate must bind to its current run experiment`);
    for (const field of ["generatedUrl", "subjectiveScore", "reviewNote", "disposition"]) {
      if (batch[field] !== matchingExperiment[field]) {
        fail(`batch ${batch.id} ${field} is inconsistent with its current experiment`);
      }
    }
  }

  const allIds = [
    ...input.batches.map(batch => batch.id),
    ...input.references.map(reference => reference.id),
    ...input.candidates.map(candidate => candidate.id),
    ...input.runs.map(run => run.id),
    ...input.experiments.map(experiment => experiment.id),
    ...validatedLicenses.map(license => license.id),
  ];
  if (new Set(allIds).size !== allIds.length) fail("all persisted ids must be unique");
  if (input.currentBestCandidate !== null) {
    const field = "currentBestCandidate";
    const keys = new Set(["candidateId", "displayName", "hash"]);
    assertKnownKeys(input.currentBestCandidate, keys, field);
    assertRequiredKeys(input.currentBestCandidate, new Set(["candidateId", "hash"]), field);
    assertId(input.currentBestCandidate.candidateId, `${field}.candidateId`);
    assertHash(input.currentBestCandidate.hash, `${field}.hash`);
    if (Object.hasOwn(input.currentBestCandidate, "displayName")) {
      assertDisplayName(input.currentBestCandidate.displayName, `${field}.displayName`);
    }
    const candidate = candidatesById.get(input.currentBestCandidate.candidateId);
    if (!candidate || candidate.hash !== input.currentBestCandidate.hash) fail(`${field} must reference an existing candidate and matching hash`);
    if (Object.hasOwn(input.currentBestCandidate, "displayName")
      && candidate.displayName !== input.currentBestCandidate.displayName) {
      fail(`${field}.displayName must match its candidate`);
    }
  }
  assertArrayOfStrings(input.outstandingIssues, "outstandingIssues");
  validateAdvice(input.nextRoundSuggestion, "nextRoundSuggestion", { nullable: true });
  if (!isPlainObject(input.extensions)) fail("extensions must be an object");

  const output = {};
  for (const key of PROJECT_KEYS) {
    if (key !== "extensions" && key !== "experiments" && key !== "licenses") output[key] = cloneJson(input[key]);
  }
  const unknown = {};
  for (const [key, value] of Object.entries(input)) {
    if (!PROJECT_KEYS.has(key)) unknown[key] = cloneJson(value);
  }
  const suppliedExtensions = cloneJson(input.extensions);
  output.extensions = { ...suppliedExtensions, ...unknown };
  output.experiments = input.experiments.map(createExperimentRecord);
  output.licenses = validatedLicenses;
  return output;
}

export function rebuildPromptQueue(project, styleSpec) {
  const validated = validateProject(project);
  const normalizedStyle = normalizeStyleSpec(styleSpec);
  validateStyleSpec(normalizedStyle);
  const freshBatches = createPromptVariants(normalizedStyle);
  const batches = freshBatches.map((fresh, index) => {
    const previous = validated.batches[index];
    const previousConditions = snapshotGenerationConditions(previous, validated.styleSpec);
    const nextConditions = snapshotGenerationConditions(fresh, normalizedStyle);
    return stableStringify(previousConditions) === stableStringify(nextConditions) ? previous : fresh;
  });
  return validateProject({
    ...validated,
    styleSpec: normalizedStyle,
    batches,
  });
}

export function recordGenerationRun(project, batchId) {
  const validated = validateProject(project);
  const batchIndex = validated.batches.findIndex(batch => batch.id === batchId);
  if (batchIndex < 0) fail(`Unknown batch: ${batchId}`);
  const current = validated.batches[batchIndex];
  if (current.currentRunId !== null && current.currentCandidateId === null) return validated;
  const { batch, run } = appendRun(validated, batchIndex, {
    resetProgress: current.currentRunId !== null,
  });
  validated.batches[batchIndex] = batch;
  validated.runs.push(run);
  return validateProject(validated);
}

export function recordCreateRun(project, batchId) {
  const validated = validateProject(project);
  const batchIndex = validated.batches.findIndex(batch => batch.id === batchId);
  if (batchIndex < 0) fail(`Unknown batch: ${batchId}`);
  const { batch, run } = appendRun(validated, batchIndex, {
    status: "submitted",
    resetProgress: true,
  });
  validated.batches[batchIndex] = batch;
  validated.runs.push(run);
  return validateProject(validated);
}

function synchronizeCurrentBatchReview(project, experiment) {
  const batchIndex = project.batches.findIndex(batch => (
    batch.id === experiment.batchId
    && batch.currentRunId === experiment.runId
    && batch.currentCandidateId === experiment.candidateId
  ));
  if (batchIndex < 0) return;
  project.batches[batchIndex] = {
    ...project.batches[batchIndex],
    ...Object.fromEntries(REVIEW_FIELDS.map(field => [field, experiment[field]])),
  };
}

export function updateRunOutputs(project, runId, outputs) {
  const validated = validateProject(project);
  assertId(runId, "runId");
  if (!Array.isArray(outputs)) fail("outputs must be an array");
  if (outputs.length > 2) fail("outputs may contain at most two results");
  assertPortableValue(outputs, "outputs");
  outputs.forEach((output, index) => validateRunOutput(output, `outputs[${index}]`));
  const runIndex = validated.runs.findIndex(run => run.id === runId);
  if (runIndex < 0) fail(`Unknown run: ${runId}`);
  const normalizedOutputs = cloneJson(outputs);
  validated.runs[runIndex] = { ...validated.runs[runIndex], outputs: normalizedOutputs };

  validated.experiments = validated.experiments.map(experiment => {
    if (experiment.runId !== runId || !Object.hasOwn(experiment, "outputIndex") || experiment.outputIndex === null) return experiment;
    const output = normalizedOutputs[experiment.outputIndex];
    if (!output) fail(`experiment ${experiment.id} outputIndex must reference an existing run output`);
    const synchronized = {
      ...experiment,
      ...Object.fromEntries(REVIEW_FIELDS.map(field => [field, output[field]])),
    };
    synchronizeCurrentBatchReview(validated, synchronized);
    return synchronized;
  });

  const currentBatchIndex = validated.batches.findIndex(batch => batch.currentRunId === runId);
  if (currentBatchIndex >= 0 && validated.batches[currentBatchIndex].currentCandidateId === null) {
    const output = normalizedOutputs[0] ?? {
      generatedUrl: null,
      subjectiveScore: null,
      reviewNote: "",
      disposition: "unrated",
    };
    validated.batches[currentBatchIndex] = {
      ...validated.batches[currentBatchIndex],
      ...Object.fromEntries(REVIEW_FIELDS.map(field => [field, output[field]])),
    };
  }
  return validateProject(validated);
}

export function bindExperimentOutput(project, experimentId, outputIndex) {
  const validated = validateProject(project);
  assertId(experimentId, "experimentId");
  const experimentIndex = validated.experiments.findIndex(experiment => experiment.id === experimentId);
  if (experimentIndex < 0) fail(`Unknown experiment: ${experimentId}`);
  const current = validated.experiments[experimentIndex];
  if (outputIndex === null) {
    const unbound = { ...current, outputIndex: null };
    validated.experiments[experimentIndex] = unbound;
    synchronizeCurrentBatchReview(validated, unbound);
    return validateProject(validated);
  }
  assertInteger(outputIndex, "outputIndex", { minimum: 0, maximum: 1 });
  const run = validated.runs.find(item => item.id === current.runId);
  const output = run?.outputs[outputIndex];
  if (!output) fail("outputIndex must reference an existing run output");
  const synchronized = {
    ...current,
    outputIndex,
    ...Object.fromEntries(REVIEW_FIELDS.map(field => [field, output[field]])),
  };
  validated.experiments[experimentIndex] = synchronized;
  synchronizeCurrentBatchReview(validated, synchronized);
  return validateProject(validated);
}

export function updateExperimentReview(project, experimentId, patch = {}) {
  const validated = validateProject(project);
  assertId(experimentId, "experimentId");
  if (!isPlainObject(patch)) fail("experiment review patch must be an object");
  for (const key of Object.keys(patch)) {
    if (!REVIEW_FIELDS.includes(key)) fail(`Unsupported experiment review field: ${key}`);
  }
  assertPortableValue(patch, "experiment review patch");
  const experimentIndex = validated.experiments.findIndex(experiment => experiment.id === experimentId);
  if (experimentIndex < 0) fail(`Unknown experiment: ${experimentId}`);
  const updated = { ...validated.experiments[experimentIndex], ...patch };
  validated.experiments[experimentIndex] = updated;
  if (Object.hasOwn(updated, "outputIndex") && updated.outputIndex !== null) {
    const runIndex = validated.runs.findIndex(run => run.id === updated.runId);
    const output = validated.runs[runIndex]?.outputs[updated.outputIndex];
    if (!output) fail(`experiment ${experimentId} outputIndex must reference an existing run output`);
    const outputs = validated.runs[runIndex].outputs.map((item, index) => index === updated.outputIndex
      ? { ...item, ...Object.fromEntries(REVIEW_FIELDS.map(field => [field, updated[field]])) }
      : item);
    validated.runs[runIndex] = { ...validated.runs[runIndex], outputs };
    const synchronizedReview = Object.fromEntries(REVIEW_FIELDS.map(field => [field, updated[field]]));
    validated.experiments = validated.experiments.map(experiment => (
      experiment.runId === updated.runId && experiment.outputIndex === updated.outputIndex
        ? { ...experiment, ...synchronizedReview }
        : experiment
    ));
    validated.experiments.forEach(experiment => {
      if (experiment.runId === updated.runId && experiment.outputIndex === updated.outputIndex) {
        synchronizeCurrentBatchReview(validated, experiment);
      }
    });
  } else {
    synchronizeCurrentBatchReview(validated, updated);
  }
  return validateProject(validated);
}

export function transitionBatch(plan, batchId, status, patch = {}) {
  const validated = validateProject(plan);
  if (!STATUS_VALUES.has(status)) fail(`Unsupported batch status: ${status}`);
  if (!isPlainObject(patch)) fail("batch patch must be an object");
  for (const key of Object.keys(patch)) {
    if (!BATCH_PATCH_KEYS.has(key)) fail(`Unsupported batch patch field: ${key}`);
  }
  assertPortableValue(patch);
  const index = validated.batches.findIndex(batch => batch.id === batchId);
  if (index < 0) fail(`Unknown batch: ${batchId}`);
  const current = validated.batches[index];
  if (!TRANSITIONS[current.status].has(status)) fail(`Invalid status transition: ${current.status} -> ${status}`);
  const shouldFreezeConditions = current.generationConditions === null
    && (status === "submitted" || (Object.hasOwn(patch, "generatedUrl") && patch.generatedUrl !== null));
  let run = null;
  const recorded = shouldFreezeConditions
    ? appendRun(validated, index, {
      status,
      generatedUrl: Object.hasOwn(patch, "generatedUrl") ? patch.generatedUrl : current.generatedUrl,
    })
    : null;
  const next = {
    ...(recorded?.batch || current),
    ...patch,
    status,
  };
  run = recorded?.run || null;
  validateBatch(next);
  validated.batches[index] = next;
  if (run) validated.runs.push(run);
  return validated;
}

export function exportProjectJson(project) {
  return stableStringify(validateProject(project));
}

function addMissingLegacyRuns(input) {
  const migrated = cloneJson(input);
  migrated.runs = [];
  const usedIds = new Set([
    ...(migrated.batches || []),
    ...(migrated.references || []),
    ...(migrated.candidates || []),
    ...(migrated.experiments || []),
    ...(migrated.licenses || []),
  ].map(item => item?.id).filter(Boolean));
  let nextIndex = 1;
  const allocateLegacyRunId = () => {
    while (usedIds.has(`run-${nextIndex}`)) nextIndex += 1;
    const id = `run-${nextIndex}`;
    usedIds.add(id);
    nextIndex += 1;
    return id;
  };
  const batchById = new Map((migrated.batches || []).map(batch => [batch.id, batch]));
  migrated.experiments = (migrated.experiments || []).map(experiment => {
    const batch = batchById.get(experiment.batchId);
    const runId = allocateLegacyRunId();
    migrated.runs.push({
      id: runId,
      sourceUrl: migrated.sourceUrl,
      status: batch?.status || "planned",
      generatedUrl: experiment.generatedUrl ?? null,
      generationConditions: cloneJson(experiment.generationConditions),
    });
    return { ...experiment, runId };
  });
  migrated.batches = (migrated.batches || []).map(batch => {
    let currentRunId = null;
    let currentCandidateId = null;
    let candidateHash = batch.candidateHash ?? null;
    if (batch.generationConditions !== null) {
      const candidate = [...(migrated.candidates || [])].reverse().find(item => (
        item.batchId === batch.id && item.hash === candidateHash
      ));
      const experiment = candidate
        ? [...migrated.experiments].reverse().find(item => item.candidateId === candidate.id)
        : null;
      if (experiment
        && stableStringify(experiment.generationConditions) === stableStringify(batch.generationConditions)) {
        currentRunId = experiment.runId;
        currentCandidateId = candidate.id;
      } else {
        currentRunId = allocateLegacyRunId();
        migrated.runs.push({
          id: currentRunId,
          sourceUrl: migrated.sourceUrl,
          status: batch.status,
          generatedUrl: batch.generatedUrl,
          generationConditions: cloneJson(batch.generationConditions),
        });
        candidateHash = null;
      }
    } else {
      candidateHash = null;
    }
    return {
      ...batch,
      currentRunId,
      currentCandidateId,
      candidateHash,
    };
  });
  return migrated;
}

function legacyOutputFromEvidence(evidence, generatedUrl) {
  return {
    generatedUrl,
    subjectiveScore: evidence.subjectiveScore ?? null,
    reviewNote: evidence.reviewNote ?? "",
    disposition: evidence.disposition ?? "unrated",
  };
}

function migrateLegacyVersionOne(input) {
  if (!isPlainObject(input) || input.version !== 1) return input;
  const migrated = Object.hasOwn(input, "runs") ? cloneJson(input) : addMissingLegacyRuns(input);
  migrated.version = 2;
  const experimentsByRun = new Map();
  for (const experiment of migrated.experiments || []) {
    if (!experimentsByRun.has(experiment.runId)) experimentsByRun.set(experiment.runId, []);
    experimentsByRun.get(experiment.runId).push(experiment);
  }
  const batchesByRun = new Map();
  for (const batch of migrated.batches || []) {
    if (batch.currentRunId !== null && typeof batch.currentRunId !== "undefined") {
      batchesByRun.set(batch.currentRunId, batch);
    }
  }
  migrated.runs = (migrated.runs || []).map(legacyRun => {
    const outputsByUrl = new Map();
    const addOutput = output => {
      if (output.generatedUrl === null || typeof output.generatedUrl === "undefined") return;
      outputsByUrl.set(output.generatedUrl, cloneJson(output));
      if (outputsByUrl.size > 2) fail(`legacy run ${legacyRun.id} has more than two unique output links`);
    };
    for (const output of Array.isArray(legacyRun.outputs) ? legacyRun.outputs : []) addOutput(output);
    if (legacyRun.generatedUrl !== null && typeof legacyRun.generatedUrl !== "undefined") {
      addOutput(legacyOutputFromEvidence({}, legacyRun.generatedUrl));
    }
    for (const experiment of experimentsByRun.get(legacyRun.id) || []) {
      if (experiment.generatedUrl !== null && typeof experiment.generatedUrl !== "undefined") {
        addOutput(legacyOutputFromEvidence(experiment, experiment.generatedUrl));
      }
    }
    const batch = batchesByRun.get(legacyRun.id);
    if (batch?.generatedUrl !== null && typeof batch?.generatedUrl !== "undefined") {
      addOutput(legacyOutputFromEvidence(batch, batch.generatedUrl));
    }
    const outputs = [...outputsByUrl.values()];
    const { generatedUrl: ignoredGeneratedUrl, outputs: ignoredOutputs, ...run } = legacyRun;
    return { ...run, outputs };
  });
  migrated.experiments = (migrated.experiments || []).map(legacyExperiment => {
    if (Object.hasOwn(legacyExperiment, "outputIndex")) {
      const { outputIndex: ignoredOutputIndex, ...unboundExperiment } = legacyExperiment;
      return unboundExperiment;
    }
    return legacyExperiment;
  });
  return migrated;
}

function migrateLegacyVersionTwo(input) {
  if (!isPlainObject(input) || input.version !== 2) return input;
  const migrated = cloneJson(input);
  migrated.version = PROJECT_VERSION;
  const experimentsByCandidate = new Map();
  for (const experiment of migrated.experiments || []) {
    if (!experimentsByCandidate.has(experiment.candidateId)) experimentsByCandidate.set(experiment.candidateId, []);
    experimentsByCandidate.get(experiment.candidateId).push(experiment);
  }
  migrated.candidates = (migrated.candidates || []).map(candidate => {
    const runIds = [...new Set((experimentsByCandidate.get(candidate.id) || [])
      .map(experiment => experiment.runId)
      .filter(runId => typeof runId === "string"))];
    return {
      ...candidate,
      candidateSource: {
        kind: "legacy-unknown",
        ...(runIds.length === 1 ? { legacyRunId: runIds[0] } : {}),
      },
    };
  });
  migrated.licenses = (migrated.licenses || []).map(license => {
    const {
      category: ignoredCategory,
      licenseFlags: ignoredLicenseFlags,
      useWarning: ignoredUseWarning,
      attributionWarning: ignoredAttributionWarning,
      publicationBlocked: ignoredPublicationBlocked,
      publicationBlockers: ignoredPublicationBlockers,
      previewOnly: ignoredPreviewOnly,
      ...evidence
    } = license;
    return evidence;
  });
  return migrated;
}

export function importProjectJson(text) {
  if (typeof text !== "string") fail("project JSON must be text");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("project JSON is invalid");
  }
  return validateProject(migrateLegacyVersionTwo(migrateLegacyVersionOne(parsed)));
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
    if (batch.currentRunId) lines.push(`- Current run ID: ${markdownText(batch.currentRunId)}`);
    if (batch.currentCandidateId) lines.push(`- Current candidate ID: ${markdownText(batch.currentCandidateId)}`);
    if (batch.generatedUrl) lines.push(`- Generated URL: ${markdownText(batch.generatedUrl)}`);
    if (batch.candidateHash) lines.push(`- Candidate hash: ${markdownText(batch.candidateHash)}`);
    if (batch.subjectiveScore !== null) lines.push(`- Subjective score: ${batch.subjectiveScore}`);
    lines.push(`- Disposition: ${markdownText(batch.disposition)}`);
    if (batch.reviewNote) lines.push(`- Review / rejection reason: ${markdownText(batch.reviewNote)}`);
    if (batch.nextRoundNote) lines.push(`- Next-round note: ${markdownText(batch.nextRoundNote)}`);
    lines.push("");
  }
  lines.push("## 生成运行快照", "");
  if (safe.runs.length === 0) lines.push("- 尚无已记录生成运行。", "");
  for (const run of safe.runs) {
    const conditions = run.generationConditions;
    lines.push(`### ${markdownText(run.id)}`);
    lines.push(`- Batch: ${markdownText(conditions.batchId)}`);
    lines.push(`- Axis: ${markdownText(conditions.changedAxis)}`);
    lines.push(`- Status: ${markdownText(run.status)}`);
    lines.push(`- Source: ${markdownText(run.sourceUrl)}`);
    run.outputs.forEach((output, index) => {
      lines.push(`- Output ${index + 1}:`);
      if (output.generatedUrl) lines.push(`  - Generated URL: ${markdownText(output.generatedUrl)}`);
      if (output.subjectiveScore !== null) lines.push(`  - Subjective score: ${output.subjectiveScore}`);
      lines.push(`  - Disposition: ${markdownText(output.disposition)}`);
      if (output.reviewNote) lines.push(`  - Review / rejection reason: ${markdownText(output.reviewNote)}`);
    });
    lines.push(`- Prompt: ${markdownText(conditions.prompt)}`);
    lines.push(`- Exclude: ${markdownText(conditions.excludePrompt)}`);
    lines.push("- Frozen StyleSpec:", "", "```json", markdownText(stableStringify({ styleSpec: conditions.styleSpec })), "```", "");
  }
  const appendJsonSection = (title, value) => {
    if (typeof value === "undefined") return;
    lines.push(`## ${title}`, "", "```json", markdownText(stableStringify(value)), "```", "");
  };
  if (safe.sourceUrl) appendJsonSection("生成来源", safe.sourceUrl);
  appendJsonSection("参考记录", safe.references);
  appendJsonSection("候选记录", safe.candidates);
  appendJsonSection("实验历史", safe.experiments);
  appendJsonSection("授权台账", safe.licenses);
  appendJsonSection("尚存问题", safe.outstandingIssues);
  appendJsonSection("下一轮建议", safe.nextRoundSuggestion);
  if (isPlainObject(safe.currentBestCandidate)) {
    const { candidateId, displayName, hash } = safe.currentBestCandidate;
    lines.push("## 当前最佳候选", "");
    lines.push(`- Candidate ID: ${markdownText(candidateId)}`);
    if (typeof displayName === "string") lines.push(`- ${markdownText(displayName)}`);
    if (typeof hash === "string") lines.push(`- Hash: ${markdownText(hash)}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
