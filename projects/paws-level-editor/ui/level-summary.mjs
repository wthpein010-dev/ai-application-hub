export function formatLevelId(level = {}) {
  const id = Number(level.id);
  if (level.id !== null && level.id !== undefined && Number.isInteger(id) && id >= 0) {
    return `#${String(id).padStart(4, "0")}`;
  }
  return level.broken ? "BROKEN" : "未编号";
}

export function formatLevelModifiedAt(modifiedAt) {
  const date = new Date(modifiedAt);
  if (Number.isNaN(date.getTime())) {
    return "日期未知";
  }
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${month}/${day}`;
}
