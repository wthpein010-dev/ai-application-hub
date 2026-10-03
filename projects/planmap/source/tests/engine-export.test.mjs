import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

import { interpretDemoMessage } from "../app/lib/demo-engine.ts";
import { applyOperations, createStarterDocument, findNode } from "../app/lib/mindmap.ts";
import { buildXMindArchive, toMarkdown } from "../app/lib/exporters.ts";
import { normalizeEndpoint, parseAIResponse } from "../app/lib/ai-client.ts";
import * as aiClient from "../app/lib/ai-client.ts";
import { handleHostedAI } from "../worker/ai.ts";

test("demo engine expands the selected node with planning-specific ideas", () => {
  const document = createStarterDocument();
  const selectedId = document.root.children[2].id;
  const result = interpretDemoMessage("展开这部分，补充三个可执行动作", document, selectedId);
  const next = applyOperations(document, result.operations);

  assert.match(result.reply, /传播节奏/);
  assert.equal(findNode(next.root, selectedId)?.children.length, 5);
  assert.deepEqual(
    findNode(next.root, selectedId)?.children.slice(-3).map((node) => node.title),
    ["内容种草", "渠道联动", "数据复盘"],
  );
});

test("demo engine renames and deletes a selected node from natural language", () => {
  const document = createStarterDocument();
  const selectedId = document.root.children[1].id;
  const renamedResult = interpretDemoMessage("把这个改成用户洞察", document, selectedId);
  const renamed = applyOperations(document, renamedResult.operations);
  assert.equal(findNode(renamed.root, selectedId)?.title, "用户洞察");

  const deletedResult = interpretDemoMessage("删除这个节点", renamed, selectedId);
  const deleted = applyOperations(renamed, deletedResult.operations);
  assert.equal(findNode(deleted.root, selectedId), undefined);
});

test("demo engine replaces an exact node text globally without a selection", () => {
  const document = createStarterDocument();
  const result = interpretDemoMessage("把核心目标改成品牌破圈", document, null);
  assert.equal(result.operations.length, 1);
  assert.deepEqual(result.operations[0], { type: "rename", nodeId: document.root.children[0].children[0].id, title: "品牌破圈" });
  assert.match(result.reply, /核心目标/);
  assert.match(result.reply, /品牌破圈/);
});

test("global replacement wins when the new text contains a layout keyword", () => {
  const document = createStarterDocument();
  const nodeId = document.root.children[0].children[0].id;
  const result = interpretDemoMessage("把核心目标改成鱼骨分析", document, null);

  assert.deepEqual(result.operations, [{ type: "rename", nodeId, title: "鱼骨分析" }]);
  assert.equal(result.operations.some((operation) => operation.type === "set-layout"), false);
});

test("selected-node pronouns rename instead of switching to a keyword layout", () => {
  const document = createStarterDocument();
  const nodeId = document.root.children[0].id;
  for (const [message, title] of [["把这个改成鱼骨分析", "鱼骨分析"], ["把选中节点改成横向增长", "横向增长"]]) {
    const result = interpretDemoMessage(message, document, nodeId);
    assert.deepEqual(result.operations, [{ type: "rename", nodeId, title }]);
    assert.equal(result.operations.some((operation) => operation.type === "set-layout"), false);
  }
});

test("provider presets reset endpoint, model and credentials without persisting API keys", () => {
  assert.equal(typeof aiClient.settingsForProvider, "function");
  assert.equal(typeof aiClient.toPersistentAISettings, "function");
  const openAI = { mode: "custom", provider: "openai", endpoint: "https://private.example/v1", model: "private-model", apiKey: "secret-key" };
  assert.deepEqual(aiClient.settingsForProvider(openAI, "ollama"), {
    mode: "custom", provider: "ollama", endpoint: "http://localhost:11434/v1", model: "qwen2.5:7b", apiKey: "",
  });
  assert.deepEqual(aiClient.toPersistentAISettings(openAI), {
    mode: "custom", provider: "openai", endpoint: "https://private.example/v1", model: "private-model",
  });
});

