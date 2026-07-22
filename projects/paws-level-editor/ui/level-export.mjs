import { serializeLevelDocument } from "../core/level-adapter.mjs";

function ensureJsonFileName(value, document) {
  const fallback = `level_${String(document?.id ?? 0).padStart(4, "0")}.json`;
  const requested = String(value || document?.fileName || fallback).trim() || fallback;
  return requested.toLowerCase().endsWith(".json") ? requested : `${requested}.json`;
}

export function createLevelDownload(document, { fileName = "" } = {}) {
  if (!document) throw new TypeError("需要先打开一个关卡。");
  const value = serializeLevelDocument(document);
  const text = `${JSON.stringify(value, null, 2)}\n`;
  return {
    fileName: ensureJsonFileName(fileName, document),
    text,
    blob: new Blob([text], { type: "application/json" }),
  };
}

export function triggerLevelDownload(download) {
  if (!download?.blob || !download?.fileName) {
    throw new TypeError("导出内容无效。");
  }
  const url = URL.createObjectURL(download.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = download.fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
