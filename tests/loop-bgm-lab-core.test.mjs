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

test("round-trips validated project JSON losslessly and keeps Markdown free of paths and secrets", () => {
  const project = validateProject({
    ...createDailyPlan(),
    sourceUrl: "https://suno.com/create",
    references: [{ displayName: "Reference A", hash: "sha256:reference", features: { tempo: 112 } }],
    candidates: [{ displayName: "Sunny Loop", hash: "sha256:abc", sourceUrl: "https://suno.com/create" }],
    licenses: [{ sourceUrl: "https://example.test/license", license: "CC0" }],
    currentBestCandidate: { displayName: "Sunny Loop", hash: "sha256:abc" },
    extensions: { futureSetting: { enabled: true } }
  });
  project.batches[0].nextRoundNote = "Do not retain C:\\Users\\listener\\loop.wav";
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
