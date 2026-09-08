const VALID_SIDES = new Set(["left", "right"]);

function assertSide(side) {
  if (!VALID_SIDES.has(side)) throw new Error("side 必须是 left 或 right。");
}

export function createComparisonSelection(defaultLeftLevels) {
  const levels = Array.isArray(defaultLeftLevels) ? [...defaultLeftLevels] : [defaultLeftLevels];
  if (levels.length === 0 || levels.some((level) => !level?.id)) {
    throw new Error("左侧默认关卡库无效。");
  }
  return {
    defaultLeftLevels: levels,
    left: { levels, selectedLevel: levels[0] },
    right: { levels: [], selectedLevel: null },
  };
}

export function applyImportedLevelsToSide(selection, side, result) {
  assertSide(side);
  const importedLevels = Array.isArray(result?.levels) ? result.levels : [];
  const levels = side === "left"
    ? [
      ...selection.defaultLeftLevels,
      ...importedLevels.filter((level) => !selection.defaultLeftLevels.includes(level)),
    ]
    : importedLevels;
  const selectedLevel = result?.selectedLevel ?? levels[0] ?? null;
  return {
    ...selection,
    [side]: { levels, selectedLevel },
  };
}

export function selectLevelOnSide(selection, side, index) {
  assertSide(side);
  const selectedLevel = selection[side]?.levels?.[index];
  if (!selectedLevel) throw new Error(`${side} 侧没有该有效关卡。`);
  return {
    ...selection,
    [side]: { ...selection[side], selectedLevel },
  };
}
