import test from "node:test";
import assert from "node:assert/strict";

import {
  exportProjectJson,
  exportProjectMarkdown,
  importProjectJson,
  stableStringify,
  transitionBatch,
  validateProject
} from "../projects/loop-bgm-lab/core/project-state.mjs";
import {
  createDailyPlan,
  createPromptVariants,
  normalizeStyleSpec
} from "../projects/loop-bgm-lab/core/prompt-engine.mjs";

const BASELINE_PROMPT = "Instrumental upbeat casual puzzle game background music, D minor, around 112 BPM, bright melodic synth plucks, springy bass, crisp light electronic percussion, playful and cheeky motif, steady energetic groove, polished wide stereo mix, seamless 64-bar gameplay loop, no intro, no outro, ending matches the opening harmony and energy";
const BASELINE_GROUPS = {
  melodyTimbre: "bright melodic synth plucks",
  bass: "springy bass",
  percussion: "crisp light electronic percussion",
  motif: "playful and cheeky motif",
  rhythm: "steady energetic groove",
  mix: "polished wide stereo mix",
  loopStructure: "seamless 64-bar gameplay loop, no intro, no outro, ending matches the opening harmony and energy"
};
const VARIANT_GROUP_VALUES = {
  melodyTimbre: "toy mallet and short marimba-like synth",
  rhythm: "subtle syncopation with a more restrained four-on-the-floor drive",
  percussion: "wooden click, soft clap, and tiny shaker percussion",
  loopStructure: "seamless 32-bar A/B loop, no intro, no outro, reinforced ending-to-opening harmony connection"
};

test("stableStringify orders object keys while preserving array order", () => {
  assert.equal(
    stableStringify({ z: 2, a: { b: true, a: ["second", "first"] } }),
    '{"a":{"a":["second","first"],"b":true},"z":2}'
  );
});

test("normalizes the approved D minor 112 BPM style baseline", () => {
  const style = normalizeStyleSpec({});

  assert.deepEqual(style.tempo, { target: 112, min: 110, max: 116 });
  assert.equal(style.key, "D minor");
  assert.deepEqual(style.structure, { bars: 64, loopable: true, intro: "none", outro: "none" });
  assert.deepEqual(style.instruments, ["bright synth plucks", "springy bass", "light electronic percussion"]);
});

