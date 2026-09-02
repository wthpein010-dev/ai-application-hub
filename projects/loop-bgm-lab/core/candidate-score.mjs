import { assertPublicEvidencePageUrl, assertPortableValue, isPlainObject } from "./portable-safety.mjs";

const WEIGHTS = Object.freeze({
  tempo: 0.25,
  key: 0.20,
  brightness: 0.15,
  dynamics: 0.10,
  loop: 0.20,
  duration: 0.10
});
const TOTAL_WEIGHT = 1;
const CORE_MATCH_SCORE = 0.85;
const MIN_TEMPO_CONFIDENCE = 0.30;
const MIN_KEY_CONFIDENCE = 0.10;

function fail(message) {
  throw new TypeError(message);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function rounded(value) {
  if (!finiteNumber(value)) return value;
  const scaled = value * 1e12;
  return finiteNumber(scaled) ? Math.round(scaled) / 1e12 : value;
}

function finiteDelta(candidate, reference) {
  const delta = candidate - reference;
  if (finiteNumber(delta)) return rounded(delta);
  if (candidate > reference) return Number.MAX_VALUE;
  if (candidate < reference) return -Number.MAX_VALUE;
  return 0;
}

function scoreFromDelta(delta, tolerance) {
  return rounded(clamp01(1 - Math.abs(delta) / tolerance));
}

function meetsConfidence(value, minimum) {
  return finiteNumber(value) && value >= minimum;
}

function component(available, weight, score, detail) {
  return { available, weight, score: available ? rounded(score) : 0, ...detail };
}

function tempoComponent(reference, candidate) {
  const referenceTempo = reference?.tempo;
  const candidateTempo = candidate?.tempo;
  const available = finiteNumber(referenceTempo?.bpm) && finiteNumber(candidateTempo?.bpm)
    && meetsConfidence(referenceTempo?.confidence, MIN_TEMPO_CONFIDENCE)
    && meetsConfidence(candidateTempo?.confidence, MIN_TEMPO_CONFIDENCE);
  if (!available) return component(false, WEIGHTS.tempo, 0, { deltaBpm: null });
  const deltaBpm = finiteDelta(candidateTempo.bpm, referenceTempo.bpm);
  return component(true, WEIGHTS.tempo, scoreFromDelta(deltaBpm, 24), { deltaBpm });
}

function keyComponent(reference, candidate) {
  const referenceKey = reference?.key;
  const candidateKey = candidate?.key;
  const available = [referenceKey, candidateKey].every(key => (
    isPlainObject(key)
    && typeof key.name === "string" && key.name.length > 0
    && typeof key.tonic === "string" && key.tonic.length > 0
    && typeof key.mode === "string" && key.mode.length > 0
    && meetsConfidence(key.confidence, MIN_KEY_CONFIDENCE)
  ));
  if (!available) return component(false, WEIGHTS.key, 0, { relationship: "unavailable" });
  if (referenceKey.tonic === candidateKey.tonic && referenceKey.mode === candidateKey.mode) {
    return component(true, WEIGHTS.key, 1, { relationship: "same-key" });
  }
  if (referenceKey.tonic === candidateKey.tonic) {
    return component(true, WEIGHTS.key, 0.75, { relationship: "parallel-key" });
  }
  if (referenceKey.mode === candidateKey.mode) {
    return component(true, WEIGHTS.key, 0.4, { relationship: "same-mode" });
  }
  return component(true, WEIGHTS.key, 0.2, { relationship: "different-key" });
}

function numericComponent(reference, candidate, weight, detailName, tolerance = 1) {
  const available = finiteNumber(reference) && finiteNumber(candidate);
  if (!available) return component(false, weight, 0, { [detailName]: null });
  const delta = finiteDelta(candidate, reference);
  return component(true, weight, scoreFromDelta(delta, tolerance), { [detailName]: delta });
}

function durationComponent(reference, candidate) {
  const referenceDuration = reference?.durationSeconds;
  const candidateDuration = candidate?.durationSeconds;
  const available = finiteNumber(referenceDuration) && finiteNumber(candidateDuration) && referenceDuration > 0 && candidateDuration > 0;
  if (!available) return component(false, WEIGHTS.duration, 0, { deltaSeconds: null });
  const deltaSeconds = finiteDelta(candidateDuration, referenceDuration);
  return component(true, WEIGHTS.duration, scoreFromDelta(deltaSeconds, referenceDuration), { deltaSeconds });
}

export function compareCandidate(reference, candidate) {
  const components = {
    tempo: tempoComponent(reference, candidate),
    key: keyComponent(reference, candidate),
    brightness: numericComponent(reference?.spectrum?.brightness, candidate?.spectrum?.brightness, WEIGHTS.brightness, "delta"),
    dynamics: numericComponent(reference?.rms, candidate?.rms, WEIGHTS.dynamics, "delta", 0.5),
    loop: numericComponent(reference?.loop?.score, candidate?.loop?.score, WEIGHTS.loop, "delta"),
    duration: durationComponent(reference, candidate)
  };
  const availableWeight = Object.values(components).reduce((sum, item) => sum + (item.available ? item.weight : 0), 0);
  const weightedScore = Object.values(components).reduce((sum, item) => sum + (item.available ? item.score * item.weight : 0), 0);
  const coverage = rounded(availableWeight / TOTAL_WEIGHT);
  const similarity = availableWeight > 0 ? rounded(weightedScore / availableWeight) : 0;
  const coreMatches = [components.tempo, components.key, components.brightness]
    .every(item => item.available && item.score >= CORE_MATCH_SCORE);
  return { components, coverage, similarity, coreMatches };
}

export function classifySimilarity(comparison) {
  const coverage = finiteNumber(comparison?.coverage) ? comparison.coverage : 0;
  const similarity = finiteNumber(comparison?.similarity) ? comparison.similarity : 0;
  if (coverage < 0.70) return "insufficient";
  if (similarity >= 0.86 && comparison?.coreMatches === true) return "too-close";
  if (similarity >= 0.75) return "review";
  return "distinct";
}

const ADVICE = {
  tempo: {
    changedAxis: "rhythm",
    reason: "速度与参考差异最明显，先只检查律动推进是否偏快或偏慢。",
    adjustment: "下一轮只调整 rhythm：把速度提示收紧，并保持其余音色与结构不变。"
  },
  key: {
    changedAxis: "melodyTimbre",
    reason: "调性关系差异最明显，先用旋律音色与动机重心建立更清晰的听感区分。",
    adjustment: "下一轮只调整 melodyTimbre：更换主旋律音色和短动机轮廓，其他变量保持不变。"
  },
  brightness: {
    changedAxis: "melodyTimbre",
    reason: "明亮度差异最明显，优先从主旋律音色的明暗取向处理。",
    adjustment: "下一轮只调整 melodyTimbre：提高或降低 pluck 的明亮度，其他变量保持不变。"
  },
  dynamics: {
    changedAxis: "percussion",
    reason: "动态起伏差异最明显，优先从打击乐密度与力度控制处理。",
    adjustment: "下一轮只调整 percussion：收紧或放松鼓组力度，其他变量保持不变。"
  },
  loop: {
    changedAxis: "loopStructure",
    reason: "循环衔接差异最明显，优先处理尾首能量和和声交接。",
    adjustment: "下一轮只调整 loopStructure：明确尾首和声与能量衔接，其他变量保持不变。"
  },
  duration: {
    changedAxis: "loopStructure",
    reason: "时长与结构比例差异最明显，优先调整循环段落长度。",
    adjustment: "下一轮只调整 loopStructure：改用更合适的小节循环长度，其他变量保持不变。"
  }
};

export function recommendNextVariant(comparison) {
  if (classifySimilarity(comparison) === "insufficient") {
    return {
      kind: "evidence-insufficient",
      message: "有效特征覆盖率低于 70%，证据不足；请补充可用分析数据后再判断。"
    };
  }
  if (classifySimilarity(comparison) === "too-close") {
    return {
      kind: "variant",
      changedAxis: "melodyTimbre",
      reason: "核心特征整体过近，不能把零差值虚构成某一项的最大差异。",
      adjustment: "下一轮只调整 melodyTimbre：重新设计旋律动机与配器层次，避免沿用可识别的主导轮廓，其他变量保持不变。"
    };
  }
  const orderedNames = ["tempo", "loop", "brightness", "dynamics", "duration", "key"];
  let selected = "brightness";
  let largestGap = -1;
  for (const name of orderedNames) {
    const item = comparison?.components?.[name];
    if (!item?.available || !finiteNumber(item.score)) continue;
    const gap = 1 - clamp01(item.score);
    if (gap > largestGap) {
      largestGap = gap;
      selected = name;
    }
  }
  const advice = ADVICE[selected];
  return { kind: "variant", changedAxis: advice.changedAxis, reason: advice.reason, adjustment: advice.adjustment };
}

function detachAndFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(detachAndFreeze));
  const output = {};
  for (const [key, childValue] of Object.entries(value)) output[key] = detachAndFreeze(childValue);
  return Object.freeze(output);
}

