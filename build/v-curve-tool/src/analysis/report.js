import { diagnoseReport } from "./diagnostics.js";
import { computeExpectedV } from "./expected-v.js";
import { empiricalRiver } from "./river.js";
import { monteCarloBand } from "./simulate.js";
import { analyzeReferenceModel } from "./reference-model.js";
import { MODEL_DEFINITIONS, configurationFingerprint } from "./model-definition.js";
import { sampleMonteCarlo } from "./sampling.js";
import {
  buildStructure,
  countAvailable,
  createBoardState,
} from "./structure.js";

export const MODEL_NOTES = Object.freeze([
  "工程模型：任意正面积上层重叠会覆盖，同层侧锁已关闭；背面砖仍计入 V。无道具机器人为简化模型。",
  "河道上界(max)与河道下界(min)使用 T=1、无暂存槽和有限确定性重启，是搜索包络，不是数学绝对边界。",
  "E[V]近似来自覆盖 DAG，忽略侧锁与合法移除顺序，不能称为真实上界或真人平均。",
  "MC P90/P50/P10 来自指定种子、槽位和策略；后段仅保留至少 5% 种子仍有样本的进度点。",
]);

const REFERENCE_NOTES = Object.freeze([
  "参考模型：上层覆盖面积 ≥25%，不启用同层侧锁；每对独立抽取图案，沿用原图贪心评分。",
  "横轴为离场进度（含暂存）；1 槽的奇偶进度对应不同样本条件，密集锯齿不等同玩家压力反复波动。",
  "河道是 T=1 无槽、有限重启搜索包络；下界已修正原图首轮长度截断，尾段可能与截图不同。",
  "E[V]近似忽略合法移除顺序；MC 仅保留至少 5% 种子有样本的点，不能解释为真人通过率。",
]);

function interpolate(points, progress, fields) {
  if (!Array.isArray(points) || points.length === 0) return null;
  const sorted = [...points].sort((left, right) => left.progress - right.progress);
  if (progress < sorted[0].progress || progress > sorted.at(-1).progress) return null;
  let left = sorted[0];
  let right = sorted.at(-1);
  if (progress <= left.progress) right = left;
  else if (progress >= right.progress) left = right;
  else {
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].progress >= progress) {
        left = sorted[index - 1];
        right = sorted[index];
        break;
      }
    }
  }
  const span = right.progress - left.progress;
  const weight = span === 0 ? 0 : (progress - left.progress) / span;
  const result = {};
  for (const field of fields) {
    const leftValue = left[field];
    const rightValue = right[field];
    result[field] = Number.isFinite(leftValue) && Number.isFinite(rightValue)
      ? leftValue + (rightValue - leftValue) * weight
      : null;
  }
  return result;
}

function typePoolLabel(level, model) {
  if (level.source === "sheep") {
    return `${level.rules.fullTypeMin}–${level.rules.fullTypeMax}`;
  }
  const ranges = (type) => [...new Set(level.tiles.filter((tile) => tile.type === type).map((tile) => {
    const custom = model !== "reference" && tile.metaType > 0 && tile.metaData > 0;
    let [minimum, maximum] = custom ? [tile.metaType, tile.metaData]
      : type === 0 ? [1, level.rules.limitedTypeMax] : [level.rules.fullTypeMin, level.rules.fullTypeMax];
    [minimum, maximum] = [minimum, maximum].map((value) => Math.min(32, Math.max(1, value))).sort((a, b) => a - b);
    return minimum === maximum ? String(minimum) : `${minimum}–${maximum}`;
  }))];
  const limited = ranges(0);
  const full = ranges(-1);
  const fixed = [...new Set(level.tiles.map((tile) => tile.type).filter((type) => type > 0))]
    .sort((left, right) => left - right);
  const labels = [];
  if (limited.length) labels.push(`限定 ${limited.join("、")}`);
  if (full.length) labels.push(`${limited.length || fixed.length ? "全随机 " : ""}${full.join("、")}`);
  if (fixed.length) {
    const fixedLabel = fixed.length > 1 && fixed.at(-1) - fixed[0] + 1 === fixed.length
      ? `${fixed[0]}–${fixed.at(-1)}` : fixed.join("、");
    labels.push(`${labels.length ? "固定 " : ""}${fixedLabel}`);
  }
  return labels.join(" + ") || "未配置";
}

function levelSummary(level, model) {
  return {
    id: level.id,
    name: level.name,
    source: level.source,
    sourceFile: level.sourceFile,
    configurationFingerprint: configurationFingerprint(level),
    tiles: level.tiles.length,
    layers: new Set(level.tiles.map((tile) => tile.layer)).size,
    typePoolLabel: typePoolLabel(level, model),
    rules: { ...level.rules },
  };
}

