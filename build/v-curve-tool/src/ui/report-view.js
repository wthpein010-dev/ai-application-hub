import {
  VChart,
  createComparisonScales,
  reportToSeries,
} from "./chart.js";

let chartInstances = [];

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(value > 0 && value < 0.01 ? 1 : 0)}%` : "—";
}

export function formatBand(value) {
  if (!value) return "—";
  return `${formatNumber(value.p90)} / ${formatNumber(value.p50)} / ${formatNumber(value.p10)}`;
}

function formatRiver(value) {
  return value ? `${formatNumber(value.lower)}–${formatNumber(value.upper)}` : "—";
}

export function comparisonText(sheepValue, pawsValue, suffix = "") {
  if (!Number.isFinite(sheepValue) || !Number.isFinite(pawsValue)) return "样本不足";
  const difference = pawsValue - sheepValue;
  if (Math.abs(difference) < 0.05) return "基本一致";
  return `Paws ${difference > 0 ? "高" : "低"} ${formatNumber(Math.abs(difference))}${suffix}`;
}

function metricRow(documentRef, label, sheep, paws, observation, detail = "") {
  const row = documentRef.createElement("tr");
  const labelCell = documentRef.createElement("td");
  labelCell.textContent = label;
  if (detail) {
    const small = documentRef.createElement("small");
    small.textContent = detail;
    labelCell.append(small);
  }
  for (const value of [sheep, paws, observation]) {
    const cell = documentRef.createElement("td");
    cell.textContent = value;
    row.append(cell);
  }
  row.prepend(labelCell);
  return row;
}

function renderMetrics(root, sheep, paws) {
  const documentRef = root.ownerDocument ?? globalThis.document;
  const sheepMetrics = sheep.metrics;
  const pawsMetrics = paws.metrics;
  const rows = [
    metricRow(documentRef, "砖数 / 层数 / 图案池",
      `${sheepMetrics.tiles} / ${sheepMetrics.layers} / ${sheepMetrics.typePoolLabel}`,
      `${pawsMetrics.tiles} / ${pawsMetrics.layers} / ${pawsMetrics.typePoolLabel}`,
      `${pawsMetrics.tiles - sheepMetrics.tiles >= 0 ? "+" : ""}${pawsMetrics.tiles - sheepMetrics.tiles} 砖`),
    metricRow(documentRef, "开局 V", formatNumber(sheepMetrics.openingV), formatNumber(pawsMetrics.openingV),
      comparisonText(sheepMetrics.openingV, pawsMetrics.openingV)),
    metricRow(documentRef, "MC @25%", formatBand(sheepMetrics.mc25), formatBand(pawsMetrics.mc25),
      comparisonText(sheepMetrics.mc25?.p50, pawsMetrics.mc25?.p50, " V"), "MC P90 / MC P50 / MC P10"),
    metricRow(documentRef, "MC @50%", formatBand(sheepMetrics.mc50), formatBand(pawsMetrics.mc50),
      comparisonText(sheepMetrics.mc50?.p50, pawsMetrics.mc50?.p50, " V"), "MC P90 / MC P50 / MC P10"),
    metricRow(documentRef, "中盘河道范围", formatRiver(sheepMetrics.midRiver), formatRiver(pawsMetrics.midRiver), "T=1 边界范围", "河道下界(min)–河道上界(max) @50%"),
    metricRow(documentRef, "河道下界(min)窄口", `${sheepMetrics.lowerDeadlocks} 次`, `${pawsMetrics.lowerDeadlocks} 次`,
      `平均止于 ${formatPercent(pawsMetrics.lowerDeadlockAverageProgress)}`, "无槽有限重启"),
    metricRow(documentRef, "无道具清盘率", formatPercent(sheepMetrics.completionRate), formatPercent(pawsMetrics.completionRate),
      comparisonText(sheepMetrics.completionRate * 100, pawsMetrics.completionRate * 100, " 个百分点")),
    metricRow(documentRef, "卡死局平均止点", formatPercent(sheepMetrics.averageDeadlockProgress), formatPercent(pawsMetrics.averageDeadlockProgress),
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
  for (const report of [comparison?.sheep, comparison?.paws]) {
    if (!report?.level?.id || !report.simulation) continue;
    if (!report.simulation.valid && report.simulation.reason) {
      warnings.push(`${report.level.id}：MC 无效（${report.simulation.reason}）`);
    }
    if (report.simulation.incomplete && report.simulation.incompleteReason) {
      warnings.push(`${report.level.id}：${report.simulation.incompleteReason}`);
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

function renderDiagnostics(root, sheep, paws) {
  const section = root.querySelector("#diagnostics-section");
  const grid = root.querySelector("#diagnostics-grid");
  const documentRef = root.ownerDocument ?? globalThis.document;
  const entries = [
    ...sheep.diagnostics.map((entry) => ({ ...entry, side: "羊 900121" })),
    ...paws.diagnostics.map((entry) => ({ ...entry, side: paws.level.id })),
  ];
  section.hidden = entries.length === 0;
  grid.replaceChildren(...entries.map((entry) => createDiagnosticCard(entry, documentRef)));
}

export function renderComparison(root, comparison) {
  chartInstances.forEach((chart) => chart.destroy());
  chartInstances = [];
  const { sheep, paws } = comparison;
  const sheepSeries = reportToSeries(sheep);
  const pawsSeries = reportToSeries(paws);
  const sampleCanvas = root.querySelector("#sheep-chart");
  const width = sampleCanvas.getBoundingClientRect().width || 720;
  const height = sampleCanvas.getBoundingClientRect().height || 330;
  const scales = createComparisonScales(sheepSeries, pawsSeries, width, height);
  chartInstances = [
    new VChart(sampleCanvas, { series: sheepSeries, yMax: scales.sheep.yMax }),
    new VChart(root.querySelector("#paws-chart"), { series: pawsSeries, yMax: scales.paws.yMax }),
  ];
  root.querySelectorAll(".chart-stage").forEach((stage) => stage.classList.add("has-data"));
  root.querySelector("#paws-chart-title").textContent = `Paws ${paws.level.id}`;
  root.querySelector("#paws-chart-meta").textContent = `N=${paws.level.tiles} · ${paws.level.layers} 层 · T=${paws.level.typePoolLabel}`;
  root.querySelector(".chart-card:first-child header p").textContent = `N=${sheep.level.tiles} · ${sheep.level.layers} 层 · T=${sheep.level.typePoolLabel}`;
  renderMetrics(root, sheep, paws);
  renderWarnings(root, comparison);
  renderDiagnostics(root, sheep, paws);
}
