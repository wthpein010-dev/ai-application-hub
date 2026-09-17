import { validateItems } from "./items.js";

export const DATA_STORAGE_KEY = "trinket-market-v1-data";
const IMAGE_DB_NAME = "trinket-market-v1-images";
const IMAGE_STORE_NAME = "images";
const CANONICAL_IDS = Object.freeze([...Array.from({ length: 42 }, (_, index) => index + 1), 48, 50]);
const LEGACY_V1_IDS = Object.freeze(Array.from({ length: 11 }, (_, index) => index + 1));
const EDITABLE_ITEM_FIELDS = Object.freeze(["name", "pinyin", "rarity", "acquired", "value", "change"]);
const LEGACY_V1_ITEMS = Object.freeze([
  { id: 1, name: "便携冰水壶", pinyin: "bianxiebingshuihu", rarity: "常见", acquired: 18342, value: 12.8, change: 2.4 },
  { id: 2, name: "橙香果汁箱", pinyin: "chengxiangguozhixiang", rarity: "稀有", acquired: 9186, value: 34.5, change: 5.1 },
  { id: 3, name: "热血篮球", pinyin: "rexuelanqiu", rarity: "进阶", acquired: 14270, value: 21.2, change: -1.3 },
  { id: 4, name: "告白玫瑰", pinyin: "gaobaimeigui", rarity: "史诗", acquired: 3210, value: 128, change: 12.8 },
  { id: 5, name: "远行手提箱", pinyin: "yuanxingshoutixiang", rarity: "稀有", acquired: 6024, value: 48.6, change: 3.7 },
  { id: 6, name: "青芽茶盏", pinyin: "qingyachazhan", rarity: "传说", acquired: 1688, value: 268, change: 18.2 },
  { id: 7, name: "幸运骨头", pinyin: "xingyungutou", rarity: "常见", acquired: 24105, value: 8.6, change: -0.8 },
  { id: 8, name: "深海猫罐头", pinyin: "shenhaimaoguantou", rarity: "进阶", acquired: 11602, value: 18.9, change: 1.9 },
  { id: 9, name: "蓝莓冰棍", pinyin: "lanmeibinggun", rarity: "稀有", acquired: 7480, value: 39.7, change: 6.4 },
  { id: 10, name: "奶牛小猫", pinyin: "nainiuxiaomao", rarity: "传说", acquired: 936, value: 520, change: 24.1 },
  { id: 11, name: "旧式捕虫网", pinyin: "jiushibuchongwang", rarity: "史诗", acquired: 2765, value: 156, change: -3.2 },
]);

function hasExactIds(items, expected) {
  const ids = items.map((item) => item.id).sort((left, right) => left - right);
  return ids.length === expected.length && ids.every((id, index) => id === expected[index]);
}

function catalogRequirementMessage() {
  return "导入文件必须完整包含当前 44 件官方小物（HAND-0001 至 HAND-0042、HAND-0048、HAND-0050）";
}

function normalizeOrder(items, input) {
  const validIds = new Set(items.map((item) => item.id));
  const order = [];
  for (const value of Array.isArray(input) ? input : []) {
    const id = Number(value);
    if (validIds.has(id) && !order.includes(id)) order.push(id);
  }
  for (const item of items) if (!order.includes(item.id)) order.push(item.id);
  return order;
}

function validImageData(value) {
  const match = typeof value === "string" ? /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value) : null;
  if (!match || match[2].length % 4 !== 0) return false;
  let binary;
  try {
    binary = atob(match[2]);
  } catch {
    return false;
  }
  if (!binary.length || binary.length > 8 * 1024 * 1024) return false;
  const bytes = Array.from(binary.slice(0, 12), (character) => character.charCodeAt(0));
  if (match[1].toLowerCase() === "png") return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (match[1].toLowerCase() === "jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.slice(0, 4).map((byte) => String.fromCharCode(byte)).join("") === "RIFF"
    && bytes.slice(8, 12).map((byte) => String.fromCharCode(byte)).join("") === "WEBP";
}

function normalizeStateItems(value) {
  const normalized = validateItems(value.items);
  return normalized.map((item, index) => {
    const imageData = value.items[index]?.imageData;
    if (imageData === undefined) return item;
    if (!validImageData(imageData)) throw new TypeError(`HAND-${String(item.id).padStart(4, "0")} 的图片数据无效`);
    return { ...item, imageData };
  });
}

