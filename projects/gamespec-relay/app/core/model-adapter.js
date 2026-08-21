import { assertDeliveryPack, normalizeDeliveryPack } from "./schema.js";

const REQUIRED_KEYS = [
  "project",
  "sources",
  "decisions",
  "questions",
  "scope",
  "tasks",
  "tests",
  "risks",
  "health",
];

function buildMessages(sources) {
  return [
    {
      role: "system",
      content: [
        "你是需求接力站。只返回一个符合约定结构的数据对象，不要解释。",
        "对象必须包含 project、sources、decisions、questions、scope、tasks、tests、risks、health。",
        "每个决定、问题和任务必须保留至少一条含 sourceId 与 quote 的 evidence。",
        "不得把未确认信息写成决定，也不得虚构来源。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({ sources }, null, 2),
    },
  ];
}

function extractContent(payload) {
  const content = payload?.choices?.[0]?.message?.content ?? payload?.output_text;
  if (typeof content === "object" && content !== null) return content;
  if (typeof content !== "string" || !content.trim()) {
    throw new TypeError("模型返回的交付包为空");
  }
  const withoutFence = content.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(withoutFence);
  } catch {
    throw new TypeError("模型返回的交付包不是有效数据");
  }
}

function validateModelPack(value) {
  if (!value || typeof value !== "object" || REQUIRED_KEYS.some((key) => !(key in value))) {
    throw new TypeError("模型返回的交付包缺少必要字段");
  }
  try {
    assertDeliveryPack(value);
    const pack = normalizeDeliveryPack(value);
    return assertDeliveryPack(pack);
  } catch {
    throw new TypeError("模型返回的交付包未通过本地验证");
  }
}

export async function runCompatibleModel({
  endpoint,
  model,
  apiKey = "",
  sources = [],
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedEndpoint = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!normalizedEndpoint) throw new TypeError("模型接口地址不能为空");
  if (!String(model || "").trim()) throw new TypeError("模型名称不能为空");
  if (typeof fetchImpl !== "function") throw new TypeError("模型请求需要 fetch 实现");

  const headers = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  let response;
  try {
    response = await fetchImpl(`${normalizedEndpoint}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: String(model).trim(),
        response_format: { type: "json_object" },
        messages: buildMessages(sources),
      }),
    });
  } catch {
    throw new Error("模型请求失败（网络错误）");
  }

  if (!response?.ok) throw new Error(`模型请求失败（HTTP ${response?.status || "未知"}）`);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new TypeError("模型返回的交付包响应不是有效数据");
  }
  return validateModelPack(extractContent(payload));
}

export { buildMessages };
