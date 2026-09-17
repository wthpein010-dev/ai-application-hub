import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyAcquisitionCounts,
  sortItems,
  validateItems,
} from "../projects/trinket-market/core/items.js";
import {
  loadLocalState,
  saveLocalState,
  validateImportedState,
} from "../projects/trinket-market/core/storage.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = resolve(root, "projects", "trinket-market");
const canonical = JSON.parse(readFileSync(resolve(projectRoot, "data", "items.json"), "utf8"));

test("canonical catalog keeps the 44 fully configured stable IDs with one bundled image each", () => {
  const items = validateItems(canonical);
  assert.deepEqual(items.map((item) => item.id), [...Array.from({ length: 42 }, (_, index) => index + 1), 48, 50]);
  assert.equal(new Set(items.map((item) => item.image)).size, 44);
  assert.equal(items.every((item) => existsSync(resolve(projectRoot, item.image))), true);
  assert.equal(items.every((item) => item.name && item.pinyin && item.rarity), true);
  assert.equal(canonical.every((item) => item.slot === "hand" && Number.isInteger(item.ownedCount) && item.ownedCount > 0), true);
  assert.equal(canonical.every((item) => item.acquisitionText && item.galleryDescription), true);
});

test("validation rejects duplicate IDs and invalid market values", () => {
  assert.throws(() => validateItems([{ ...canonical[0] }, { ...canonical[0] }]), /重复/);
  assert.throws(() => validateItems([{ ...canonical[0], acquired: -1 }]), /获得数量/);
  assert.throws(() => validateItems([{ ...canonical[0], value: Number.NaN }]), /估值/);
  assert.throws(() => validateItems([{ ...canonical[0], image: "https://example.com/tracker.png" }]), /本项目素材/);
});

test("acquisition bridge updates known non-negative integer counts only", () => {
  const updated = applyAcquisitionCounts(canonical, { 1: 20000, 2: -1, 3: 3.5, 99: 7 });
  assert.equal(updated.find((item) => item.id === 1).acquired, 20000);
  assert.equal(updated.find((item) => item.id === 2).acquired, 9186);
  assert.equal(updated.find((item) => item.id === 3).acquired, 14270);
  assert.equal(updated.some((item) => item.id === 99), false);
  assert.notEqual(updated, canonical);
});

test("sorting supports IDs, names, counts, and a complete manual order", () => {
  const sample = canonical.slice(0, 4);
  assert.deepEqual(sortItems(sample, "id", "desc").map((item) => item.id), [4, 3, 2, 1]);
  assert.deepEqual(sortItems(sample, "name", "asc").map((item) => item.id), [2, 1, 3, 4]);
  assert.deepEqual(sortItems(sample, "acquired", "desc").map((item) => item.id), [1, 3, 2, 4]);
  assert.deepEqual(sortItems(sample, "manual", "asc", [3, 1, 4, 2]).map((item) => item.id), [3, 1, 4, 2]);
});

test("manual sorting appends IDs absent from a stale saved order", () => {
  const sample = canonical.slice(0, 4);
  assert.deepEqual(sortItems(sample, "manual", "asc", [3, 1]).map((item) => item.id), [3, 1, 2, 4]);
});

test("imported state validates item data and repairs stale manual order", () => {
  const imported = validateImportedState({ version: 1, items: canonical, order: [3, 1, 99, 3] });
  assert.equal(imported.version, 1);
  assert.deepEqual(imported.order, [3, 1, ...canonical.map((item) => item.id).filter((id) => id !== 1 && id !== 3)]);
  assert.throws(() => validateImportedState({ version: 1, items: [canonical[0], canonical[0]], order: [] }), /重复/);
  assert.throws(() => validateImportedState({ version: 2, items: canonical, order: [] }), /版本/);
  assert.throws(() => validateImportedState({ version: 1, items: canonical.slice(0, 10), order: [] }), /完整包含/);
  assert.throws(() => validateImportedState({ version: 1, items: [...canonical.slice(0, 10), { ...canonical[10], id: 99 }], order: [] }), /完整包含/);
  assert.throws(() => validateImportedState({
    version: 1,
    items: canonical.map((item, index) => index === 0 ? { ...item, imageData: "data:image/png;base64,YmFk" } : item),
    order: [],
  }), /图片数据/);
  assert.throws(() => validateImportedState({ version: 1, items: canonical.slice(0, 11), order: [] }), /当前 44 件官方小物/);
});

