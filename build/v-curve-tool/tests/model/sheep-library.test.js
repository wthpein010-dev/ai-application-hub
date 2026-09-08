import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as normalizers from "../../src/model/normalize.js";

function sheepMap(levelKey, x = 0) {
  return {
    widthNum: 8,
    heightNum: 10,
    levelKey,
    blockTypeData: { 1: 1, 2: 1 },
    levelData: {
      1: [{ rolNum: x, rowNum: 0, layerNum: 1, type: 0 }],
    },
  };
}

describe("built-in Sheep level library", () => {
  it("parses map_data records and makes duplicate level keys distinguishable", () => {
    expect(normalizers.normalizeSheepLibrary).toBeTypeOf("function");
    const result = normalizers.normalizeSheepLibrary([
      { map_data: JSON.stringify(sheepMap(90014, 0)) },
      { map_data: JSON.stringify(sheepMap(90014, 8)), ignored_instruction: "do not use" },
      { map_data: "{broken", ignored_instruction: "do not use" },
    ], "game_map.json");

    expect(result.errors).toEqual(["game_map.json[2]：map_data 不是有效 JSON。"]);
    expect(result.duplicateLevelKeys).toEqual(["90014"]);
    expect(result.levels.map(({ id, name, sourceFile }) => ({ id, name, sourceFile }))).toEqual([
      { id: "90014-v1", name: "羊 90014（版本1/2）", sourceFile: "game_map.json[0]" },
      { id: "90014-v2", name: "羊 90014（版本2/2）", sourceFile: "game_map.json[1]" },
    ]);
    expect(result.levels.map((level) => level.tiles[0].x)).toEqual([0, 8]);
  });

  it("loads all records from the provided game_map.json without losing duplicate versions", () => {
    const dataPath = fileURLToPath(new URL("../../src/data/sheep-game-map.json", import.meta.url));
    expect(existsSync(dataPath)).toBe(true);
    expect(normalizers.normalizeSheepLibrary).toBeTypeOf("function");
    const result = normalizers.normalizeSheepLibrary(
      JSON.parse(readFileSync(dataPath, "utf8")),
      "sheep-game-map.json",
    );

    expect(result.errors).toEqual([]);
    expect(result.levels).toHaveLength(36);
    expect(result.duplicateLevelKeys).toEqual([
      "90014", "90017", "90023", "90024", "90025", "90026",
    ]);
    expect(new Set(result.levels.map((level) => level.id)).size).toBe(36);
    expect(result.levels[0]).toMatchObject({
      id: "90009",
      name: "羊 90009",
      source: "sheep",
    });
    expect(result.levels[0].tiles).toHaveLength(252);
    expect(new Set(result.levels[0].tiles.map((tile) => tile.layer)).size).toBe(22);
  });
});
