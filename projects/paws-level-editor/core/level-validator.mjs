const isSupportedType = (type) =>
  type === 0 ||
  type === -1 ||
  (type >= 1 && type <= 32) ||
  (type >= 1001 && type <= 1006);

function issue(severity, code, message, tileUids = []) {
  return { severity, code, message, tileUids };
}

function overlapsWithPositiveArea(left, right) {
  return (
    Math.abs(Number(left.x) - Number(right.x)) < 8
    && Math.abs(Number(left.y) - Number(right.y)) < 8
  );
}

export function validateLevel(document, {
  rejectSameLayerOverlap = Boolean(document?.designerNote?.aiGeneration),
} = {}) {
  const tiles = Array.isArray(document?.tiles) ? document.tiles : [];
  if (tiles.length === 0) {
    return [issue("error", "empty-level", "关卡不能为空。")];
  }

  const issues = [];
  if (tiles.length % 2 !== 0) {
    issues.push(issue("error", "odd-total", "砖块总数必须为偶数。", tiles.map((tile) => tile.uid)));
  }

  const boardWidth = Number(document?.board?.width) * 8;
  const boardHeight = Number(document?.board?.height) * 8;
  const anchors = new Map();
  const layerGroups = new Map();
  const typeGroups = new Map();

  for (const tile of tiles) {
    const type = Number(tile.type);
    (typeGroups.get(type) ?? typeGroups.set(type, []).get(type)).push(tile.uid);

    if (!Number.isInteger(tile.layer) || tile.layer < 1) {
      issues.push(issue("error", "invalid-layer", "砖块层级必须是大于 0 的整数。", [tile.uid]));
    }
    if (
      Number.isFinite(boardWidth) &&
      Number.isFinite(boardHeight) &&
      (tile.x < 0 || tile.y < 0 || tile.x + 8 > boardWidth || tile.y + 8 > boardHeight)
    ) {
      issues.push(issue("error", "out-of-board", "砖块超出棋盘范围。", [tile.uid]));
    }
    if (!isSupportedType(type)) {
      issues.push(issue("error", "invalid-type", `不支持的砖块类型：${tile.type}`, [tile.uid]));
    }

    const anchor = `${tile.layer}|${tile.x}|${tile.y}`;
    (anchors.get(anchor) ?? anchors.set(anchor, []).get(anchor)).push(tile.uid);
    (layerGroups.get(tile.layer) ?? layerGroups.set(tile.layer, []).get(tile.layer))
      .push(tile);
  }

  for (const tileUids of anchors.values()) {
    if (tileUids.length > 1) {
      issues.push(issue("error", "duplicate-anchor", "同层存在完全重叠的砖块锚点。", tileUids));
    }
  }

  if (rejectSameLayerOverlap) {
    const overlappingUids = new Set();
    let overlappingPairCount = 0;
    for (const layerTiles of layerGroups.values()) {
      for (let leftIndex = 0; leftIndex < layerTiles.length; leftIndex += 1) {
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < layerTiles.length;
          rightIndex += 1
        ) {
          const left = layerTiles[leftIndex];
          const right = layerTiles[rightIndex];
          if (!overlapsWithPositiveArea(left, right)) continue;
          overlappingPairCount += 1;
          overlappingUids.add(left.uid);
          overlappingUids.add(right.uid);
        }
      }
    }
    if (overlappingPairCount > 0) {
      issues.push(issue(
        "error",
        "same-layer-overlap",
        `AI 关卡同层存在 ${overlappingPairCount} 组面积重叠的砖块。`,
        [...overlappingUids],
      ));
    }
  }

  for (const [type, tileUids] of typeGroups) {
    if (tileUids.length % 2 === 0) {
      continue;
    }
    if (type === 0) {
      issues.push(issue("error", "odd-random-zero", "type=0 随机牌数量必须为偶数。", tileUids));
    } else if (type === -1) {
      issues.push(issue("error", "odd-random-full", "type=-1 随机牌数量必须为偶数。", tileUids));
    } else if (isSupportedType(type)) {
      issues.push(
        issue("error", "odd-fixed-type", `固定类型 ${type} 的砖块数量必须为偶数。`, tileUids),
      );
    }
  }

  return issues;
}
