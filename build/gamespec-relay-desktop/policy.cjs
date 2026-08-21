"use strict";

const { Buffer } = require("node:buffer");

const MAX_EXPORT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "text/markdown",
  "application/json",
  "text/csv",
  "text/plain",
]);

function fileNameOnly(value) {
  return String(value || "")
    .split(/[\\/]/)
    .filter(Boolean)
    .at(-1) || "需求接力站-导出文件.txt";
}

function normalizeExportRequest(value) {
  const name = fileNameOnly(value?.name).replace(/[<>:"|?*\u0000-\u001f]/g, "-").slice(0, 160);
  const mime = String(value?.mime || "text/plain").split(";")[0].trim().toLowerCase();
  const content = typeof value?.content === "string" ? value.content : "";
  if (!ALLOWED_MIMES.has(mime)) throw new TypeError("不支持的导出格式");
  if (!content) throw new TypeError("导出内容不能为空");
  if (Buffer.byteLength(content, "utf8") > MAX_EXPORT_BYTES) throw new RangeError("导出内容超过 10 MB");
  return { name, mime, content };
}

function publicModelStatus(settings) {
  return {
    configured: Boolean(settings?.endpoint && settings?.model && settings?.encryptedApiKey),
  };
}

function normalizeModelSettings(value) {
  const endpoint = String(value?.endpoint || "").trim().replace(/\/+$/, "");
  const model = String(value?.model || "").trim();
  const apiKey = String(value?.apiKey || "");
  let parsed;
  try { parsed = new URL(endpoint); } catch { throw new TypeError("模型接口地址无效"); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new TypeError("模型接口地址只支持网页协议");
  if (!model || model.length > 160) throw new TypeError("模型名称无效");
  if (!apiKey || apiKey.length > 8192) throw new TypeError("访问密钥无效");
  return { endpoint, model, apiKey };
}

module.exports = {
  ALLOWED_MIMES,
  MAX_EXPORT_BYTES,
  normalizeExportRequest,
  normalizeModelSettings,
  publicModelStatus,
};
