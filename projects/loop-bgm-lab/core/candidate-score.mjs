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

function fail(message) {
  throw new TypeError(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function positiveConfidence(value) {
  return finiteNumber(value) && value > 0;
}

function component(available, weight, score, detail) {
  return { available, weight, score: available ? rounded(score) : 0, ...detail };
}

function tempoComponent(reference, candidate) {
  const referenceTempo = reference?.tempo;
  const candidateTempo = candidate?.tempo;
  const available = finiteNumber(referenceTempo?.bpm) && finiteNumber(candidateTempo?.bpm)
    && positiveConfidence(referenceTempo?.confidence) && positiveConfidence(candidateTempo?.confidence);
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
    && positiveConfidence(key.confidence)
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
  return { changedAxis: advice.changedAxis, reason: advice.reason, adjustment: advice.adjustment };
}

const SECRET_OR_BINARY_KEY = /(audioBytes|cookie|token|apiKey|recoveryKey|session)/i;
const LOCAL_PATH_KEY = /^(?:localPath|filePath|audioPath|path)$/i;

function isAbsolutePath(value) {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\");
}

function assertSafeJson(value, key = "", inheritedPathSensitive = false, seen = new WeakSet()) {
  if (SECRET_OR_BINARY_KEY.test(key)) fail(`Forbidden key: ${key}`);
  const pathSensitive = inheritedPathSensitive || LOCAL_PATH_KEY.test(key);
  if (pathSensitive && typeof value === "string" && isAbsolutePath(value)) {
    fail(`Absolute path is not allowed in ${key}`);
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("Only finite numbers are allowed");
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) fail("Circular values are not allowed");
    seen.add(value);
    value.forEach(item => assertSafeJson(item, "", pathSensitive, seen));
    seen.delete(value);
    return;
  }
  if (!isPlainObject(value)) fail("Only plain JSON values are allowed");
  if (seen.has(value)) fail("Circular values are not allowed");
  seen.add(value);
  Object.entries(value).forEach(([childKey, childValue]) => assertSafeJson(childValue, childKey, pathSensitive, seen));
  seen.delete(value);
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
  assertSafeJson(input);
  return detachAndFreeze(input);
}

function licenseCategory(license) {
  const normalized = license.trim().toLowerCase();
  if (/\bcc\s*-?\s*by\s*-?\s*nc\b|\bnc\b/.test(normalized)) return "nc";
  if (/^cc0(?:\b|\s)/.test(normalized)) return "cc0";
  if (/\bcc\s*-?\s*by\b/.test(normalized)) return "cc-by";
  return "unknown";
}

function assertRequiredString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${field} must be a non-empty string`);
}

function assertHttpsUrl(value) {
  assertRequiredString(value, "sourceUrl");
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("sourceUrl must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:") fail("sourceUrl must use HTTPS");
}

export function validateLicenseEntry(entry) {
  if (!isPlainObject(entry)) fail("license entry must be an object");
  assertSafeJson(entry);
  assertRequiredString(entry.id, "license.id");
  assertRequiredString(entry.source, "license.source");
  assertHttpsUrl(entry.sourceUrl);
  assertRequiredString(entry.license, "license.license");
  const fileSha256 = entry.fileSha256 ?? entry.fileHash;
  if (typeof fileSha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(fileSha256)) {
    fail("license.fileSha256 must be a SHA-256 hash");
  }
  const category = licenseCategory(entry.license);
  if (category === "cc-by") assertRequiredString(entry.attributionText, "license.attributionText");
  const warnings = {
    cc0: {
      useWarning: "标记为 CC0；仍请核对来源页面与实际使用范围。",
      attributionWarning: "CC0 通常不要求署名，但应保留来源和许可证记录。"
    },
    "cc-by": {
      useWarning: "CC-BY 需要按来源页面要求保留署名与许可证信息。",
      attributionWarning: "必须在项目素材台账和成品署名中保留提供的署名文本。"
    },
    nc: {
      useWarning: "含 NC（非商业）限制，不应作为商业游戏素材使用。",
      attributionWarning: "即使需要署名，也不能忽略非商业限制。"
    },
    unknown: {
      useWarning: "授权类型未知，不应按可商用素材处理。",
      attributionWarning: "请补充来源许可和署名要求后再决定用途。"
    }
  }[category];
  const output = {
    id: entry.id,
    source: entry.source,
    sourceUrl: entry.sourceUrl,
    license: entry.license,
    fileSha256,
    category,
    useWarning: warnings.useWarning,
    attributionWarning: warnings.attributionWarning
  };
  if (typeof entry.attributionText === "string" && entry.attributionText.length > 0) output.attributionText = entry.attributionText;
  if (typeof entry.author === "string") output.author = entry.author;
  if (typeof entry.downloadedAt === "string") output.downloadedAt = entry.downloadedAt;
  return output;
}
