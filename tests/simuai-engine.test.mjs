import test from "node:test";
import assert from "node:assert/strict";

import { runModel } from "../projects/simuai/core/engines.mjs";
import {
  clampParameters,
  validateExperiment,
} from "../projects/simuai/core/schema.mjs";

const parameter = (id, overrides = {}) => ({
  id,
  label: id,
  unit: "",
  min: 0,
  max: 100,
  step: 1,
  default: 10,
  ...overrides,
});

const validSpec = {
  version: 1,
  id: "fixture",
  title: "Fixture",
  category: "Test",
  question: "What changes?",
  modelType: "linear",
  parameters: [parameter("initial"), parameter("rate"), parameter("duration")],
  metrics: [
    { id: "final", label: "Final", output: "finalValue", format: "number", unit: "" },
  ],
  chart: { type: "line", xLabel: "Time", yLabel: "Value", series: ["value"] },
  explanation: {
    formula: "final = initial + rate × duration",
    assumptions: ["Constant rate"],
    boundary: "Illustrative only.",
    disclaimer: "互动估算，不构成专业建议。",
  },
  keywords: ["fixture"],
  source: "builtin",
};

test("decay halves the remaining value once per half-life", () => {
  const result = runModel({ modelType: "decay" }, {
    initial: 200,
    halfLife: 5,
    duration: 10,
  });

  assert.equal(result.series.at(0).value, 200);
  assert.equal(Math.round(result.series.at(-1).value), 50);
  assert.equal(Math.round(result.outputs.finalValue), 50);
});

test("linear returns hand-calculated accumulation", () => {
  const result = runModel({ modelType: "linear" }, {
    initial: 25,
    rate: 4,
    duration: 5,
  });

  assert.equal(result.outputs.finalValue, 45);
  assert.equal(result.series.length, 6);
});

test("compound models recurring deposits and periodic interest", () => {
  const result = runModel({ modelType: "compound" }, {
    principal: 1000,
    contribution: 100,
    annualRate: 12,
    years: 1,
  });

  // 12 monthly periods at 1%, deposit added at the end of each period.
  assert.equal(Math.round(result.outputs.finalValue), 2395);
  assert.equal(result.outputs.totalContributed, 2200);
});

test("funnel applies each percentage to the previous stage", () => {
  const result = runModel({ modelType: "funnel" }, {
    audience: 1000,
    rate1: 50,
    rate2: 20,
    rate3: 10,
  });

  assert.deepEqual(result.series.map(point => point.value), [1000, 500, 100, 10]);
  assert.equal(result.outputs.finalValue, 10);
  assert.equal(result.outputs.overallRate, 1);
});

test("inventory reports depletion time and never renders negative stock", () => {
  const result = runModel({ modelType: "inventory" }, {
    initialStock: 100,
    dailyInflow: 5,
    dailyOutflow: 15,
    duration: 20,
  });

  assert.equal(result.outputs.depletionTime, 10);
  assert.equal(result.outputs.finalValue, 0);
  assert.equal(result.series.at(-1).value, 0);
});

test("payback reports the first profitable day", () => {
  const result = runModel({ modelType: "payback" }, {
    dailySpend: 100,
    dailyUsers: 100,
    day1Retention: 50,
    revenuePerActiveUser: 3,
    duration: 10,
  });

  assert.equal(result.outputs.paybackDay, 1);
  assert.equal(result.outputs.finalValue, 500);
});

test("model inputs must be finite and model types must be supported", () => {
  assert.throws(
    () => runModel({ modelType: "linear" }, { initial: Number.NaN, rate: 1, duration: 2 }),
    RangeError,
  );
  assert.throws(
    () => runModel({ modelType: "javascript" }, { value: 1 }),
    /Unsupported model type/,
  );
});

test("schema accepts a complete safe experiment", () => {
  const checked = validateExperiment(validSpec);

  assert.equal(checked.ok, true, checked.errors.join("\n"));
  assert.notEqual(checked.value, validSpec);
});

test("schema rejects executable content, unknown models and invalid ranges", () => {
  const checked = validateExperiment({
    ...validSpec,
    modelType: "javascript",
    title: "<script>alert(1)</script>",
    parameters: [parameter("value", { min: 10, max: 1 })],
  });

  assert.equal(checked.ok, false);
  assert.match(checked.errors.join(" "), /modelType/);
  assert.match(checked.errors.join(" "), /executable|markup/i);
  assert.match(checked.errors.join(" "), /range/i);
});

test("parameter clamping uses schema bounds and defaults", () => {
  const values = clampParameters(validSpec, {
    initial: -50,
    rate: "not-a-number",
    duration: 1000,
  });

  assert.deepEqual(values, { initial: 0, rate: 10, duration: 100 });
});
