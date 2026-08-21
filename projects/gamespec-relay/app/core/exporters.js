function lines(items, render, empty = "- 无") {
  return items.length ? items.flatMap(render) : [empty];
}

function evidenceLines(evidence = []) {
  return evidence.map((item) => `  - 依据：${item.quote}（${item.sourceId}${item.location ? `，${item.location}` : ""}）`);
}

function questionState(question) {
  if (question.status === "confirmed") return `已确认：${question.answer || "未填写答案"}`;
  if (question.status === "deferred") return `已推迟：${question.answer || "未填写说明"}`;
  return question.blockerLevel === "hard" ? "未决硬阻塞" : "未决";
}

function versionLabel(version) {
  if (version === "V1") return "第一版";
  if (version === "V2") return "第二版";
  return version;
}

export function toMarkdown(pack) {
  const output = [
    `# ${pack.project.name} · ${versionLabel(pack.project.version)}`,
    "",
    pack.project.summary,
    "",
    "## 已确认决定",
    ...lines(pack.decisions, (decision) => [
      `- **${decision.title}**：${decision.detail}`,
      ...evidenceLines(decision.evidence),
    ]),
    "",
    "## 待确认与结论",
    ...lines(pack.questions, (question) => [
      `- **${question.title}**（${questionState(question)}）${question.detail ? `：${question.detail}` : ""}`,
      ...evidenceLines(question.evidence),
    ]),
    "",
    "## 范围",
    `- 范围内：${pack.scope.inScope.join("；") || "无"}`,
    `- 范围外：${pack.scope.outOfScope.join("；") || "无"}`,
    "",
    "## 跨职能任务",
    ...lines(pack.tasks, (task) => [
      `### ${task.id} · ${task.role} · ${task.title}`,
      `- 目标：${task.objective || "未填写"}`,
      `- 输出：${task.outputs.join("；") || "未填写"}`,
      `- 依赖：${task.dependencies.join("；") || "无"}`,
      `- 验收标准：${task.acceptanceCriteria.join("；") || "未填写"}`,
      ...evidenceLines(task.evidence),
      "",
    ]),
    "## 测试与风险",
    ...lines(pack.tests, (testCase) => [
      `- **${testCase.title}**：${testCase.expected.join("；") || "未填写预期"}`,
    ]),
    ...lines(pack.risks, (risk) => [`- 风险：**${risk.title}**；缓解：${risk.mitigation || "未填写"}`]),
  ];
  return `${output.join("\n").trim()}\n`;
}

export function toJson(pack) {
  return `${JSON.stringify(pack, null, 2)}\n`;
}

function csvCell(value) {
  const rendered = Array.isArray(value) ? value.join("；") : String(value ?? "");
  return `"${rendered.replaceAll('"', '""')}"`;
}

export function toTaskCsv(pack) {
  const header = "任务编号,职能,任务标题,优先级,状态,目标,依赖,验收标准";
  const rows = pack.tasks.map((task) => [
    task.id,
    task.role,
    task.title,
    task.priority,
    task.status,
    task.objective,
    task.dependencies,
    task.acceptanceCriteria,
  ].map(csvCell).join(","));
  return `${[header, ...rows].join("\n")}\n`;
}

export function toCodexContext(pack) {
  const blockers = pack.questions.filter((question) => question.status === "open");
  return [
    `# 开发助手交付上下文：${pack.project.name} · ${versionLabel(pack.project.version)}`,
    "",
    "## 工作目标",
    pack.project.summary || "按交付包完成实现。",
    "",
    "## 未决阻塞",
    ...lines(blockers, (question) => [
      `- [${question.blockerLevel === "hard" ? "硬阻塞" : "待确认"}] ${question.title}（负责人：${question.ownerRole}）`,
    ]),
    "",
    "## 执行任务与验收标准",
    ...lines(pack.tasks, (task) => [
      `### ${task.id} · ${task.role} · ${task.title}`,
      `目标：${task.objective || "未填写"}`,
      `依赖：${task.dependencies.join("、") || "无"}`,
      "验收标准：",
      ...lines(task.acceptanceCriteria, (criterion) => [`- ${criterion}`], "- 未填写"),
      "",
    ]),
    "## 回归测试",
    ...lines(pack.tests, (testCase) => [
      `- ${testCase.id}：${testCase.title}；预期：${testCase.expected.join("；") || "未填写"}`,
    ]),
    "",
    "只实现范围内事项；遇到未决硬阻塞时先停止相关任务，不得自行补写结论。",
  ].join("\n");
}
