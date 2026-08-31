import { assertPortableValue } from "./portable-safety.mjs";

const DEFAULT_STYLE = {
  version: 1,
  intent: "casual-puzzle-level-bgm",
  tempo: { target: 112, min: 110, max: 116 },
  key: "D minor",
  mood: ["upbeat", "playful", "cheeky"],
  instruments: ["bright melodic synth plucks", "springy bass", "crisp light electronic percussion"],
  structure: { bars: 64, loopable: true, intro: "none", outro: "none" },
  mix: ["polished", "wide stereo", "gameplay-safe"],
  exclusions: ["vocals", "fade-out", "tempo changes", "key changes"]
};

const DEFAULT_EXCLUSIONS = [
  "vocals", "rap", "spoken words", "cinematic orchestra", "epic trailer", "long ambient intro",
  "breakdown", "dramatic stop", "tempo changes", "key changes", "fade-out", "distorted bass",
  "melancholic ballad", "lo-fi vinyl noise"
];

const VARIANTS = [
  {
    id: "batch-1",
    changedAxis: "baseline",
    expectedDifference: "Baseline bright pluck, springy bass, and light electronic percussion."
  },
  {
    id: "batch-2",
    changedAxis: "melodyTimbre",
    melody: "toy mallet and short marimba-like synth",
    expectedDifference: "Melody timbre becomes toy mallet and short marimba-like synth."
  },
  {
    id: "batch-3",
    changedAxis: "rhythm",
    rhythm: "subtle syncopation with a more restrained four-on-the-floor drive",
    expectedDifference: "Rhythm adds subtle syncopation and a more restrained four-on-the-floor drive."
  },
  {
    id: "batch-4",
    changedAxis: "percussion",
    percussion: "wooden click, soft clap, and tiny shaker percussion",
    expectedDifference: "Percussion changes to wooden click, soft clap, and tiny shaker."
  },
  {
    id: "batch-5",
    changedAxis: "loopStructure",
    changesLoopStructure: true
  }
];

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function asStringArray(value, fallback) {
  return Array.isArray(value) && value.every(item => typeof item === "string") ? [...value] : [...fallback];
}

export function normalizeStyleSpec(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const tempo = source.tempo && typeof source.tempo === "object" ? source.tempo : {};
  const structure = source.structure && typeof source.structure === "object" ? source.structure : {};
  return {
    version: 1,
    intent: typeof source.intent === "string" ? source.intent : DEFAULT_STYLE.intent,
    tempo: {
      target: Number.isFinite(tempo.target) ? tempo.target : DEFAULT_STYLE.tempo.target,
      min: Number.isFinite(tempo.min) ? tempo.min : DEFAULT_STYLE.tempo.min,
      max: Number.isFinite(tempo.max) ? tempo.max : DEFAULT_STYLE.tempo.max
    },
    key: typeof source.key === "string" ? source.key : DEFAULT_STYLE.key,
    mood: asStringArray(source.mood, DEFAULT_STYLE.mood),
    instruments: asStringArray(source.instruments, DEFAULT_STYLE.instruments),
    structure: {
      bars: Number.isFinite(structure.bars) ? structure.bars : DEFAULT_STYLE.structure.bars,
      loopable: typeof structure.loopable === "boolean" ? structure.loopable : DEFAULT_STYLE.structure.loopable,
      intro: typeof structure.intro === "string" ? structure.intro : DEFAULT_STYLE.structure.intro,
      outro: typeof structure.outro === "string" ? structure.outro : DEFAULT_STYLE.structure.outro
    },
    mix: asStringArray(source.mix, DEFAULT_STYLE.mix),
    exclusions: asStringArray(source.exclusions, DEFAULT_STYLE.exclusions)
  };
}

function naturalList(values, fallback) {
  const items = values.filter(value => typeof value === "string" && value.trim().length > 0);
  if (!items.length) return fallback;
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function structurePhrase(style, variant) {
  const bars = variant.changesLoopStructure ? (style.structure.bars === 32 ? 64 : 32) : style.structure.bars;
  const form = variant.changesLoopStructure ? "A/B gameplay loop" : "gameplay loop";
  const intro = style.structure.intro === "none" ? "no intro" : `${style.structure.intro} intro`;
  const outro = style.structure.outro === "none" ? "no outro" : `${style.structure.outro} outro`;
  const ending = variant.changesLoopStructure
    ? "reinforced ending-to-opening harmony connection"
    : "ending matches the opening harmony and energy";
  return `${style.structure.loopable ? "seamless " : ""}${bars}-bar ${form}, ${intro}, ${outro}, ${ending}`;
}

function buildPrompt(style, variant) {
  const melody = variant.melody ?? style.instruments[0] ?? DEFAULT_STYLE.instruments[0];
  const bass = style.instruments[1] ?? DEFAULT_STYLE.instruments[1];
  const percussion = variant.percussion ?? naturalList(style.instruments.slice(2), DEFAULT_STYLE.instruments[2]);
  const leadMood = style.mood[0] ?? DEFAULT_STYLE.mood[0];
  const motifMood = naturalList(style.mood.slice(1), leadMood);
  const rhythm = variant.rhythm ?? "steady energetic groove";
  const mix = style.mix.join(" ");
  return `Instrumental ${leadMood} casual puzzle game background music, ${style.key}, around ${style.tempo.target} BPM, ${melody}, ${bass}, ${percussion}, ${motifMood} motif, ${rhythm}, ${mix} mix, ${structurePhrase(style, variant)}`;
}

export function createPromptVariants(styleSpec) {
  const style = normalizeStyleSpec(styleSpec);
  const excludePrompt = [...new Set([...style.exclusions, ...DEFAULT_EXCLUSIONS])].join(", ");
  return VARIANTS.map(variant => ({
    id: variant.id,
    changedAxis: variant.changedAxis,
    prompt: buildPrompt(style, variant),
    excludePrompt,
    expectedDifference: variant.changesLoopStructure
      ? `Loop structure changes from ${style.structure.bars} to ${style.structure.bars === 32 ? 64 : 32} bars with a reinforced end-to-start harmonic handoff.`
      : variant.expectedDifference,
    credits: 10,
    status: "planned",
    generatedUrl: null,
    currentRunId: null,
    generationConditions: null,
    currentCandidateId: null,
    candidateHash: null,
    subjectiveScore: null,
    nextRoundNote: "",
    reviewNote: "",
    disposition: "unrated"
  }));
}

export function createDailyPlan(options = {}) {
  const styleSpec = normalizeStyleSpec(options.styleSpec);
  const batches = createPromptVariants(styleSpec);
  const extensions = options.extensions && typeof options.extensions === "object" ? options.extensions : {};
  assertPortableValue(extensions, "extensions");
  return {
    version: 2,
    toolVersion: typeof options.toolVersion === "string" ? options.toolVersion : "loop-bgm-lab/1.1.0",
    ruleCheckedAt: typeof options.ruleCheckedAt === "string" ? options.ruleCheckedAt : "2026-08-30",
    styleSpec,
    credits: { planned: 50, perBatch: 10, batchCount: 5 },
    batches,
    sourceUrl: "https://suno.com/create",
    references: [],
    candidates: [],
    runs: [],
    experiments: [],
    licenses: [],
    currentBestCandidate: null,
    outstandingIssues: [],
    nextRoundSuggestion: null,
    extensions: copy(extensions)
  };
}
