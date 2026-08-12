import { EXPERIMENTS } from "./templates.mjs";

const PUNCTUATION = /[\s\p{P}\p{S}]+/gu;

export function normalizeQuestion(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(PUNCTUATION, "")
    .trim();
}

function categoryTerms(category) {
  if (category === "生活科普") return ["生活", "科普", "健康"];
  if (category === "游戏产品") return ["游戏", "产品", "玩家"];
  return ["商业", "业务", "公司"];
}

function scoreExperiment(question, experiment) {
  const normalized = normalizeQuestion(question);
  const matchedTerms = [];
  let score = 0;

  for (const keyword of experiment.keywords) {
    const term = normalizeQuestion(keyword);
    if (term && normalized.includes(term)) {
      score += 4;
      matchedTerms.push(keyword);
    }
  }

  for (const term of categoryTerms(experiment.category)) {
    if (normalized.includes(normalizeQuestion(term))) score += 2;
  }

  const titleTokens = normalizeQuestion(experiment.title).match(/[a-z0-9]+|[\p{Script=Han}]{2,}/gu) ?? [];
  for (const token of titleTokens) {
    if (normalized.includes(token) && !matchedTerms.includes(token)) {
      score += 1;
      matchedTerms.push(token);
    }
  }

  return { experiment, score, matchedTerms };
}

export function rankExperiments(question, limit = 3) {
  const safeLimit = Math.max(1, Math.min(EXPERIMENTS.length, Math.trunc(limit) || 3));
  return EXPERIMENTS
    .map((experiment, index) => ({ ...scoreExperiment(question, experiment), index }))
    .toSorted((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, safeLimit)
    .map(({ index: _index, ...match }) => ({
      ...match,
      experiment: structuredClone(match.experiment),
    }));
}
