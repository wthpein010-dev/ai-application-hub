import { EXPERIMENTS } from "./templates.mjs";

export const EXPERIMENT_CATEGORIES = Object.freeze([
  "生活日常",
  "自然科学",
  "游戏世界",
  "商业决策",
  "社交传播",
  "趣味脑洞",
]);

export function experimentsForCategory(category) {
  if (!EXPERIMENT_CATEGORIES.includes(category)) return [];
  return EXPERIMENTS.filter(experiment => experiment.category === category);
}
