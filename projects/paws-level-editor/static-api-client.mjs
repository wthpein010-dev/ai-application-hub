const STORAGE_PREFIX = "paws-level-editor-demo-v1";
const INDEX_URL = "./levels/index.json";
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*\.json$/;

export class WorkbenchApiError extends Error {
  constructor(message, { status = 500, code = "static-api-error" } = {}) {
    super(message);
    this.name = "WorkbenchApiError";
    this.status = status;
    this.code = code;
  }
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
      return index.levels.map((entry) => mergeStoredSummary(entry, storage));
    },
    async loadLevel(fileName) {
      assertFileName(fileName);
      return readStored(storage, fileName) ?? await loadBundled(fetchImpl, fileName);
    },
    async saveLevel({ fileName, value, expectedVersion = "", saveAs = false } = {}) {
      assertFileName(fileName);
      const current = await this.loadLevel(fileName).catch((error) => {
        if (error instanceof WorkbenchApiError && error.status === 404) return null;
        throw error;
      });
      if (saveAs && current) {
        throw new WorkbenchApiError("文件已存在。", { status: 409, code: "file-exists" });
      }
      if (!saveAs && current?.version !== expectedVersion) {
        throw new WorkbenchApiError("浏览器版本已变化。", { status: 409, code: "version-conflict" });
      }
      const saved = makeLocalRecord(fileName, synchronizeLevelData(value), now());
      writeStored(storage, fileName, saved);
      return clone(saved);
    },
    async login() { return { authenticated: true }; },
    async logout() { return { authenticated: true }; },
    blockImageUrl(type) { return `./assets/blocks/block_${encodeURIComponent(type)}.png`; },
    async resetLevel(fileName) {
      assertFileName(fileName);
      removeStored(storage, fileName);
      return loadBundled(fetchImpl, fileName);
    },
  };
}

function assertFileName(fileName) {
  if (typeof fileName !== "string" || !FILE_NAME_PATTERN.test(fileName)) {
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
  const value = await fetchJson(fetchImpl, `./levels/${fileName}`);
  return makeBundledRecord(fileName, value);
}

function mergeStoredSummary(entry, storage) {
  const summary = clone(entry);
  const stored = readStored(storage, entry.fileName);
  if (!stored) return { ...summary, local: false };
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
  };
}

function makeLocalRecord(fileName, value, updatedAt) {
  const clonedValue = clone(value);
  return {
    fileName,
    value: clonedValue,
    version: `local-${stableHash({ fileName, value: clonedValue, updatedAt })}`,
    updatedAt,
    local: true,
  };
}

function synchronizeLevelData(value) {
  const copy = clone(value);
  if (Array.isArray(copy?.tiles)) {
    copy.designerNote = copy.designerNote && typeof copy.designerNote === "object" ? copy.designerNote : {};
    copy.designerNote.levelData = clone(copy.tiles);
  }
  return copy;
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

function removeStored(storage, fileName) {
  try {
    storage?.removeItem(storageKey(fileName));
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
