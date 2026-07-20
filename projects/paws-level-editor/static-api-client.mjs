const STORAGE_PREFIX = "paws-level-editor-demo-v1";
const STORAGE_MANIFEST_KEY = `${STORAGE_PREFIX}:local-files`;
const INDEX_URL = "./levels/index.json";
const FILE_NAME_PATTERN = /^[^\u0000-\u001f<>:"/\\|?*]+\.json$/iu;

export class WorkbenchApiError extends Error {
  constructor(message, { status = 500, code = "static-api-error" } = {}) {
    super(message);
    this.name = "WorkbenchApiError";
    this.status = status;
    this.code = code;
  }
}

export function isValidLevelFileName(fileName) {
  return (
    typeof fileName === "string"
    && fileName === fileName.trim()
    && !fileName.includes("..")
    && FILE_NAME_PATTERN.test(fileName)
  );
}

export function createApiClient({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  storage = globalThis.localStorage,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new WorkbenchApiError("当前环境不支持读取内置关卡。", { code: "fetch-unavailable" });
  }

  return {
    async health() {
      return { online: true, authenticated: true, writable: true, staticDemo: true };
    },
    async listLevels() {
      const index = await fetchJson(fetchImpl, INDEX_URL);
      if (!Array.isArray(index?.levels)) {
        throw new WorkbenchApiError("内置关卡索引格式无效。", { code: "invalid-level-index" });
      }
      const bundledFileNames = new Set(index.levels.map((entry) => entry.fileName));
      const bundled = index.levels.map((entry) =>
        mergeStoredSummary({ ...entry, bundled: true }, storage));
      const localOnly = readStoredFileNames(storage)
        .filter((fileName) => !bundledFileNames.has(fileName))
        .map((fileName) => mergeStoredOnlySummary(fileName, storage))
        .filter(Boolean);
      return [...bundled, ...localOnly];
    },
    async loadLevel(fileName) {
      assertFileName(fileName);
      const stored = readStored(storage, fileName);
      if (!stored) return loadBundled(fetchImpl, fileName);
      const index = await fetchJson(fetchImpl, INDEX_URL);
      return {
        ...stored,
        bundled: Array.isArray(index?.levels)
          && index.levels.some((entry) => entry.fileName === fileName),
      };
    },
    async saveLevel({ fileName, value, expectedVersion = "", saveAs = false } = {}) {
      assertFileName(fileName);
      let current;
      if (saveAs) {
        current = readStored(storage, fileName);
        if (!current) {
          const index = await fetchJson(fetchImpl, INDEX_URL);
          if (!Array.isArray(index?.levels)) {
            throw new WorkbenchApiError("内置关卡索引格式无效。", {
              code: "invalid-level-index",
            });
          }
          current = index.levels.some((entry) => entry.fileName === fileName)
            ? { bundled: true }
            : null;
        }
      } else {
        current = await this.loadLevel(fileName).catch((error) => {
          if (error instanceof WorkbenchApiError && error.status === 404) return null;
          throw error;
        });
      }
      if (saveAs && current) {
        throw new WorkbenchApiError("文件已存在。", { status: 409, code: "file-exists" });
      }
      if (!saveAs && current?.version !== expectedVersion) {
        throw new WorkbenchApiError("浏览器版本已变化。", { status: 409, code: "version-conflict" });
      }
      const saved = makeLocalRecord(
        fileName,
        synchronizeLevelData(value),
        now(),
        Boolean(current?.bundled),
      );
      persistStoredRecord(storage, fileName, saved);
      return clone(saved);
    },
    async login() { return { authenticated: true }; },
    async logout() { return { authenticated: true }; },
    blockImageUrl(type) { return `./assets/blocks/block_${encodeURIComponent(type)}.png`; },
    async resetLevel(fileName) {
      assertFileName(fileName);
      const index = await fetchJson(fetchImpl, INDEX_URL);
      if (!Array.isArray(index?.levels)
        || !index.levels.some((entry) => entry.fileName === fileName)) {
        throw new WorkbenchApiError("该关卡没有可恢复的内置版本。", {
          status: 400,
          code: "not-bundled-level",
        });
      }
      const bundled = await loadBundled(fetchImpl, fileName);
      removeStored(storage, fileName);
      return bundled;
    },
  };
}

function assertFileName(fileName) {
  if (!isValidLevelFileName(fileName)) {
    throw new WorkbenchApiError("关卡文件名无效。", { status: 400, code: "invalid-file-name" });
  }
}

async function fetchJson(fetchImpl, url) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new WorkbenchApiError("无法读取内置关卡。", { status: 503, code: "bundle-fetch-failed" });
  }
  if (!response?.ok) {
    throw new WorkbenchApiError("内置关卡不存在。", { status: response?.status || 404, code: "bundle-not-found" });
  }
  try {
    return await response.json();
  } catch (error) {
    throw new WorkbenchApiError("内置关卡 JSON 损坏。", { code: "invalid-bundle-json" });
  }
}

async function loadBundled(fetchImpl, fileName) {
  const value = await fetchJson(fetchImpl, `./levels/${encodeURIComponent(fileName)}`);
  return makeBundledRecord(fileName, value);
}

function mergeStoredSummary(entry, storage) {
  const summary = clone(entry);
  try {
    const stored = readStored(storage, entry.fileName);
    if (!stored) return { ...summary, local: false };
    return storedSummary(summary, stored);
  } catch (error) {
    if (error instanceof WorkbenchApiError && error.code === "invalid-local-record") {
      return { ...summary, local: false, localError: error.code, recoverable: true };
    }
    throw error;
  }
}

