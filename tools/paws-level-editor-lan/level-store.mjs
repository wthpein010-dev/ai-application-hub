import { createHash, randomBytes } from "node:crypto";
import * as defaultFs from "node:fs/promises";
import path from "node:path";

import { HttpError } from "./http-utils.mjs";

const FILE_NAME_PATTERN = /^[^\u0000-\u001f<>:"/\\|?*]+\.json$/iu;
const TRASH_PATTERN = /^(.*)_(\d{8})_(\d{6})(?:_(\d+))?\.json$/u;

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertLevelFileName(fileName) {
  if (
    typeof fileName !== "string"
    || fileName !== fileName.trim()
    || fileName.includes("..")
    || !FILE_NAME_PATTERN.test(fileName)
  ) {
    throw new HttpError(400, "invalid-file-name", "关卡文件名无效。");
  }
  return fileName;
}

export function originalNameFromTrashId(trashId) {
  const safeId = assertLevelFileName(trashId);
  const match = safeId.match(TRASH_PATTERN);
  if (!match?.[1]) {
    throw new HttpError(400, "invalid-trash-id", "回收站记录名称无效。");
  }
  return `${match[1]}.json`;
}

function deletedAtFromTrashId(trashId, fallback) {
  const match = trashId.match(TRASH_PATTERN);
  if (!match) return fallback;
  const [, , date, time] = match;
  const value = new Date(Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(4, 6)) - 1,
    Number(date.slice(6, 8)),
    Number(time.slice(0, 2)),
    Number(time.slice(2, 4)),
    Number(time.slice(4, 6)),
  ));
  return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
}

function trashTimestamp(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    "_",
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0"),
  ].join("");
}

