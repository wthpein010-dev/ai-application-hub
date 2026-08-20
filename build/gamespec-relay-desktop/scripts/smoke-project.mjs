import assert from "node:assert/strict";
import { analyzeSources } from "../../../projects/gamespec-relay/app/core/analyzer.js";
import { toJson } from "../../../projects/gamespec-relay/app/core/exporters.js";
import { evaluateDeliveryPack } from "../../../projects/gamespec-relay/app/core/quality.js";
import { BOSS_PHASE_SAMPLE, GAME_GLOSSARY } from "../../../projects/gamespec-relay/app/data/boss-phase-sample.js";

const pack = analyzeSources({
  projectName: BOSS_PHASE_SAMPLE.projectName,
  sources: BOSS_PHASE_SAMPLE.sources,
  glossary: GAME_GLOSSARY,
});
const health = evaluateDeliveryPack(pack);
const exported = JSON.parse(toJson(pack));
assert.ok(exported.tasks.length >= 5);
assert.ok(exported.tasks.flatMap((task) => task.acceptanceCriteria).length >= 8);
assert.equal(health.blockerCount, 2);
console.log("GAMESPEC_RELAY_CORE_SMOKE_OK", JSON.stringify({ tasks: pack.tasks.length, tests: pack.tests.length }));
