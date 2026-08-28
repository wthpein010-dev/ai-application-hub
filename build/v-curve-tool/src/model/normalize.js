const DEFAULT_RULES = Object.freeze({
  gameLevelOrder: 2,
  limitedTypeMax: 8,
  fullTypeMin: 1,
  fullTypeMax: 32,
  pseudoRandomLimitedMode: 0,
  pseudoRandomFullMode: 0,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function requiredFiniteInt(raw, field, sourceFile, tileIndex, minimum = Number.NEGATIVE_INFINITY) {
  const value = raw?.[field];
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < minimum) {
    throw new Error(`${sourceFile}：砖块 ${tileIndex} 的 ${field} 必须是有限整数${minimum === 1 ? "（且不小于 1）" : "。"}`);
  }
  return value;
}

function requiredTileType(raw, sourceFile, tileIndex) {
  const type = requiredFiniteInt(raw, "type", sourceFile, tileIndex);
  if (type < -1) {
    throw new Error(`${sourceFile}：砖块 ${tileIndex} 的 type 只能是 -1、0 或正整数。`);
  }
  return type;
}

function optionalRuleInteger(data, field, fallback, minimum, maximum, warnings) {
  if (!Object.hasOwn(data, field)) return fallback;
  const value = data[field];
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)
    || value < minimum || value > maximum) {
    warnings.push(`designerNote.${field} 必须是 ${minimum}–${maximum} 的有限整数，已使用默认值。`);
    return fallback;
  }
  return value;
}

