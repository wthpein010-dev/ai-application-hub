import { runModel } from "./engines.mjs";
import { clampParameters } from "./schema.mjs";

const numberFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
const currencyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0,
});

function formatMetric(metric, rawValue) {
  if (metric.format === "duration" && rawValue < 0) {
    if (metric.output === "depletionTime") return "不会耗尽";
    if (metric.output === "clearTime") return "不会自行清空";
    if (metric.output === "medianAttempt") return "概率未过半";
    return "观察期未回本";
  }
  if (metric.format === "currency") return currencyFormatter.format(rawValue);
  if (metric.format === "percent") return `${numberFormatter.format(rawValue)}%`;
  const formatted = numberFormatter.format(rawValue);
  return metric.unit ? `${formatted} ${metric.unit}` : formatted;
}

function conclusionFor(spec, metrics, result, values) {
  const first = metrics[0];
  if (spec.modelType === "payback") {
    if (result.outputs.paybackDay < 0) {
      const duration = spec.parameters.find(item => item.id === "duration");
      return `按当前假设，${numberFormatter.format(values.duration)} ${duration?.unit ?? "个单位"}观察期内尚未回本；优先调整成本、有效用户或单用户收益。`;
    }
    return `按当前假设，模型在第 ${numberFormatter.format(result.outputs.paybackDay)} 天达到回本，期末结果为 ${metrics.find(item => item.output === "finalValue")?.displayValue ?? first.displayValue}。`;
  }
  if (spec.modelType === "funnel") {
    return `从起始规模到最终阶段，模型得到 ${first.displayValue}，整体转化率为 ${metrics.find(item => item.output === "overallRate")?.displayValue ?? "—"}。`;
  }
  if (spec.modelType === "inventory") {
    const depletion = metrics.find(item => item.output === "depletionTime");
    return depletion?.rawValue < 0
      ? `按当前流入和流出，${spec.title}在观察期内不会耗尽。`
      : `按当前速度，预计在 ${depletion?.displayValue ?? "—"} 左右耗尽，期末剩余 ${first.displayValue}。`;
  }
  if (spec.modelType === "compound") {
    const earned = metrics.find(item => item.output === "interestEarned");
    return `持续投入后，期末估算为 ${first.displayValue}，其中模型收益约为 ${earned?.displayValue ?? "—"}。`;
  }
  if (spec.modelType === "decay") {
    return `经过设定时长，估算剩余 ${first.displayValue}；拖动半衰期可以观察代谢速度差异。`;
  }
  if (spec.modelType === "logistic") {
    const capacity = metrics.find(item => item.output === "capacityPercent");
    return `按当前增长强度，期末估算为 ${first.displayValue}，约达到设定上限的 ${capacity?.displayValue ?? "—"}。`;
  }
  if (spec.modelType === "queue") {
    const clear = metrics.find(item => item.output === "clearTime");
    return clear?.rawValue < 0
      ? `当前到达速度不低于处理速度，排队会继续累积，期末约为 ${first.displayValue}。`
      : `按当前到达与处理速度，队列预计在 ${clear?.displayValue ?? "—"} 左右清空。`;
  }
  if (spec.modelType === "probability") {
    return `在当前次数下，累计概率约为 ${first.displayValue}；这是数学概率，不代表单次事件一定发生。`;
  }
  return `保持当前速度，期末估算为 ${first.displayValue}。该趋势用于比较情景，不代表现实会一直线性变化。`;
}

function chartFor(spec, result, chartMode) {
  const fields = spec.chart.series;
  const series = fields.map((field, index) => ({
    id: field,
    label: field === "value" ? spec.title : field === "revenue" ? "累计收益" : field === "cost" ? "累计成本" : field,
    colorIndex: index,
    points: result.series.map(point => ({
      x: point.x,
      label: point.label,
      value: Number(point[field] ?? (field === "value" ? point.value : 0)),
    })),
  }));
  if (series.some(item => item.points.some(point => !Number.isFinite(point.value)))) {
    throw new RangeError("Chart contains a non-finite value");
  }
  const modes = Array.isArray(spec.chart.modes) && spec.chart.modes.length > 0
    ? [...spec.chart.modes]
    : [spec.chart.type];
  const type = modes.includes(chartMode) ? chartMode : spec.chart.type;
  return { ...spec.chart, type, modes, series };
}

export function buildViewModel(spec, inputValues = {}, options = {}) {
  const values = clampParameters(spec, inputValues);
  const result = runModel(spec, values);
  const metrics = spec.metrics.map(metric => {
    const rawValue = result.outputs[metric.output];
    if (!Number.isFinite(rawValue)) {
      throw new RangeError(`Model did not produce finite output: ${metric.output}`);
    }
    return {
      ...metric,
      rawValue,
      displayValue: formatMetric(metric, rawValue),
    };
  });
  return {
    id: spec.id,
    title: spec.title,
    category: spec.category,
    question: spec.question,
    source: spec.source,
    parameters: spec.parameters.map(parameter => ({ ...parameter, value: values[parameter.id] })),
    metrics,
    chart: chartFor(spec, result, options.chartMode),
    conclusion: conclusionFor(spec, metrics, result, values),
    warnings: [...result.warnings],
    disclosure: structuredClone(spec.explanation),
  };
}