test("demo engine switches structure through conversation without a selected node", () => {
  const document = createStarterDocument();
  const result = interpretDemoMessage("切换成鱼骨图", document, null);
  assert.deepEqual(result.operations, [{ type: "set-layout", layout: "fishbone" }]);
  assert.match(result.reply, /鱼骨图/);
});

test("a broad planning request asks for confirmation before replacing the map", () => {
  const document = createStarterDocument();
  const result = interpretDemoMessage("重新做一个校园音乐节完整策划", document);

  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.operations[0]?.type, "replace-document");
  assert.match(result.reply, /整体重构/);
});

test("markdown export preserves the real node hierarchy", () => {
  const document = createStarterDocument();
  const markdown = toMarkdown(document);

  assert.match(markdown, /^# 新品发布会策划/m);
  assert.match(markdown, /- 目标与主题\n {2}- 核心目标\n {2}- 主题概念/);
  assert.match(markdown, /- 传播节奏/);
});

test("xmind export creates a valid archive with the document hierarchy", async () => {
  const document = createStarterDocument();
  const archive = await buildXMindArchive(document);
  const zip = await JSZip.loadAsync(archive);

  assert.deepEqual(Object.keys(zip.files).sort(), ["content.json", "manifest.json", "metadata.json"]);
  const content = JSON.parse(await zip.file("content.json").async("string"));
  assert.equal(content[0].rootTopic.title, "新品发布会");
  assert.equal(content[0].rootTopic.children.attached[0].title, "目标与主题");
});

test("AI response parser accepts fenced JSON and rejects unsafe operations", () => {
  const document = createStarterDocument();
  const selectedId = document.root.children[0].id;
  const parsed = parseAIResponse(`\`\`\`json\n{
    "reply": "已补充两个方向",
    "operations": [
      {"type":"add-child","parentId":"${selectedId}","title":"验证指标"},
      {"type":"delete","nodeId":"missing-node"}
    ]
  }\n\`\`\``, document);

  assert.equal(parsed.reply, "已补充两个方向");
  assert.deepEqual(parsed.operations, [{ type: "add-child", parentId: selectedId, title: "验证指标" }]);
  assert.throws(() => parseAIResponse("这不是 JSON", document), /无法解析/);
});

test("custom AI endpoint is normalized to chat completions", () => {
  assert.equal(normalizeEndpoint("https://api.openai.com/v1"), "https://api.openai.com/v1/chat/completions");
  assert.equal(normalizeEndpoint("https://example.com/v1/chat/completions/"), "https://example.com/v1/chat/completions");
});

test("hosted AI proxy keeps the secret server-side and forwards a bounded request", async () => {
  let forwarded;
  const response = await handleHostedAI(
    new Request("https://planmap.example/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "补充风险", document: { title: "测试", nodes: [{ id: "root", title: "测试", children: [] }] }, selectedId: "root" }) }),
    { PLANMAP_AI_API_KEY: "server-secret", PLANMAP_AI_BASE_URL: "https://ai.example/v1", PLANMAP_AI_MODEL: "planner-model" },
    async (url, init) => { forwarded = { url, init }; return Response.json({ choices: [{ message: { content: "{\"reply\":\"已完成\",\"operations\":[]}" } }] }); },
  );

  assert.equal(response.status, 200);
  assert.equal(forwarded.url, "https://ai.example/v1/chat/completions");
  assert.equal(forwarded.init.headers.Authorization, "Bearer server-secret");
  const body = JSON.parse(forwarded.init.body);
  assert.equal(body.model, "planner-model");
  assert.doesNotMatch(JSON.stringify(body), /server-secret/);
});

test("hosted AI proxy reports missing deployment configuration", async () => {
  const response = await handleHostedAI(new Request("https://planmap.example/api/ai", { method: "POST", body: "{}" }), {}, fetch);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "思维导图快捷工具 AI 尚未配置" });
});