function stringValue(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function normalizeTile(raw, id, fieldNames, sourceFile, requiredFields) {
  const xName = fieldNames.x;
  const yName = fieldNames.y;
  const layerName = fieldNames.layer;
  return {
    id,
    x: requiredFields.includes("x")
      ? requiredFiniteInt(raw, xName, sourceFile, id)
      : finiteInt(raw?.[xName]),
    y: requiredFields.includes("y")
      ? requiredFiniteInt(raw, yName, sourceFile, id)
      : finiteInt(raw?.[yName]),
    layer: requiredFields.includes("layer")
      ? requiredFiniteInt(raw, layerName, sourceFile, id, 1)
      : Math.max(1, finiteInt(raw?.[layerName], 1)),
    type: requiredFields.includes("type")
      ? requiredTileType(raw, sourceFile, id)
      : finiteInt(raw?.type),
    moldType: requiredFields.includes("moldType")
      ? requiredFiniteInt(raw, "moldType", sourceFile, id)
      : finiteInt(raw?.moldType, 1),
    metaType: requiredFields.includes("metaType")
      ? requiredFiniteInt(raw, "metaType", sourceFile, id)
      : finiteInt(raw?.metaType),
    metaData: requiredFields.includes("metaData")
      ? requiredFiniteInt(raw, "metaData", sourceFile, id)
      : finiteInt(raw?.metaData),
    presetColorType: requiredFields.includes("presetColorType")
      ? requiredFiniteInt(raw, "presetColorType", sourceFile, id)
      : finiteInt(raw?.presetColorType),
  };
}

function collectTileWarnings(tiles) {
  const warnings = [];
  const positions = new Set();
  let hasDuplicate = false;
  let hasSpecial = false;
  let limitedCount = 0;
  let fullCount = 0;

  for (const tile of tiles) {
    const key = `${tile.x}|${tile.y}|${tile.layer}`;
    if (positions.has(key)) hasDuplicate = true;
    positions.add(key);
    if (tile.type >= 1001 || tile.metaType !== 0) hasSpecial = true;
    if (tile.type === 0) limitedCount += 1;
    if (tile.type === -1) fullCount += 1;
  }

  if (hasDuplicate) warnings.push("存在重复的 (x,y,layer) 砖块位置。");
  if (hasSpecial) {
    warnings.push("包含动态砖或非零 metaType：结构可分析，但玩法 MC 可能不完整。");
  }
  if (limitedCount % 2 !== 0) warnings.push(`限定随机组砖数为奇数（${limitedCount}）。`);
  if (fullCount % 2 !== 0) warnings.push(`全随机组砖数为奇数（${fullCount}）。`);
  return warnings;
}

function canonicalPawsId(rawId, sourceFile) {
  if (typeof rawId === "number" && Number.isFinite(rawId)) {
    const match = String(sourceFile).match(/level[_-]\d+/i);
    if (match) return match[0].replace("-", "_").toLowerCase();
  }
  return stringValue(rawId, sourceFile);
}

export function parseDesignerRules(note = "") {
  const warnings = [];
  let data = {};
  if (note && typeof note === "object") {
    data = note;
  } else if (typeof note === "string" && note.trim()) {
    try {
      data = JSON.parse(note);
    } catch {
      warnings.push("designerNote 不是有效 JSON，已使用默认规则。");
    }
  }

  const gameLevelOrder = optionalRuleInteger(
    data, "gameLevelOrder", DEFAULT_RULES.gameLevelOrder, 1, 32, warnings,
  );
  const limitedTypeMax = optionalRuleInteger(
    data, "blockTypeCount", DEFAULT_RULES.limitedTypeMax, 1, 32, warnings,
  );
  let fullTypeMin = optionalRuleInteger(
    data, "fullRandomTypeMin", DEFAULT_RULES.fullTypeMin, 1, 32, warnings,
  );
  let fullTypeMax = optionalRuleInteger(
    data, "fullRandomTypeMax", DEFAULT_RULES.fullTypeMax, 1, 32, warnings,
  );
  if (fullTypeMin > fullTypeMax) {
    [fullTypeMin, fullTypeMax] = [fullTypeMax, fullTypeMin];
    warnings.push("全随机图案范围上下限颠倒，已交换。");
  }

  return {
    rules: {
      gameLevelOrder,
      limitedTypeMax,
      fullTypeMin,
      fullTypeMax,
      pseudoRandomLimitedMode: optionalRuleInteger(
        data, "pseudoRandomLimitedMode", DEFAULT_RULES.pseudoRandomLimitedMode, 0, 2, warnings,
      ),
      pseudoRandomFullMode: optionalRuleInteger(
        data, "pseudoRandomFullMode", DEFAULT_RULES.pseudoRandomFullMode, 0, 2, warnings,
      ),
    },
    warnings,
  };
}

export function normalizePawsLevel(raw, sourceFile = "level.json") {
  if (!raw || !Array.isArray(raw.tiles) || raw.tiles.length === 0) {
    throw new Error(`${sourceFile}：关卡没有可分析砖块。`);
  }

  const parsed = parseDesignerRules(raw.designerNote);
  const tiles = raw.tiles.map((tile, id) => normalizeTile(tile, id, {
    x: "x",
    y: "y",
    layer: "layer",
  }, sourceFile, ["x", "y", "layer", "type", "moldType", "metaType", "metaData", "presetColorType"]));
  const warnings = [...parsed.warnings, ...collectTileWarnings(tiles)];

  return {
    id: canonicalPawsId(raw.id, sourceFile),
    name: stringValue(raw.name, sourceFile.replace(/\.json$/i, "")),
    source: "paws",
    sourceFile,
    tiles,
    rules: parsed.rules,
    warnings,
  };
}

export function normalizeSheepLevel(raw, sourceFile = "900121.json") {
  if (!raw || !raw.levelData || typeof raw.levelData !== "object") {
    throw new Error(`${sourceFile}：羊关卡缺少 levelData。`);
  }

  const layers = Object.entries(raw.levelData)
    .sort(([left], [right]) => Number(left) - Number(right));
  const sourceTiles = layers.flatMap(([, layerTiles]) => (
    Array.isArray(layerTiles) ? layerTiles : []
  ));
  if (sourceTiles.length === 0) {
    throw new Error(`${sourceFile}：关卡没有可分析砖块。`);
  }

  const tiles = sourceTiles.map((tile, id) => normalizeTile(tile, id, {
    x: "rolNum",
    y: "rowNum",
    layer: "layerNum",
  }, sourceFile, ["x", "y", "layer", "type"]));
  const typeKeys = Object.keys(raw.blockTypeData ?? {})
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0);
  const typeMax = typeKeys.length ? Math.max(...typeKeys) : 15;

  return {
    id: stringValue(raw.levelKey, "900121"),
    name: `羊 ${stringValue(raw.levelKey, "900121")}`,
    source: "sheep",
    sourceFile,
    tiles,
    rules: {
      gameLevelOrder: 2,
      limitedTypeMax: clamp(typeMax, 1, 32),
      fullTypeMin: 1,
      fullTypeMax: clamp(typeMax, 1, 32),
      pseudoRandomLimitedMode: 0,
      pseudoRandomFullMode: 0,
    },
    warnings: collectTileWarnings(tiles),
  };
}