export function createExperimentRecord(input) {
  if (!isPlainObject(input)) fail("experiment record must be an object");
  assertPortableValue(input);
  return detachAndFreeze(input);
}

const DELIVERY_STATUSES = new Set(["original", "preview-only", "unknown"]);
const RIGHTS_CHAIN_STATUSES = new Set([
  "user-declared-original",
  "source-declaration-only",
  "independently-verified",
  "unknown",
]);
const LICENSE_CATEGORY_BY_IDENTIFIER = new Map([
  ["CC0-1.0", "cc0"],
  ["CC-BY-3.0", "cc-by"],
  ["CC-BY-4.0", "cc-by"],
  ["CC-BY-SA-3.0", "cc-by-sa"],
  ["CC-BY-SA-4.0", "cc-by-sa"],
  ["CC-BY-NC-3.0", "cc-by-nc"],
  ["CC-BY-NC-4.0", "cc-by-nc"],
  ["CC-BY-ND-3.0", "cc-by-nd"],
  ["CC-BY-ND-4.0", "cc-by-nd"],
  ["CC-BY-NC-SA-3.0", "cc-by-nc-sa"],
  ["CC-BY-NC-SA-4.0", "cc-by-nc-sa"],
  ["CC-BY-NC-ND-3.0", "cc-by-nc-nd"],
  ["CC-BY-NC-ND-4.0", "cc-by-nc-nd"],
]);

