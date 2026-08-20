import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSources } from "../projects/gamespec-relay/app/core/analyzer.js";
import { diffDeliveryPacks } from "../projects/gamespec-relay/app/core/diff.js";
import { toCodexContext, toJson, toMarkdown, toTaskCsv } from "../projects/gamespec-relay/app/core/exporters.js";
import { BOSS_PHASE_SAMPLE, GAME_GLOSSARY } from "../projects/gamespec-relay/app/data/boss-phase-sample.js";

function versions() {
  const v1 = analyzeSources({
    projectName: BOSS_PHASE_SAMPLE.projectName,
    sources: BOSS_PHASE_SAMPLE.sources,
    glossary: GAME_GLOSSARY,
    version: "V1",
  });
  const v2 = structuredClone(v1);
  v2.project.version = "V2";
  const clientTask = v2.tasks.find((task) => task.role === "客户端");
  clientTask.acceptanceCriteria = clientTask.acceptanceCriteria.map((criterion) =>
    criterion.includes("回落至 20%") ? "红屏峰值为 55%，结束时回落至 20%" : criterion,
  );
  const audioTask = v2.tasks.find((task) => task.role === "音频");
  audioTask.outputs = ["阶段爆发音", "前摇音新版本 B"];
  v2.questions = v2.questions.map((item) => ({ ...item, status: "confirmed", answer: item.title.includes("前摇音") ? "采用新版本 B" : "排除战斗 UI" }));
  v2.tests.push({
    id: "TEST-HIT-STUN-DELAY",
    type: "boundary",
    title: "硬直结束后延迟进入二阶段",
    preconditions: ["Boss 在硬直中跨过 40% 血量"],
    steps: ["等待硬直结束"],
    expected: ["0.1 秒内进入二阶段"],
    taskIds: [clientTask.id],
    evidence: clientTask.evidence,
  });
  return { v1, v2, clientTask };
}

test("V2 diff returns task changes and affected regression tests", () => {
  const { v1, v2, clientTask } = versions();
  const impact = diffDeliveryPacks(v1, v2);

  assert.ok(impact.tasks.modified.some((item) => item.after.id === clientTask.id));
  assert.ok(impact.tests.added.some((item) => item.id === "TEST-HIT-STUN-DELAY"));
  assert.ok(impact.affectedTests.some((item) => item.taskIds.includes(clientTask.id)));
  assert.ok(impact.summary.changed >= 3);
});

test("exports use current edited state and escape CSV safely", () => {
  const { v2 } = versions();
  v2.tasks[0].title = "确认触发、数值与范围";
  v2.tasks[0].objective = "处理包含 \"引号\" 与\n换行的内容";

  const markdown = toMarkdown(v2);
  const json = toJson(v2);
  const csv = toTaskCsv(v2);
  const codex = toCodexContext(v2);

  assert.match(markdown, /# Boss 二阶段压迫感增强 · V2/);
  assert.match(markdown, /采用新版本 B/);
  assert.deepEqual(JSON.parse(json).tasks[0].title, "确认触发、数值与范围");
  assert.match(csv, /^id,role,title,priority,status,objective,dependencies,acceptanceCriteria/m);
  assert.match(csv, /"确认触发、数值与范围"/);
  assert.match(csv, /"处理包含 ""引号"" 与\n换行的内容"/);
  assert.match(codex, /验收标准/);
  assert.match(codex, /未决阻塞/);
});