function normalizeOptions(options = {}) {
  const seeds = Math.min(2000, Math.max(1, Math.trunc(Number(options.seeds ?? 300)) || 300));
  const traySlots = Math.min(2, Math.max(0, Math.trunc(Number(options.traySlots ?? 1)) || 0));
  const riverRestarts = Math.min(100, Math.max(1,
    Math.trunc(Number(options.riverRestarts ?? 20)) || 20));
  return {
    model: options.model === 'reference' ? 'reference' : 'runtime',
    seeds,
    traySlots,
    policy: options.policy === "random" ? "random" : "greedy",
    riverRestarts,
  };
}

function emit(onProgress, stage, progress) {
  if (typeof onProgress === "function") onProgress({ stage, progress });
}

export function summarizeReport(report) {
  const sample = (progress) => sampleMonteCarlo(report?.curves?.mc, progress, report?.model?.id);
  const mc25 = sample(0.25);
  const mc50 = sample(0.5);
  const upper = interpolate(report?.curves?.riverUpper, 0.5, ["y"]);
  const lower = interpolate(report?.curves?.riverLower, 0.5, ["y"]);
  const opening = interpolate(report?.curves?.mc, 0, ["p50"]);
  return {
    tiles: report?.level?.tiles ?? 0,
    layers: report?.level?.layers ?? 0,
    typePoolLabel: report?.level?.typePoolLabel ?? "—",
    openingV: report?.openingV ?? opening?.p50 ?? null,
    mc25,
    mc50,
    midRiver: upper && lower ? { lower: lower.y, upper: upper.y } : null,
    lowerDeadlocks: report?.river?.lowerDeadlocks ?? 0,
    lowerDeadlockAverageProgress: report?.river?.lowerDeadlockAverageProgress ?? null,
    completionRate: report?.simulation?.valid ? report.simulation.completionRate : null,
    averageDeadlockProgress: report?.simulation?.valid
      ? report.simulation.averageDeadlockProgress
      : null,
  };
}

export function analyzeLevel(level, options = {}, onProgress) {
  const normalizedOptions = normalizeOptions(options);
  const reference = normalizedOptions.model === "reference";
  const referenceResult = reference ? analyzeReferenceModel(level, normalizedOptions) : null;
  const structure = reference ? null : buildStructure(level.tiles);
  const openingV = referenceResult?.openingV ?? countAvailable(structure, createBoardState(structure));
  emit(onProgress, "structure", 1 / 6);

  const expected = referenceResult?.expected ?? computeExpectedV(structure).map((point) => ({
    progress: point.x,
    removed: point.removed,
    y: point.y,
  }));
  emit(onProgress, "expected-v", 2 / 6);

  const river = referenceResult?.river ?? empiricalRiver(structure, normalizedOptions.riverRestarts);
  emit(onProgress, "river", 3 / 6);

  const rawSimulation = referenceResult?.simulation ?? monteCarloBand(level, structure, normalizedOptions);
  const limitations = level.modelLimitations ?? [];
  const hasUnsupportedMechanics = limitations.length > 0;
  const simulation = hasUnsupportedMechanics
    ? {
      ...rawSimulation,
      incomplete: true,
      incompleteReason: [rawSimulation.incompleteReason, ...limitations].filter(Boolean).join("；"),
    }
    : rawSimulation;
  emit(onProgress, "monte-carlo", 4 / 6);

  const warnings = [...(level.warnings ?? [])];
  if (!simulation.valid && simulation.reason) warnings.push(`MC 无效：${simulation.reason}`);
  const report = {
    schemaVersion: "vcurve-report/1",
    level: levelSummary(level, normalizedOptions.model),
    options: normalizedOptions,
    model: {...MODEL_DEFINITIONS[normalizedOptions.model]},
    openingV,
    curves: {
      riverUpper: river.upper,
      riverLower: river.lower,
      expected,
      mc: simulation.points,
    },
    river,
    simulation,
    warnings,
    metrics: null,
    diagnostics: [],
    modelNotes: [...(reference ? REFERENCE_NOTES : MODEL_NOTES)],
  };
  report.metrics = summarizeReport(report);
  emit(onProgress, "metrics", 5 / 6);
  report.diagnostics = diagnoseReport(report);
  emit(onProgress, "diagnostics", 1);
  return report;
}

export function compareReports(left, right) {
  if (left.model?.id !== right.model?.id || left.model?.version !== right.model?.version) {
    throw new Error('左右报告模型版本不同，请使用同一模型重新分析。');
  }
  return {
    schemaVersion: "vcurve-comparison/2",
    options: { ...right.options },
    model: {...right.model},
    left,
    right,
    modelNotes: [...right.modelNotes],
    warnings: [
      ...left.warnings.map((warning) => `左侧 ${left.level.id}：${warning}`),
      ...right.warnings.map((warning) => `右侧 ${right.level.id}：${warning}`),
    ],
  };
}

export function analyzeComparisonLevels(leftLevel, rightLevel, options = {}, onProgress) {
  const left = analyzeLevel(leftLevel, options, (payload) => {
    if (typeof onProgress === "function") onProgress({ side: "left", payload });
  });
  const right = analyzeLevel(rightLevel, options, (payload) => {
    if (typeof onProgress === "function") onProgress({ side: "right", payload });
  });
  return compareReports(left, right);
}
