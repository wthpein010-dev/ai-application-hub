import assert from "node:assert/strict";
import test from "node:test";

import {
  createDotNetRandom,
  evaluateLevelPassRate,
  readPassRateResult,
  resolvePassRateBudget,
  writePassRateResult,
} from "../projects/paws-level-editor/core/pass-rate-evaluator.mjs";

function level(tiles, overrides = {}) {
  return {
    id: 7,
    gameplay: {
      gameLevelOrder: 2,
      ...(overrides.gameplay ?? {}),
    },
    random: {
      blockTypeCount: 32,
      fullTypeMin: 1,
      fullTypeMax: 32,
      ...(overrides.random ?? {}),
    },
    tiles,
    ...overrides,
  };
}

function tile(uid, x, y, layer, type) {
  return { uid, x, y, layer, type };
}

test("the seeded generator matches Unity System.Random", () => {
  const random = createDotNetRandom(1);
  assert.deepEqual(
    Array.from({ length: 5 }, () => random.next()),
    [534011718, 237820880, 1002897798, 1657007234, 1412011072],
  );
});

test("pass-rate budgets match the Unity tile-count thresholds", () => {
  assert.deepEqual(resolvePassRateBudget(40), {
    trials: 24,
    rollouts: 6,
    nodesPerRollout: 2500,
  });
  assert.deepEqual(resolvePassRateBudget(41), {
    trials: 16,
    rollouts: 5,
    nodesPerRollout: 6000,
  });
  assert.deepEqual(resolvePassRateBudget(120), {
    trials: 16,
    rollouts: 5,
    nodesPerRollout: 6000,
  });
  assert.deepEqual(resolvePassRateBudget(121), {
    trials: 12,
    rollouts: 4,
    nodesPerRollout: 10000,
  });
});

test("an empty level returns Unity's zero-percent reason", async () => {
  assert.deepEqual(await evaluateLevelPassRate(level([])), {
    passPercent: 0,
    passCount: 0,
    trialCount: 0,
    invalidDealCount: 0,
    failSolveCount: 0,
    reasons: ["未摆放方块，无法评估通关率。"],
  });
});

test("one exposed fixed pair passes every Unity trial", async () => {
  const progress = [];
  const result = await evaluateLevelPassRate(level([
    tile("a", 0, 0, 1, 3),
    tile("b", 8, 0, 1, 3),
  ]), {
    yieldTask: async () => {},
    onProgress: (value) => progress.push(value),
  });

  assert.deepEqual(result, {
    passPercent: 100,
    passCount: 24,
    trialCount: 24,
    invalidDealCount: 0,
    failSolveCount: 0,
    reasons: [],
  });
  assert.deepEqual(progress.at(-1), { completed: 24, total: 24 });
});

test("an odd full-random pool rejects every deal", async () => {
  const result = await evaluateLevelPassRate(level([
    tile("a", 0, 0, 1, -1),
    tile("b", 8, 0, 1, -1),
    tile("c", 16, 0, 1, -1),
  ]), {
    yieldTask: async () => {},
  });

  assert.deepEqual(result, {
    passPercent: 0,
    passCount: 0,
    trialCount: 0,
    invalidDealCount: 24,
    failSolveCount: 0,
    reasons: ["24 次模拟均无法生成合法偶数配对出盘（盲盒/全随机池约束）。"],
  });
});

test("the same level and ID produce deterministic repeated evaluations", async () => {
  const document = level([
    tile("a", 0, 0, 1, -1),
    tile("b", 8, 0, 1, -1),
    tile("c", 16, 0, 2, -1),
    tile("d", 24, 0, 2, -1),
  ], {
    random: { fullTypeMin: 2, fullTypeMax: 5 },
  });
  const options = { yieldTask: async () => {} };

  assert.deepEqual(
    await evaluateLevelPassRate(document, options),
    await evaluateLevelPassRate(document, options),
  );
});

test("pass-rate metadata round-trips without losing unrelated designerNote keys", () => {
  const original = {
    custom: { keep: true },
    passRatePercent: 12,
  };
  const result = {
    passPercent: 75,
    passCount: 9,
    trialCount: 12,
    invalidDealCount: 1,
    failSolveCount: 3,
    reasons: ["第一条", "第二条"],
  };

  const written = writePassRateResult(original, result);
  assert.notEqual(written, original);
  assert.deepEqual(written.custom, { keep: true });
  assert.deepEqual(readPassRateResult(written), result);
  assert.equal(written.passRateReasonsText, "第一条\n第二条");
  assert.equal(original.passRatePercent, 12);
  assert.equal(readPassRateResult({ custom: true }), null);
});

test("stored pass-rate parsing follows Unity defaults and ignores blank reason lines", () => {
  assert.deepEqual(readPassRateResult({
    passRatePercent: 65,
    passRateReasonsText: "第一条\n\n第二条",
  }), {
    passPercent: 65,
    passCount: 0,
    trialCount: 0,
    invalidDealCount: 0,
    failSolveCount: 0,
    reasons: ["第一条", "第二条"],
  });
});
