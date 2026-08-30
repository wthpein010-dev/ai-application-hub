import test from "node:test";
import assert from "node:assert/strict";

const policyUrl = new URL("../projects/loop-bgm-lab/core/browser-policy.mjs", import.meta.url);

async function loadPolicy() {
  try {
    return await import(policyUrl);
  } catch (error) {
    assert.fail(`browser policy module must exist and load: ${error.message}`);
  }
}

const defaultStyle = {
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

test("confidence-weighted reference aggregation updates key and tempo while preserving the rest of StyleSpec", async () => {
  // Break caught: analysis metrics render but the prompt-producing StyleSpec remains at D minor / 112 BPM.
  const { aggregateReferenceStyle } = await loadPolicy();
  const records = [
    { analysis: { tempo: { bpm: 96, confidence: 0.9 }, key: { name: "C major", confidence: 0.8 } } },
    { analysis: { tempo: { bpm: 124, confidence: 0.1 }, key: { name: "E minor", confidence: 0.1 } } }
  ];

  const style = aggregateReferenceStyle(records, defaultStyle);

  assert.deepEqual(style.tempo, { target: 96, min: 93, max: 100 });
  assert.equal(style.key, "C major");
  assert.deepEqual(style.instruments, defaultStyle.instruments);
  assert.deepEqual(style.structure, defaultStyle.structure);
});

test("reference aggregation respects persisted user overrides for key and tempo", async () => {
  // Break caught: a later file selection silently replaces the user's explicit style controls.
  const { aggregateReferenceStyle } = await loadPolicy();
  const records = [{ analysis: { tempo: { bpm: 96, confidence: 0.9 }, key: { name: "C major", confidence: 0.8 } } }];

  const style = aggregateReferenceStyle(records, defaultStyle, { key: true, tempo: true });

  assert.equal(style.key, "D minor");
  assert.deepEqual(style.tempo, defaultStyle.tempo);
});

test("empty reference aggregation resets learned key/tempo fields while retaining a non-default imported bar count", async () => {
  // Break caught: deleting the final reference leaves its learned key/tempo in StyleSpec and rebuilt prompts.
  const { aggregateReferenceStyle } = await loadPolicy();
  const learnedStyle = {
    ...defaultStyle,
    key: "C major",
    tempo: { target: 96, min: 93, max: 100 },
    mood: ["reference-derived"],
    structure: { ...defaultStyle.structure, bars: 32 }
  };
  const cases = [
    { name: "no overrides", overrides: {}, key: "D minor", tempo: defaultStyle.tempo },
    { name: "tempo only", overrides: { tempo: true }, key: "D minor", tempo: learnedStyle.tempo },
    { name: "key only", overrides: { key: true }, key: "C major", tempo: defaultStyle.tempo },
    { name: "both", overrides: { key: true, tempo: true }, key: "C major", tempo: learnedStyle.tempo }
  ];

  for (const entry of cases) {
    const actual = aggregateReferenceStyle([], learnedStyle, entry.overrides);
    assert.deepEqual(actual, {
      ...defaultStyle,
      key: entry.key,
      tempo: entry.tempo,
      structure: { ...defaultStyle.structure, bars: 32 },
    }, entry.name);
  }
});

test("an explicit bars override survives reference aggregation and deleting the final reference", async () => {
  // Break caught: selecting 32 bars is persisted visually but deleting references silently rebuilds 64-bar prompts.
  const { aggregateReferenceStyle } = await loadPolicy();
  const selected32 = {
    ...defaultStyle,
    structure: { ...defaultStyle.structure, bars: 32 },
  };
  const learned = [{ analysis: { tempo: { bpm: 96, confidence: 0.9 }, key: { name: "C major", confidence: 0.8 } } }];

  assert.equal(aggregateReferenceStyle(learned, selected32, { bars: true }).structure.bars, 32);
  assert.equal(aggregateReferenceStyle([], selected32, { bars: true }).structure.bars, 32);
  assert.equal(aggregateReferenceStyle([], selected32, {}).structure.bars, 32);
});

test("decoded audio budgets reject long metadata and excessive scalar samples before analysis", async () => {
  // Break caught: a small compressed file expands to an unbounded AudioBuffer and freezes sample extraction.
  const {
    MAX_DECODED_DURATION_SECONDS,
    MAX_DECODED_SCALAR_SAMPLES,
    assertPredecodeAudioBudget,
    assertDecodedAudioBudget
  } = await loadPolicy();

  assert.throws(
    () => assertPredecodeAudioBudget({ durationSeconds: MAX_DECODED_DURATION_SECONDS + 0.01 }),
    /解码时长|duration/i
  );
  assert.doesNotThrow(() => assertPredecodeAudioBudget({ durationSeconds: 10 }));
  assert.throws(() => assertDecodedAudioBudget({
    durationSeconds: 10,
    length: Math.floor(MAX_DECODED_SCALAR_SAMPLES / 2) + 1,
    channelCount: 2,
    sampleRate: 44_100
  }), /采样总量|sample/i);
  assert.doesNotThrow(() => assertDecodedAudioBudget({
    durationSeconds: 10,
    length: 441_000,
    channelCount: 1,
    sampleRate: 44_100
  }));
});

test("monotonic IDs never reuse a surviving imported or post-deletion license ID", async () => {
  // Break caught: deleting license-1 makes a length-based allocator duplicate surviving license-2.
  const { nextMonotonicId } = await loadPolicy();

  assert.equal(nextMonotonicId([{ id: "license-2" }, { id: "license-9" }, { id: "legacy-custom" }], "license"), "license-10");
  assert.equal(nextMonotonicId([{ id: "license-2" }], "license"), "license-3");
  assert.equal(nextMonotonicId([], "license"), "license-1");
});
