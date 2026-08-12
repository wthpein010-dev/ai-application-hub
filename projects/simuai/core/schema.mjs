export const SCHEMA_VERSION = 1;

export const MODEL_TYPES = Object.freeze([
  "linear",
  "compound",
  "decay",
  "funnel",
  "inventory",
  "payback",
]);

const CHART_TYPES = new Set(["line", "area", "funnel"]);
const SOURCES = new Set(["builtin", "ai", "cache"]);
const STANDARD_DISCLAIMER = "互动估算，不构成专业建议。";
const EXECUTABLE_CONTENT = /<\/?[a-z][^>]*>|javascript\s*:|\beval\s*\(|new\s+Function\b|on\w+\s*=/i;
const HIGH_RISK_TOPIC = /医疗|诊断|疾病|用药|药物|手术|健康|减重|投资|股票|个股|基金|证券|法律|诉讼|判决|合同|安全操作|危险品|武器|爆炸|自残|medical|diagnos|invest|stock|legal|weapon/i;
const DETERMINISTIC_CLAIM = /保证|承诺|必然|一定会|准确(?:预测|判断|结论)|确定(?:上涨|下跌|诊断|违法|安全)|买入|卖出|治愈|处方|guarantee|certain(?:ly)?|must (?:rise|fall)|buy|sell/i;
const EDUCATIONAL_BOUNDARY = /教育|理解|估算|假设|情景|趋势|不用于|不代表|仅用于|仅供|不构成|educational|estimate|scenario|not (?:advice|a diagnosis)/i;
const SAFE_ID = /^[a-z][a-zA-Z0-9-]{1,63}$/;
const SAFE_FIELD = /^[a-z][a-zA-Z0-9]{1,63}$/;
const MODEL_CONTRACTS = Object.freeze({
  linear: {
    parameters: ["initial", "rate", "duration"],
    bounds: { initial: [-1e7, 1e7], rate: [-1e6, 1e6], duration: [0, 1000] },
    outputs: ["finalValue", "totalChange"],
    series: ["value"],
  },
  compound: {
    parameters: ["principal", "contribution", "annualRate", "years"],
    bounds: { principal: [0, 1e8], contribution: [0, 1e7], annualRate: [-100, 100], years: [0, 100] },
    outputs: ["finalValue", "totalContributed", "interestEarned"],
    series: ["value"],
  },
  decay: {
    parameters: ["initial", "halfLife", "duration"],
    bounds: { initial: [0, 1e8], halfLife: [0.01, 1e5], duration: [0, 1e5] },
    outputs: ["finalValue", "percentRemaining"],
    series: ["value"],
  },
  funnel: {
    parameters: ["audience", "rate1", "rate2", "rate3", "rate4"],
    bounds: { audience: [0, 1e9], rate1: [0, 100], rate2: [0, 100], rate3: [0, 100], rate4: [0, 100] },
    outputs: ["finalValue", "overallRate"],
    series: ["value"],
  },
  inventory: {
    parameters: ["initialStock", "dailyInflow", "dailyOutflow", "duration"],
    bounds: { initialStock: [0, 1e9], dailyInflow: [0, 1e9], dailyOutflow: [0, 1e9], duration: [0, 1000] },
    outputs: ["finalValue", "depletionTime", "netDailyChange"],
    series: ["value"],
  },
  payback: {
    parameters: ["dailySpend", "dailyUsers", "day1Retention", "revenuePerActiveUser", "duration"],
    bounds: { dailySpend: [0, 1e9], dailyUsers: [0, 1e9], day1Retention: [0, 100], revenuePerActiveUser: [0, 1e6], duration: [0, 1000] },
    outputs: ["finalValue", "totalRevenue", "totalCost", "paybackDay", "roi"],
    series: ["value", "revenue", "cost", "activeUsers"],
  },
});

const isRecord = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = value => typeof value === "number" && Number.isFinite(value);
const isSafeText = (value, max = 400) => (
  typeof value === "string"
  && value.trim().length > 0
  && value.length <= max
  && !EXECUTABLE_CONTENT.test(value)
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function checkSafeText(value, path, errors, max) {
  if (!isSafeText(value, max)) {
    errors.push(`${path} must be safe text without executable markup`);
  }
}

function checkParameter(parameter, index, errors, seenIds) {
  const path = `parameters[${index}]`;
  if (!isRecord(parameter)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!SAFE_ID.test(parameter.id ?? "") || seenIds.has(parameter.id)) {
    errors.push(`${path}.id must be a unique safe identifier`);
  } else {
    seenIds.add(parameter.id);
  }
  checkSafeText(parameter.label, `${path}.label`, errors, 60);
  if (typeof parameter.unit !== "string" || parameter.unit.length > 24 || EXECUTABLE_CONTENT.test(parameter.unit)) {
    errors.push(`${path}.unit must be a short safe string`);
  }
  for (const field of ["min", "max", "step", "default"]) {
    if (!isFiniteNumber(parameter[field])) errors.push(`${path}.${field} must be finite`);
  }
  if (
    isFiniteNumber(parameter.min)
    && isFiniteNumber(parameter.max)
    && parameter.min >= parameter.max
  ) {
    errors.push(`${path} range must have min lower than max`);
  }
  if (isFiniteNumber(parameter.step) && parameter.step <= 0) {
    errors.push(`${path}.step must be positive`);
  }
  if (
    isFiniteNumber(parameter.default)
    && isFiniteNumber(parameter.min)
    && isFiniteNumber(parameter.max)
    && (parameter.default < parameter.min || parameter.default > parameter.max)
  ) {
    errors.push(`${path}.default must be inside the parameter range`);
  }
}

function checkMetric(metric, index, errors, seenIds) {
  const path = `metrics[${index}]`;
  if (!isRecord(metric)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!SAFE_ID.test(metric.id ?? "") || seenIds.has(metric.id)) {
    errors.push(`${path}.id must be a unique safe identifier`);
  } else {
    seenIds.add(metric.id);
  }
  checkSafeText(metric.label, `${path}.label`, errors, 60);
  if (!SAFE_FIELD.test(metric.output ?? "")) errors.push(`${path}.output must be a safe identifier`);
  if (!["number", "currency", "percent", "duration"].includes(metric.format)) {
    errors.push(`${path}.format is not supported`);
  }
  if (typeof metric.unit !== "string" || metric.unit.length > 24 || EXECUTABLE_CONTENT.test(metric.unit)) {
    errors.push(`${path}.unit must be a short safe string`);
  }
}

function checkModelContract(spec, errors) {
  const contract = MODEL_CONTRACTS[spec.modelType];
  if (!contract) return;

  const parameterIds = Array.isArray(spec.parameters) ? spec.parameters.map(item => item?.id) : [];
  const unsupportedParameters = parameterIds.filter(id => !contract.parameters.includes(id));
  if (unsupportedParameters.length) {
    errors.push(`parameter ${unsupportedParameters.join(", ")} is not supported by ${spec.modelType} model`);
  }
  if (Array.isArray(spec.parameters)) {
    for (const parameter of spec.parameters) {
      const bounds = contract.bounds[parameter?.id];
      if (!bounds) continue;
      const [safeMin, safeMax] = bounds;
      if (parameter.min < safeMin || parameter.max > safeMax) {
        errors.push(`${parameter.id} range must stay inside safe bounds ${safeMin} to ${safeMax}`);
      }
    }
  }

  if (spec.modelType === "funnel") {
    const rates = parameterIds
      .filter(id => /^rate[1-4]$/.test(id))
      .map(id => Number(id.slice(4)))
      .toSorted((a, b) => a - b);
    const contiguous = rates.length >= 2 && rates.every((rate, index) => rate === index + 1);
    if (!parameterIds.includes("audience") || !contiguous) {
      errors.push("parameters for funnel model must contain audience and contiguous rate fields starting at rate1");
    }
  } else {
    const missingParameters = contract.parameters.filter(id => !parameterIds.includes(id));
    if (missingParameters.length) {
      errors.push(`parameters for ${spec.modelType} model are missing ${missingParameters.join(", ")}`);
    }
  }

  const unsupportedMetrics = Array.isArray(spec.metrics)
    ? spec.metrics.map(item => item?.output).filter(output => !contract.outputs.includes(output))
    : [];
  if (unsupportedMetrics.length) {
    errors.push(`metric output ${unsupportedMetrics.join(", ")} is not supported by ${spec.modelType} model`);
  }

  const unsupportedSeries = Array.isArray(spec.chart?.series)
    ? spec.chart.series.filter(field => !contract.series.includes(field))
    : [];
  if (unsupportedSeries.length) {
    errors.push(`chart series ${unsupportedSeries.join(", ")} is not supported by ${spec.modelType} model`);
  }
}

export function validateExperiment(spec) {
  const errors = [];
  if (!isRecord(spec)) return { ok: false, errors: ["experiment must be an object"] };

  if (spec.version !== SCHEMA_VERSION) errors.push(`version must be ${SCHEMA_VERSION}`);
  if (!SAFE_ID.test(spec.id ?? "")) errors.push("id must be a safe identifier");
  for (const [field, max] of [["title", 100], ["category", 60], ["question", 300]]) {
    checkSafeText(spec[field], field, errors, max);
  }
  if (!MODEL_TYPES.includes(spec.modelType)) errors.push("modelType is not supported");
  if (!Array.isArray(spec.parameters) || spec.parameters.length < 3 || spec.parameters.length > 5) {
    errors.push("parameters must contain 3 to 5 items");
  }
  if (Array.isArray(spec.parameters)) {
    const seen = new Set();
    spec.parameters.forEach((item, index) => checkParameter(item, index, errors, seen));
  }
  if (!Array.isArray(spec.metrics) || spec.metrics.length < 1 || spec.metrics.length > 4) {
    errors.push("metrics must contain 1 to 4 items");
  }
  if (Array.isArray(spec.metrics)) {
    const seen = new Set();
    spec.metrics.forEach((item, index) => checkMetric(item, index, errors, seen));
  }
  if (!isRecord(spec.chart) || !CHART_TYPES.has(spec.chart?.type)) {
    errors.push("chart.type is not supported");
  } else {
    checkSafeText(spec.chart.xLabel, "chart.xLabel", errors, 60);
    checkSafeText(spec.chart.yLabel, "chart.yLabel", errors, 60);
    if (!Array.isArray(spec.chart.series) || spec.chart.series.length < 1 || spec.chart.series.length > 3) {
      errors.push("chart.series must contain 1 to 3 fields");
    } else if (spec.chart.series.some(field => !SAFE_FIELD.test(field))) {
      errors.push("chart.series contains an unsafe field");
    }
  }
  if (!isRecord(spec.explanation)) {
    errors.push("explanation must be an object");
  } else {
    checkSafeText(spec.explanation.formula, "explanation.formula", errors, 500);
    checkSafeText(spec.explanation.boundary, "explanation.boundary", errors, 500);
    checkSafeText(spec.explanation.disclaimer, "explanation.disclaimer", errors, 300);
    if (!Array.isArray(spec.explanation.assumptions) || spec.explanation.assumptions.length < 1 || spec.explanation.assumptions.length > 6) {
      errors.push("explanation.assumptions must contain 1 to 6 items");
    } else {
      spec.explanation.assumptions.forEach((item, index) => (
        checkSafeText(item, `explanation.assumptions[${index}]`, errors, 240)
      ));
    }
  }
  if (!Array.isArray(spec.keywords) || spec.keywords.length < 1 || spec.keywords.length > 20) {
    errors.push("keywords must contain 1 to 20 items");
  } else {
    spec.keywords.forEach((item, index) => checkSafeText(item, `keywords[${index}]`, errors, 40));
  }
  if (!SOURCES.has(spec.source)) errors.push("source is not supported");
  checkModelContract(spec, errors);
  if (spec.explanation?.disclaimer !== STANDARD_DISCLAIMER) {
    errors.push("explanation.disclaimer must use the standard disclaimer");
  }
  const riskText = [
    spec.title,
    spec.category,
    spec.question,
    spec.explanation?.formula,
    spec.explanation?.boundary,
    ...(Array.isArray(spec.explanation?.assumptions) ? spec.explanation.assumptions : []),
    ...(Array.isArray(spec.keywords) ? spec.keywords : []),
  ].filter(Boolean).join(" ");
  if (HIGH_RISK_TOPIC.test(riskText)) {
    if (DETERMINISTIC_CLAIM.test(riskText)) {
      errors.push("high-risk topics cannot contain deterministic promises or instructions");
    } else if (!EDUCATIONAL_BOUNDARY.test(spec.explanation?.boundary ?? "")) {
      errors.push("high-risk topics must state an educational estimation boundary");
    }
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: clone(spec), errors: [] };
}

export function clampParameters(spec, values = {}) {
  if (!Array.isArray(spec?.parameters)) throw new TypeError("A parameterized experiment is required");
  return Object.fromEntries(spec.parameters.map(parameter => {
    const candidate = Number(values[parameter.id]);
    const value = Number.isFinite(candidate) ? candidate : parameter.default;
    return [parameter.id, Math.min(parameter.max, Math.max(parameter.min, value))];
  }));
}
