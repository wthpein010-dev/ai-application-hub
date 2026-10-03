export interface HostedAIEnv {
  PLANMAP_AI_API_KEY?: string;
  PLANMAP_AI_BASE_URL?: string;
  PLANMAP_AI_MODEL?: string;
}

interface HostedRequest {
  message?: string;
  selectedId?: string | null;
  document?: { title?: string; nodes?: Array<{ id: string; title: string; children: string[] }> };
}

export async function handleHostedAI(request: Request, env: HostedAIEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  if (!env.PLANMAP_AI_API_KEY) return Response.json({ error: "思维导图快捷工具 AI 尚未配置" }, { status: 503 });
  let payload: HostedRequest;
  try { payload = await request.json() as HostedRequest; } catch { return Response.json({ error: "请求格式不正确" }, { status: 400 }); }
  const message = payload.message?.trim().slice(0, 4000);
  const nodes = payload.document?.nodes?.slice(0, 300) ?? [];
  if (!message || !payload.document?.title) return Response.json({ error: "缺少策划内容" }, { status: 400 });
  const endpoint = `${(env.PLANMAP_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "")}/chat/completions`;
  const prompt = `你是“思维导图快捷工具”的 AI 脑图搭档。只返回 JSON：{"reply":"自然具体的中文回复","operations":[{"type":"add-child","parentId":"存在的ID","title":"节点名"}|{"type":"rename","nodeId":"存在的ID","title":"新名字"}|{"type":"delete","nodeId":"非根节点ID"}|{"type":"set-layout","layout":"mindmap|right|tree|fishbone|logic|timeline"}],"requiresConfirmation":false}。用户无需先选择节点；按节点文字理解整体指令。大范围修改 requiresConfirmation=true。脑图：${JSON.stringify(nodes)}。选中节点：${payload.selectedId ?? "无"}。用户：${message}`;
  const upstream = await fetcher(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.PLANMAP_AI_API_KEY}` },
    body: JSON.stringify({ model: env.PLANMAP_AI_MODEL || "gpt-4.1-mini", temperature: 0.3, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
  });
  if (!upstream.ok) return Response.json({ error: `AI 服务暂时不可用（${upstream.status}）` }, { status: 502 });
  const result = await upstream.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = result.choices?.[0]?.message?.content;
  if (!content) return Response.json({ error: "AI 未返回有效内容" }, { status: 502 });
  return Response.json({ content });
}
