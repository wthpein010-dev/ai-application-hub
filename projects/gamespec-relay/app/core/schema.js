const PACK_KEYS = [
  "project",
  "sources",
  "decisions",
  "questions",
  "scope",
  "tasks",
  "tests",
  "risks",
  "health",
];

const text = (value, fallback = "") => (typeof value === "string" ? value.trim() : fallback);
const texts = (value) => (Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []);
const number = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const bounded = (value, fallback = 0) => Math.max(0, Math.min(100, number(value, fallback)));

function slug(value, prefix) {
  const normalized = text(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${prefix}-${normalized || "item"}`.toUpperCase();
}

function evidenceList(value) {
  return Array.isArray(value)
    ? value
        .map((item) => ({
          sourceId: text(item?.sourceId),
          quote: text(item?.quote),
          location: text(item?.location),
        }))
        .filter((item) => item.sourceId && item.quote)
    : [];
}

function normalizeDecision(item, index) {
  const title = text(item?.title, `决定 ${index + 1}`);
  return {
    id: text(item?.id, slug(title, "DEC")),
    title,
    detail: text(item?.detail),
    confidence: Math.max(0, Math.min(1, number(item?.confidence, 0.7))),
    evidence: evidenceList(item?.evidence),
  };
}

function normalizeQuestion(item, index) {
  const title = text(item?.title, item?.question ? text(item.question) : `待确认问题 ${index + 1}`);
  return {
    id: text(item?.id, slug(title, "Q")),
    title,
    detail: text(item?.detail, text(item?.question)),
    blockerLevel: ["hard", "recommended", "later"].includes(item?.blockerLevel) ? item.blockerLevel : "recommended",
    ownerRole: text(item?.ownerRole, "策划"),
    status: ["open", "confirmed", "deferred"].includes(item?.status) ? item.status : "open",
    answer: text(item?.answer),
    evidence: evidenceList(item?.evidence),
  };
}

function normalizeTask(item, index) {
  const role = text(item?.role, "策划");
  const title = text(item?.title, `任务 ${index + 1}`);
  return {
    id: text(item?.id, slug(`${role}-${title}`, "TASK")),
    role,
    title,
    objective: text(item?.objective),
    inputs: texts(item?.inputs),
    outputs: texts(item?.outputs),
    dependencies: texts(item?.dependencies),
    acceptanceCriteria: texts(item?.acceptanceCriteria),
    priority: ["P0", "P1", "P2"].includes(item?.priority) ? item.priority : "P1",
    status: ["draft", "ready", "blocked", "done"].includes(item?.status) ? item.status : "draft",
    risk: ["low", "medium", "high"].includes(item?.risk) ? item.risk : "medium",
    evidence: evidenceList(item?.evidence),
  };
}

function normalizeTest(item, index) {
  const title = text(item?.title, `测试 ${index + 1}`);
  return {
    id: text(item?.id, slug(title, "TEST")),
    type: ["functional", "boundary", "recovery", "compatibility", "performance"].includes(item?.type)
      ? item.type
      : "functional",
    title,
    preconditions: texts(item?.preconditions),
    steps: texts(item?.steps),
    expected: texts(item?.expected),
    taskIds: texts(item?.taskIds),
    evidence: evidenceList(item?.evidence),
  };
}

function normalizeRisk(item, index) {
  const title = text(item?.title, `风险 ${index + 1}`);
  return {
    id: text(item?.id, slug(title, "RISK")),
    title,
    probability: ["low", "medium", "high"].includes(item?.probability) ? item.probability : "medium",
    impact: ["low", "medium", "high"].includes(item?.impact) ? item.impact : "medium",
    mitigation: text(item?.mitigation),
    taskIds: texts(item?.taskIds),
    evidence: evidenceList(item?.evidence),
  };
}

export function createEmptyDeliveryPack({ projectName, sources = [], version = "V1", generatedAt } = {}) {
  return normalizeDeliveryPack({
    project: {
      name: text(projectName, "未命名游戏需求"),
      version,
      generatedAt: generatedAt || new Date(0).toISOString(),
      summary: "",
    },
    sources,
    decisions: [],
    questions: [],
    scope: { inScope: [], outOfScope: [] },
    tasks: [],
    tests: [],
    risks: [],
    health: {},
  });
}

export function normalizeDeliveryPack(value = {}) {
  const sourceItems = Array.isArray(value.sources) ? value.sources : [];
  const sources = sourceItems.map((source, index) => ({
    id: text(source?.id, `SRC-${index + 1}`),
    kind: ["chat", "document", "change", "text"].includes(source?.kind) ? source.kind : "text",
    title: text(source?.title, `来源 ${index + 1}`),
    content: typeof source?.content === "string" ? source.content.trim() : "",
  }));

  return {
    project: {
      name: text(value.project?.name, "未命名游戏需求"),
      version: text(value.project?.version, "V1"),
      generatedAt: text(value.project?.generatedAt, new Date(0).toISOString()),
      summary: text(value.project?.summary),
    },
    sources,
    decisions: (Array.isArray(value.decisions) ? value.decisions : []).map(normalizeDecision),
    questions: (Array.isArray(value.questions) ? value.questions : []).map(normalizeQuestion),
    scope: {
      inScope: texts(value.scope?.inScope),
      outOfScope: texts(value.scope?.outOfScope),
    },
    tasks: (Array.isArray(value.tasks) ? value.tasks : []).map(normalizeTask),
    tests: (Array.isArray(value.tests) ? value.tests : []).map(normalizeTest),
    risks: (Array.isArray(value.risks) ? value.risks : []).map(normalizeRisk),
    health: {
      completeness: bounded(value.health?.completeness),
      testability: bounded(value.health?.testability),
      blockerCount: Math.max(0, Math.round(number(value.health?.blockerCount))),
      dependencyRisk: bounded(value.health?.dependencyRisk),
      ready: value.health?.ready === true,
      findings: Array.isArray(value.health?.findings)
        ? value.health.findings.map((item) => ({ code: text(item?.code), message: text(item?.message), targetId: text(item?.targetId) })).filter((item) => item.code)
        : [],
    },
  };
}

export function assertDeliveryPack(value) {
  if (!value || typeof value !== "object") throw new TypeError("交付包必须是数据对象");
  for (const key of PACK_KEYS) {
    if (!(key in value)) throw new TypeError(`交付包缺少必要字段：${key}`);
  }
  for (const key of ["sources", "decisions", "questions", "tasks", "tests", "risks"]) {
    if (!Array.isArray(value[key])) throw new TypeError(`交付包字段必须是列表：${key}`);
  }
  const sourceIds = new Set(value.sources.map((source) => source.id));
  if (sourceIds.size !== value.sources.length || sourceIds.has("")) throw new TypeError("交付包来源编号必须唯一且不能为空");

  for (const item of [...value.decisions, ...value.questions, ...value.tasks, ...value.tests, ...value.risks]) {
    if (!item.id) throw new TypeError("交付包条目必须具有编号");
    for (const evidence of item.evidence || []) {
      if (!sourceIds.has(evidence.sourceId)) throw new TypeError(`Evidence references missing source ${evidence.sourceId}`);
      if (!evidence.quote) throw new TypeError(`Evidence for ${item.id} requires a quote`);
    }
  }
  return value;
}

export { PACK_KEYS };
