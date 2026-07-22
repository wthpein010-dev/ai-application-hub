const GAMEPLAY_METADATA_ERROR_CODES = new Set([
  "invalid-level-key",
  "invalid-game-level-order",
  "invalid-cd-num",
  "invalid-show-layer-num",
]);

function requireInteger(value, minimum, label) {
  if (!Number.isInteger(value) || value < minimum) {
    const qualifier = minimum === 0 ? "不小于 0" : "大于 0";
    throw new TypeError(`${label}必须是${qualifier}的整数。`);
  }
  return value;
}

function requireAnyInteger(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label}必须是整数。`);
  }
  return value;
}

export function normalizeGameplayPatch(patch = {}) {
  const normalized = {};
  if (Object.hasOwn(patch, "gameLevelOrder")) {
    normalized.gameLevelOrder = requireInteger(patch.gameLevelOrder, 1, "挑战回合");
  }
  if (Object.hasOwn(patch, "cdNum")) {
    normalized.cdNum = requireInteger(patch.cdNum, 0, "限时秒数");
  }
  if (Object.hasOwn(patch, "showLayerNum")) {
    if (typeof patch.showLayerNum !== "boolean") {
      throw new TypeError("显示层数必须选择显示或隐藏。");
    }
    normalized.showLayerNum = patch.showLayerNum;
  }
  return normalized;
}

export function assertGameplayMetadata(gameplay) {
  try {
    requireAnyInteger(gameplay?.levelKey, "Level Key");
    requireInteger(gameplay?.gameLevelOrder, 1, "挑战回合");
    requireInteger(gameplay?.cdNum, 0, "限时秒数");
    if (typeof gameplay?.showLayerNum !== "boolean") {
      throw new TypeError("显示层数必须为布尔值。");
    }
  } catch (error) {
    throw new TypeError(`Unity 游戏运行参数不合法：${error.message}`, { cause: error });
  }
  return gameplay;
}

export function isGameplayMetadataIssue(code) {
  return GAMEPLAY_METADATA_ERROR_CODES.has(code);
}
