import { normalizeStyleSpec } from "./prompt-engine.mjs";

export const MAX_DECODED_DURATION_SECONDS = 600;
export const MAX_DECODED_SCALAR_SAMPLES = 30_000_000;
const MAX_CHANNEL_COUNT = 8;

function finitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function weightedMedian(items, valueOf, weightOf) {
  const usable = items
    .map(item => ({ value: valueOf(item), weight: weightOf(item) }))
    .filter(item => Number.isFinite(item.value) && finitePositive(item.weight))
    .sort((left, right) => left.value - right.value);
  if (!usable.length) return null;
  const midpoint = usable.reduce((sum, item) => sum + item.weight, 0) / 2;
  let accumulated = 0;
  for (const item of usable) {
    accumulated += item.weight;
    if (accumulated >= midpoint) return item.value;
  }
  return usable.at(-1).value;
}

function winningKey(analyses) {
  const votes = new Map();
  for (const analysis of analyses) {
    const name = analysis?.key?.name;
    const confidence = analysis?.key?.confidence;
    if (typeof name !== "string" || !name || name === "Unknown" || !finitePositive(confidence)) continue;
    votes.set(name, (votes.get(name) || 0) + confidence);
  }
  return [...votes.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || null;
}

export function aggregateReferenceStyle(records, currentStyle, overrides = {}) {
  const style = normalizeStyleSpec(currentStyle);
  const analyses = Array.isArray(records) ? records.map(record => record?.analysis ?? record).filter(Boolean) : [];
  if (!analyses.length) {
    const defaults = normalizeStyleSpec();
    return normalizeStyleSpec({
      ...defaults,
      key: overrides.key ? style.key : defaults.key,
      tempo: overrides.tempo ? style.tempo : defaults.tempo
    });
  }
  const tempo = weightedMedian(
    analyses,
    analysis => analysis?.tempo?.bpm,
    analysis => analysis?.tempo?.confidence
  );
  const key = winningKey(analyses);
  const nextTarget = Number.isFinite(tempo) ? Math.round(tempo) : style.tempo.target;
  return normalizeStyleSpec({
    ...style,
    key: overrides.key || !key ? style.key : key,
    tempo: overrides.tempo || !Number.isFinite(tempo)
      ? style.tempo
      : { target: nextTarget, min: Math.max(70, nextTarget - 3), max: Math.min(160, nextTarget + 4) }
  });
}

export function assertPredecodeAudioBudget(metadata) {
  const durationSeconds = metadata?.durationSeconds;
  if (Number.isFinite(durationSeconds) && durationSeconds > MAX_DECODED_DURATION_SECONDS) {
    throw new RangeError(`音频解码时长不能超过 ${MAX_DECODED_DURATION_SECONDS} 秒。`);
  }
}

export function assertDecodedAudioBudget(metadata) {
  const durationSeconds = metadata?.durationSeconds;
  const length = metadata?.length;
  const channelCount = metadata?.channelCount;
  const sampleRate = metadata?.sampleRate;
  if (!finitePositive(durationSeconds) || !finitePositive(sampleRate)
    || !Number.isInteger(length) || length <= 0
    || !Number.isInteger(channelCount) || channelCount <= 0 || channelCount > MAX_CHANNEL_COUNT) {
    throw new RangeError("解码后的音频元数据无效，未提取采样数据。");
  }
  assertPredecodeAudioBudget({ durationSeconds });
  const scalarSamples = length * channelCount;
  if (!Number.isSafeInteger(scalarSamples) || scalarSamples > MAX_DECODED_SCALAR_SAMPLES) {
    throw new RangeError(`解码后采样总量不能超过 ${MAX_DECODED_SCALAR_SAMPLES.toLocaleString("en-US")}。`);
  }
  return { durationSeconds, length, channelCount, sampleRate, scalarSamples };
}

export function nextMonotonicId(entries, prefix) {
  if (typeof prefix !== "string" || !/^[a-z][a-z0-9-]*$/i.test(prefix)) {
    throw new TypeError("ID prefix must be a simple non-empty identifier");
  }
  const ids = new Set((Array.isArray(entries) ? entries : []).map(entry => typeof entry === "string" ? entry : entry?.id).filter(Boolean));
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  let maximum = 0;
  for (const id of ids) {
    const match = String(id).match(pattern);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  let candidate = maximum + 1;
  while (ids.has(`${prefix}-${candidate}`)) candidate += 1;
  return `${prefix}-${candidate}`;
}
