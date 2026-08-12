import { compileQuestion } from "./compiler-client.mjs";
import { rankExperiments } from "./matcher.mjs";

export async function resolveQuestion(question, options = {}) {
  const matches = rankExperiments(question, 3);
  const strongMatch = matches[0]?.score >= (options.localThreshold ?? 8);
  if (strongMatch) {
    return { mode: "local", experiment: matches[0].experiment, recommendations: matches };
  }

  const cached = options.cache?.get(question);
  if (cached) return { mode: "cache", experiment: cached, recommendations: matches };

  const compileImpl = options.compileImpl ?? compileQuestion;
  try {
    const experiment = await compileImpl(question);
    options.cache?.set(question, experiment);
    return { mode: "ai", experiment, recommendations: matches };
  } catch (error) {
    return { mode: "fallback", experiment: null, recommendations: matches, error };
  }
}
