import { findNode, flattenTree } from "./mindmap.ts";
import type { EngineResult, MindMapDocument, MindMapOperation } from "./types.ts";

export interface AISettings {
  mode: "demo" | "hosted" | "custom";
  provider?: "openai" | "ollama" | "lmstudio" | "localai";
  endpoint: string;
  model: string;
  apiKey: string;
}

export const providerDefaults = {
  ollama: { endpoint: "http://localhost:11434/v1", model: "qwen2.5:7b" },
  lmstudio: { endpoint: "http://localhost:1234/v1", model: "local-model" },
  localai: { endpoint: "http://localhost:8080/v1", model: "qwen2.5-7b-instruct" },
  openai: { endpoint: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
} as const;

export function settingsForProvider(settings: AISettings, provider: keyof typeof providerDefaults): AISettings {
  return { ...settings, mode: "custom", provider, ...providerDefaults[provider], apiKey: "" };
}

export function toPersistentAISettings(settings: AISettings): Omit<AISettings, "apiKey"> {
  return { mode: settings.mode, provider: settings.provider, endpoint: settings.endpoint, model: settings.model };
}

export function normalizeEndpoint(endpoint: string): string {
  const clean = endpoint.trim().replace(/\/+$/, "");
  return clean.endsWith("/chat/completions") ? clean : `${clean}/chat/completions`;
}

export function parseAIResponse(content: string, document: MindMapDocument): EngineResult {
  const clean = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error("无法解析 AI 返回的脑图操作，请换一种说法重试。");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("AI 返回格式不完整。");
  const value = parsed as { reply?: unknown; operations?: unknown; requiresConfirmation?: unknown };
  if (typeof value.reply !== "string" || !Array.isArray(value.operations)) throw new Error("AI 返回格式不完整。");
  const operations = value.operations.filter((candidate): candidate is MindMapOperation => {
    if (!candidate || typeof candidate !== "object") return false;
    const operation = candidate as Record<string, unknown>;
    if (operation.type === "add-child") return typeof operation.parentId === "string" && Boolean(findNode(document.root, operation.parentId)) && typeof operation.title === "string" && operation.title.trim().length > 0;
    if (operation.type === "rename") return typeof operation.nodeId === "string" && Boolean(findNode(document.root, operation.nodeId)) && typeof operation.title === "string" && operation.title.trim().length > 0;
    if (operation.type === "delete") return typeof operation.nodeId === "string" && operation.nodeId !== document.root.id && Boolean(findNode(document.root, operation.nodeId));
    if (operation.type === "set-layout") return typeof operation.layout === "string" && ["mindmap", "right", "tree", "fishbone", "logic", "timeline"].includes(operation.layout);
    return false;
  });
  return { reply: value.reply, operations, requiresConfirmation: Boolean(value.requiresConfirmation) };
}

export async function askCustomAI(message: string, document: MindMapDocument, selectedId: string | null, settings: AISettings): Promise<EngineResult> {
  if (!settings.endpoint.trim() || !settings.model.trim()) throw new Error("请先在设置中填写 API 地址和模型名称。");
  const nodes = flattenTree(document.root).map((node) => ({ id: node.id, title: node.title, children: node.children.map((child) => child.id) }));
  const prompt = `你是“思维导图快捷工具”的 AI 脑图搭档。把用户意图转为 JSON：{"reply":"自然、具体的中文回复","operations":[{"type":"add-child","parentId":"存在的节点ID","title":"节点名"}|{"type":"rename","nodeId":"存在的节点ID","title":"新名字"}|{"type":"delete","nodeId":"非根节点ID"}|{"type":"set-layout","layout":"mindmap|right|tree|fishbone|logic|timeline"}],"requiresConfirmation":false}。不要输出 JSON 以外的内容。用户不需要先选择节点；按文字定位相关节点。大范围内容重构设 requiresConfirmation=true。当前节点：${JSON.stringify(nodes)}。当前选中：${selectedId ?? "无"}。用户：${message}`;
  const response = await fetch(normalizeEndpoint(settings.endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) },
    body: JSON.stringify({ model: settings.model, temperature: 0.3, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
  });
  if (!response.ok) throw new Error(`AI 服务请求失败（${response.status}），请检查地址、模型、密钥或浏览器 CORS 设置。`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 服务没有返回可用内容。");
  return parseAIResponse(content, document);
}

export async function askHostedAI(message: string, document: MindMapDocument, selectedId: string | null): Promise<EngineResult> {
  const nodes = flattenTree(document.root).map((node) => ({ id: node.id, title: node.title, children: node.children.map((child) => child.id) }));
  const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, selectedId, document: { title: document.title, nodes } }) });
  const payload = await response.json() as { content?: string; error?: string };
  if (!response.ok) throw new Error(payload.error || "托管 AI 暂时不可用");
  if (!payload.content) throw new Error("托管 AI 没有返回可用内容");
  return parseAIResponse(payload.content, document);
}
