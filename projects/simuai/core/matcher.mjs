import { EXPERIMENTS } from "./templates.mjs";

const PUNCTUATION = /[\s\p{P}\p{S}]+/gu;

export function normalizeQuestion(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(PUNCTUATION, "")
    .trim();
}

const CATEGORY_TERMS = Object.freeze({
  "生活日常": ["生活", "日常", "健康"],
  "自然科学": ["自然", "科学", "生态"],
  "游戏世界": ["游戏", "玩家", "虚拟"],
  "商业决策": ["商业", "业务", "经营", "决策"],
  "社交传播": ["社交", "传播", "内容", "流量"],
  "趣味脑洞": ["趣味", "脑洞", "假想", "奇思"],
});

function categoryTerms(category) {
  return CATEGORY_TERMS[category] ?? [];
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
