import { diagnoseReport } from "./diagnostics.js";
import { computeExpectedV } from "./expected-v.js";
import { empiricalRiver } from "./river.js";
import { monteCarloBand } from "./simulate.js";
import {
  buildStructure,
  countAvailable,
  createBoardState,
} from "./structure.js";

export const MODEL_NOTES = Object.freeze([
  "实际 V 对齐当前 Paws 运行时：任意正面积上层重叠会覆盖，同层 x±8 两侧同时存在会侧锁；背面砖仍计入 V。",
  "河道上界(max)与河道下界(min)使用 T=1、无暂存槽和有限确定性重启，是搜索包络，不是数学绝对边界。",
  "E[V]近似来自覆盖 DAG，忽略侧锁与合法移除顺序，不能称为真实上界或真人平均。",
  "MC P90/P50/P10 来自指定种子、槽位和策略；后段仅保留至少 5% 种子仍有样本的进度点。",
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

function typePoolLabel(level) {
  if (level.source === "sheep") {
    return `${level.rules.fullTypeMin}–${level.rules.fullTypeMax}`;
  }
  const limited = level.tiles.filter((tile) => tile.type === 0).length;
  const full = level.tiles.filter((tile) => tile.type === -1).length;
  const fixed = [...new Set(level.tiles.map((tile) => tile.type).filter((type) => type > 0))]
    .sort((left, right) => left - right);
  const labels = [];
  if (limited > 0) labels.push(`限定 1–${level.rules.limitedTypeMax}`);
  if (full > 0) labels.push(`${level.rules.fullTypeMin}–${level.rules.fullTypeMax}`);
  if (labels.length > 0) return labels.join(" + ");
  if (fixed.length === 0) return "未配置";
  if (fixed.at(-1) - fixed[0] + 1 === fixed.length) return `${fixed[0]}–${fixed.at(-1)}`;
  return fixed.join("、");
}

function levelSummary(level) {
  return {
    id: level.id,
    name: level.name,
    source: level.source,
    sourceFile: level.sourceFile,
    tiles: level.tiles.length,
    layers: new Set(level.tiles.map((tile) => tile.layer)).size,
    typePoolLabel: typePoolLabel(level),
    rules: { ...level.rules },
  };
}

function normalizeOptions(options = {}) {
  const seeds = Math.min(2000, Math.max(1, Math.trunc(Number(options.seeds ?? 300)) || 300));
  const traySlots = Math.min(2, Math.max(0, Math.trunc(Number(options.traySlots ?? 1)) || 0));
  const riverRestarts = Math.min(100, Math.max(1,
    Math.trunc(Number(options.riverRestarts ?? 20)) || 20));
  return {
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
  const mc25 = interpolate(report?.curves?.mc, 0.25, ["p10", "p50", "p90"]);
  const mc50 = interpolate(report?.curves?.mc, 0.5, ["p10", "p50", "p90"]);
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
  const structure = buildStructure(level.tiles);
  const openingV = countAvailable(structure, createBoardState(structure));
  emit(onProgress, "structure", 1 / 6);

  const expected = computeExpectedV(structure).map((point) => ({
    progress: point.x,
    removed: point.removed,
    y: point.y,
  }));
  emit(onProgress, "expected-v", 2 / 6);

  const river = empiricalRiver(structure, normalizedOptions.riverRestarts);
  emit(onProgress, "river", 3 / 6);

  const rawSimulation = monteCarloBand(level, structure, normalizedOptions);
  const hasUnsupportedMechanics = (level.warnings ?? []).some((warning) => (
    warning.includes("动态砖") || warning.includes("非零 metaType")
  ));
  const simulation = hasUnsupportedMechanics
    ? {
      ...rawSimulation,
      incomplete: true,
      incompleteReason: "包含动态砖或非零 metaType，玩法仿真不完整。",
    }
    : rawSimulation;
  emit(onProgress, "monte-carlo", 4 / 6);

  const warnings = [...(level.warnings ?? [])];
  if (!simulation.valid && simulation.reason) warnings.push(`MC 无效：${simulation.reason}`);
  const report = {
    schemaVersion: "vcurve-report/1",
    level: levelSummary(level),
    options: normalizedOptions,
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
    modelNotes: [...MODEL_NOTES],
  };
  report.metrics = summarizeReport(report);
  emit(onProgress, "metrics", 5 / 6);
  report.diagnostics = diagnoseReport(report);
  emit(onProgress, "diagnostics", 1);
  return report;
}

export function compareReports(sheep, paws) {
  return {
    schemaVersion: "vcurve-comparison/1",
    options: { ...paws.options },
    sheep,
    paws,
    modelNotes: [...MODEL_NOTES],
    warnings: [
      ...sheep.warnings.map((warning) => `羊 900121：${warning}`),
      ...paws.warnings.map((warning) => `${paws.level.id}：${warning}`),
    ],
  };
}