async function pathExists(fs, filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createLanLevelStore({
  levelDir,
  now = () => new Date(),
  randomSuffix = () => randomBytes(4).toString("hex"),
  fsOps = {},
} = {}) {
  if (!levelDir) throw new Error("levelDir is required");
  const fs = { ...defaultFs, ...fsOps };
  const root = path.resolve(levelDir);
  const trashDir = path.join(root, "_Trash");

  function resolveLevel(fileName) {
    const safe = assertLevelFileName(fileName);
    const target = path.resolve(root, safe);
    if (path.dirname(target) !== root) {
      throw new HttpError(400, "invalid-file-name", "关卡文件名无效。");
    }
    return target;
  }

  function resolveTrash(trashId) {
    const safe = assertLevelFileName(trashId);
    const target = path.resolve(trashDir, safe);
    if (path.dirname(target) !== trashDir) {
      throw new HttpError(400, "invalid-trash-id", "回收站记录名称无效。");
    }
    return target;
  }

  async function readJsonFile(target, { code = "invalid-level-json" } = {}) {
    const bytes = await fs.readFile(target);
    try {
      return { bytes, value: JSON.parse(bytes.toString("utf8")) };
    } catch (error) {
      throw new HttpError(422, code, `关卡 JSON 无法解析：${error.message}`);
    }
  }

  async function readLevel(fileName) {
    const target = resolveLevel(fileName);
    let result;
    let details;
    try {
      [result, details] = await Promise.all([
        readJsonFile(target),
        fs.stat(target),
      ]);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new HttpError(404, "level-not-found", "关卡文件不存在。");
      }
      throw error;
    }
    return {
      fileName,
      value: clone(result.value),
      version: hash(result.bytes),
      modifiedAt: details.mtime.toISOString(),
      size: details.size,
      local: false,
      bundled: true,
      source: "bundled",
    };
  }

  async function listLevelCatalog({ defaultFileName = "" } = {}) {
    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
      throw new HttpError(503, "level-directory-unavailable", `关卡目录不可读：${error.message}`);
    }
    const names = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "zh-CN"));
    const levels = [];
    for (const fileName of names) {
      try {
        const level = await readLevel(fileName);
        levels.push({
          fileName,
          id: level.value.id ?? null,
          name: level.value.name ?? fileName,
          tileCount: Array.isArray(level.value.tiles) ? level.value.tiles.length : null,
          modifiedAt: level.modifiedAt,
          size: level.size,
          version: level.version,
          bundled: true,
          local: false,
          source: "bundled",
          aiReferenceEligible: true,
          broken: false,
        });
      } catch (error) {
        const details = await fs.stat(path.join(root, fileName));
        levels.push({
          fileName,
          id: null,
          name: fileName,
          tileCount: null,
          modifiedAt: details.mtime.toISOString(),
          size: details.size,
          version: null,
          bundled: true,
          local: false,
          source: "bundled",
          aiReferenceEligible: false,
          broken: true,
          error: error.message,
        });
      }
    }
    const available = new Set(names);
    return {
      defaultFileName: available.has(defaultFileName) ? defaultFileName : names[0] ?? "",
      levels,
    };
  }

  async function listTrash() {
    let entries;
    try {
      entries = await fs.readdir(trashDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw new HttpError(503, "trash-directory-unavailable", `回收站目录不可读：${error.message}`);
    }
    const names = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name)
      .filter((name) => TRASH_PATTERN.test(name))
      .sort((left, right) => right.localeCompare(left, "zh-CN"));
    const levels = [];
    for (const trashId of names) {
      const target = resolveTrash(trashId);
      const details = await fs.stat(target);
      const fileName = originalNameFromTrashId(trashId);
      try {
        const { bytes, value } = await readJsonFile(target, { code: "invalid-trash-json" });
        levels.push({
          trashId,
          fileName,
          id: value.id ?? null,
          name: value.name ?? fileName,
          tileCount: Array.isArray(value.tiles) ? value.tiles.length : null,
          deletedAt: deletedAtFromTrashId(trashId, details.mtime.toISOString()),
          size: details.size,
          version: hash(bytes),
          broken: false,
        });
      } catch (error) {
        levels.push({
          trashId,
          fileName,
          id: null,
          name: fileName,
          tileCount: null,
          deletedAt: deletedAtFromTrashId(trashId, details.mtime.toISOString()),
          size: details.size,
          version: null,
          broken: true,
          error: error.message,
        });
      }
    }
    return levels;
  }

  async function rollbackMoves(completed) {
    const failures = [];
    for (const [from, to] of [...completed].reverse()) {
      try {
        await fs.rename(to, from);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw failures[0];
  }

  async function moveTransaction(moves, { failureCode, rollbackCode, failureMessage }) {
    const completed = [];
    try {
      for (const [from, to] of moves) {
        await fs.rename(from, to);
        completed.push([from, to]);
      }
    } catch (error) {
      try {
        await rollbackMoves(completed);
      } catch (rollbackError) {
        throw new HttpError(500, rollbackCode, `${failureMessage}，且回滚失败：${rollbackError.message}`);
      }
      throw new HttpError(500, failureCode, `${failureMessage}：${error.message}`);
    }
  }

  async function nextTrashId(fileName) {
    await fs.mkdir(trashDir, { recursive: true });
    const base = fileName.replace(/\.json$/iu, "");
    const stamp = trashTimestamp(now());
    for (let sequence = 1; sequence < 10000; sequence += 1) {
      const suffix = sequence === 1 ? "" : `_${sequence}`;
      const candidate = `${base}_${stamp}${suffix}.json`;
      if (
        !(await pathExists(fs, path.join(trashDir, candidate)))
        && !(await pathExists(fs, path.join(trashDir, `${candidate}.meta`)))
      ) return candidate;
    }
    return `${base}_${stamp}_${randomSuffix()}.json`;
  }

  async function deleteLevel({ fileName, expectedVersion = "" } = {}) {
    const current = await readLevel(fileName);
    if (!expectedVersion || current.version !== expectedVersion) {
      throw new HttpError(409, "version-conflict", "关卡已被其他用户修改，请刷新后重试。", {
        currentVersion: current.version,
        modifiedAt: current.modifiedAt,
      });
    }
    const source = resolveLevel(fileName);
    const sourceMeta = `${source}.meta`;
    const trashId = await nextTrashId(fileName);
    const target = resolveTrash(trashId);
    const moves = [[source, target]];
    if (await pathExists(fs, sourceMeta)) moves.push([sourceMeta, `${target}.meta`]);
    await moveTransaction(moves, {
      failureCode: "trash-move-failed",
      rollbackCode: "trash-rollback-failed",
      failureMessage: "移动关卡到工程 _Trash 失败",
    });
    return {
      trashId,
      fileName,
      deletedAt: deletedAtFromTrashId(trashId, now().toISOString()),
      deleted: true,
    };
  }

  async function restoreLevel({ trashId } = {}) {
    const source = resolveTrash(trashId);
    if (!(await pathExists(fs, source))) {
      throw new HttpError(404, "trash-entry-not-found", "回收站记录不存在。");
    }
    const fileName = originalNameFromTrashId(trashId);
    const target = resolveLevel(fileName);
    const sourceMeta = `${source}.meta`;
    const targetMeta = `${target}.meta`;
    if (await pathExists(fs, target) || await pathExists(fs, targetMeta)) {
      throw new HttpError(409, "restore-conflict", "活动关卡目录已存在同名文件，未执行覆盖恢复。");
    }
    const moves = [[source, target]];
    if (await pathExists(fs, sourceMeta)) moves.push([sourceMeta, targetMeta]);
    await moveTransaction(moves, {
      failureCode: "restore-move-failed",
      rollbackCode: "restore-rollback-failed",
      failureMessage: "从工程 _Trash 恢复关卡失败",
    });
    return readLevel(fileName);
  }

  async function saveLevel({ fileName, value, expectedVersion = "", saveAs = false } = {}) {
    const target = resolveLevel(fileName);
    const targetExists = await pathExists(fs, target);
    if (saveAs && targetExists) {
      throw new HttpError(409, "file-exists", "另存文件名已存在。");
    }
    if (!saveAs && !targetExists) {
      throw new HttpError(404, "level-not-found", "要保存的关卡不存在。");
    }
    if (!saveAs) {
      const current = await readLevel(fileName);
      if (current.version !== expectedVersion) {
        throw new HttpError(409, "version-conflict", "关卡已被其他用户修改，请刷新后重试。", {
          currentVersion: current.version,
          modifiedAt: current.modifiedAt,
        });
      }
    }
    let serialized;
    try {
      serialized = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    } catch {
      throw new HttpError(400, "invalid-level-value", "关卡对象无法序列化。");
    }
    await fs.mkdir(root, { recursive: true });
    const temporary = path.join(root, `.${fileName}.${process.pid}.${randomSuffix()}.tmp`);
    const handle = await fs.open(temporary, "wx");
    try {
      await handle.writeFile(serialized);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      if (targetExists) {
        const backupDir = path.join(root, "_Backups");
        await fs.mkdir(backupDir, { recursive: true });
        const backupName = `${fileName.replace(/\.json$/iu, "")}_${trashTimestamp(now())}.json`;
        await fs.copyFile(target, path.join(backupDir, backupName));
      }
      await fs.rename(temporary, target);
    } catch (error) {
      await fs.rm(temporary, { force: true });
      throw error;
    }
    return readLevel(fileName);
  }

  return {
    root,
    trashDir,
    readLevel,
    listLevelCatalog,
    listTrash,
    deleteLevel,
    restoreLevel,
    saveLevel,
  };
}
