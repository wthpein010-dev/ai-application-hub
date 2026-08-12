import test from "node:test";
import assert from "node:assert/strict";

import { validateExperiment } from "../projects/simuai/core/schema.mjs";
import {
  EXPERIMENTS,
  getExperiment,
} from "../projects/simuai/core/templates.mjs";
import {
  normalizeQuestion,
  rankExperiments,
} from "../projects/simuai/core/matcher.mjs";

test("the offline library contains twelve unique valid experiments", () => {
  assert.equal(EXPERIMENTS.length, 12);
  assert.equal(new Set(EXPERIMENTS.map(item => item.id)).size, 12);
  for (const experiment of EXPERIMENTS) {
    const checked = validateExperiment(experiment);
    assert.equal(checked.ok, true, `${experiment.id}: ${checked.errors.join(", ")}`);
  }
});

test("the three showcase experiments cover life, games and business", () => {
  const showcases = EXPERIMENTS.filter(item => item.featured);
  assert.deepEqual(
    showcases.map(item => item.id),
    ["caffeine-decay", "game-payback", "compound-savings"],
  );
  assert.deepEqual(
    new Set(showcases.map(item => item.category)),
    new Set(["生活科普", "游戏产品", "商业决策"]),
  );
});

const examples = [
  ["下午喝咖啡晚上还剩多少咖啡因", "caffeine-decay"],
  ["小游戏每天买量 5000 元多久回本", "game-payback"],
  ["每月存 3000 元十年复利有多少钱", "compound-savings"],
  ["每天少睡两小时一周欠多少觉", "sleep-debt"],
  ["每天少吃 500 大卡体重怎么变化", "weight-trend"],
  ["每天读 20 页多久读完这本书", "learning-progress"],
  ["10000 个访客经过销售漏斗最终成交多少", "sales-funnel"],
  ["订阅用户每月增长和流失后还剩多少", "subscription-growth"],
  ["仓库库存按当前销量什么时候耗尽", "inventory-runway"],
  ["团队预算按现在花费速度能撑多久", "budget-burn"],
  ["活动报名的人最终有多少到场", "event-attendance"],
  ["游戏角色升级经验曲线多久满级", "game-progression"],
];

for (const [question, expectedId] of examples) {
  test(`matches ${expectedId}`, () => {
    const matches = rankExperiments(question);
    assert.equal(matches[0].experiment.id, expectedId);
    assert.ok(matches[0].score > 0);
    assert.ok(matches[0].matchedTerms.length > 0);
  });
}

test("normalization removes spacing and punctuation without losing Chinese terms", () => {
  assert.equal(normalizeQuestion("  小游戏：买量，多久回本？ "), "小游戏买量多久回本");
});

test("ranking is stable when no term matches", () => {
  assert.deepEqual(
    rankExperiments("量子香蕉天气", 3).map(match => match.experiment.id),
    EXPERIMENTS.slice(0, 3).map(item => item.id),
  );
});

test("getExperiment returns a defensive copy", () => {
  const first = getExperiment("caffeine-decay");
  first.title = "changed";
  assert.notEqual(getExperiment("caffeine-decay").title, "changed");
  assert.equal(getExperiment("missing"), null);
});
