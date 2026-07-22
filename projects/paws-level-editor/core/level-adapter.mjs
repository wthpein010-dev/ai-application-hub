import {
  DEFAULT_BOARD,
  buildGridUnit,
  parseGridUnit,
} from "./editor-geometry.mjs";
import { assertGameplayMetadata } from "./gameplay-metadata.mjs";

const TILE_DEFAULTS = Object.freeze({
  moldType: 1,
  metaType: 0,
  metaData: 0,
  presetColorType: 1,
});

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function numberOr(value, fallback) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function definedOr(value, fallback) {
  return value === undefined ? fallback : value;
}

function dimensionOr(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return Number(value);
}

function safeGridUnit(width, height, fallback) {
  try {
    return buildGridUnit(width, height);
  } catch {
    return String(fallback || buildGridUnit(DEFAULT_BOARD.width, DEFAULT_BOARD.height));
  }
}

function normalizeTile(tile, uid) {
  return {
    uid,
    x: numberOr(tile.x ?? tile.rolNum, 0),
    y: numberOr(tile.y ?? tile.rowNum, 0),
    layer: numberOr(tile.layer ?? tile.layerNum, 1),
    type: numberOr(tile.type, 0),
    moldType: numberOr(tile.moldType, TILE_DEFAULTS.moldType),
    metaType: numberOr(tile.metaType, TILE_DEFAULTS.metaType),
    metaData: numberOr(tile.metaData, TILE_DEFAULTS.metaData),
    presetColorType: numberOr(tile.presetColorType, TILE_DEFAULTS.presetColorType),
  };
}

function parseDesignerNote(value, warnings) {
  if (!value) {
    return {};
  }
  if (typeof value === "object") {
    return clone(value);
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    warnings.push({
      code: "invalid-designer-note",
      message: `designerNote 不是合法 JSON：${error.message}`,
    });
    return {};
  }
}

function flattenLevelData(levelData) {
  if (!levelData || typeof levelData !== "object" || Array.isArray(levelData)) {
    return [];
  }
  return Object.entries(levelData)
    .sort(([left], [right]) => numberOr(left, 0) - numberOr(right, 0))
    .flatMap(([, tiles]) => (Array.isArray(tiles) ? tiles : []));
}

function plainTile(tile) {
  return {
    x: numberOr(tile.x, 0),
    y: numberOr(tile.y, 0),
    layer: numberOr(tile.layer, 1),
    type: numberOr(tile.type, 0),
    moldType: numberOr(tile.moldType, TILE_DEFAULTS.moldType),
    metaType: numberOr(tile.metaType, TILE_DEFAULTS.metaType),
    metaData: numberOr(tile.metaData, TILE_DEFAULTS.metaData),
    presetColorType: numberOr(tile.presetColorType, TILE_DEFAULTS.presetColorType),
  };
}

export function parseLevelDocument(raw, { fileName = "", version = "" } = {}) {
  const original = clone(raw ?? {});
  const warnings = [];
  const designerNote = parseDesignerNote(original.designerNote, warnings);
  const noteTiles = flattenLevelData(designerNote.levelData);
  const topTiles = Array.isArray(original.tiles) ? original.tiles : [];
  const source = noteTiles.length > 0 ? "designerNote" : "tiles";
  const sourceTiles = source === "designerNote" ? noteTiles : topTiles;
  if (sourceTiles.length === 0) {
    warnings.push({ code: "empty-level", message: "关卡没有砖块数据。" });
  }

  const normalized = sourceTiles
    .map((tile, inputIndex) => ({ tile, inputIndex }))
    .sort((left, right) => {
      const layerDifference =
        numberOr(left.tile.layer ?? left.tile.layerNum, 1) -
        numberOr(right.tile.layer ?? right.tile.layerNum, 1);
      return layerDifference || left.inputIndex - right.inputIndex;
    })
    .map(({ tile }, index) => normalizeTile(tile, `tile-${index + 1}`));

  const parsedGridUnit = parseGridUnit(original.gridUnit);
  const fallbackWidth = parsedGridUnit?.width ?? DEFAULT_BOARD.width;
  const fallbackHeight = parsedGridUnit?.height ?? DEFAULT_BOARD.height;
  const boardWidth = dimensionOr(designerNote.widthNum, fallbackWidth);
  const boardHeight = dimensionOr(designerNote.heightNum, fallbackHeight);
  const gridUnit = safeGridUnit(boardWidth, boardHeight, original.gridUnit);
  const id = numberOr(original.id, 0);

  return {
    original,
    designerNote,
    fileName,
    version,
    source,
    warnings,
    id,
    name: String(original.name ?? ""),
    difficulty: String(original.difficulty ?? "Normal"),
    gridUnit,
    board: {
      width: boardWidth,
      height: boardHeight,
      scale: numberOr(designerNote.boardScale, 1),
    },
    random: {
      blockTypeCount: numberOr(designerNote.blockTypeCount, 32),
      fullTypeMin: numberOr(designerNote.fullRandomTypeMin, 1),
      fullTypeMax: numberOr(designerNote.fullRandomTypeMax, 32),
    },
    gameplay: {
      levelKey: definedOr(designerNote.levelKey, id),
      gameLevelOrder: definedOr(designerNote.gameLevelOrder, 1),
      cdNum: definedOr(designerNote.cdNum, 0),
      showLayerNum: definedOr(designerNote.showLayerNum, true),
    },
    tiles: normalized,
  };
}

