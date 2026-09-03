function itemId(item) {
  return Number.isInteger(item?.id) ? item.id : Number.MAX_SAFE_INTEGER;
}

function timeValue(item) {
  const value = Date.parse(item?.obtainedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function activityValue(item) {
  return Number.isFinite(item?.activitySort) ? item.activitySort : Number.POSITIVE_INFINITY;
}

export function ownedTrinkets(items) {
  return (Array.isArray(items) ? items : []).filter((item) => Number.isInteger(item.ownedCount) && item.ownedCount > 0);
}

export function sortTrinkets(items, mode = "default") {
  const source = Array.isArray(items) ? items.slice() : [];
  return source.sort((left, right) => {
    if (mode === "recent") return timeValue(right) - timeValue(left) || itemId(left) - itemId(right);
    if (mode === "name") return String(left?.pinyin || "").localeCompare(String(right?.pinyin || ""), "en") || itemId(left) - itemId(right);
    if (mode === "quantity") return Number(right?.ownedCount || 0) - Number(left?.ownedCount || 0) || itemId(left) - itemId(right);
    if (mode === "activity") return activityValue(left) - activityValue(right) || itemId(left) - itemId(right);
    return Number(Boolean(right?.isNew)) - Number(Boolean(left?.isNew)) || itemId(left) - itemId(right);
  });
}

export function availableGiftCount(item, equippedItemId, lockedCount = 0) {
  const ownedCount = Number.isInteger(item?.ownedCount) ? item.ownedCount : 0;
  const locked = Number.isInteger(lockedCount) && lockedCount > 0 ? lockedCount : 0;
  return Math.max(0, ownedCount - (item?.id === equippedItemId ? 1 : 0) - locked);
}

export function applyGiftPreview(items, itemIdToGift) {
  return (Array.isArray(items) ? items : []).map((item) => {
    if (item.id !== itemIdToGift || !Number.isInteger(item.ownedCount) || item.ownedCount < 1) return { ...item };
    return { ...item, ownedCount: item.ownedCount - 1 };
  });
}
