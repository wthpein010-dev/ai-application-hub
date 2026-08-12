import test from "node:test";
import assert from "node:assert/strict";

import { createCache } from "../projects/simuai/core/cache.mjs";
import { buildViewModel } from "../projects/simuai/core/presenter.mjs";
import { getExperiment } from "../projects/simuai/core/templates.mjs";

function createMemoryStorage() {
  const items = new Map();
  return {
    getItem(key) { return items.has(key) ? items.get(key) : null; },
    setItem(key, value) { items.set(key, String(value)); },
    removeItem(key) { items.delete(key); },
  };
}

test("view model exposes chart, metrics, conclusion and disclosure", () => {
  const caffeine = getExperiment("caffeine-decay");
  const view = buildViewModel(caffeine, { initial: 200, halfLife: 5, duration: 10 });

  assert.equal(Math.round(view.metrics[0].rawValue), 50);
  assert.equal(view.metrics[0].displayValue, "50 mg");
  assert.match(view.conclusion, /50 mg/);
  assert.equal(view.chart.type, "area");
  assert.equal(view.chart.series[0].points.at(-1).value, 50);
  assert.match(view.disclosure.disclaimer, /不构成专业建议/);
});

test("view model uses the recommended chart mode and accepts only supported visual overrides", () => {
  const caffeine = getExperiment("caffeine-decay");
  caffeine.chart.modes = ["area", "line", "step"];
  const values = { initial: 200, halfLife: 5, duration: 10 };

  const recommended = buildViewModel(caffeine, values);
  const line = buildViewModel(caffeine, values, { chartMode: "line" });
  const rejected = buildViewModel(caffeine, values, { chartMode: "bar" });

  assert.equal(recommended.chart.type, "area");
  assert.equal(line.chart.type, "line");
  assert.equal(rejected.chart.type, "area");
  assert.deepEqual(line.chart.modes, ["area", "line", "step"]);
  assert.deepEqual(
    line.metrics.map(metric => metric.rawValue),
    recommended.metrics.map(metric => metric.rawValue),
  );
});

test("legacy experiments without chart modes remain locked to their recommended view", () => {
  const caffeine = getExperiment("caffeine-decay");
  delete caffeine.chart.modes;
  const view = buildViewModel(
    caffeine,
    { initial: 200, halfLife: 5, duration: 10 },
    { chartMode: "line" },
  );

  assert.equal(view.chart.type, "area");
  assert.deepEqual(view.chart.modes, ["area"]);
});

test("payback conclusion handles an unprofitable observation window", () => {
  const experiment = getExperiment("game-payback");
  const view = buildViewModel(experiment, {
    dailySpend: 10000,
    dailyUsers: 100,
    day1Retention: 10,
    revenuePerActiveUser: 0.1,
    duration: 30,
  });

  assert.equal(view.metrics.find(item => item.id === "payback-day").displayValue, "观察期未回本");
  assert.match(view.conclusion, /尚未回本/);
  assert.ok(view.warnings.length > 0);
});

test("payback conclusion uses the current observation duration", () => {
  const experiment = getExperiment("game-payback");
  const view = buildViewModel(experiment, {
    dailySpend: 10000,
    dailyUsers: 100,
    day1Retention: 10,
    revenuePerActiveUser: 0.1,
    duration: 14,
  });

  assert.match(view.conclusion, /14 天/);
});

test("inventory and queue use model-specific text when they will not clear", () => {
  const inventory = buildViewModel(getExperiment("rainwater-tank"), {
    initialStock: 100,
    dailyInflow: 20,
    dailyOutflow: 10,
    duration: 30,
  });
  const queue = buildViewModel(getExperiment("theme-park-queue"), {
    initialQueue: 100,
    arrivalRate: 50,
    serviceRate: 40,
    duration: 4,
  });

  assert.equal(inventory.metrics.find(item => item.output === "depletionTime").displayValue, "不会耗尽");
  assert.equal(queue.metrics.find(item => item.output === "clearTime").displayValue, "不会自行清空");
  assert.match(queue.conclusion, /排队|队列/);
});

test("an initially empty queue explains later accumulation without claiming a future clear", () => {
  const experiment = getExperiment("restaurant-queue");
  const view = buildViewModel(experiment, {
    initialQueue: 0,
    arrivalRate: 7,
    serviceRate: 3,
    duration: 10,
  });

  assert.equal(view.metrics.find(item => item.output === "clearTime").displayValue, "当前已空");
  assert.match(view.conclusion, /起点为空/);
  assert.match(view.conclusion, /累积/);
});

test("new deterministic models receive specific conclusions", () => {
  const logistic = buildViewModel(getExperiment("plant-growth"));
  const probability = buildViewModel(getExperiment("gacha-pity"));

  assert.match(logistic.conclusion, /上限|容量/);
  assert.match(probability.conclusion, /概率/);
  assert.doesNotMatch(logistic.conclusion, /线性变化/);
  assert.doesNotMatch(probability.conclusion, /线性变化/);
});

test("presenter rejects an unknown model output", () => {
  const experiment = getExperiment("caffeine-decay");
  experiment.metrics[0].output = "notProduced";

  assert.throws(
    () => buildViewModel(experiment, { initial: 200, halfLife: 5, duration: 10 }),
    /notProduced/,
  );
});

test("cache round trips validated experiments with normalized question keys", () => {
  const storage = createMemoryStorage();
  const cache = createCache(storage);
  const experiment = getExperiment("compound-savings");

  cache.set("  每月存钱？ ", experiment);

  const cached = cache.get("每月存钱");
  assert.equal(cached.id, experiment.id);
  assert.equal(cached.source, "cache");
});

test("cache ignores another schema version and damaged data", () => {
  const storage = createMemoryStorage();
  const cache = createCache(storage);
  storage.setItem(cache.keyFor("测试"), JSON.stringify({ version: 0 }));
  assert.equal(cache.get("测试"), null);

  storage.setItem(cache.keyFor("损坏"), "{not-json");
  assert.equal(cache.get("损坏"), null);
});

test("cache does not store invalid experiments", () => {
  const cache = createCache(createMemoryStorage());
  assert.throws(() => cache.set("危险", { version: 1, modelType: "javascript" }), /Invalid experiment/);
});
