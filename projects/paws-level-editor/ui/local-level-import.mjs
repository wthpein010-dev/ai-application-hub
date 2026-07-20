import { parseLevelDocument, serializeLevelDocument } from "../core/level-adapter.mjs";
import { isValidLevelFileName } from "../static-api-client.mjs";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export class LocalLevelImportError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "LocalLevelImportError";
    this.code = code;
  }
}

export function chooseImportedFileName(fileName, occupiedFileNames = []) {
  if (!isValidLevelFileName(fileName)) {
    throw new LocalLevelImportError(
      "请选择文件名合法的 .json 关卡文件。",
      "invalid-file-name",
    );
  }

  const occupied = new Set(occupiedFileNames);
  if (!occupied.has(fileName)) return fileName;

  const base = fileName.replace(/\.json$/iu, "");
  for (let ordinal = 1; ordinal < 10_000; ordinal += 1) {
    const suffix = ordinal === 1 ? "_import" : `_import_${ordinal}`;
    const candidate = `${base}${suffix}.json`;
    if (!occupied.has(candidate)) return candidate;
  }

  throw new LocalLevelImportError("无法生成可用的导入副本名称。", "name-exhausted");
}

export async function prepareImportedLevel(file, { occupiedFileNames = [] } = {}) {
  const fileName = chooseImportedFileName(file?.name, occupiedFileNames);

  if (!Number.isFinite(file?.size) || file.size <= 0) {
    throw new LocalLevelImportError("所选关卡文件为空。", "empty-file");
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new LocalLevelImportError("所选关卡文件超过大小限制。", "file-too-large");
  }

  let text;
  try {
    text = await file.text();
  } catch {
    throw new LocalLevelImportError("无法读取所选关卡文件。", "file-read-failed");
  }

  if (!text.trim()) {
    throw new LocalLevelImportError("所选关卡文件为空。", "empty-file");
  }

  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new LocalLevelImportError("所选关卡文件不是合法 JSON。", "invalid-json");
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new LocalLevelImportError("关卡 JSON 根节点必须是对象。", "invalid-level-root");
  }

  const document = parseLevelDocument(raw, { fileName });
  return { fileName, value: serializeLevelDocument(document) };
}
