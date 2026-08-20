import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSources } from "../projects/gamespec-relay/app/core/analyzer.js";
import { BOSS_PHASE_SAMPLE, GAME_GLOSSARY } from "../projects/gamespec-relay/app/data/boss-phase-sample.js";

function analyze(version = "V1") {
  return analyzeSources({
    projectName: BOSS_PHASE_SAMPLE.projectName,
    sources: BOSS_PHASE_SAMPLE.sources,
    glossary: GAME_GLOSSARY,
    version,
  });
}

test("Boss sample becomes a cross-discipline delivery pack", () => {
  const pack = analyze();
  const roles = new Set(pack.tasks.map((task) => task.role));

  assert.ok(roles.size >= 5, `expected 5+ roles, received ${[...roles].join(", ")}`);
  assert.ok(pack.tasks.flatMap((task) => task.acceptanceCriteria).length >= 8);
  assert.ok(pack.tests.length >= 5);
  assert.ok(pack.questions.filter((item) => item.status === "open").length >= 2);
  assert.ok(pack.decisions.some((item) => /0\.6 秒/.test(`${item.title}${item.detail}`)));
  assert.ok(pack.scope.outOfScope.some((item) => item.includes("Boss 数值")));

  for (const item of [...pack.decisions, ...pack.questions, ...pack.tasks]) {
    assert.ok(item.evidence.length >= 1, `${item.id} needs evidence`);
  }
});

test("unresolved chat questions remain questions instead of invented decisions", () => {
  const pack = analyze();
  const unresolved = pack.questions.map((item) => `${item.title} ${item.detail}`).join("\n");
  const decisions = pack.decisions.map((item) => `${item.title} ${item.detail}`).join("\n");

  assert.match(unresolved, /前摇音/);
  assert.match(unresolved, /按钮|UI/);
  assert.doesNotMatch(decisions, /前摇音.*版本 [AB]/);
});

test("analysis IDs are stable across identical runs and version may change independently", () => {
  const v1 = analyze("V1");
  const v2 = analyze("V2");

  assert.deepEqual(v1.tasks.map((task) => task.id), v2.tasks.map((task) => task.id));
  assert.deepEqual(v1.tests.map((item) => item.id), v2.tests.map((item) => item.id));
  assert.equal(v2.project.version, "V2");
});
