import html2canvas from "html2canvas";

function assertFinite(value, path = "report", seen = new WeakSet()) {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${path} 不是有限数值，分析结果不能导出。`);
  }
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) throw new Error(`${path} 存在循环引用，分析结果不能导出。`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFinite(entry, `${path}[${index}]`, seen));
  } else {
    for (const [key, entry] of Object.entries(value)) {
      assertFinite(entry, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function shortHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function safePart(value, maxLength = 64) {
  const safe = String(value ?? "level")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "level";
  const characters = Array.from(safe);
  if (characters.length <= maxLength) return safe;
  return `${characters.slice(0, maxLength - 9).join("")}-${shortHash(safe)}`;
}

export function buildReportFilename(comparison, extension) {
  const partLength = comparison?.model?.id ? 56 : 64;
  const leftId = safePart(comparison?.left?.level?.id, partLength);
  const rightId = safePart(comparison?.right?.level?.id, partLength);
  const suffix = safePart(extension, 8).toLowerCase();
  const model = comparison?.model?.id ? `-${safePart(comparison.model.id, 16)}` : "";
  return `V曲线-${leftId}-vs-${rightId}${model}.${suffix}`;
}

export function serializeReportJson(comparison) {
  if (comparison?.schemaVersion !== "vcurve-comparison/2") {
    throw new Error("报告 schemaVersion 无效，无法导出。");
  }
  assertFinite(comparison);
  return JSON.stringify(comparison, null, 2);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadReportJson(comparison) {
  const text = serializeReportJson(comparison);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  downloadBlob(blob, buildReportFilename(comparison, "json"));
}

export async function downloadReportPng(element, comparison) {
  const canvas = await html2canvas(element, {
    backgroundColor: "#090d14",
    scale: 2,
    logging: false,
    useCORS: false,
  });
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("PNG 编码失败。"));
    }, "image/png");
  });
  downloadBlob(blob, buildReportFilename(comparison, "png"));
}
