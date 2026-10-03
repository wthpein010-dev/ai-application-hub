import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server renders the conversation-first 思维导图快捷工具 workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();

  assert.match(html, /<title>思维导图快捷工具<\/title>/i);
  assert.match(html, /AI 脑图搭档/);
  assert.match(html, /只管说想法，结构与排版交给我/);
  assert.match(html, /新品发布会策划/);
  assert.match(html, /导出/);
  assert.match(html, /自动整理/);
  assert.match(html, /演示模式/);
  assert.match(html, /大纲模式/);
  assert.match(html, /鱼骨图/);
  assert.match(html, /Ollama/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);
});

test("workspace exposes accessible primary actions", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /aria-label="发送消息"/);
  assert.match(html, /aria-label="打开设置"/);
  assert.match(html, /aria-label="撤销"/);
  assert.match(html, /aria-label="重做"/);
  assert.match(html, /aria-label="缩小画布"/);
  assert.match(html, /aria-label="放大画布"/);
  assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*>脑图视图/);
  assert.match(html, /<button[^>]*aria-pressed="true"[^>]*>[\s\S]*?左右脑图<\/button>/);
  assert.match(html, /aria-label="全屏查看"[^>]*aria-pressed="false"/);
  assert.match(html, /aria-label="重命名核心目标"/);
  assert.match(html, /role="status"[^>]*aria-live="polite"/);
  assert.match(html, /class="canvas-export-status"[^>]*role="status"[^>]*aria-live="polite"/);
});
