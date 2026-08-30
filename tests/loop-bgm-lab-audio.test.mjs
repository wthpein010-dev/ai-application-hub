import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzePcm,
  estimateKey,
  estimateTempo,
  measureSpectrum,
  mixToMono,
  scoreLoopBoundary
} from "../projects/loop-bgm-lab/core/audio-analysis.mjs";

const SAMPLE_RATE = 16_000;

function sine(frequency, seconds, { amplitude = 0.5, sampleRate = SAMPLE_RATE, phase = 0 } = {}) {
  const output = new Float32Array(Math.round(seconds * sampleRate));
  for (let index = 0; index < output.length; index += 1) {
    output[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate + phase);
  }
  return output;
}

function impulseTrain(bpm, seconds, sampleRate = SAMPLE_RATE) {
  const output = new Float32Array(Math.round(seconds * sampleRate));
  const beatSamples = (60 * sampleRate) / bpm;
  for (let beat = 0; Math.round(beat * beatSamples) < output.length; beat += 1) {
    const start = Math.round(beat * beatSamples);
    for (let offset = 0; offset < 96 && start + offset < output.length; offset += 1) {
      output[start + offset] += 0.9 * Math.exp(-offset / 20);
    }
  }
  return output;
}

function dMinorProgression(seconds = 12, sampleRate = SAMPLE_RATE) {
  const progression = [
    [293.665, 349.228, 440.0],
    [392.0, 466.164, 587.33],
    [440.0, 554.365, 659.255],
    [293.665, 349.228, 440.0]
  ];
  const scale = [293.665, 329.628, 349.228, 392.0, 440.0, 466.164, 523.251, 587.33];
  const output = new Float32Array(Math.round(seconds * sampleRate));
  const segmentLength = Math.floor(output.length / 8);
  for (let index = 0; index < output.length; index += 1) {
    const segment = Math.min(7, Math.floor(index / segmentLength));
    const chord = progression[Math.floor(segment / 2) % progression.length];
    const scaleTone = scale[segment];
    const time = index / sampleRate;
    output[index] = (
      0.19 * Math.sin(2 * Math.PI * chord[0] * time) +
      0.14 * Math.sin(2 * Math.PI * chord[1] * time) +
      0.14 * Math.sin(2 * Math.PI * chord[2] * time) +
      0.08 * Math.sin(2 * Math.PI * scaleTone * time) +
      0.07 * Math.sin(2 * Math.PI * 293.665 * time)
    );
  }
  return output;
}

function assertUnit(value, label) {
  assert.ok(Number.isFinite(value), `${label} must be finite`);
  assert.ok(value >= 0 && value <= 1, `${label} must be in [0, 1], got ${value}`);
}