test("creates five deterministic single-axis prompt variants", () => {
  const variants = createPromptVariants(normalizeStyleSpec({}));

  assert.equal(variants.length, 5);
  assert.deepEqual(variants.map(variant => variant.id), ["batch-1", "batch-2", "batch-3", "batch-4", "batch-5"]);
  assert.deepEqual(variants.map(variant => variant.changedAxis), ["baseline", "melodyTimbre", "rhythm", "percussion", "loopStructure"]);
  assert.equal(variants[0].prompt, BASELINE_PROMPT);
  for (const variant of variants) {
    assert.equal(variant.credits, 10);
    assert.equal(variant.status, "planned");
    assert.match(variant.excludePrompt, /vocals/);
  }
  for (const variant of variants.slice(1)) {
    for (const [group, baselineValue] of Object.entries(BASELINE_GROUPS)) {
      const expected = group === variant.changedAxis ? VARIANT_GROUP_VALUES[group] : baselineValue;
      assert.match(variant.prompt, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});

test("creates a five-batch 50-credit daily plan without treating it as account balance", () => {
  const plan = createDailyPlan({ ruleCheckedAt: "2026-08-30" });

  assert.equal(plan.version, 1);
  assert.equal(plan.ruleCheckedAt, "2026-08-30");
  assert.deepEqual(plan.credits, { planned: 50, perBatch: 10, batchCount: 5 });
  assert.equal(plan.batches.length, 5);
  assert.equal(plan.batches.reduce((sum, batch) => sum + batch.credits, 0), 50);
  assert.match(
    exportProjectMarkdown(plan),
    /Local plan based on rules checked on 2026-08-30; not an actual account balance\./
  );
});

test("allows only explicit batch status transitions and never infers submission from links", () => {
  const plan = createDailyPlan();
  const linked = transitionBatch(plan, "batch-1", "planned", { generatedUrl: "https://suno.com/create" });
  const submitted = transitionBatch(linked, "batch-1", "submitted");
  const downloaded = transitionBatch(submitted, "batch-1", "downloaded", { candidateHash: "sha256:abc" });
  const reviewed = transitionBatch(downloaded, "batch-1", "reviewed", { subjectiveScore: 4 });

  assert.equal(linked.batches[0].status, "planned");
  assert.equal(reviewed.batches[0].status, "reviewed");
  assert.throws(() => transitionBatch(plan, "batch-1", "downloaded"), /Invalid status transition/);
  assert.throws(() => transitionBatch(reviewed, "batch-1", "submitted"), /Invalid status transition/);
  assert.throws(() => transitionBatch(plan, "batch-1", "planned", { id: "batch-other" }), /Unsupported batch patch field/);
});

test("validates a deep-copied project and preserves unknown top-level fields under extensions", () => {
  const plan = createDailyPlan();
  const validated = validateProject({ ...plan, futureSetting: { enabled: true } });

  assert.deepEqual(validated.extensions, { futureSetting: { enabled: true } });
  validated.styleSpec.tempo.target = 120;
  assert.equal(plan.styleSpec.tempo.target, 112);
});

test("rejects audio bytes and secret-bearing keys anywhere in project input", () => {
  const plan = createDailyPlan();

  assert.throws(() => validateProject({ ...plan, audioBytes: "not allowed" }), /forbidden key/i);
  assert.throws(() => validateProject({ ...plan, extensions: { cookie: "not allowed" } }), /forbidden key/i);
  assert.throws(() => validateProject({ ...plan, batches: [{ ...plan.batches[0], apiKey: "not allowed" }] }), /forbidden key/i);
  assert.throws(() => createDailyPlan({ extensions: { recoveryKey: "not allowed" } }), /forbidden key/i);
});

test("rejects absolute local paths but permits HTTPS source URLs", () => {
  const plan = createDailyPlan();

  assert.doesNotThrow(() => validateProject({ ...plan, sourceUrl: "https://suno.com/create" }));
  assert.throws(() => validateProject({ ...plan, localPath: "C:\\Users\\music.wav" }), /absolute path/i);
  assert.throws(() => validateProject({ ...plan, localPath: "/Users/music.wav" }), /absolute path/i);
});

test("project validation rejects sensitive local-path fields through nested arrays and UNC paths", () => {
  const plan = createDailyPlan();

  for (const value of [
    { extensions: { localPath: ["C:\\private\\audio.wav"] } },
    { extensions: { metadata: { audioPath: [["/private/audio.wav"]] } } },
    { extensions: { filePath: "\\\\server\\share\\audio.wav" } },
    { experiments: [{ id: "run-1", metadata: { localPath: ["C:\\private\\audio.wav"] } }] }
  ]) {
    assert.throws(() => validateProject({ ...plan, ...value }), /absolute path/i);
  }
});

test("portable project validation rejects path, local URL, filename, and raw-audio payloads regardless of nesting", () => {
  // Break caught: a malicious import survives under an innocuous extension key and is re-exported.
  const plan = createDailyPlan();
  const rejected = [
    { extensions: { note: "private source C:\\Users\\Alice\\reference.wav" } },
    { extensions: { note: "prefix=C:\\Users\\Alice\\reference.wav" } },
    { extensions: { note: "private source /Users/alice/reference.wav" } },
    { extensions: { note: "private source \\\\server\\share\\reference.wav" } },
    { extensions: { playback: "blob:https://example.test/private" } },
    { extensions: { playback: "url=blob:https://example.test/private" } },
    { extensions: { playback: "file:///Users/alice/reference.wav" } },
    { extensions: { originalFileName: "reference" } },
    { extensions: { note: "reference.wav" } },
    { extensions: { note: "selected=reference.wav" } },
    { extensions: { rawSamples: "redacted" } },
    { extensions: { payloadAudioCache: "redacted" } },
    { extensions: { waveform: [0.1, 0.2, 0.3] } },
    { extensions: { metadata: { unknown: [[1, 2, 3]] } } }
  ];

  for (const value of rejected) {
    assert.throws(() => validateProject({ ...plan, ...value }), /portable|path|file name|audio|numeric array|forbidden/i);
    assert.throws(() => importProjectJson(JSON.stringify({ ...plan, ...value })), /portable|path|file name|audio|numeric array|forbidden/i);
  }
});

test("portable project validation preserves HTTPS audio sources and explicit 12-value analysis chroma", () => {
  // Break caught: privacy hardening blocks the published feature schema or legitimate HTTPS evidence.
  const plan = validateProject({
    ...createDailyPlan(),
    sourceUrl: "https://example.test/music/reference.wav",
    references: [{
      id: "reference-1",
      hash: "a".repeat(64),
      analysis: {
        durationSeconds: 10,
        sampleRate: 44_100,
        channelCount: 1,
        key: { name: "C major", tonic: "C", mode: "major", confidence: 0.9, chroma: Array(12).fill(1 / 12) }
      }
    }]
  });

  assert.equal(plan.sourceUrl, "https://example.test/music/reference.wav");
  assert.equal(plan.references[0].analysis.key.chroma.length, 12);
  assert.throws(() => validateProject({
    ...createDailyPlan(),
    references: [{ id: "reference-1", hash: "a".repeat(64), analysis: { key: { chroma: Array(11).fill(0.1) } } }]
  }), /chroma/i);
});

test("portable project validation rejects duplicate imported license IDs", () => {
  const license = {
    id: "license-7",
    source: "Freesound",
    sourceUrl: "https://freesound.org/s/7/",
    license: "CC0",
    fileSha256: "a".repeat(64)
  };
  assert.throws(() => validateProject({ ...createDailyPlan(), licenses: [license, { ...license, sourceUrl: "https://freesound.org/s/8/" }] }), /license ids must be unique/i);
});

test("project validation and JSON import keep nested secret validation under path-labelled values", () => {
  const plan = createDailyPlan();
  const nestedToken = { ...plan, extensions: { localPath: { token: "secret" } } };
  const nestedApiKey = { ...plan, extensions: { localPath: [{ apiKey: "secret" }] } };

  assert.throws(() => validateProject(nestedToken), /forbidden key/i);
  assert.throws(() => validateProject(nestedApiKey), /forbidden key/i);
  assert.throws(() => importProjectJson(JSON.stringify(nestedToken)), /forbidden key/i);
  assert.doesNotThrow(() => validateProject({ ...plan, extensions: { metadata: { sourceUrl: "https://example.test/audio" } } }));
});

test("round-trips validated project JSON losslessly and keeps Markdown free of paths and secrets", () => {
  const project = validateProject({
    ...createDailyPlan(),
    sourceUrl: "https://suno.com/create",
    references: [{ label: "Reference A", hash: "sha256:reference", features: { tempo: 112 } }],
    candidates: [{ label: "Sunny Loop", hash: "sha256:abc", sourceUrl: "https://suno.com/create" }],
    licenses: [{
      id: "license-cc0-a",
      source: "Example",
      sourceUrl: "https://example.test/license",
      license: "CC0",
      fileSha256: "a".repeat(64)
    }],
    currentBestCandidate: { label: "Sunny Loop", hash: "sha256:abc" },
    extensions: { futureSetting: { enabled: true } }
  });
  project.batches[0].nextRoundNote = "Keep the next iteration focused on one axis.";
  const json = exportProjectJson(project);
  const restored = importProjectJson(json);
  const markdown = exportProjectMarkdown(project);

  assert.deepEqual(restored, project);
  assert.equal(json, stableStringify(project));
  assert.match(markdown, /# 循环乐工房项目交接/);
  assert.match(markdown, /Sunny Loop/);
  assert.match(markdown, /Reference A/);
  assert.match(markdown, /CC0/);
  assert.match(markdown, /https:\/\/suno\.com\/create/);
  assert.match(markdown, /https:\/\/example\.test\/license/);
  assert.doesNotMatch(markdown, /C:\\|\/Users\/|cookie|token|apiKey|recoveryKey/i);
});
