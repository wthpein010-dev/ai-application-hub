function finding(code, message, targetId = "", severity = "blocking") {
  return { code, message, targetId, severity };
}

function percentage(parts) {
  const totalWeight = parts.reduce((total, part) => total + part.weight, 0);
  const earned = parts.reduce((total, part) => total + (part.ok ? part.weight : 0), 0);
  return totalWeight ? Math.round((earned / totalWeight) * 100) : 0;
}

function evidenceCoverage(pack) {
  const items = [...pack.decisions, ...pack.questions, ...pack.tasks];
  return items.length > 0 && items.every((item) => Array.isArray(item.evidence) && item.evidence.length > 0);
}

function dependencyFindings(tasks) {
  const findings = [];
  const taskIds = new Set(tasks.map((task) => task.id));
  const graph = new Map(tasks.map((task) => [task.id, (task.dependencies || []).filter((id) => taskIds.has(id))]));

  for (const task of tasks) {
    for (const dependencyId of task.dependencies || []) {
      if (!taskIds.has(dependencyId)) {
        findings.push(finding(
          "dangling-dependency",
          `任务“${task.title}”依赖不存在的任务 ${dependencyId}。`,
          task.id,
        ));
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const cycleTargets = new Set();

  function visit(taskId, path) {
    if (visiting.has(taskId)) {
      const cycleStart = path.indexOf(taskId);
      for (const id of path.slice(cycleStart)) cycleTargets.add(id);
      return;
    }
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependencyId of graph.get(taskId) || []) visit(dependencyId, [...path, taskId]);
    visiting.delete(taskId);
    visited.add(taskId);
  }

  for (const taskId of taskIds) visit(taskId, []);
  if (cycleTargets.size) {
    findings.push(finding(
      "dependency-cycle",
      `任务依赖形成循环：${[...cycleTargets].join(" → ")}。`,
      [...cycleTargets][0],
    ));
  }
  return findings;
}

export function evaluateDeliveryPack(pack) {
  const findings = [];
  const openHardBlockers = pack.questions.filter(
    (question) => question.status === "open" && question.blockerLevel === "hard",
  );
  for (const question of openHardBlockers) {
    findings.push(finding(
      "open-hard-blocker",
      `未决硬阻塞：“${question.title}”。`,
      question.id,
    ));
  }

  findings.push(...dependencyFindings(pack.tasks));

  const completeness = percentage([
    { weight: 10, ok: Boolean(pack.project?.name && pack.project?.summary) },
    { weight: 10, ok: pack.sources.length > 0 },
    { weight: 15, ok: pack.decisions.length > 0 },
    { weight: 10, ok: pack.scope.inScope.length > 0 && pack.scope.outOfScope.length > 0 },
    { weight: 20, ok: pack.tasks.length > 0 },
    { weight: 15, ok: evidenceCoverage(pack) },
    { weight: 10, ok: pack.questions.length > 0 },
    { weight: 10, ok: pack.risks.length > 0 },
  ]);

  const tasksWithCriteria = pack.tasks.filter((task) => task.acceptanceCriteria.length > 0).length;
  const structuredTests = pack.tests.filter(
    (testCase) => testCase.steps.length > 0 && testCase.expected.length > 0 && testCase.taskIds.length > 0,
  ).length;
  const testability = Math.round(
    (pack.tasks.length ? (tasksWithCriteria / pack.tasks.length) * 60 : 0)
      + (pack.tests.length ? (structuredTests / pack.tests.length) * 25 : 0)
      + (pack.tests.some((testCase) => testCase.taskIds.length > 0) ? 15 : 0),
  );

  if (completeness < 80) {
    findings.push(finding("incomplete-pack", `交付完整度仅 ${completeness}%，需要补齐关键上下文。`, "project"));
  }
  if (testability < 80) {
    findings.push(finding("low-testability", `可测试度仅 ${testability}%，需要补齐验收标准或测试步骤。`, "tests"));
  }

  const dependencyProblems = findings.filter((item) =>
    item.code === "dependency-cycle" || item.code === "dangling-dependency",
  ).length;
  const dependencyRisk = Math.min(100, dependencyProblems * 50);
  const blockerCount = findings.filter((item) => item.severity === "blocking").length;

  return {
    completeness,
    testability,
    blockerCount,
    dependencyRisk,
    ready: blockerCount === 0,
    findings,
  };
}
