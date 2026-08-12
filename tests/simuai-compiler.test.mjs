import test from "node:test";
import assert from "node:assert/strict";

import {
  CompilerError,
  compileQuestion,
} from "../projects/simuai/core/compiler-client.mjs";
import { createSimuAiServer } from "../projects/simuai/server.mjs";
import { getExperiment } from "../projects/simuai/core/templates.mjs";
import { resolveQuestion } from "../projects/simuai/core/resolver.mjs";

test("compiler sends one request and accepts a valid experiment", async () => {
  let calls = 0;
  const experiment = getExperiment("sales-funnel");
  const result = await compileQuestion("帮我模拟销售漏斗", {
    fetchImpl: async (_url, options) => {
      calls += 1;
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(options.body).question, "帮我模拟销售漏斗");
      return new Response(JSON.stringify({ experiment }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.id, "sales-funnel");
  assert.equal(result.source, "ai");
});

test("compiler rejects invalid specs after exactly one request", async () => {
  let calls = 0;
  await assert.rejects(() => compileQuestion("帮我模拟风险", {
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ experiment: { modelType: "javascript" } }), { status: 200 });
    },
  }), error => error instanceof CompilerError && error.code === "INVALID_SPEC");
  assert.equal(calls, 1);
});

test("compiler validates question length before the network", async () => {
  let calls = 0;
  await assert.rejects(() => compileQuestion("短", {
    fetchImpl: async () => { calls += 1; },
  }), error => error.code === "UNSUPPORTED");
  assert.equal(calls, 0);
});

test("compiler maps timeout, offline and unsupported HTTP responses", async () => {
  await assert.rejects(() => compileQuestion("模拟一个新问题", {
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }),
  }), error => error.code === "TIMEOUT");

  await assert.rejects(() => compileQuestion("模拟一个新问题", {
    fetchImpl: async () => { throw new TypeError("network failed"); },
  }), error => error.code === "OFFLINE");

  await assert.rejects(() => compileQuestion("模拟一个新问题", {
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: "UNSUPPORTED" } }), { status: 422 }),
  }), error => error.code === "UNSUPPORTED");
});

test("proxy forwards a strict request without returning its secret", async t => {
  const secret = "secret-fixture-key";
  let upstreamBody;
  let upstreamAuthorization;
  const server = createSimuAiServer({
    apiKey: secret,
    model: "fixture-model",
    fetchImpl: async (_url, options) => {
      upstreamBody = JSON.parse(options.body);
      upstreamAuthorization = options.headers.authorization;
      const experiment = getExperiment("sales-funnel");
      return new Response(JSON.stringify({
        output_text: JSON.stringify(experiment),
      }), { status: 200 });
    },
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "帮我模拟销售漏斗" }),
  });
  const responseText = await response.text();

  assert.equal(response.status, 200);
  assert.equal(JSON.parse(responseText).experiment.id, "sales-funnel");
  assert.doesNotMatch(responseText, new RegExp(secret));
  assert.equal(upstreamAuthorization, `Bearer ${secret}`);
  assert.equal(upstreamBody.model, "fixture-model");
  assert.match(upstreamBody.input, /只返回 JSON/);
});

test("proxy rejects oversized, unsupported and unconfigured requests safely", async t => {
  const server = createSimuAiServer({ apiKey: "", fetchImpl: fetch });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();

  const unsupported = await fetch(`http://127.0.0.1:${port}/api/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "短" }),
  });
  assert.equal(unsupported.status, 422);

  const unavailable = await fetch(`http://127.0.0.1:${port}/api/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "这是一个可以量化的新问题" }),
  });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: { code: "OFFLINE" } });
});

test("resolver uses a strong local match without calling the compiler", async () => {
  let calls = 0;
  const result = await resolveQuestion("小游戏买量多久回本", {
    compileImpl: async () => { calls += 1; },
    cache: { get: () => null, set: () => {} },
  });

  assert.equal(result.experiment.id, "game-payback");
  assert.equal(result.mode, "local");
  assert.equal(calls, 0);
});

test("resolver compiles an unmatched question once and caches it", async () => {
  let calls = 0;
  let stored;
  const generated = getExperiment("sales-funnel");
  generated.source = "ai";
  const result = await resolveQuestion("量子香蕉天气", {
    compileImpl: async () => { calls += 1; return generated; },
    cache: { get: () => null, set: (question, spec) => { stored = { question, spec }; } },
  });

  assert.equal(result.mode, "ai");
  assert.equal(calls, 1);
  assert.equal(stored.question, "量子香蕉天气");
  assert.equal(stored.spec.id, "sales-funnel");
});

test("resolver keeps three offline recommendations when compilation fails", async () => {
  const result = await resolveQuestion("量子香蕉天气", {
    compileImpl: async () => { throw new CompilerError("OFFLINE", "offline"); },
    cache: { get: () => null, set: () => {} },
  });

  assert.equal(result.mode, "fallback");
  assert.equal(result.recommendations.length, 3);
  assert.equal(result.error.code, "OFFLINE");
});
