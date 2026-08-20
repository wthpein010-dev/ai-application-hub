import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSources } from "../projects/gamespec-relay/app/core/analyzer.js";
import { evaluateDeliveryPack } from "../projects/gamespec-relay/app/core/quality.js";
import { BOSS_PHASE_SAMPLE, GAME_GLOSSARY } from "../projects/gamespec-relay/app/data/boss-phase-sample.js";

function samplePack() {
  return analyzeSources({
    projectName: BOSS_PHASE_SAMPLE.projectName,
    sources: BOSS_PHASE_SAMPLE.sources,
    glossary: GAME_GLOSSARY,
  });
}

test("open hard blockers keep an otherwise complete delivery pack in draft", () => {
  const result = evaluateDeliveryPack(samplePack());

  assert.equal(result.ready, false);
  assert.equal(result.blockerCount, 2);
  assert.ok(result.completeness >= 80);
  assert.ok(result.testability >= 80);
  assert.ok(result.findings.some((item) => item.code === "open-hard-blocker"));
});

test("quality gate reports circular and dangling dependencies", () => {
  const pack = samplePack();
  pack.questions = pack.questions.map((item) => ({ ...item, status: "confirmed", answer: "已确认" }));
  pack.tasks[0].dependencies = [pack.tasks[1].id];
  pack.tasks[1].dependencies = [pack.tasks[0].id, "TASK-MISSING"];

  const result = evaluateDeliveryPack(pack);

  assert.equal(result.ready, false);
  assert.ok(result.findings.some((item) => item.code === "dependency-cycle"));
  assert.ok(result.findings.some((item) => item.code === "dangling-dependency" && item.targetId === pack.tasks[1].id));
});

test("confirmed questions and valid dependencies produce a ready pack", () => {
  const pack = samplePack();
  pack.questions = pack.questions.map((item) => ({ ...item, status: "confirmed", answer: "已由制作人确认" }));

  const result = evaluateDeliveryPack(pack);

  assert.equal(result.ready, true);
  assert.equal(result.blockerCount, 0);
  assert.equal(result.findings.filter((item) => item.severity === "blocking").length, 0);
});