function assertFiniteTree(value, path = "result") {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} must be finite`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteTree(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => assertFiniteTree(item, `${path}.${key}`));
  }
}

test("mixToMono averages equal-length channels without mutating them", () => {
  const left = new Float32Array([1, 0.5, -1]);
  const right = new Float32Array([-1, 0.5, 1]);
  const mixed = mixToMono([left, right]);

  assert.ok(mixed instanceof Float32Array);
  assert.deepEqual([...mixed], [0, 0.5, 0]);
  assert.deepEqual([...left], [1, 0.5, -1]);
});

test("estimateTempo resolves 110 and 115 BPM impulse trains within three BPM", () => {
  for (const expected of [110, 115]) {
    const result = estimateTempo(impulseTrain(expected, 16), SAMPLE_RATE);
    assert.ok(Math.abs(result.bpm - expected) <= 3, `${result.bpm} should be near ${expected}`);
    assertUnit(result.confidence, "tempo confidence");
    assert.ok(result.confidence >= 0.45, `expected a useful confidence, got ${result.confidence}`);
  }
});

test("estimateKey identifies a D-minor scale and progression fixture", () => {
  const result = estimateKey(dMinorProgression(), SAMPLE_RATE);

  assert.equal(result.name, "D minor");
  assert.equal(result.tonic, "D");
  assert.equal(result.mode, "minor");
  assert.equal(result.chroma.length, 12);
  assertUnit(result.confidence, "key confidence");
  assert.ok(result.confidence >= 0.12, `expected D minor evidence, got ${result.confidence}`);
  assert.ok(Math.abs(result.chroma.reduce((sum, value) => sum + value, 0) - 1) < 1e-6);
});

test("measureSpectrum reports a 440 Hz sine centroid near its hand-set frequency", () => {
  const result = measureSpectrum(sine(440, 2), SAMPLE_RATE);

  assert.ok(Math.abs(result.centroidHz - 440) < 35, `centroid ${result.centroidHz} Hz`);
  assertUnit(result.brightness, "brightness");
});

test("scoreLoopBoundary gives a periodic endpoint a better score than a discontinuity", () => {
  const smooth = sine(200, 4);
  const discontinuous = smooth.slice();
  const quarter = Math.floor(discontinuous.length / 4);
  const reversedEndpoint = discontinuous.slice(discontinuous.length - quarter).reverse();
  for (let offset = 0; offset < quarter; offset += 1) {
    discontinuous[discontinuous.length - quarter + offset] = reversedEndpoint[offset];
  }

  const smoothResult = scoreLoopBoundary(smooth, SAMPLE_RATE);
  const discontinuousResult = scoreLoopBoundary(discontinuous, SAMPLE_RATE);

  assert.ok(smoothResult.score > discontinuousResult.score + 0.08, `${smoothResult.score} vs ${discontinuousResult.score}`);
  assert.ok(smoothResult.score >= 0.75, `smooth score ${smoothResult.score}`);
  assert.deepEqual(Object.keys(smoothResult.components).sort(), ["boundary", "centroid", "chroma", "envelope"]);
  Object.entries(smoothResult.components).forEach(([name, value]) => assertUnit(value, `loop ${name}`));
});

test("analyzePcm returns the stable shape, hand-derived levels, and deterministic bounded values", () => {
  const samples = sine(440, 10);
  const pcm = { sampleRate: SAMPLE_RATE, channels: [samples] };
  const first = analyzePcm(pcm, { maxFrames: 96 });
  const second = analyzePcm(pcm, { maxFrames: 96 });

  assert.deepEqual(second, first);
  assert.deepEqual(Object.keys(first), [
    "durationSeconds", "sampleRate", "channelCount", "peak", "rms", "tempo", "key", "spectrum", "loop", "warnings"
  ]);
  assert.equal(first.durationSeconds, 10);
  assert.equal(first.sampleRate, SAMPLE_RATE);
  assert.equal(first.channelCount, 1);
  assert.ok(Math.abs(first.peak - 0.5) < 1e-5);
  assert.ok(Math.abs(first.rms - 0.5 / Math.sqrt(2)) < 1e-4);
  assertUnit(first.tempo.confidence, "tempo confidence");
  assertUnit(first.key.confidence, "key confidence");
  assertUnit(first.spectrum.brightness, "brightness");
  assertUnit(first.loop.score, "loop score");
  assertFiniteTree(first);
});

test("analyzePcm emits stable coded Chinese warnings for weak but valid PCM", () => {
  const silence = new Float32Array(4_000);
  const silentResult = analyzePcm({ sampleRate: 8_000, channels: [silence] });
  const warningCodes = silentResult.warnings.map(warning => warning.code);

  assert.deepEqual(warningCodes, [
    "short-audio", "low-sample-rate", "near-silence", "low-tempo-confidence", "low-key-confidence"
  ]);
  silentResult.warnings.forEach(warning => assert.match(warning.message, /[\u3400-\u9fff]/));
  assertFiniteTree(silentResult);

  const left = sine(220, 10);
  const right = Float32Array.from(left, value => -value);
  const cancelled = analyzePcm({ sampleRate: SAMPLE_RATE, channels: [left, right] });
  assert.ok(cancelled.warnings.some(warning => warning.code === "channel-cancellation"));
});

test("analyzePcm rejects malformed PCM schemas with clear errors", () => {
  assert.throws(() => analyzePcm(null), /PCM must be an object/);
  assert.throws(() => analyzePcm({ sampleRate: 0, channels: [new Float32Array(4)] }), /sampleRate must be a positive finite number/);
  assert.throws(() => analyzePcm({ sampleRate: SAMPLE_RATE, channels: [] }), /channels must be a non-empty array/);
  assert.throws(() => analyzePcm({ sampleRate: SAMPLE_RATE, channels: [[0, 1]] }), /channel 0 must be a Float32Array/);
  assert.throws(() => analyzePcm({ sampleRate: SAMPLE_RATE, channels: [new Float32Array(2), new Float32Array(3)] }), /same length/);
  assert.throws(() => analyzePcm({ sampleRate: SAMPLE_RATE, channels: [new Float32Array([0, Number.NaN])] }), /finite samples/);
  assert.throws(() => mixToMono([new Float32Array([0, Number.NaN])]), /finite samples/);
});
