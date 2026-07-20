import assert from "node:assert/strict";
import test from "node:test";

const importModule = () =>
  import("../projects/paws-level-editor/ui/local-level-import.mjs");

function fileLike(name, text, { size = Buffer.byteLength(text), readError = null } = {}) {
  return {
    name,
    size,
    async text() {
      if (readError) throw readError;
      return text;
    },
  };
}

test("prepares a Unicode JSON level and preserves unknown fields", async () => {
  const { prepareImportedLevel } = await importModule();
  const raw = {
    id: 7001,
    name: "本地关卡",
    difficulty: "Hard",
    unknownTopLevel: { keep: true },
    designerNote: JSON.stringify({ customNote: "保留", widthNum: 8 }),
    tiles: [{ x: 0, y: 0, layer: 1, type: 1, unknownTileField: "source-only" }],
  };

  const imported = await prepareImportedLevel(
    fileLike("我的关卡.json", JSON.stringify(raw)),
    { occupiedFileNames: [] },
  );

  assert.equal(imported.fileName, "我的关卡.json");
  assert.equal(imported.value.id, 7001);
  assert.equal(imported.value.name, "本地关卡");
  assert.deepEqual(imported.value.unknownTopLevel, { keep: true });
  const note = JSON.parse(imported.value.designerNote);
  assert.equal(note.customNote, "保留");
  assert.equal(note.levelData["1"].length, 1);
});

test("deduplicates imported names without overwriting existing levels", async () => {
  const { chooseImportedFileName } = await importModule();

  assert.equal(chooseImportedFileName("新关卡.json", []), "新关卡.json");
  assert.equal(
    chooseImportedFileName(
      "level_showcase.json",
      ["level_showcase.json", "level_showcase_import.json"],
    ),
    "level_showcase_import_2.json",
  );
});

test("rejects an invalid filename before reading the file", async () => {
  const { prepareImportedLevel } = await importModule();
  let read = false;
  const file = fileLike("not-json.txt", "{}", {});
  file.text = async () => {
    read = true;
    return "{}";
  };

  await assert.rejects(
    () => prepareImportedLevel(file),
    { code: "invalid-file-name" },
  );
  assert.equal(read, false);
});

test("rejects empty, oversized, malformed and non-object JSON", async (context) => {
  const { MAX_IMPORT_BYTES, prepareImportedLevel } = await importModule();
  const cases = [
    {
      name: "empty",
      file: fileLike("empty.json", ""),
      code: "empty-file",
    },
    {
      name: "oversized",
      file: fileLike("large.json", "{}", { size: MAX_IMPORT_BYTES + 1 }),
      code: "file-too-large",
    },
    {
      name: "malformed",
      file: fileLike("broken.json", "{not JSON"),
      code: "invalid-json",
    },
    {
      name: "array root",
      file: fileLike("array.json", "[]"),
      code: "invalid-level-root",
    },
  ];

  for (const entry of cases) {
    await context.test(entry.name, async () => {
      await assert.rejects(
        () => prepareImportedLevel(entry.file),
        { code: entry.code },
      );
    });
  }
});

test("reports browser file read failures without changing the error contract", async () => {
  const { prepareImportedLevel } = await importModule();

  await assert.rejects(
    () => prepareImportedLevel(
      fileLike("unreadable.json", "{}", { readError: new Error("private browser detail") }),
    ),
    {
      code: "file-read-failed",
      message: "无法读取所选关卡文件。",
    },
  );
});
