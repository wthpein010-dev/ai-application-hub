import { join, resolve } from "node:path";
import { readWorkbookSheet } from "./lib/xlsx-sheet-reader.mjs";

const VISIBLE_CHARACTER_COUNT = 45;
const SKIN_HEADER_ROW = 3;
const SKIN_DATA_ROW = 5;
const LANGUAGE_HEADER_ROW = 0;
const LANGUAGE_DATA_ROW = 5;

function headerIndexes(row, required) {
  const index = new Map(row.map((value, position) => [String(value || ""), position]));
  for (const name of required) {
    if (!index.has(name)) throw new Error(`Missing spreadsheet column ${name}`);
  }
  return index;
}

function requiredLanguage(language, key, label) {
  const value = language.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${label} localization for ${key}`);
  return value;
}

export function mapBrickGallerySpreadsheets({ skinRows, languageRows }) {
  const skinColumns = headerIndexes(skinRows[SKIN_HEADER_ROW] || [], [
    "id", "blockid", "stringsequence", "show", "blockname", "UnownedDesc", "UnlockDesc", "GalleryDesc",
  ]);
  const languageColumns = headerIndexes(languageRows[LANGUAGE_HEADER_ROW] || [], ["id", "zh"]);
  const language = new Map();
  for (const row of languageRows.slice(LANGUAGE_DATA_ROW)) {
    const key = String(row[languageColumns.get("id")] || "");
    const value = row[languageColumns.get("zh")];
    if (!key || value === undefined || value === null || language.has(key)) continue;
    language.set(key, String(value));
  }

  const visibleRows = skinRows
    .slice(SKIN_DATA_ROW)
    .filter((row) => Number(row[skinColumns.get("show")]) === 1)
    .sort((left, right) => Number(left[skinColumns.get("stringsequence")]) - Number(right[skinColumns.get("stringsequence")]));
  if (visibleRows.length !== VISIBLE_CHARACTER_COUNT) {
    throw new Error(`Expected ${VISIBLE_CHARACTER_COUNT} visible brick skins, received ${visibleRows.length}`);
  }

  const characters = visibleRows.map((row, index) => {
    const id = Number(row[skinColumns.get("id")]);
    const blockId = Number(row[skinColumns.get("blockid")]);
    const sequence = Number(row[skinColumns.get("stringsequence")]);
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(blockId) || blockId < 1 || sequence !== index + 1) {
      throw new Error(`Invalid brick skin row at gallery position ${index + 1}`);
    }
    const sourceKeys = {
      name: String(row[skinColumns.get("blockname")] || ""),
      unowned: String(row[skinColumns.get("UnownedDesc")] || ""),
      unlock: String(row[skinColumns.get("UnlockDesc")] || ""),
      gallery: String(row[skinColumns.get("GalleryDesc")] || ""),
    };
    return {
      id,
      blockId,
      sequence,
      name: requiredLanguage(language, sourceKeys.name, "name"),
      unownedDesc: requiredLanguage(language, sourceKeys.unowned, "unowned description"),
      unlockDesc: requiredLanguage(language, sourceKeys.unlock, "unlock description"),
      galleryDesc: requiredLanguage(language, sourceKeys.gallery, "gallery description"),
      sourceKeys,
    };
  });
  if (new Set(characters.map(({ id }) => id)).size !== characters.length) throw new Error("Duplicate spreadsheet skin IDs");
  if (new Set(characters.map(({ blockId }) => blockId)).size !== characters.length) throw new Error("Duplicate spreadsheet block IDs");
  return characters;
}

export async function buildBrickGalleryDataFromSpreadsheets({ dataRoot = process.env.PAWS_HOME_DATA_ROOT } = {}) {
  if (!dataRoot) throw new Error("Set PAWS_HOME_DATA_ROOT to the local PawsHomeData data directory");
  const root = resolve(dataRoot);
  return mapBrickGallerySpreadsheets({
    skinRows: readWorkbookSheet(join(root, "blockskin.xlsx"), "Sheet1"),
    languageRows: readWorkbookSheet(join(root, "language.xlsx"), "language0"),
  });
}