export function tilesToLevelData(tiles) {
  const result = {};
  const collisions = new Map();
  const sorted = tiles
    .map((tile, inputIndex) => ({ tile, inputIndex }))
    .sort((left, right) => {
      const layerDifference = numberOr(left.tile.layer, 1) - numberOr(right.tile.layer, 1);
      return layerDifference || left.inputIndex - right.inputIndex;
    });

  for (const { tile } of sorted) {
    const normalized = plainTile(tile);
    const layerKey = String(normalized.layer);
    const baseId = `${normalized.layer}-${normalized.x}-${normalized.y}`;
    const ordinal = (collisions.get(baseId) ?? 0) + 1;
    collisions.set(baseId, ordinal);
    const id = ordinal === 1 ? baseId : `${baseId}-${ordinal}`;
    const levelTile = {
      id,
      type: normalized.type,
      rolNum: normalized.x,
      rowNum: normalized.y,
      layerNum: normalized.layer,
      moldType: normalized.moldType,
      metaType: normalized.metaType,
      metaData: normalized.metaData,
      presetColorType: normalized.presetColorType,
    };
    (result[layerKey] ??= []).push(levelTile);
  }
  return result;
}

export function serializeLevelDocument(document) {
  const saved = clone(document.original ?? {});
  const note = clone(document.designerNote ?? {});
  const levelData = tilesToLevelData(document.tiles ?? []);
  const parsedGridUnit = parseGridUnit(document.gridUnit ?? saved.gridUnit);
  const boardWidth = dimensionOr(
    document.board?.width,
    dimensionOr(note.widthNum, parsedGridUnit?.width ?? DEFAULT_BOARD.width),
  );
  const boardHeight = dimensionOr(
    document.board?.height,
    dimensionOr(note.heightNum, parsedGridUnit?.height ?? DEFAULT_BOARD.height),
  );
  const gridUnit = safeGridUnit(boardWidth, boardHeight, document.gridUnit ?? saved.gridUnit);

  saved.id = numberOr(document.id, numberOr(saved.id, 0));
  saved.name = String(document.name ?? "");
  saved.difficulty = String(document.difficulty ?? saved.difficulty ?? "Normal");
  saved.gridUnit = gridUnit;
  saved.tiles = Object.values(levelData).flat().map((tile) => ({
    x: tile.rolNum,
    y: tile.rowNum,
    layer: tile.layerNum,
    type: tile.type,
    moldType: tile.moldType,
    metaType: tile.metaType,
    metaData: tile.metaData,
    presetColorType: tile.presetColorType,
  }));

  note.widthNum = boardWidth;
  note.heightNum = boardHeight;
  note.boardScale = numberOr(document.board?.scale, numberOr(note.boardScale, 1));
  note.blockTypeCount = numberOr(
    document.random?.blockTypeCount,
    numberOr(note.blockTypeCount, 32),
  );
  note.fullRandomTypeMin = numberOr(
    document.random?.fullTypeMin,
    numberOr(note.fullRandomTypeMin, 1),
  );
  note.fullRandomTypeMax = numberOr(
    document.random?.fullTypeMax,
    numberOr(note.fullRandomTypeMax, 32),
  );
  const gameplay = {
    levelKey: saved.id,
    gameLevelOrder: definedOr(
      document.gameplay?.gameLevelOrder,
      definedOr(note.gameLevelOrder, 1),
    ),
    cdNum: definedOr(document.gameplay?.cdNum, definedOr(note.cdNum, 0)),
    showLayerNum: definedOr(
      document.gameplay?.showLayerNum,
      definedOr(note.showLayerNum, true),
    ),
  };
  assertGameplayMetadata(gameplay);
  note.levelKey = saved.id;
  note.gameLevelOrder = gameplay.gameLevelOrder;
  note.cdNum = gameplay.cdNum;
  note.showLayerNum = gameplay.showLayerNum;
  note.blockTypeData ??= {};
  note.goldBlockData ??= [];
  note.cakeNum = numberOr(note.cakeNum, 0);
  note.levelData = levelData;
  saved.designerNote = JSON.stringify(note);

  return saved;
}
