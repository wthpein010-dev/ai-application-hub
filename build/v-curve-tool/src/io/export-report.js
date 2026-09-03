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

function safePart(value) {
  return String(value ?? "level")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "level";
}

export function buildReportFilename(comparison, extension) {
  const pawsId = safePart(comparison?.paws?.level?.id);
  const suffix = safePart(extension).toLowerCase();
  return `V曲线-900121-vs-${pawsId}.${suffix}`;
}

export function serializeReportJson(comparison) {
  if (comparison?.schemaVersion !== "vcurve-comparison/1") {
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
