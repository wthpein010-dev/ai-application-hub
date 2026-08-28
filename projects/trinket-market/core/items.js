const SORT_MODES = new Set(["manual", "id", "name", "acquired"]);

function text(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${label}不能为空`);
  return normalized;
}

function normalizeItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("物品数据格式无效");

  const id = Number(item.id);
  const acquired = Number(item.acquired);
  const value = Number(item.value);
  const change = Number(item.change);
  if (!Number.isInteger(id) || id <= 0) throw new TypeError("物品 ID 必须是正整数");
  if (!Number.isInteger(acquired) || acquired < 0) throw new TypeError("获得数量必须是非负整数");
  if (!Number.isFinite(value) || value < 0) throw new TypeError("参考估值必须是非负数字");
  if (!Number.isFinite(change)) throw new TypeError("涨跌幅必须是有效数字");

  return {
    id,
    name: text(item.name, "物品名字"),
    pinyin: text(item.pinyin, "名字拼音"),
    rarity: text(item.rarity, "稀有度"),
    acquired,
    value,
    change,
    image: text(item.image, "物品图片"),
  };
}

export function validateItems(input) {
  if (!Array.isArray(input) || input.length === 0) throw new TypeError("物品列表不能为空");
  const items = input.map(normalizeItem);
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new TypeError("物品 ID 不能重复");
  return items;
}

export function applyAcquisitionCounts(input, counts) {
  const items = validateItems(input);
  const source = counts && typeof counts === "object" && !Array.isArray(counts) ? counts : {};
  return items.map((item) => {
    const next = Number(source[item.id]);
    return Number.isInteger(next) && next >= 0 ? { ...item, acquired: next } : { ...item };
  });
}

export function sortItems(input, mode = "manual", direction = "asc", manualOrder = []) {
  const items = validateItems(input);
  const selectedMode = SORT_MODES.has(mode) ? mode : "manual";

  if (selectedMode === "manual") {
    const validIds = new Set(items.map((item) => item.id));
    const orderedIds = [];
    for (const value of Array.isArray(manualOrder) ? manualOrder : []) {
      const id = Number(value);
      if (validIds.has(id) && !orderedIds.includes(id)) orderedIds.push(id);
    }
    for (const item of items) if (!orderedIds.includes(item.id)) orderedIds.push(item.id);
    const byId = new Map(items.map((item) => [item.id, item]));
    return orderedIds.map((id) => byId.get(id));
  }

  const sign = direction === "desc" ? -1 : 1;
  return items.slice().sort((left, right) => {
    let compared = 0;
    if (selectedMode === "id") compared = left.id - right.id;
    if (selectedMode === "name") compared = left.pinyin.localeCompare(right.pinyin, "en");
    if (selectedMode === "acquired") compared = left.acquired - right.acquired;
    return compared === 0 ? left.id - right.id : compared * sign;
  });
}
