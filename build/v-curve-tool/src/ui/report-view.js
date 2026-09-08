import {
  VChart,
  createComparisonScales,
  reportToSeries,
} from "./chart.js";

let chartInstances = [];

function reportTitle(level, fallback) {
  if (!level) return fallback;
  return level.name || level.id || fallback;
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(value > 0 && value < 0.01 ? 1 : 0)}%` : "—";
}

export function formatBand(value) {
  if (!value) return "—";
  return `${formatNumber(value.p10)} / ${formatNumber(value.p50)} / ${formatNumber(value.p90)}`;
}

export function formatSampleCount(value) {
  if (!Number.isFinite(value?.samples) || !Number.isFinite(value?.sampleProgress)) return "—";
  return `${formatNumber(value.samples)} @${(value.sampleProgress * 100).toFixed(1)}%`;
}

function formatRiver(value) {
  return value ? `${formatNumber(value.lower)}–${formatNumber(value.upper)}` : "—";
}

export function comparisonText(leftValue, rightValue, suffix = "", rightId = "右侧") {
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return "样本不足";
  const difference = rightValue - leftValue;
  if (Math.abs(difference) < 0.05) return "基本一致";
  return `${rightId} ${difference > 0 ? "高" : "低"} ${formatNumber(Math.abs(difference))}${suffix}`;
}

function metricRow(documentRef, label, left, right, observation, detail = "") {
  const row = documentRef.createElement("tr");
  const labelCell = documentRef.createElement("td");
  labelCell.textContent = label;
  if (detail) {
    const small = documentRef.createElement("small");
    small.textContent = detail;
    labelCell.append(small);
  }
  for (const value of [left, right, observation]) {
    const cell = documentRef.createElement("td");
    cell.textContent = value;
    row.append(cell);
  }
  row.prepend(labelCell);
  return row;
}

function renderMetrics(root, left, right) {
  const documentRef = root.ownerDocument ?? globalThis.document;
  const leftMetrics = left.metrics;
  const rightMetrics = right.metrics;
  const rightId = right.level.id;
  const rows = [
    metricRow(documentRef, "砖数 / 层数 / 图案池",
      `${leftMetrics.tiles} / ${leftMetrics.layers} / ${leftMetrics.typePoolLabel}`,
      `${rightMetrics.tiles} / ${rightMetrics.layers} / ${rightMetrics.typePoolLabel}`,
      `${rightMetrics.tiles - leftMetrics.tiles >= 0 ? "+" : ""}${rightMetrics.tiles - leftMetrics.tiles} 砖`),
    metricRow(documentRef, "开局 V", formatNumber(leftMetrics.openingV), formatNumber(rightMetrics.openingV),
      comparisonText(leftMetrics.openingV, rightMetrics.openingV, "", rightId)),
    metricRow(documentRef, "MC @25%", formatBand(leftMetrics.mc25), formatBand(rightMetrics.mc25),
      comparisonText(leftMetrics.mc25?.p50, rightMetrics.mc25?.p50, " V", rightId), "MC P10 / MC P50 / MC P90"),
    metricRow(documentRef, "MC @50%", formatBand(leftMetrics.mc50), formatBand(rightMetrics.mc50),
      comparisonText(leftMetrics.mc50?.p50, rightMetrics.mc50?.p50, " V", rightId), "MC P10 / MC P50 / MC P90"),
    metricRow(documentRef, "MC 有效样本 @25% / @50%",
      `${formatSampleCount(leftMetrics.mc25)} / ${formatSampleCount(leftMetrics.mc50)}`,
      `${formatSampleCount(rightMetrics.mc25)} / ${formatSampleCount(rightMetrics.mc50)}`, "@ 后为实际采样进度；各进度独立统计"),
    metricRow(documentRef, "中盘河道范围", formatRiver(leftMetrics.midRiver), formatRiver(rightMetrics.midRiver), "T=1 边界范围", "河道下界(min)–河道上界(max) @50%"),
    metricRow(documentRef, "河道下界(min)窄口", `${leftMetrics.lowerDeadlocks} 次`, `${rightMetrics.lowerDeadlocks} 次`,
      `平均止于 ${formatPercent(rightMetrics.lowerDeadlockAverageProgress)}`, "无槽有限重启"),
    metricRow(documentRef, "无道具清盘率", formatPercent(leftMetrics.completionRate), formatPercent(rightMetrics.completionRate),
      comparisonText(leftMetrics.completionRate * 100, rightMetrics.completionRate * 100, " 个百分点", rightId)),
    metricRow(documentRef, "卡死局平均止点", formatPercent(leftMetrics.averageDeadlockProgress), formatPercent(rightMetrics.averageDeadlockProgress),
      "指定策略与槽位"),
  ];
  root.querySelector("#metrics-body").replaceChildren(...rows);
}

export function createDiagnosticCard(entry, documentRef = globalThis.document) {
  const card = documentRef.createElement("article");
  card.className = "diagnostic-card";
  card.dataset.severity = entry.severity;
  const title = documentRef.createElement("h3");
  title.textContent = `${entry.side} · ${entry.title}`;
  const message = documentRef.createElement("p");
  message.textContent = entry.message;
  const action = documentRef.createElement("small");
  action.textContent = entry.action;
  card.append(title, message, action);
  return card;
}

export function collectVisibleWarnings(comparison) {
  const warnings = [...(comparison?.warnings ?? [])];
  for (const [side, report] of [["左侧", comparison?.left], ["右侧", comparison?.right]]) {
    if (!report?.level?.id || !report.simulation) continue;
    if (!report.simulation.valid && report.simulation.reason) {
      warnings.push(`${side} ${report.level.id}：MC 无效（${report.simulation.reason}）`);
    }
    if (report.simulation.incomplete && report.simulation.incompleteReason) {
      warnings.push(`${side} ${report.level.id}：${report.simulation.incompleteReason}`);
    }
  }
  return [...new Set(warnings)];
}

function renderWarnings(root, comparison) {
  const section = root.querySelector("#report-warnings");
  const list = root.querySelector("#report-warning-list");
  const documentRef = root.ownerDocument ?? globalThis.document;
  const warnings = collectVisibleWarnings(comparison);
  section.hidden = warnings.length === 0;
  list.replaceChildren(...warnings.map((warning) => {
    const item = documentRef.createElement("li");
    item.textContent = warning;
    return item;
  }));
}

function renderDiagnostics(root, left, right) {
  const section = root.querySelector("#diagnostics-section");
  const grid = root.querySelector("#diagnostics-grid");
  const documentRef = root.ownerDocument ?? globalThis.document;
  const entries = [
    ...left.diagnostics.map((entry) => ({ ...entry, side: `左侧 ${left.level.id}` })),
    ...right.diagnostics.map((entry) => ({ ...entry, side: `右侧 ${right.level.id}` })),
  ];
  section.hidden = entries.length === 0;
  grid.replaceChildren(...entries.map((entry) => createDiagnosticCard(entry, documentRef)));
}

export function renderComparison(root, comparison) {
  chartInstances.forEach((chart) => chart.destroy());
  chartInstances = [];
  const { left, right } = comparison;
  const leftSeries = reportToSeries(left);
  const rightSeries = reportToSeries(right);
  const sampleCanvas = root.querySelector("#left-chart");
  const width = sampleCanvas.getBoundingClientRect().width || 720;
  const height = sampleCanvas.getBoundingClientRect().height || 330;
  const reference = comparison.model?.id === "reference";
  root.dataset.model = comparison.model?.id ?? "runtime";
  const scales = createComparisonScales(leftSeries, rightSeries, width, height, reference ? "independent" : "shared");
  const progressLabel = comparison.model?.progressLabel ?? "消除进度";
  chartInstances = [
    new VChart(sampleCanvas, { series: leftSeries, yMax: scales.sheep.yMax, progressLabel }),
    new VChart(root.querySelector("#right-chart"), { series: rightSeries, yMax: scales.paws.yMax, progressLabel }),
  ];
  root.querySelectorAll(".chart-stage").forEach((stage) => stage.classList.add("has-data"));
  const leftTitle = root.querySelector("#left-chart-title");
  const rightTitle = root.querySelector("#right-chart-title");
  leftTitle.textContent = reportTitle(left.level, "左侧待选关卡");
  rightTitle.textContent = reportTitle(right.level, "右侧待选关卡");
  leftTitle.title = leftTitle.textContent;
  rightTitle.title = rightTitle.textContent;
  root.querySelector("#left-chart-meta").textContent = `N=${left.level.tiles} · ${left.level.layers} 层 · T=${left.level.typePoolLabel}`;
  root.querySelector("#right-chart-meta").textContent = `N=${right.level.tiles} · ${right.level.layers} 层 · T=${right.level.typePoolLabel}`;
  root.querySelector("#left-metrics-title").textContent = left.level.id;
  root.querySelector("#right-metrics-title").textContent = right.level.id;
  root.querySelector("#model-evidence").textContent = `${comparison.model.title} v${comparison.model.version} · ${progressLabel} · ${reference ? "左右独立纵轴" : "共享纵轴"} · ${comparison.options.seeds} Seeds / ${comparison.options.traySlots} 槽 / ${comparison.options.policy}`;
  root.querySelector("#configuration-evidence").textContent = `配置指纹（非安全哈希）：左 ${left.level.configurationFingerprint} · 右 ${right.level.configurationFingerprint}`;
  root.querySelector("#model-description").textContent = comparison.model.description;
  root.querySelector("#metrics-axis-note").textContent = reference ? "参考口径 · 独立纵轴 · P10 / P50 / P90" : "工程口径 · 共享纵轴 · P10 / P50 / P90";
  root.querySelector("#method-actual").textContent = comparison.modelNotes[0];
  root.querySelector("#method-river").textContent = reference ? comparison.modelNotes[2] : comparison.modelNotes[1];
  root.querySelector("#method-expected").textContent = reference ? comparison.modelNotes[3] : comparison.modelNotes[2];
  root.querySelector("#sampling-note").textContent = reference ? comparison.modelNotes[1] : comparison.modelNotes[3];
  renderMetrics(root, left, right);
  renderWarnings(root, comparison);
  renderDiagnostics(root, left, right);
}

export function resetComparisonView(root, leftLevel, rightLevel) {
  chartInstances.forEach((chart) => chart.destroy());
  chartInstances = [];
  root.querySelector("#model-evidence").textContent = "等待当前选择的分析结果…";
  root.querySelector("#configuration-evidence").textContent = "";
  root.querySelector("#model-description").textContent = "";
  root.querySelectorAll(".chart-stage").forEach((stage) => stage.classList.remove("has-data"));
  root.querySelectorAll(".chart-stage canvas").forEach((canvas) => {
    const context = canvas.getContext("2d");
    context?.clearRect(0, 0, canvas.width, canvas.height);
  });
  root.querySelector("#left-chart-title").textContent = reportTitle(leftLevel, "左侧待选关卡");
  root.querySelector("#right-chart-title").textContent = reportTitle(rightLevel, "右侧待选关卡");
  root.querySelector("#left-chart-meta").textContent = leftLevel ? "已选择 · 等待分析" : "等待选择左侧关卡";
  root.querySelector("#right-chart-meta").textContent = rightLevel ? "已选择 · 等待分析" : "等待选择右侧关卡";
  root.querySelector("#left-metrics-title").textContent = leftLevel?.id ?? "左侧关卡";
  root.querySelector("#right-metrics-title").textContent = rightLevel?.id ?? "右侧关卡";
  root.querySelector("#metrics-body").replaceChildren();
  root.querySelector("#report-warnings").hidden = true;
  root.querySelector("#report-warning-list").replaceChildren();
  root.querySelector("#diagnostics-section").hidden = true;
  root.querySelector("#diagnostics-grid").replaceChildren();
}
