const DEFAULT_RULES = Object.freeze({
  gameLevelOrder: 2,
  limitedTypeMax: 8,
  fullTypeMin: 1,
  fullTypeMax: 32,
  pseudoRandomLimitedMode: 0,
  pseudoRandomFullMode: 0,
  funClearPercent: 0,
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
    pseudoRandomMode: clamp(finiteInt(raw?.pseudoRandomMode), 0, 2),
  };
}

function collectTileWarnings(tiles) {
  const warnings = [];
  const positions = new Set();
  let hasDuplicate = false;
  let limitedCount = 0;
  let fullCount = 0;

  for (const tile of tiles) {
    const key = `${tile.x}|${tile.y}|${tile.layer}`;
    if (positions.has(key)) hasDuplicate = true;
    positions.add(key);
    if (tile.type === 0) limitedCount += 1;
    if (tile.type === -1) fullCount += 1;
  }

  if (hasDuplicate) warnings.push("存在重复的 (x,y,layer) 砖块位置。");
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
  const sourcePseudoRandomLimitedMode = optionalRuleInteger(
    data, "pseudoRandomLimitedMode", 0, 0, 2, warnings,
  );
  const sourcePseudoRandomFullMode = optionalRuleInteger(
    data, "pseudoRandomFullMode", 0, 0, 2, warnings,
  );
  if (sourcePseudoRandomLimitedMode || sourcePseudoRandomFullMode) {
    warnings.push("旧伪随机模式字段已被当前客户端废弃，工程模型按关闭处理。");
  }

  return {
    data,
    rules: {
      gameLevelOrder,
      limitedTypeMax,
      fullTypeMin,
      fullTypeMax,
      pseudoRandomLimitedMode: 0,
      pseudoRandomFullMode: 0,
      funClearPercent: optionalRuleInteger(data, "funClearPercent", 0, 0, 100, warnings),
    },
    warnings,
  };
}

export function normalizePawsLevel(raw, sourceFile = "level.json") {
  if (!raw) {
    throw new Error(`${sourceFile}：关卡没有可分析砖块。`);
  }

  const parsed = parseDesignerRules(raw.designerNote);
  const designerTiles = Object.values(parsed.data?.levelData ?? {})
    .flatMap((layerTiles) => Array.isArray(layerTiles) ? layerTiles : []);
  const useDesignerTiles = designerTiles.length > 0;
  const sourceTiles = useDesignerTiles ? designerTiles : raw.tiles;
  if (!Array.isArray(sourceTiles) || sourceTiles.length === 0) {
    throw new Error(`${sourceFile}：关卡没有可分析砖块。`);
  }
  const tiles = sourceTiles.map((tile, id) => normalizeTile(tile, id, useDesignerTiles ? {
    x: "rolNum", y: "rowNum", layer: "layerNum",
  } : {
    x: "x",
    y: "y",
    layer: "layer",
  }, sourceFile, useDesignerTiles ? ["x", "y", "layer", "type"]
    : ["x", "y", "layer", "type", "moldType", "metaType", "metaData", "presetColorType"]));
  const warnings = [...parsed.warnings, ...collectTileWarnings(tiles)];
  const modelLimitations = [];
  if (tiles.some((tile) => tile.type >= 1001)) {
    modelLimitations.push("包含动态砖，动态变化效果未模拟，玩法 MC 不完整。");
  }
  if (tiles.some((tile) => tile.type > 0 && (tile.metaType !== 0 || tile.metaData !== 0))) {
    modelLimitations.push("固定图案附带非零元数据，其特殊效果未模拟，玩法 MC 不完整。");
  }
  if (parsed.rules.gameLevelOrder === 1 && tiles.some((tile) => tile.type <= 0)) {
    modelLimitations.push("首关专用图案池与保障出盘未模拟，采用普通随机配牌，玩法 MC 不完整。");
  }
  if (tiles.some((tile) => tile.presetColorType === 2) || finiteInt(raw.features?.flipEvery) > 0) {
    modelLimitations.push("背面砖计入可操作 V，但 MC 预知图案并省略翻面决策，玩法 MC 不完整。");
  }
  if (raw.features?.monoColor) {
    modelLimitations.push("启用 monoColor 配置，其运行时效果未模拟，玩法 MC 不完整。");
  }
  warnings.push(...modelLimitations);

  return {
    id: canonicalPawsId(raw.id, sourceFile),
    name: stringValue(raw.name, sourceFile.replace(/\.json$/i, "")),
    source: "paws",
    sourceFile,
    tileSource: useDesignerTiles ? "designerNote.levelData" : "tiles",
    tiles,
    referenceTiles: tiles.map((tile) => ({ ...tile })),
    rules: parsed.rules,
    features: { flipEvery: Math.max(0, finiteInt(raw.features?.flipEvery)), monoColor: Boolean(raw.features?.monoColor) },
    modelLimitations,
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
  // The audited reference export enumerated layer keys lexicographically
  // (1, 10, 11, ..., 2), unlike JS integer-key enumeration. Keep each layer's
  // tile array intact; this is reference-export order, not JSON textual order.
  const referenceTiles = Object.keys(raw.levelData).sort()
    .flatMap((key) => Array.isArray(raw.levelData[key]) ? raw.levelData[key] : [])
    .map((tile, id) => normalizeTile(tile, id, {
      x: "rolNum", y: "rowNum", layer: "layerNum",
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
    referenceTiles,
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

export function normalizeSheepLibrary(raw, sourceFile = "game_map.json") {
  if (!Array.isArray(raw)) {
    throw new Error(`${sourceFile}：羊关卡库必须是数组。`);
  }

  const parsed = [];
  const errors = [];
  raw.forEach((entry, index) => {
    const entrySource = `${sourceFile}[${index}]`;
    let map;
    try {
      if (typeof entry?.map_data !== "string") throw new Error("invalid map_data");
      map = JSON.parse(entry.map_data);
    } catch {
      errors.push(`${entrySource}：map_data 不是有效 JSON。`);
      return;
    }
    try {
      parsed.push(normalizeSheepLevel(map, entrySource));
    } catch (error) {
      errors.push(error.message);
    }
  });

  const counts = new Map();
  parsed.forEach((level) => counts.set(level.id, (counts.get(level.id) ?? 0) + 1));
  const occurrences = new Map();
  const levels = parsed.map((level) => {
    const variantCount = counts.get(level.id);
    if (variantCount === 1) return level;
    const levelKey = level.id;
    const variantIndex = (occurrences.get(levelKey) ?? 0) + 1;
    occurrences.set(levelKey, variantIndex);
    return {
      ...level,
      id: `${levelKey}-v${variantIndex}`,
      name: `羊 ${levelKey}（版本${variantIndex}/${variantCount}）`,
      sheepLevelKey: levelKey,
      sheepVariantIndex: variantIndex,
      sheepVariantCount: variantCount,
    };
  });
  const duplicateLevelKeys = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([levelKey]) => levelKey)
    .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));

  return { levels, errors, duplicateLevelKeys };
}