function licenseFacts(licenseIdentifier, evidence) {
  const category = LICENSE_CATEGORY_BY_IDENTIFIER.get(licenseIdentifier) ?? "unknown";
  const cc0 = category === "cc0";
  const by = category.startsWith("cc-by");
  const nc = category.includes("-nc");
  const sa = category.endsWith("-sa");
  const nd = category.endsWith("-nd");
  const unknown = category === "unknown";
  const previewOnly = evidence.deliveryStatus === "preview-only";
  const missingEvidence = evidence.deliveryStatus === "unknown"
    || evidence.licenseUrl === null
    || evidence.evidenceUrl === null
    || evidence.evidenceCheckedAt === null
    || evidence.scopeNote === null;
  const missingAttribution = by && evidence.attributionText === null;
  const rightsReviewRequired = evidence.rightsChainStatus === "source-declaration-only"
    || evidence.rightsChainStatus === "unknown";
  const publicationBlockers = [
    ...(nc ? ["noncommercial"] : []),
    ...(sa ? ["share-alike-review-required"] : []),
    ...(nd ? ["no-derivatives-review-required"] : []),
    ...(previewOnly ? ["preview-only"] : []),
    ...(unknown ? ["unknown-license"] : []),
    ...(missingEvidence ? ["missing-evidence"] : []),
    ...(missingAttribution ? ["missing-attribution"] : []),
    ...(rightsReviewRequired ? ["rights-chain-review-required"] : []),
  ];
  return {
    category,
    licenseFlags: { by, nc, sa, nd, cc0, previewOnly, unknown },
    publicationBlocked: publicationBlockers.length > 0,
    publicationBlockers,
  };
}

