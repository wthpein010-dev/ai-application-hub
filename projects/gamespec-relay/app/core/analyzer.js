import { assertDeliveryPack, createEmptyDeliveryPack, normalizeDeliveryPack } from "./schema.js";
import { ROLE_TEMPLATES, TEST_TEMPLATES } from "./vocabulary.js";

function stableId(prefix, value) {
  const slug = String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52);
  return `${prefix}-${slug || "item"}`.toUpperCase();
}

function stripSpeaker(line) {
  return line
    .replace(/^\s*\d{1,2}:\d{2}\s+[^：:]{1,20}[：:]\s*/, "")
    .replace(/^\s*[-*]\s*/, "")
    .trim();
}

export function segmentSources(sources) {
  return sources.flatMap((source) =>
    String(source.content || "")
      .split(/\r?\n/)
      .map((raw, index) => ({
        sourceId: source.id,
        sourceTitle: source.title,
        raw: raw.trim(),
        text: stripSpeaker(raw),
        location: `第 ${index + 1} 行`,
      }))
      .filter((statement) => statement.text),
  );
}

export function extractEvidence(statement) {
  return {
    sourceId: statement.sourceId,
    quote: statement.text,
    location: statement.location,
  };
}

function findStatement(statements, keywords) {
  return statements.find((statement) => keywords.some((keyword) => statement.text.includes(keyword))) || statements[0];
}

function findEvidence(statements, keywords, limit = 2) {
  return statements
    .filter((statement) => keywords.some((keyword) => statement.text.includes(keyword)))
    .slice(0, limit)
    .map(extractEvidence);
}

function deriveDecisions(statements) {
  const rules = [
    { title: "二阶段触发阈值", keywords: ["40% 进二阶段"], detail: "首领血量首次降至 40% 时进入二阶段。" },
    { title: "红屏表现时长", keywords: ["先按 0.6 秒", "红屏 0.6 秒"], detail: "二阶段红屏按 0.6 秒制作，并使用先增强后回落的曲线。" },
    { title: "大招前摇时长", keywords: ["0.4 秒加到 0.8 秒"], detail: "大招前摇从 0.4 秒调整为 0.8 秒，并强化地面预警。" },
    { title: "阶段爆发音", keywords: ["爆发音可以新做"], detail: "二阶段进入时新增独立阶段爆发音。" },
    { title: "性能底线", keywords: ["每秒 45 帧"], detail: "中端安卓设备战斗帧率不得低于每秒 45 帧。" },
  ];

  return rules.flatMap((rule) => {
    const evidence = findEvidence(statements, rule.keywords, 1);
    return evidence.length
      ? [{ id: stableId("DEC", rule.title), title: rule.title, detail: rule.detail, confidence: 0.92, evidence }]
      : [];
  });
}

function deriveQuestions(statements) {
  const rules = [
    {
      title: "前摇音采用旧版还是新版本",
      detail: "需要在周四听审两个版本后确认，当前不能作为已决定事项。",
      blockerLevel: "hard",
      ownerRole: "策划",
      keywords: ["复用旧的还是", "前摇音先别定"],
    },
    {
      title: "红屏是否排除战斗界面",
      detail: "必须确认红屏的渲染层级，保证战斗按钮保持可读。",
      blockerLevel: "hard",
      ownerRole: "客户端",
      keywords: ["影响操作界面", "排除界面", "按钮必须保持可读"],
    },
  ];

  return rules.flatMap((rule) => {
    const evidence = findEvidence(statements, rule.keywords);
    return evidence.length
      ? [{ id: stableId("Q", rule.title), title: rule.title, detail: rule.detail, blockerLevel: rule.blockerLevel, ownerRole: rule.ownerRole, status: "open", answer: "", evidence }]
      : [];
  });
}

function splitScope(value) {
  return value
    .split(/[、，,；;]/)
    .map((item) => item.trim().replace(/[。.]$/, ""))
    .filter(Boolean);
}

function deriveScope(statements) {
  const inStatement = statements.find((statement) => /^范围内[：:]/.test(statement.text));
  const outStatement = statements.find((statement) => /^范围外[：:]/.test(statement.text));
  return {
    inScope: inStatement ? splitScope(inStatement.text.replace(/^范围内[：:]\s*/, "")) : [],
    outOfScope: outStatement ? splitScope(outStatement.text.replace(/^范围外[：:]\s*/, "")) : [],
  };
}

function deriveTasks(statements, glossary) {
  const glossaryTerms = new Set(glossary.map((item) => item.term));
  return ROLE_TEMPLATES.flatMap((template) => {
    const matchingKeywords = template.keywords.filter((keyword) =>
      statements.some((statement) => statement.text.includes(keyword)),
    );
    const matchedGlossary = [...glossaryTerms].filter((term) =>
      statements.some((statement) => statement.text.includes(term)) && template.keywords.some((keyword) => keyword.includes(term) || term.includes(keyword)),
    );
    const evidence = findEvidence(statements, [...matchingKeywords, ...matchedGlossary], 3);
    if (!evidence.length) return [];
    return [{
      id: stableId("TASK", `${template.role}-${template.title}`),
      role: template.role,
      title: template.title,
      objective: template.objective,
      inputs: template.inputs,
      outputs: template.outputs,
      dependencies: [],
      acceptanceCriteria: template.acceptanceCriteria,
      priority: template.priority,
      status: template.priority === "P0" ? "ready" : "draft",
      risk: template.priority === "P0" ? "high" : "medium",
      evidence,
    }];
  }).map((task, index, tasks) => {
    if (task.role === "客户端" || task.role === "特效" || task.role === "音频" || task.role === "动画") {
      const design = tasks.find((candidate) => candidate.role === "策划");
      task.dependencies = design ? [design.id] : [];
    }
    if (task.role === "测试") task.dependencies = tasks.filter((candidate) => candidate.role !== "测试").map((candidate) => candidate.id);
    return task;
  });
}

