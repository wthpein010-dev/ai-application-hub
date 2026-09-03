import { normalizePawsLevel } from "../model/normalize.js";

function filePath(file) {
  return String(file?.webkitRelativePath || file?.name || "未知文件");
}

function ignoredReason(path) {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.split("/").some((segment) => segment.toLowerCase() === "_trash")) {
    return "位于 _Trash";
  }
  if (/\.meta$/i.test(normalized)) return "Unity .meta 文件";
  if (!/\.json$/i.test(normalized)) return "非 JSON 文件";
  return null;
}

function numericLevelKey(level) {
  const candidates = [level.id, level.sourceFile, level.name];
  for (const candidate of candidates) {
    const match = String(candidate ?? "").match(/level[_-]?(\d+)/i);
    if (match) return Number(match[1]);
  }
  return Number.POSITIVE_INFINITY;
}

function isLevel20(level) {
  return numericLevelKey(level) === 20;
}

export async function importLevelFiles(fileList) {
  const files = Array.from(fileList ?? []);
  const ignored = [];
  const candidates = [];
  for (const file of files) {
    const path = filePath(file);
    const reason = ignoredReason(path);
    if (reason) ignored.push({ name: file.name || path, path, reason });
    else candidates.push(file);
  }

  const settled = await Promise.all(candidates.map(async (file) => {
    const path = filePath(file);
    try {
      const raw = JSON.parse(await file.text());
      return { level: normalizePawsLevel(raw, file.name || path) };
    } catch (error) {
      return {
        error: {
          name: file.name || path,
          path,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }));

  const levels = settled
    .filter((entry) => entry.level)
    .map((entry) => entry.level)
    .sort((left, right) => (
      numericLevelKey(left) - numericLevelKey(right)
      || left.sourceFile.localeCompare(right.sourceFile, "zh-CN", { numeric: true })
    ));
  const errors = settled.filter((entry) => entry.error).map((entry) => entry.error);
  const selectedLevel = levels.find(isLevel20)
    ?? [...levels].sort((left, right) => (
      right.tiles.length - left.tiles.length
      || numericLevelKey(left) - numericLevelKey(right)
    ))[0]
    ?? null;

  return {
    levels,
    ignored,
    errors,
    selectedLevel,
    importedCount: levels.length,
    ignoredCount: ignored.length,
    warningCount: levels.reduce((sum, level) => sum + level.warnings.length, 0) + errors.length,
  };
}

export async function loadBundledLevelFiles(desktopBridge) {
  if (typeof desktopBridge?.loadBundledLevels !== "function") {
    return { available: false, folderName: null, files: [] };
  }
  const payload = await desktopBridge.loadBundledLevels();
  if (!payload?.available || !Array.isArray(payload.files)) {
    return { available: false, folderName: null, files: [] };
  }
  const files = payload.files
    .filter((file) => (
      typeof file?.name === "string"
      && typeof file?.webkitRelativePath === "string"
      && typeof file?.text === "string"
    ))
    .map((file) => ({
      name: file.name,
      webkitRelativePath: file.webkitRelativePath,
      async text() {
        return file.text;
      },
    }));
  return {
    available: true,
    folderName: typeof payload.folderName === "string" ? payload.folderName : null,
    files,
  };
}
