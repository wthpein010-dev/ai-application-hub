import { describe, expect, it } from "vitest";
import * as importLevels from "../../src/io/import-levels.js";

const { importLevelFiles } = importLevels;

function validLevel(id, tileCount = 2) {
  return JSON.stringify({
    id,
    name: id,
    designerNote: JSON.stringify({ fullRandomTypeMin: 1, fullRandomTypeMax: 15 }),
    tiles: Array.from({ length: tileCount }, (_, index) => ({
      x: index * 16,
      y: 0,
      layer: 1,
      type: index % 2 ? 1 : 1,
      moldType: 1,
      metaType: 0,
      metaData: 0,
      presetColorType: 1,
    })),
  });
}

function fakeFile(name, text, webkitRelativePath = name) {
  return {
    name,
    webkitRelativePath,
    async text() {
      return text;
    },
  };
}

describe("EditorLevels batch import", () => {
  it("ignores meta files and every file under _Trash", async () => {
    const result = await importLevelFiles([
      fakeFile("level_0001.json", validLevel("level_0001"), "EditorLevels/level_0001.json"),
      fakeFile("level_0001.json.meta", "x", "EditorLevels/level_0001.json.meta"),
      fakeFile("old.json", validLevel("old"), "EditorLevels/_Trash/old.json"),
    ]);

    expect(result.levels).toHaveLength(1);
    expect(result.ignored).toHaveLength(2);
  });

  it("keeps malformed files as errors and defaults to level_0020 after sorting", async () => {
    const result = await importLevelFiles([
      fakeFile("level_0100.json", validLevel("level_0100", 4)),
      fakeFile("broken.json", "{oops"),
      fakeFile("level_0020_r2.json", validLevel("level_0020", 2)),
      fakeFile("level_0002.json", validLevel("level_0002", 2)),
    ]);

    expect(result.levels.map((level) => level.id)).toEqual([
      "level_0002",
      "level_0020",
      "level_0100",
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe("broken.json");
    expect(result.selectedLevel.id).toBe("level_0020");
  });

  it("falls back to the largest valid level when level_0020 is absent", async () => {
    const result = await importLevelFiles([
      fakeFile("small.json", validLevel("level_0001", 2)),
      fakeFile("large.json", validLevel("level_0009", 6)),
    ]);

    expect(result.selectedLevel.id).toBe("level_0009");
    expect(result.warningCount).toBe(0);
  });
});

describe("bundled desktop level payload", () => {
  it("converts the read-only desktop payload into File-like entries", async () => {
    expect(importLevels.loadBundledLevelFiles).toBeTypeOf("function");
    const result = await importLevels.loadBundledLevelFiles({
      async loadBundledLevels() {
        return {
          available: true,
          folderName: "Editorlevel",
          files: [{
            name: "level_0020.json",
            webkitRelativePath: "Editorlevel/level_0020.json",
            text: validLevel("level_0020"),
          }],
        };
      },
    });

    expect(result.available).toBe(true);
    expect(result.folderName).toBe("Editorlevel");
    expect(result.files[0].name).toBe("level_0020.json");
    expect(result.files[0].webkitRelativePath).toBe("Editorlevel/level_0020.json");
    await expect(result.files[0].text()).resolves.toContain('"id":"level_0020"');
  });

  it("stays unavailable in the standalone HTML without the desktop bridge", async () => {
    expect(importLevels.loadBundledLevelFiles).toBeTypeOf("function");
    await expect(importLevels.loadBundledLevelFiles(undefined)).resolves.toEqual({
      available: false,
      folderName: null,
      files: [],
    });
  });
});
