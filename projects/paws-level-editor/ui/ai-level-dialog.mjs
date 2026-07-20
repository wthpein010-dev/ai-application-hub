const DIFFICULTIES = Object.freeze({
  easy: { tiles: "36–48", layers: "3–4" },
  normal: { tiles: "60–72", layers: "5–6" },
  hard: { tiles: "84–96", layers: "7–8" },
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
  return { difficulty, layout, reference };
}

export function describeGenerationOptions(options) {
  const {
    difficulty = "normal",
    layout = "balanced",
    reference = "all",
  } = options ?? {};
  const profile = DIFFICULTIES[difficulty];
  if (
    !profile
    || !Object.hasOwn(LAYOUT_LABELS, layout)
    || !Object.hasOwn(REFERENCE_LABELS, reference)
  ) {
    throw new Error("AI 生成选项无效。");
  }
  return (
    `约 ${profile.tiles} 张、${profile.layers} 层；`
    + `${REFERENCE_LABELS[reference]}，${LAYOUT_LABELS[layout]}，`
    + "限制重叠并自动验证可解。"
  );
}
