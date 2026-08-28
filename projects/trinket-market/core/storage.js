import { validateItems } from "./items.js";

export const DATA_STORAGE_KEY = "trinket-market-v1-data";
const IMAGE_DB_NAME = "trinket-market-v1-images";
const IMAGE_STORE_NAME = "images";

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
  if (typeof value !== "string" || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(value)) return false;
  const encoded = value.slice(value.indexOf(",") + 1);
  return Math.ceil(encoded.length * 0.75) <= 8 * 1024 * 1024;
}

export function validateImportedState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("导入文件格式无效");
  if (Number(value.version) !== 1) throw new TypeError("导入文件版本不受支持");
  const normalized = validateItems(value.items);
  const items = normalized.map((item, index) => {
    const imageData = value.items[index]?.imageData;
    return validImageData(imageData) ? { ...item, imageData } : item;
  });
  return { version: 1, items, order: normalizeOrder(items, value.order) };
}

export function loadLocalState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(DATA_STORAGE_KEY);
    return raw ? validateImportedState(JSON.parse(raw)) : null;
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