function mergeStoredOnlySummary(fileName, storage) {
  try {
    const stored = readStored(storage, fileName);
    if (!stored) return null;
    return storedSummary({ fileName, name: fileName, bundled: false }, stored);
  } catch (error) {
    if (error instanceof WorkbenchApiError && error.code === "invalid-local-record") {
      return {
        fileName,
        name: fileName,
        bundled: false,
        local: false,
        localError: error.code,
        recoverable: false,
      };
    }
    throw error;
  }
}

function storedSummary(summary, stored) {
  return {
    ...summary,
    name: stored.value?.name ?? summary.name,
    local: true,
    version: stored.version,
    updatedAt: stored.updatedAt,
  };
}

function makeBundledRecord(fileName, value) {
  const clonedValue = clone(value);
  return {
    fileName,
    value: clonedValue,
    version: `bundle-${stableHash(clonedValue)}`,
    updatedAt: "",
    local: false,
    bundled: true,
  };
}

function makeLocalRecord(fileName, value, updatedAt, bundled) {
  const clonedValue = clone(value);
  return {
    fileName,
    value: clonedValue,
    version: `local-${stableHash({ fileName, value: clonedValue, updatedAt })}`,
    updatedAt,
    local: true,
    bundled,
  };
}

function synchronizeLevelData(value) {
  const copy = clone(value);
  if (!Array.isArray(copy?.tiles)) return copy;
  const stringFormat = typeof copy.designerNote === "string";
  let note;
  try {
    note = stringFormat
      ? JSON.parse(copy.designerNote)
      : clone(copy.designerNote ?? {});
  } catch {
    return copy;
  }
  if (!note || typeof note !== "object" || Array.isArray(note)) note = {};
  if (!note.levelData || typeof note.levelData !== "object" || Array.isArray(note.levelData)) {
    note.levelData = groupTilesByLayer(copy.tiles);
  }
  copy.designerNote = stringFormat ? JSON.stringify(note) : note;
  return copy;
}

function groupTilesByLayer(tiles) {
  const levelData = {};
  for (const tile of tiles) {
    const layer = String(tile?.layer ?? tile?.layerNum ?? 0);
    (levelData[layer] ??= []).push(clone(tile));
  }
  return levelData;
}

function storageKey(fileName) {
  return `${STORAGE_PREFIX}:${fileName}`;
}

function readStored(storage, fileName) {
  let raw;
  try {
    raw = storage?.getItem(storageKey(fileName));
  } catch (error) {
    throw new WorkbenchApiError("无法读取浏览器本地关卡。", { code: "local-storage-read-failed" });
  }
  if (raw === null || raw === undefined) return null;
  try {
    const record = JSON.parse(raw);
    if (record?.fileName !== fileName || !record?.version || !Object.hasOwn(record, "value")) {
      throw new Error("invalid record");
    }
    return clone({ ...record, local: true });
  } catch (error) {
    throw new WorkbenchApiError("浏览器本地关卡数据损坏。", { code: "invalid-local-record" });
  }
}

function writeStored(storage, fileName, record) {
  try {
    storage?.setItem(storageKey(fileName), JSON.stringify(record));
  } catch (error) {
    throw new WorkbenchApiError("无法保存到浏览器本地存储。", { code: "local-storage-write-failed" });
  }
}

function persistStoredRecord(storage, fileName, record) {
  const recordKey = storageKey(fileName);
  const snapshot = [
    [recordKey, readRawStorageValue(storage, recordKey)],
    [STORAGE_MANIFEST_KEY, readRawStorageValue(storage, STORAGE_MANIFEST_KEY)],
  ];
  try {
    writeStored(storage, fileName, record);
    rememberStoredFileName(storage, fileName);
  } catch (error) {
    try {
      restoreStorageSnapshot(storage, snapshot);
    } catch {
      throw new WorkbenchApiError(
        "浏览器本地存储失败且无法恢复原状态。",
        { code: "local-storage-rollback-failed" },
      );
    }
    throw error;
  }
}

function readRawStorageValue(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    throw new WorkbenchApiError("无法读取浏览器本地关卡。", {
      code: "local-storage-read-failed",
    });
  }
}

function restoreStorageSnapshot(storage, snapshot) {
  const failures = [];
  for (const [key, value] of snapshot) {
    try {
      if (value === null) {
        storage?.removeItem(key);
      } else {
        storage?.setItem(key, value);
      }
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw failures[0];
}

function readStoredFileNames(storage) {
  let raw;
  try {
    raw = storage?.getItem(STORAGE_MANIFEST_KEY);
  } catch (error) {
    throw new WorkbenchApiError("无法读取浏览器本地关卡清单。", { code: "local-storage-read-failed" });
  }
  if (raw === null || raw === undefined) return [];
  try {
    const fileNames = JSON.parse(raw);
    if (!Array.isArray(fileNames)) throw new Error("invalid manifest");
    return [...new Set(fileNames.filter(isValidLevelFileName))];
  } catch (error) {
    return [];
  }
}

function rememberStoredFileName(storage, fileName) {
  const fileNames = readStoredFileNames(storage);
  if (fileNames.includes(fileName)) return;
  try {
    storage?.setItem(STORAGE_MANIFEST_KEY, JSON.stringify([...fileNames, fileName]));
  } catch (error) {
    throw new WorkbenchApiError("无法保存浏览器本地关卡清单。", { code: "local-storage-write-failed" });
  }
}

function removeStored(storage, fileName) {
  try {
    storage?.removeItem(storageKey(fileName));
    const fileNames = readStoredFileNames(storage).filter((storedFileName) => storedFileName !== fileName);
    storage?.setItem(STORAGE_MANIFEST_KEY, JSON.stringify(fileNames));
  } catch (error) {
    throw new WorkbenchApiError("无法清除浏览器本地关卡。", { code: "local-storage-remove-failed" });
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableHash(value) {
  const text = stableJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}
