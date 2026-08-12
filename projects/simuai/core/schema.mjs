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
const EXECUTABLE_CONTENT = /<\/?[a-z][^>]*>|javascript\s*:|\beval\s*\(|new\s+Function\b|on\w+\s*=/i;
const SAFE_ID = /^[a-z][a-zA-Z0-9-]{1,63}$/;
const SAFE_FIELD = /^[a-z][a-zA-Z0-9]{1,63}$/;

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
