import {
  BOARD_LIMITS,
  TILE_SIZE,
  overlapsWithPositiveArea,
  parseGridUnit,
} from "./editor-geometry.mjs";
import { solveLevel } from "./level-solver.mjs";

const isSupportedType = (type) =>
  type === 0 ||
  type === -1 ||
  (type >= 1 && type <= 32) ||
  (type >= 1001 && type <= 1006);

function issue(severity, code, message, tileUids = []) {
  return { severity, code, message, tileUids };
}

export function validateLevel(document, {
  rejectSameLayerOverlap = Boolean(document?.designerNote?.aiGeneration),
  rejectOddLayerTypeCounts = Boolean(document?.designerNote?.aiGeneration),
} = {}) {
  const tiles = Array.isArray(document?.tiles) ? document.tiles : [];
  if (tiles.length === 0) {
    return [issue("error", "empty-level", "关卡不能为空。")];
  }

  const issues = [];
  if (tiles.length % 2 !== 0) {
    issues.push(issue("error", "odd-total", "砖块总数必须为偶数。", tiles.map((tile) => tile.uid)));
  }

  const boardFieldsWidth = Number(document?.board?.width);
  const boardFieldsHeight = Number(document?.board?.height);
  const validBoardSize = (
    Number.isInteger(boardFieldsWidth)
    && boardFieldsWidth >= BOARD_LIMITS.minWidth
    && boardFieldsWidth <= BOARD_LIMITS.maxWidth
    && Number.isInteger(boardFieldsHeight)
    && boardFieldsHeight >= BOARD_LIMITS.minHeight
    && boardFieldsHeight <= BOARD_LIMITS.maxHeight
  );
  if (!validBoardSize) {
    issues.push(issue(
      "error",
      "invalid-board-size",
      `棋盘宽度需为 ${BOARD_LIMITS.minWidth}–${BOARD_LIMITS.maxWidth}，高度需为 ${BOARD_LIMITS.minHeight}–${BOARD_LIMITS.maxHeight}。`,
    ));
  }

  const parsedGridUnit = parseGridUnit(document?.gridUnit);
  if (
    !parsedGridUnit
    || parsedGridUnit.width !== boardFieldsWidth
    || parsedGridUnit.height !== boardFieldsHeight
  ) {
    issues.push(issue("warning", "grid-unit-mismatch", "Grid Unit 与当前棋盘尺寸不一致。"));
  }

  const blockTypeCount = Number(document?.random?.blockTypeCount);
  const fullTypeMin = Number(document?.random?.fullTypeMin);
  const fullTypeMax = Number(document?.random?.fullTypeMax);
  if (
    !Number.isInteger(blockTypeCount)
    || blockTypeCount < 1
    || blockTypeCount > 32
    || !Number.isInteger(fullTypeMin)
    || fullTypeMin < 1
    || fullTypeMin > 32
    || !Number.isInteger(fullTypeMax)
    || fullTypeMax < 1
    || fullTypeMax > 32
    || fullTypeMin > fullTypeMax
  ) {
    issues.push(issue("error", "invalid-random-range", "随机图案范围必须是 1–32，且最小值不能大于最大值。"));
  }

  const boardWidth = boardFieldsWidth * TILE_SIZE;
  const boardHeight = boardFieldsHeight * TILE_SIZE;
  const anchors = new Map();
  const layerGroups = new Map();
  const typeGroups = new Map();
  const uidGroups = new Map();

  for (const tile of tiles) {
    const type = Number(tile.type);
    (typeGroups.get(type) ?? typeGroups.set(type, []).get(type)).push(tile.uid);
    (uidGroups.get(tile.uid) ?? uidGroups.set(tile.uid, []).get(tile.uid)).push(tile.uid);

    if (!Number.isInteger(tile.layer) || tile.layer < 1) {
      issues.push(issue("error", "invalid-layer", "砖块层级必须是大于 0 的整数。", [tile.uid]));
    }
    if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
      issues.push(issue("error", "invalid-coordinate", "砖块 X/Y 坐标必须是整数。", [tile.uid]));
    }
    if (
      validBoardSize &&
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

  for (const tileUids of uidGroups.values()) {
    if (tileUids.length > 1) {
      issues.push(issue("error", "duplicate-uid", "砖块 UID 必须唯一。", [...new Set(tileUids)]));
    }
  }

  for (const tileUids of anchors.values()) {
    if (tileUids.length > 1) {
      issues.push(issue("error", "duplicate-anchor", "同层存在完全重叠的砖块锚点。", tileUids));
    }
  }

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
        const exactAnchor = Number(left.x) === Number(right.x) && Number(left.y) === Number(right.y);
        if (exactAnchor || !overlapsWithPositiveArea(left, right)) continue;
        overlappingPairCount += 1;
        overlappingUids.add(left.uid);
        overlappingUids.add(right.uid);
      }
    }
  }
  if (overlappingPairCount > 0) {
    const severity = rejectSameLayerOverlap ? "error" : "warning";
    const scope = rejectSameLayerOverlap ? "AI 关卡" : "当前关卡";
    issues.push(issue(
      severity,
      "same-layer-overlap",
      `${scope}同层存在 ${overlappingPairCount} 组面积重叠的砖块。`,
      [...overlappingUids],
    ));
  }

  if (rejectOddLayerTypeCounts) {
    const oddLayerTypeUids = new Set();
    const oddLayerTypeGroups = [];
    for (const [layer, layerTiles] of layerGroups) {
      const layerTypeGroups = new Map();
      for (const tile of layerTiles) {
        const type = Number(tile.type);
        (layerTypeGroups.get(type) ?? layerTypeGroups.set(type, []).get(type)).push(tile.uid);
      }
      for (const [type, tileUids] of layerTypeGroups) {
        if (tileUids.length % 2 === 0) continue;
        oddLayerTypeGroups.push(`第 ${layer} 层 / 图案 ${type}`);
        tileUids.forEach((uid) => oddLayerTypeUids.add(uid));
      }
    }
    if (oddLayerTypeGroups.length) {
      issues.push(issue(
        "error",
        "odd-layer-type",
        `AI 关卡存在 ${oddLayerTypeGroups.length} 组逐层图案数量不是偶数：${oddLayerTypeGroups.join("、")}。`,
        [...oddLayerTypeUids],
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

export function validateLevelForPublish(document, { maxNodes = 20000 } = {}) {
  const issues = validateLevel(document);
  if (
    !document?.designerNote?.aiGeneration
    || issues.some(({ severity }) => severity === "error")
  ) {
    return issues;
  }

  const report = solveLevel(document, { maxNodes });
  if (!report.solvable) {
    issues.push(issue(
      "error",
      "unsolvable-ai-level",
      report.exhausted
        ? `AI 关卡求解达到 ${report.nodes} 个搜索节点上限，无法确认可解，已阻止发布。`
        : "AI 关卡编辑后已无法完整两两消除，已阻止发布。",
      document.tiles.map((tile) => tile.uid),
    ));
  }
  return issues;
}
