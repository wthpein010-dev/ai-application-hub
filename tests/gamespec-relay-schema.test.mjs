import test from "node:test";
import assert from "node:assert/strict";

import { BOSS_PHASE_SAMPLE } from "../projects/gamespec-relay/app/data/boss-phase-sample.js";
import {
  assertDeliveryPack,
  createEmptyDeliveryPack,
  normalizeDeliveryPack,
} from "../projects/gamespec-relay/app/core/schema.js";

test("DeliveryPack starts with every required collection", () => {
  const pack = createEmptyDeliveryPack({
    projectName: "Boss 二阶段",
    sources: BOSS_PHASE_SAMPLE.sources,
  });

  assert.deepEqual(Object.keys(pack), [
    "project",
    "sources",
    "decisions",
    "questions",
    "scope",
    "tasks",
    "tests",
    "risks",
    "health",
  ]);
  assert.equal(pack.sources.length, 2);
  assert.doesNotThrow(() => assertDeliveryPack(pack));
});

test("normalization keeps stable IDs and removes unsafe unknown fields", () => {
  const pack = normalizeDeliveryPack({
    project: { name: "Boss 二阶段", version: "V2", injected: "no" },
    sources: [{ id: "chat", title: "群聊", content: "二阶段红屏。" }],
    decisions: [{ id: "DEC-RED", title: "红屏", detail: "加强红屏", evidence: [{ sourceId: "chat", quote: "二阶段红屏。" }] }],
    questions: [],
    scope: { inScope: ["表现增强"], outOfScope: [] },
    tasks: [],
    tests: [],
    risks: [],
    health: {},
    unknown: "drop-me",
  });

  assert.equal(pack.project.version, "V2");
  assert.equal(pack.decisions[0].id, "DEC-RED");
  assert.equal("unknown" in pack, false);
  assert.equal("injected" in pack.project, false);
  assert.doesNotThrow(() => assertDeliveryPack(pack));
});

test("schema rejects evidence that points at an absent source", () => {
  const pack = createEmptyDeliveryPack({ projectName: "Boss 二阶段", sources: [] });
  pack.decisions.push({
    id: "DEC-BAD",
    title: "错误证据",
    detail: "不可接受",
    confidence: 1,
    evidence: [{ sourceId: "missing", quote: "不存在" }],
  });

  assert.throws(() => assertDeliveryPack(pack), /missing source/i);
});