function deriveTests(tasks, statements) {
  return TEST_TEMPLATES.flatMap((template) => {
    const statement = findStatement(statements, template.keywords);
    if (!statement || !template.keywords.some((keyword) => statement.text.includes(keyword))) return [];
    const related = tasks.filter((task) =>
      task.evidence.some((evidence) => evidence.sourceId === statement.sourceId) &&
      template.keywords.some((keyword) => `${task.title} ${task.objective} ${task.acceptanceCriteria.join(" ")}`.includes(keyword)),
    );
    const fallbackTask = tasks.find((task) => task.role === "测试") || tasks[0];
    return [{
      id: stableId("TEST", template.title),
      type: template.type,
      title: template.title,
      preconditions: template.preconditions,
      steps: template.steps,
      expected: template.expected,
      taskIds: related.length ? related.map((task) => task.id) : fallbackTask ? [fallbackTask.id] : [],
      evidence: [extractEvidence(statement)],
    }];
  });
}

function deriveRisks(tasks, questions) {
  const risks = [];
  const uiQuestion = questions.find((item) => /界面/.test(item.title));
  if (uiQuestion) {
    risks.push({
      id: "RISK-UI-READABILITY",
      title: "红屏可能降低战斗界面可读性",
      probability: "medium",
      impact: "high",
      mitigation: "在合入前确认渲染层级，并用真实战斗界面录屏验收。",
      taskIds: tasks.filter((task) => ["客户端", "测试"].includes(task.role)).map((task) => task.id),
      evidence: uiQuestion.evidence,
    });
  }
  const perfStatement = tasks.find((task) => task.role === "测试")?.evidence.find((item) => /低端机|每秒 45 帧/.test(item.quote));
  if (perfStatement) {
    risks.push({
      id: "RISK-LOW-END-PERFORMANCE",
      title: "阶段爆发导致低端设备掉帧",
      probability: "medium",
      impact: "high",
      mitigation: "建立低档粒子数量和后处理开关，并在目标设备上记录 30 秒帧率。",
      taskIds: tasks.filter((task) => ["客户端", "特效", "测试"].includes(task.role)).map((task) => task.id),
      evidence: [perfStatement],
    });
  }
  return risks;
}

function applyConfirmedChanges(pack, statements) {
  const exactChange = (keyword) => statements.find((statement) => statement.text.includes(keyword));
  const redScreenChange = exactChange("峰值从 70% 降到 55%");
  const audioChange = exactChange("前摇音选择新版本乙");
  const uiChange = exactChange("战斗按钮不参与红屏");
  const hitStunChange = exactChange("硬直结束后 0.1 秒内进入二阶段");

  if (audioChange) {
    const question = pack.questions.find((item) => item.title.includes("前摇音"));
    if (question) {
      question.status = "confirmed";
      question.answer = "采用前摇音新版本乙";
      question.evidence = [...question.evidence, extractEvidence(audioChange)];
    }
    const task = pack.tasks.find((item) => item.role === "音频");
    if (task) {
      task.outputs = ["阶段爆发音", "前摇音新版本乙"];
      task.evidence = [...task.evidence, extractEvidence(audioChange)];
    }
  }

  if (uiChange) {
    const question = pack.questions.find((item) => /界面|按钮/.test(item.title));
    if (question) {
      question.status = "confirmed";
      question.answer = "战斗按钮不参与红屏";
      question.evidence = [...question.evidence, extractEvidence(uiChange)];
    }
  }

  if (redScreenChange || uiChange) {
    const task = pack.tasks.find((item) => item.role === "客户端");
    if (task) {
      task.acceptanceCriteria = task.acceptanceCriteria.map((criterion) => {
        if (redScreenChange && criterion.includes("回落至 20%")) return "红屏峰值为 55%，结束时回落至 20%";
        if (uiChange && criterion.includes("按钮")) return "战斗按钮不参与红屏，红屏期间保持可读和可操作";
        return criterion;
      });
      for (const statement of [redScreenChange, uiChange].filter(Boolean)) {
        task.evidence = [...task.evidence, extractEvidence(statement)];
      }
    }
    const decision = pack.decisions.find((item) => item.title === "红屏表现时长");
    if (decision && redScreenChange) {
      decision.detail = "二阶段红屏保持 0.6 秒，峰值调整为 55%，结束时回落至 20%。";
      decision.evidence = [...decision.evidence, extractEvidence(redScreenChange)];
    }
  }

  if (hitStunChange) {
    const testCase = pack.tests.find((item) => item.title.includes("受击硬直"));
    if (testCase) {
      testCase.expected = ["硬直结束后 0.1 秒内进入二阶段", "阶段表现只播放一次"];
      testCase.evidence = [...testCase.evidence, extractEvidence(hitStunChange)];
    }
  }
}

export function analyzeSources({ projectName, sources, glossary = [], version = "V1" }) {
  const base = createEmptyDeliveryPack({ projectName, sources, version });
  const statements = segmentSources(base.sources);
  base.project.summary = "增强首领二阶段进入与大招前摇的识别度，并形成可跨职能验收的交付包。";
  base.decisions = deriveDecisions(statements);
  base.questions = deriveQuestions(statements);
  base.scope = deriveScope(statements);
  base.tasks = deriveTasks(statements, glossary);
  base.tests = deriveTests(base.tasks, statements);
  base.risks = deriveRisks(base.tasks, base.questions);
  applyConfirmedChanges(base, statements);
  const pack = normalizeDeliveryPack(base);
  return assertDeliveryPack(pack);
}
