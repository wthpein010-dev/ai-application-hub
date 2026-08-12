import { MODEL_TYPES } from "./schema.mjs";

const MAX_POINTS = 240;

function finiteValues(inputValues) {
  const values = Object.fromEntries(
    Object.entries(inputValues ?? {}).map(([key, value]) => [key, Number(value)]),
  );
  if (Object.values(values).some(value => !Number.isFinite(value))) {
    throw new RangeError("All model inputs must be finite numbers");
  }
  return values;
}

function durationPoints(duration, calculate) {
  const safeDuration = Math.max(0, duration);
  const count = Math.max(1, Math.min(MAX_POINTS, Math.ceil(safeDuration)));
  const step = safeDuration / count;
  return Array.from({ length: count + 1 }, (_, index) => {
    const x = index === count ? safeDuration : index * step;
    return { x, value: calculate(x) };
  });
}

function linear(_spec, values) {
  const initial = values.initial ?? 0;
  const rate = values.rate ?? 0;
  const duration = Math.max(0, values.duration ?? 0);
  const series = durationPoints(duration, time => initial + rate * time);
  return {
    series,
    outputs: { finalValue: series.at(-1).value, totalChange: rate * duration },
    warnings: [],
  };
}

function compound(_spec, values) {
  const principal = Math.max(0, values.principal ?? 0);
  const contribution = Math.max(0, values.contribution ?? 0);
  const annualRate = values.annualRate ?? 0;
  const years = Math.max(0, values.years ?? 0);
  const months = Math.max(0, Math.round(years * 12));
  const sampleEvery = Math.max(1, Math.ceil(months / MAX_POINTS));
  const monthlyRate = annualRate / 100 / 12;
  let balance = principal;
  const series = [{ x: 0, value: balance }];
  for (let month = 1; month <= months; month += 1) {
    balance = balance * (1 + monthlyRate) + contribution;
    if (!Number.isFinite(balance)) throw new RangeError("Compound result is not finite");
    if (month % sampleEvery === 0 || month === months) series.push({ x: month, value: balance });
  }
  const totalContributed = principal + contribution * months;
  return {
    series,
    outputs: {
      finalValue: balance,
      totalContributed,
      interestEarned: balance - totalContributed,
    },
    warnings: annualRate < 0 ? ["收益率为负时，本金可能下降。"] : [],
  };
}

function decay(_spec, values) {
  const initial = Math.max(0, values.initial ?? 0);
  const halfLife = values.halfLife ?? 0;
  const duration = Math.max(0, values.duration ?? 0);
  if (halfLife <= 0) throw new RangeError("halfLife must be positive");
  const series = durationPoints(duration, time => initial * (0.5 ** (time / halfLife)));
  return {
    series,
    outputs: {
      finalValue: series.at(-1).value,
      percentRemaining: initial === 0 ? 0 : series.at(-1).value / initial * 100,
    },
    warnings: [],
  };
}

function funnel(spec, values) {
  const entryKey = spec.entryKey ?? "audience";
  const audience = Math.max(0, values[entryKey] ?? 0);
  const rateKeys = (spec.rateKeys ?? Object.keys(values).filter(key => /^rate\d+$/.test(key)))
    .toSorted((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const series = [{ x: 0, label: spec.stageLabels?.[0] ?? "起始", value: audience }];
  let current = audience;
  rateKeys.forEach((key, index) => {
    const rate = Math.min(100, Math.max(0, values[key] ?? 0));
    current *= rate / 100;
    series.push({ x: index + 1, label: spec.stageLabels?.[index + 1] ?? `阶段 ${index + 1}`, value: current });
  });
  return {
    series,
    outputs: {
      finalValue: current,
      overallRate: audience === 0 ? 0 : current / audience * 100,
    },
    warnings: [],
  };
}

function inventory(_spec, values) {
  const initialStock = Math.max(0, values.initialStock ?? 0);
  const dailyInflow = Math.max(0, values.dailyInflow ?? 0);
  const dailyOutflow = Math.max(0, values.dailyOutflow ?? 0);
  const duration = Math.max(0, values.duration ?? 0);
  const netOutflow = dailyOutflow - dailyInflow;
  const depletionTime = netOutflow > 0 ? initialStock / netOutflow : null;
  const series = durationPoints(duration, day => Math.max(0, initialStock - netOutflow * day));
  return {
    series,
    outputs: {
      finalValue: series.at(-1).value,
      depletionTime: depletionTime === null ? -1 : depletionTime,
      netDailyChange: dailyInflow - dailyOutflow,
    },
    warnings: depletionTime === null ? ["当前流入不少于流出，库存不会耗尽。"] : [],
  };
}

function payback(_spec, values) {
  const dailySpend = Math.max(0, values.dailySpend ?? 0);
  const dailyUsers = Math.max(0, values.dailyUsers ?? 0);
  const day1Retention = Math.min(100, Math.max(0, values.day1Retention ?? 0));
  const revenuePerActiveUser = Math.max(0, values.revenuePerActiveUser ?? 0);
  const duration = Math.max(0, Math.min(MAX_POINTS, Math.round(values.duration ?? 0)));
  const retention = day1Retention / 100;
  let paybackDay = -1;
  let totalRevenue = 0;
  const series = [{ x: 0, value: 0, revenue: 0, cost: 0, activeUsers: 0 }];
  for (let day = 1; day <= duration; day += 1) {
    const activeUsers = retention === 1
      ? dailyUsers * day
      : dailyUsers * (1 - retention ** day) / (1 - retention);
    totalRevenue += activeUsers * revenuePerActiveUser;
    const revenue = totalRevenue;
    const cost = dailySpend * day;
    const value = revenue - cost;
    if (paybackDay === -1 && value >= 0 && revenue > 0) paybackDay = day;
    series.push({ x: day, value, revenue, cost, activeUsers });
  }
  const final = series.at(-1);
  return {
    series,
    outputs: {
      finalValue: final.value,
      totalRevenue: final.revenue,
      totalCost: final.cost,
      paybackDay,
      roi: final.cost === 0 ? 0 : final.value / final.cost * 100,
    },
    warnings: paybackDay < 0 ? ["观察期内尚未回本。"] : [],
  };
}

const engines = { linear, compound, decay, funnel, inventory, payback };

export function runModel(spec, inputValues) {
  if (!MODEL_TYPES.includes(spec?.modelType) || !engines[spec.modelType]) {
    throw new TypeError(`Unsupported model type: ${spec?.modelType ?? "unknown"}`);
  }
  const result = engines[spec.modelType](spec, finiteValues(inputValues));
  const outputValues = Object.values(result.outputs);
  if (result.series.some(point => !Number.isFinite(point.value)) || outputValues.some(value => !Number.isFinite(value))) {
    throw new RangeError("Model result must contain only finite numbers");
  }
  return result;
}
