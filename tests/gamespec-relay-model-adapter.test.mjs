import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSources } from "../projects/gamespec-relay/app/core/analyzer.js";
import { runCompatibleModel } from "../projects/gamespec-relay/app/core/model-adapter.js";
import { BOSS_PHASE_SAMPLE, GAME_GLOSSARY } from "../projects/gamespec-relay/app/data/boss-phase-sample.js";

function validPack() {
  return analyzeSources({
    projectName: BOSS_PHASE_SAMPLE.projectName,
    sources: BOSS_PHASE_SAMPLE.sources,
    glossary: GAME_GLOSSARY,
  });
}

test("compatible model response is normalized and the key stays outside the request body and result", async () => {
  const pack = validPack();
  pack.project.name = `  ${pack.project.name}  `;
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(pack)}\n\`\`\`` } }] };
      },
    };
  };

  const result = await runCompatibleModel({
    endpoint: "https://model.example/v1/",
    model: "relay-model",
    apiKey: "sk-request-only",
    sources: BOSS_PHASE_SAMPLE.sources,
    fetchImpl,
  });

  assert.equal(captured.url, "https://model.example/v1/chat/completions");
  assert.equal(captured.options.headers.authorization, "Bearer sk-request-only");
  assert.doesNotMatch(captured.options.body, /sk-request-only/);
  assert.match(captured.options.body, /Boss 体验复盘群聊/);
  assert.equal(result.project.name, BOSS_PHASE_SAMPLE.projectName);
  assert.doesNotMatch(JSON.stringify(result), /sk-request-only/);
});

test("adapter rejects a structurally invalid DeliveryPack", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async json() { return { choices: [{ message: { content: "{}" } }] }; },
  });

  await assert.rejects(
    () => runCompatibleModel({ endpoint: "https://model.example/v1", model: "demo", apiKey: "secret", sources: [], fetchImpl }),
    /DeliveryPack/,
  );
});

test("HTTP failures expose only status and never echo credentials", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, async json() { return {}; } });
  const secret = "sk-private-error";

  await assert.rejects(
    () => runCompatibleModel({ endpoint: "https://model.example/v1", model: "demo", apiKey: secret, sources: [], fetchImpl }),
    (error) => error.message === "模型请求失败（HTTP 401）" && !error.message.includes(secret),
  );
});