test("legacy eleven-item browser state migrates custom fields and manual order onto the configured catalog", () => {
  const legacyItems = [
    { id: 1, name: "便携冰水壶", pinyin: "bianxiebingshuihu", rarity: "常见", acquired: 18342, value: 12.8, change: 2.4, image: "./assets/items/hand_1.png" },
    { id: 2, name: "橙香果汁箱", pinyin: "chengxiangguozhixiang", rarity: "稀有", acquired: 9186, value: 34.5, change: 5.1, image: "./assets/items/hand_2.png" },
    { id: 3, name: "热血篮球", pinyin: "rexuelanqiu", rarity: "进阶", acquired: 14270, value: 21.2, change: -1.3, image: "./assets/items/hand_3.png" },
    { id: 4, name: "告白玫瑰", pinyin: "gaobaimeigui", rarity: "史诗", acquired: 3210, value: 128, change: 12.8, image: "./assets/items/hand_4.png" },
    { id: 5, name: "远行手提箱", pinyin: "yuanxingshoutixiang", rarity: "稀有", acquired: 6024, value: 48.6, change: 3.7, image: "./assets/items/hand_5.png" },
    { id: 6, name: "青芽茶盏", pinyin: "qingyachazhan", rarity: "传说", acquired: 1688, value: 268, change: 18.2, image: "./assets/items/hand_6.png" },
    { id: 7, name: "幸运骨头", pinyin: "xingyungutou", rarity: "常见", acquired: 24105, value: 8.6, change: -0.8, image: "./assets/items/hand_7.png" },
    { id: 8, name: "深海猫罐头", pinyin: "shenhaimaoguantou", rarity: "进阶", acquired: 11602, value: 18.9, change: 1.9, image: "./assets/items/hand_8.png" },
    { id: 9, name: "蓝莓冰棍", pinyin: "lanmeibinggun", rarity: "稀有", acquired: 7480, value: 39.7, change: 6.4, image: "./assets/items/hand_9.png" },
    { id: 10, name: "奶牛小猫", pinyin: "nainiuxiaomao", rarity: "传说", acquired: 936, value: 520, change: 24.1, image: "./assets/items/hand_10.png" },
    { id: 11, name: "旧式捕虫网", pinyin: "jiushibuchongwang", rarity: "史诗", acquired: 2765, value: 156, change: -3.2, image: "./assets/items/hand_11.png" },
  ];
  legacyItems[0] = { ...legacyItems[0], name: "我的保温杯", acquired: 88 };
  const memory = new Map([["trinket-market-v1-data", JSON.stringify({ version: 1, items: legacyItems, order: [11, 1, 10] })]]);
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
  };

  const migrated = loadLocalState(storage, canonical);

  assert.equal(migrated.items.length, 44);
  assert.equal(migrated.items.find((item) => item.id === 1).name, "我的保温杯");
  assert.equal(migrated.items.find((item) => item.id === 1).acquired, 88);
  assert.deepEqual(migrated.order.slice(0, 5), [11, 1, 10, 2, 3]);
  assert.equal(JSON.parse(memory.get("trinket-market-v1-data")).items.length, 44);
});

test("browser state round-trips and corrupt saved data falls back safely", () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
  };
  const saved = saveLocalState(storage, { version: 1, items: canonical, order: [2, 1] });
  assert.equal(saved, true);
  assert.deepEqual(loadLocalState(storage).order.slice(0, 3), [2, 1, 3]);
  memory.set("trinket-market-v1-data", "{broken");
  assert.equal(loadLocalState(storage), null);
  assert.equal(saveLocalState({ setItem: () => { throw new Error("quota"); } }, { version: 1, items: canonical, order: [] }), false);
});
