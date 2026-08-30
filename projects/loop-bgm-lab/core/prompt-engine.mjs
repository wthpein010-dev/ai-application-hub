const DEFAULT_STYLE = {
  version: 1,
  intent: "casual-puzzle-level-bgm",
  tempo: { target: 112, min: 110, max: 116 },
  key: "D minor",
  mood: ["upbeat", "playful", "cheeky"],
  instruments: ["bright synth plucks", "springy bass", "light electronic percussion"],
  structure: { bars: 64, loopable: true, intro: "none", outro: "none" },
  mix: ["polished", "wide stereo", "gameplay-safe"],
  exclusions: ["vocals", "fade-out", "tempo changes", "key changes"]
};

const EXCLUDE_PROMPT = "vocals, rap, spoken words, cinematic orchestra, epic trailer, long ambient intro, breakdown, dramatic stop, tempo changes, key changes, fade-out, distorted bass, melancholic ballad, lo-fi vinyl noise";
const FORBIDDEN_KEY = /(audioBytes|cookie|token|apiKey|recoveryKey|session)/i;
const LOCAL_PATH_KEY = /^(?:localPath|filePath|audioPath|path)$/i;

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
    loopStructure: "seamless 32-bar A/B loop, no intro, no outro, reinforced ending-to-opening harmony connection",
    expectedDifference: "Loop structure becomes a shorter 32-bar A/B cycle with a reinforced end-to-start harmonic handoff."
  }
];

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertSafeExtension(value, key = "") {
  if (FORBIDDEN_KEY.test(key)) throw new TypeError(`Forbidden key: ${key}`);
  if (LOCAL_PATH_KEY.test(key) && typeof value === "string" && (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/"))) {
    throw new TypeError(`Absolute path is not allowed in ${key}`);
  }
  if (Array.isArray(value)) {
    value.forEach(item => assertSafeExtension(item));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([childKey, childValue]) => assertSafeExtension(childValue, childKey));
  }
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

function buildPrompt(style, variant) {
  const melody = variant.melody ?? "bright melodic synth plucks";
  const rhythm = variant.rhythm ?? "steady energetic groove";
  const percussion = variant.percussion ?? "crisp light electronic percussion";
  const loopStructure = variant.loopStructure ?? "seamless 64-bar gameplay loop, no intro, no outro, ending matches the opening harmony and energy";
  return `Instrumental upbeat casual puzzle game background music, ${style.key}, around ${style.tempo.target} BPM, ${melody}, springy bass, ${percussion}, playful and cheeky motif, ${rhythm}, polished wide stereo mix, ${loopStructure}`;
}

export function createPromptVariants(styleSpec) {
  const style = normalizeStyleSpec(styleSpec);
  return VARIANTS.map(variant => ({
    id: variant.id,
    changedAxis: variant.changedAxis,
    prompt: buildPrompt(style, variant),
    excludePrompt: EXCLUDE_PROMPT,
    expectedDifference: variant.expectedDifference,
    credits: 10,
    status: "planned",
    generatedUrl: null,
    candidateHash: null,
    subjectiveScore: null,
    nextRoundNote: ""
  }));
}

export function createDailyPlan(options = {}) {
  const styleSpec = normalizeStyleSpec(options.styleSpec);
  const batches = createPromptVariants(styleSpec);
  const extensions = options.extensions && typeof options.extensions === "object" ? options.extensions : {};
  assertSafeExtension(extensions);
  return {
    version: 1,
    toolVersion: typeof options.toolVersion === "string" ? options.toolVersion : "loop-bgm-lab/1.0.0",
    ruleCheckedAt: typeof options.ruleCheckedAt === "string" ? options.ruleCheckedAt : "2026-08-30",
    styleSpec,
    credits: { planned: 50, perBatch: 10, batchCount: 5 },
    batches,
    extensions: copy(extensions)
  };
}
