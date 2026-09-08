import { describe, expect, it } from "vitest";
import pawsSmall from "../fixtures/paws-small.json";
import sheep900121 from "../../src/data/sheep-900121.json";
import {
  normalizePawsLevel,
  normalizeSheepLevel,
  parseDesignerRules,
} from "../../src/model/normalize.js";

describe("level normalization", () => {
  it("reads the current fun-clear percentage and ignores deprecated pseudo-random modes", () => {
    const result = parseDesignerRules({ funClearPercent: 40, pseudoRandomLimitedMode: 1, pseudoRandomFullMode: 2 });
    expect(result.rules).toMatchObject({ funClearPercent: 40, pseudoRandomLimitedMode: 0, pseudoRandomFullMode: 0 });
    expect(result.warnings.some((warning) => warning.includes("伪随机") && warning.includes("废弃"))).toBe(true);
  });

  it("uses designerNote levelData before the fallback tiles as the client loader does", () => {
    const raw = structuredClone(pawsSmall);
    raw.designerNote = JSON.stringify({
      levelData: { 2: [{ rolNum: 40, rowNum: 24, layerNum: 2, type: 7 }] },
    });
    const level = normalizePawsLevel(raw);
    expect(level.tiles).toHaveLength(1);
    expect(level.tiles[0]).toMatchObject({ x: 40, y: 24, layer: 2, type: 7 });
    expect(level.tileSource).toBe("designerNote.levelData");
    expect(level.referenceTiles).toEqual(level.tiles);
  });

  it("retains custom random ranges without mislabeling them as unsupported mechanics", () => {
    const raw = structuredClone(pawsSmall);
    raw.tiles.forEach((tile) => { tile.metaType = 12; tile.metaData = 16; });
    const level = normalizePawsLevel(raw);
    expect(level.tiles[0]).toMatchObject({ metaType: 12, metaData: 16 });
    expect(level.modelLimitations).toEqual([]);
    expect(level.warnings.some((warning) => warning.includes("非零 metaType"))).toBe(false);
  });

  it("marks first-round random assignment and manual hidden patterns as model limitations", () => {
    const raw = structuredClone(pawsSmall);
    raw.designerNote = JSON.stringify({ gameLevelOrder: 1 });
    raw.tiles[0].presetColorType = 2;
    const level = normalizePawsLevel(raw);
    expect(level.modelLimitations.some((reason) => reason.includes("首关"))).toBe(true);
    expect(level.modelLimitations.some((reason) => reason.includes("背面"))).toBe(true);
    expect(level.warnings.some((reason) => reason.includes("不完整"))).toBe(true);
  });
  it("reads current Paws random rules from designerNote", () => {
    const level = normalizePawsLevel(pawsSmall, "level_0020.json");

    expect(level.tiles).toHaveLength(4);
    expect(level.rules).toMatchObject({
      gameLevelOrder: 2,
      limitedTypeMax: 4,
      fullTypeMin: 1,
      fullTypeMax: 15,
      pseudoRandomLimitedMode: 0,
      pseudoRandomFullMode: 0,
    });
    expect(level.tiles[0]).toMatchObject({
      id: 0,
      x: 0,
      y: 0,
      layer: 1,
      type: -1,
    });
  });

  it("uses the canonical level_0020 filename when the raw id is numeric", () => {
    const level = normalizePawsLevel(
      { ...pawsSmall, id: 20 },
      "level_0020_r2_第二关模板25.json",
    );

    expect(level.id).toBe("level_0020");
  });

  it.each([
    ["x", null],
    ["layer", 1.5],
    ["type", "not-a-number"],
  ])("rejects malformed tile numeric field %s", (field, value) => {
    const raw = structuredClone(pawsSmall);
    raw.tiles[0][field] = value;

    expect(() => normalizePawsLevel(raw, "broken-numeric.json"))
      .toThrow(new RegExp(`砖块 0.*${field}.*有限整数`));
  });

  it("falls back safely when designerNote is malformed", () => {
    const result = parseDesignerRules("{broken");

    expect(result.rules).toMatchObject({
      gameLevelOrder: 2,
      limitedTypeMax: 8,
      fullTypeMin: 1,
      fullTypeMax: 32,
    });
    expect(result.warnings).toContain("designerNote 不是有效 JSON，已使用默认规则。");
  });

  it.each([
    ["string", { blockTypeCount: "7" }, "blockTypeCount"],
    ["decimal", { gameLevelOrder: 2.7 }, "gameLevelOrder"],
    ["out of range", { fullRandomTypeMax: 33 }, "fullRandomTypeMax"],
  ])("warns and uses safe defaults for %s designer rule values", (_kind, note, field) => {
    const result = parseDesignerRules(note);

    expect(result.warnings.some((warning) => warning.includes(field))).toBe(true);
    expect(result.rules).toMatchObject({
      gameLevelOrder: 2,
      limitedTypeMax: 8,
      fullTypeMin: 1,
      fullTypeMax: 32,
    });
  });

  it("flattens Sheep layer dictionaries", () => {
    const level = normalizeSheepLevel({
      levelKey: 900121,
      blockTypeData: { 1: 1, 2: 1 },
      levelData: {
        1: [{ rolNum: 0, rowNum: 0, layerNum: 1, type: 0 }],
        2: [{ rolNum: 4, rowNum: 4, layerNum: 2, type: 0 }],
      },
    });

    expect(level.tiles.map(({ x, y, layer }) => [x, y, layer])).toEqual([
      [0, 0, 1],
      [4, 4, 2],
    ]);
    expect(level.rules.fullTypeMax).toBe(2);
    expect(level.referenceTiles).toHaveLength(level.tiles.length);
    expect(level.referenceTiles.map(({ x, y, layer }) => [x, y, layer])).toEqual([
      [0, 0, 1], [4, 4, 2],
    ]);
  });

  it("normalizes the provided Sheep 900121 baseline", () => {
    const level = normalizeSheepLevel(sheep900121);
    const layers = new Set(level.tiles.map((tile) => tile.layer));

    expect(level.tiles).toHaveLength(258);
    expect(layers.size).toBe(23);
    expect(level.rules.fullTypeMax).toBe(15);
  });

  it("rejects an empty level instead of producing a misleading report", () => {
    expect(() => normalizePawsLevel({ id: 1, tiles: [] }, "empty.json"))
      .toThrow("关卡没有可分析砖块");
  });

  it("rejects unsupported negative tile types", () => {
    const raw = structuredClone(pawsSmall);
    raw.tiles[0].type = -2;

    expect(() => normalizePawsLevel(raw, "invalid-type.json"))
      .toThrow(/砖块 0.*type.*只能是 -1、0 或正整数/);
  });

  it("warns about duplicate positions and unsupported special mechanics", () => {
    const raw = structuredClone(pawsSmall);
    raw.tiles[1] = {
      ...raw.tiles[0],
      type: 1001,
      metaType: 2,
    };
    const level = normalizePawsLevel(raw, "special.json");

    expect(level.warnings).toContain("存在重复的 (x,y,layer) 砖块位置。");
    expect(level.modelLimitations.some((reason) => reason.includes("动态砖"))).toBe(true);
  });
});
