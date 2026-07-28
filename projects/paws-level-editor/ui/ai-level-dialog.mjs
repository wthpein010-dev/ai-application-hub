import {
  DIFFICULTY_PROFILES,
  normalizeGenerationTargets,
} from "../core/ai-level-generator.mjs";

const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    defaults: Object.freeze({ tileCount: 180, layerCount: 12, targetScore: 40 }),
    suggestedTiles: "160–200",
    suggestedLayers: "10–14",
  }),
  normal: Object.freeze({
    defaults: Object.freeze({ tileCount: 200, layerCount: 15, targetScore: 60 }),
    suggestedTiles: "190–230",
    suggestedLayers: "14–20",
  }),
  hard: Object.freeze({
    defaults: Object.freeze({ tileCount: 240, layerCount: 32, targetScore: 80 }),
    suggestedTiles: "220–280",
    suggestedLayers: "28–36",
  }),
});

const LAYOUT_LABELS = Object.freeze({
  balanced: "均衡布局",
  progressive: "层层推进",
  open: "开阔分布",
});

const REFERENCE_LABELS = Object.freeze({
  current: "从当前关卡学习",
  all: "从全部关卡学习",
});

function ratingLabel(score) {
  if (score <= 39) return "教学 / 轻松";
  if (score <= 59) return "标准";
  if (score <= 69) return "困难入门";
  if (score <= 79) return "困难";
  if (score <= 89) return "极难挑战";
  return "专家挑战";
}

function integerField(formData, name, { minimum, maximum, label }) {
  const raw = String(formData?.get(name) ?? "").trim();
  const value = Number(raw);
  if (!raw || !Number.isInteger(value)) {
    throw new Error(`${label}必须是整数。`);
  }
  if (value < minimum || value > maximum) {
    throw new Error(`${label}必须在 ${minimum}–${maximum} 之间。`);
  }
  return value;
}

export function getDifficultyDefaults(difficulty) {
  const profile = DIFFICULTIES[difficulty];
  if (!profile) throw new Error("AI 生成选项无效。");
  return { ...profile.defaults };
}

export function normalizeGenerationOptions(formData) {
  const difficulty = String(formData?.get("ai-difficulty") ?? "normal");
  const layout = String(formData?.get("ai-layout") ?? "balanced");
  const reference = String(formData?.get("ai-reference") ?? "all");
  if (
    !Object.hasOwn(DIFFICULTIES, difficulty)
    || !Object.hasOwn(LAYOUT_LABELS, layout)
    || !Object.hasOwn(REFERENCE_LABELS, reference)
  ) {
    throw new Error("AI 生成选项无效。");
  }
  const requestedTileCount = integerField(formData, "ai-tile-count", {
    minimum: 20,
    maximum: 400,
    label: "砖块数量",
  });
  const layerCount = integerField(formData, "ai-layer-count", {
    minimum: 5,
    maximum: 40,
    label: "有效层数",
  });
  const targetScore = integerField(formData, "ai-target-score", {
    minimum: 0,
    maximum: 100,
    label: "目标难度",
  });
  const target = normalizeGenerationTargets({
    profile: DIFFICULTY_PROFILES[difficulty],
    tileCount: requestedTileCount,
    layerCount,
    targetScore,
  });
  return {
    difficulty,
    layout,
    reference,
    tileCount: target.tileCount,
    layerCount: target.layerCount,
    targetScore: target.score,
    tileCountAdjusted: target.tileCountAdjusted,
  };
}

export function describeGenerationOptions(options) {
  const {
    difficulty = "normal",
    layout = "balanced",
    reference = "all",
    tileCount,
    layerCount,
    targetScore,
    tileCountAdjusted = false,
  } = options ?? {};
  const profile = DIFFICULTIES[difficulty];
  if (
    !profile
    || !Object.hasOwn(LAYOUT_LABELS, layout)
    || !Object.hasOwn(REFERENCE_LABELS, reference)
    || !Number.isInteger(tileCount)
    || !Number.isInteger(layerCount)
    || !Number.isInteger(targetScore)
  ) {
    throw new Error("AI 生成选项无效。");
  }
  const adjustment = tileCountAdjusted
    ? "输入砖块数已自动补为偶数。"
    : "";
  return (
    `精确 ${tileCount} 张、${layerCount} 个有效层，`
    + `目标 ${targetScore} 分（${ratingLabel(targetScore)}）；`
    + adjustment
    + `${REFERENCE_LABELS[reference]}，${LAYOUT_LABELS[layout]}。`
    + `建议 ${profile.suggestedTiles} 张、${profile.suggestedLayers} 层。`
  );
}