function assertRequiredString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${field} must be a non-empty string`);
}

function normalizeNullableString(value, field) {
  if (value === null) return null;
  if (typeof value !== "string") fail(`${field} must be a string or null`);
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNullableHttpsUrl(value, field) {
  if (value === null) return null;
  return assertPublicEvidencePageUrl(value, field);
}

function normalizeDate(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  assertRequiredString(value, field);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [year, month, day] = dateOnly.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return value;
    }
  }
  const timestamp = nullable
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(value)
    : null;
  const timestampValue = timestamp ? Date.parse(value) : Number.NaN;
  const parsedTimestamp = Number.isFinite(timestampValue) ? new Date(timestampValue) : null;
  const milliseconds = timestamp?.[7] ? Number(timestamp[7].padEnd(3, "0")) : 0;
  if (!timestamp
    || !parsedTimestamp
    || parsedTimestamp.getUTCFullYear() !== Number(timestamp[1])
    || parsedTimestamp.getUTCMonth() + 1 !== Number(timestamp[2])
    || parsedTimestamp.getUTCDate() !== Number(timestamp[3])
    || parsedTimestamp.getUTCHours() !== Number(timestamp[4])
    || parsedTimestamp.getUTCMinutes() !== Number(timestamp[5])
    || parsedTimestamp.getUTCSeconds() !== Number(timestamp[6])
    || parsedTimestamp.getUTCMilliseconds() !== milliseconds) {
    fail(`${field} must be a valid ISO date${nullable ? " or UTC timestamp" : ""}`);
  }
  return value;
}

function assertHash(value, field) {
  if (typeof value !== "string" || !/^[a-fA-F0-9]{64}$/.test(value)) fail(`${field} must be a SHA-256 hash`);
  return value.toLowerCase();
}

export function validateLicenseEntry(entry) {
  if (!isPlainObject(entry)) fail("license entry must be an object");
  const allowed = new Set([
    "id", "source", "sourceUrl", "license", "fileSha256", "fileHash", "attributionText", "author",
    "downloadedAt", "previewOnly", "category", "licenseFlags", "publicationBlocked", "publicationBlockers",
    "useWarning", "attributionWarning", "licenseIdentifier", "licenseUrl", "evidenceUrl", "evidenceCheckedAt",
    "deliveryStatus", "scopeNote", "rightsChainStatus", "evidenceSha256", "modificationNote"
  ]);
  for (const key of Object.keys(entry)) {
    if (!allowed.has(key)) fail(`Unsupported license field: ${key}`);
  }
  const sourceUrl = assertPublicEvidencePageUrl(entry.sourceUrl, "sourceUrl");
  assertPortableValue(entry);
  assertRequiredString(entry.id, "license.id");
  if (!/^[a-z][a-z0-9-]{0,79}$/i.test(entry.id)) fail("license.id must be a portable identifier");
  assertRequiredString(entry.source, "license.source");
  assertRequiredString(entry.license, "license.license");
  for (const requiredField of [
    "licenseIdentifier", "licenseUrl", "evidenceUrl", "evidenceCheckedAt", "deliveryStatus", "scopeNote",
    "rightsChainStatus",
  ]) {
    if (!Object.hasOwn(entry, requiredField)) fail(`license.${requiredField} is required`);
  }
  assertRequiredString(entry.licenseIdentifier, "license.licenseIdentifier");
  if (entry.licenseIdentifier !== entry.licenseIdentifier.trim()) {
    fail("license.licenseIdentifier must not contain surrounding whitespace");
  }
  const licenseUrl = normalizeNullableHttpsUrl(entry.licenseUrl, "license.licenseUrl");
  const evidenceUrl = normalizeNullableHttpsUrl(entry.evidenceUrl, "license.evidenceUrl");
  const evidenceCheckedAt = normalizeDate(entry.evidenceCheckedAt, "license.evidenceCheckedAt", { nullable: true });
  if (!DELIVERY_STATUSES.has(entry.deliveryStatus)) fail("license.deliveryStatus is unsupported");
  const scopeNote = normalizeNullableString(entry.scopeNote, "license.scopeNote");
  if (!RIGHTS_CHAIN_STATUSES.has(entry.rightsChainStatus)) fail("license.rightsChainStatus is unsupported");
  const fileSha256 = entry.fileSha256 ?? entry.fileHash;
  const normalizedFileSha256 = assertHash(fileSha256, "license.fileSha256");
  if (typeof entry.fileSha256 === "string" && typeof entry.fileHash === "string"
    && entry.fileSha256.toLowerCase() !== entry.fileHash.toLowerCase()) {
    fail("license hash fields are inconsistent");
  }
  const attributionText = Object.hasOwn(entry, "attributionText")
    ? normalizeNullableString(entry.attributionText, "license.attributionText")
    : null;
  const evidenceSha256 = Object.hasOwn(entry, "evidenceSha256")
    ? assertHash(entry.evidenceSha256, "license.evidenceSha256")
    : null;
  const modificationNote = Object.hasOwn(entry, "modificationNote")
    ? normalizeNullableString(entry.modificationNote, "license.modificationNote")
    : null;
  const derived = licenseFacts(entry.licenseIdentifier, {
    licenseUrl,
    evidenceUrl,
    evidenceCheckedAt,
    deliveryStatus: entry.deliveryStatus,
    scopeNote,
    rightsChainStatus: entry.rightsChainStatus,
    attributionText,
  });
  const { category, licenseFlags, publicationBlocked, publicationBlockers } = derived;
  const previewOnly = licenseFlags.previewOnly;
  assertRequiredString(entry.author, "license.author");
  const downloadedAt = normalizeDate(entry.downloadedAt, "license.downloadedAt");
  const warnings = {
    cc0: {
      useWarning: "标记为 CC0；仍请核对来源页面与实际使用范围。",
      attributionWarning: "CC0 通常不要求署名，但应保留来源和许可证记录。"
    },
    "cc-by": {
      useWarning: "CC-BY 需要按来源页面要求保留署名与许可证信息。",
      attributionWarning: "必须在项目素材台账和成品署名中保留提供的署名文本。"
    },
    "cc-by-nc": {
      useWarning: "CC-BY-NC 同时要求署名并限制非商业使用，不应作为商业游戏素材使用。",
      attributionWarning: "必须保留作者与署名文本；NC 限制仍独立生效。"
    },
    "cc-by-sa": {
      useWarning: "CC-BY-SA 要求署名并履行相同方式共享；完成兼容性审核前阻止发布。",
      attributionWarning: "必须保留作者、署名文本、许可证和相同方式共享要求。"
    },
    "cc-by-nc-sa": {
      useWarning: "CC-BY-NC-SA 含非商业与相同方式共享限制，不应作为商业游戏素材发布。",
      attributionWarning: "必须保留作者与署名文本；NC 与 SA 限制仍独立生效。"
    },
    "cc-by-nd": {
      useWarning: "CC-BY-ND 禁止发布改编版本；完成成品使用方式审核前阻止发布。",
      attributionWarning: "必须保留作者与署名文本，并核对是否构成改编。"
    },
    "cc-by-nc-nd": {
      useWarning: "CC-BY-NC-ND 同时限制商业使用与改编，不应作为商业游戏素材发布。",
      attributionWarning: "必须保留作者与署名文本；NC 与 ND 限制仍独立生效。"
    },
    nc: {
      useWarning: "含 NC（非商业）限制，不应作为商业游戏素材使用。",
      attributionWarning: "即使需要署名，也不能忽略非商业限制。"
    },
    unknown: {
      useWarning: "授权类型未知，不应按可商用素材处理。",
      attributionWarning: "请补充来源许可和署名要求后再决定用途。"
    },
    sa: {
      useWarning: "许可证含相同方式共享要求；完成许可证兼容性审核前阻止发布。",
      attributionWarning: "请补齐署名与相同方式共享要求。"
    },
    nd: {
      useWarning: "许可证含禁止改编要求；完成成品使用方式审核前阻止发布。",
      attributionWarning: "请补齐署名要求并核对是否构成改编。"
    }
  }[category];
  const output = {
    id: entry.id,
    source: entry.source,
    sourceUrl,
    license: entry.license,
    licenseIdentifier: entry.licenseIdentifier,
    licenseUrl,
    evidenceUrl,
    evidenceCheckedAt,
    deliveryStatus: entry.deliveryStatus,
    scopeNote,
    rightsChainStatus: entry.rightsChainStatus,
    fileSha256: normalizedFileSha256,
    category,
    licenseFlags,
    previewOnly,
    publicationBlocked,
    publicationBlockers,
    useWarning: warnings.useWarning,
    attributionWarning: warnings.attributionWarning,
    author: entry.author,
    downloadedAt,
  };
  if (attributionText !== null) output.attributionText = attributionText;
  if (evidenceSha256 !== null) output.evidenceSha256 = evidenceSha256;
  if (modificationNote !== null) output.modificationNote = modificationNote;
  if (Object.hasOwn(entry, "category") && entry.category !== category) fail("license.category is inconsistent with license text");
  if (Object.hasOwn(entry, "licenseFlags")) {
    const supplied = entry.licenseFlags;
    if (!isPlainObject(supplied)
      || Object.keys(licenseFlags).some(key => supplied[key] !== licenseFlags[key])
      || Object.keys(supplied).some(key => !Object.hasOwn(licenseFlags, key))) {
      fail("license.licenseFlags are inconsistent with license text");
    }
  }
  if (Object.hasOwn(entry, "publicationBlocked") && entry.publicationBlocked !== publicationBlocked) {
    fail("license.publicationBlocked is inconsistent with license restrictions");
  }
  if (Object.hasOwn(entry, "previewOnly") && entry.previewOnly !== previewOnly) {
    fail("license.previewOnly is inconsistent with license.deliveryStatus");
  }
  if (Object.hasOwn(entry, "publicationBlockers")
    && JSON.stringify(entry.publicationBlockers) !== JSON.stringify(publicationBlockers)) {
    fail("license.publicationBlockers are inconsistent with license restrictions");
  }
  if (Object.hasOwn(entry, "useWarning") && entry.useWarning !== output.useWarning) {
    fail("license.useWarning is inconsistent with license restrictions");
  }
  if (Object.hasOwn(entry, "attributionWarning") && entry.attributionWarning !== output.attributionWarning) {
    fail("license.attributionWarning is inconsistent with license restrictions");
  }
  return output;
}
