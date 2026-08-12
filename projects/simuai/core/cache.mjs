import { normalizeQuestion } from "./matcher.mjs";
import { SCHEMA_VERSION, validateExperiment } from "./schema.mjs";

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createCache(storage, namespace = "simuai:v1") {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new TypeError("A Storage-compatible object is required");
  }

  const keyFor = question => `${namespace}:${hashText(normalizeQuestion(question))}`;

  return {
    keyFor,
    get(question) {
      const key = keyFor(question);
      try {
        const parsed = JSON.parse(storage.getItem(key));
        if (parsed?.version !== SCHEMA_VERSION) return null;
        const checked = validateExperiment(parsed.spec);
        if (!checked.ok) return null;
        return { ...checked.value, source: "cache" };
      } catch {
        return null;
      }
    },
    set(question, spec) {
      const checked = validateExperiment(spec);
      if (!checked.ok) throw new TypeError(`Invalid experiment: ${checked.errors.join(", ")}`);
      storage.setItem(keyFor(question), JSON.stringify({
        version: SCHEMA_VERSION,
        spec: checked.value,
      }));
    },
    remove(question) {
      storage.removeItem(keyFor(question));
    },
  };
}