function migrateLegacyState(legacyItems, legacyOrder, canonicalItems) {
  const catalog = validateItems(canonicalItems);
  if (!hasExactIds(catalog, CANONICAL_IDS)) throw new TypeError(catalogRequirementMessage());
  const legacyById = new Map(legacyItems.map((item) => [item.id, item]));
  const baselineById = new Map(LEGACY_V1_ITEMS.map((item) => [item.id, item]));
  const items = catalog.map((item) => {
    const legacy = legacyById.get(item.id);
    const baseline = baselineById.get(item.id);
    if (!legacy || !baseline) return { ...item };
    const customFields = Object.fromEntries(EDITABLE_ITEM_FIELDS
      .filter((field) => legacy[field] !== baseline[field])
      .map((field) => [field, legacy[field]]));
    return legacy.imageData === undefined
      ? { ...item, ...customFields }
      : { ...item, ...customFields, imageData: legacy.imageData };
  });
  return { version: 1, items, order: normalizeOrder(items, legacyOrder) };
}

export function validateImportedState(value, canonicalItems = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("导入文件格式无效");
  if (Number(value.version) !== 1) throw new TypeError("导入文件版本不受支持");
  const items = normalizeStateItems(value);
  if (hasExactIds(items, CANONICAL_IDS)) return { version: 1, items, order: normalizeOrder(items, value.order) };
  if (canonicalItems && hasExactIds(items, LEGACY_V1_IDS)) return migrateLegacyState(items, value.order, canonicalItems);
  throw new TypeError(catalogRequirementMessage());
}

export function loadLocalState(storage = globalThis.localStorage, canonicalItems = null) {
  try {
    const raw = storage?.getItem(DATA_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const migrated = canonicalItems && Array.isArray(parsed?.items)
      && hasExactIds(validateItems(parsed.items), LEGACY_V1_IDS);
    const state = validateImportedState(parsed, canonicalItems);
    if (migrated) {
      try {
        storage?.setItem(DATA_STORAGE_KEY, JSON.stringify({
          ...state,
          items: state.items.map(({ imageData, ...item }) => item),
        }));
      } catch {
        // Migration remains usable even when browser storage has become read-only.
      }
    }
    return state;
  } catch {
    return null;
  }
}

export function saveLocalState(storage = globalThis.localStorage, value) {
  try {
    const validated = validateImportedState(value);
    const serializable = {
      ...validated,
      items: validated.items.map(({ imageData, ...item }) => item),
    };
    storage?.setItem(DATA_STORAGE_KEY, JSON.stringify(serializable));
    return true;
  } catch {
    return false;
  }
}

export function removeLocalState(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(DATA_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function openImageDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("当前浏览器不支持本地图片存储"));
      return;
    }
    const request = indexedDB.open(IMAGE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(IMAGE_STORE_NAME)) database.createObjectStore(IMAGE_STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地图片存储打开失败"));
  });
}

function withImageStore(mode, action) {
  return openImageDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(IMAGE_STORE_NAME, mode);
    const store = transaction.objectStore(IMAGE_STORE_NAME);
    let result;
    try {
      result = action(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("本地图片存储失败")); };
    transaction.onabort = transaction.onerror;
  }));
}

export function saveItemImage(id, blob) {
  if (!Number.isInteger(Number(id)) || !(blob instanceof Blob)) return Promise.reject(new TypeError("本地图片数据无效"));
  return withImageStore("readwrite", (store) => store.put({ id: Number(id), blob }));
}

export async function loadItemImages() {
  const database = await openImageDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(IMAGE_STORE_NAME, "readonly");
    const request = transaction.objectStore(IMAGE_STORE_NAME).getAll();
    request.onsuccess = () => resolve(new Map(request.result.map((record) => [Number(record.id), record.blob])));
    request.onerror = () => reject(request.error || new Error("本地图片读取失败"));
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error("本地图片读取失败")); };
  });
}

export function clearItemImages() {
  return withImageStore("readwrite", (store) => store.clear());
}

export function replaceItemImages(images) {
  const records = [...images].map(([id, blob]) => ({ id: Number(id), blob }));
  if (records.some(({ id, blob }) => !Number.isInteger(id) || !CANONICAL_IDS.includes(id) || !(blob instanceof Blob))) {
    return Promise.reject(new TypeError("本地图片数据无效"));
  }
  return withImageStore("readwrite", (store) => {
    store.clear();
    for (const record of records) store.put(record);
  });
}
