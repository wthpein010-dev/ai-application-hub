import test from "node:test";
import assert from "node:assert/strict";

import { validateExperiment } from "../projects/simuai/core/schema.mjs";
import {
  EXPERIMENTS,
  getExperiment,
} from "../projects/simuai/core/templates.mjs";
import {
  EXPERIMENT_CATEGORIES,
  experimentsForCategory,
  resolveCatalogCategory,
} from "../projects/simuai/core/catalog.mjs";
import {
  normalizeQuestion,
  rankExperiments,
} from "../projects/simuai/core/matcher.mjs";

test("the offline library contains thirty unique valid experiments across six balanced categories", () => {
  assert.equal(EXPERIMENTS.length, 30);
  assert.equal(new Set(EXPERIMENTS.map(item => item.id)).size, 30);
  assert.equal(EXPERIMENT_CATEGORIES.length, 6);
  assert.deepEqual(
    EXPERIMENT_CATEGORIES.map(category => experimentsForCategory(category).length),
    [5, 5, 5, 5, 5, 5],
  );
  for (const experiment of EXPERIMENTS) {
    const checked = validateExperiment(experiment);
    assert.equal(checked.ok, true, `${experiment.id}: ${checked.errors.join(", ")}`);
    assert.ok(experiment.chart.modes.includes(experiment.chart.type), experiment.id);
    assert.ok(experiment.chart.modes.length >= 2, experiment.id);
  }
});

test("the three showcase experiments span distinct categories and model shapes", () => {
  const showcases = EXPERIMENTS.filter(item => item.featured);
  assert.deepEqual(
    showcases.map(item => item.id),
    ["caffeine-decay", "plant-growth", "game-payback"],
  );
  assert.deepEqual(
    new Set(showcases.map(item => item.category)),
    new Set(["生活日常", "游戏世界", "自然科学"]),
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
  ["手机一直刷视频电量多久用完", "phone-battery"],
  ["植物多久长到接近最大高度", "plant-growth"],
  ["培养皿细菌菌落多久铺满", "bacteria-growth"],
  ["放射性物质经过半衰期还剩多少", "radioactive-decay"],
  ["下雨和用水后储水箱还剩多少水", "rainwater-tank"],
  ["生态食物链每一层能量留存多少", "food-chain"],
  ["游戏体力多久恢复满", "stamina-recovery"],
  ["抽卡多少抽触发保底概率", "gacha-pity"],
  ["游戏关卡玩家最终通关多少", "level-funnel"],
  ["短视频热度几天后衰减多少", "short-video-decay"],
  ["直播观众开播到结束留存多少", "livestream-retention"],
  ["社区成员增长会接近多少上限", "community-growth"],
  ["一条消息最多能扩散到多少人", "message-spread"],
  ["餐厅排队多久能消化完", "restaurant-queue"],
  ["多少人生日相同概率超过一半", "birthday-collision"],
  ["火星殖民人口如何增长", "mars-colony"],
  ["派对披萨按吃的速度多久耗尽", "pizza-consumption"],
  ["游乐园项目排队会越来越长吗", "theme-park-queue"],
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

test("category-only questions recommend experiments from the current six-category catalog", () => {
  for (const category of EXPERIMENT_CATEGORIES) {
    const matches = rankExperiments(category, 3);
    assert.deepEqual(
      matches.map(match => match.experiment.category),
      [category, category, category],
      category,
    );
    assert.equal(matches.every(match => match.score > 0), true, category);
  }
});

test("getExperiment returns a defensive copy", () => {
  const first = getExperiment("caffeine-decay");
  first.title = "changed";
  assert.notEqual(getExperiment("caffeine-decay").title, "changed");
  assert.equal(getExperiment("missing"), null);
});

test("unknown generated categories keep the current catalog category", () => {
  assert.equal(resolveCatalogCategory("未来城市", "游戏世界"), "游戏世界");
  assert.equal(resolveCatalogCategory("自然科学", "游戏世界"), "自然科学");
  assert.equal(resolveCatalogCategory("未来城市"), EXPERIMENT_CATEGORIES[0]);
});
