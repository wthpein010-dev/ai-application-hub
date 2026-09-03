import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 44_100;
const DURATION_SECONDS = 10;
const SAMPLE_COUNT = SAMPLE_RATE * DURATION_SECONDS;
const DATA_BYTES = SAMPLE_COUNT * 2;
const BEAT_SAMPLES = 23_625;
const TONE_PERIODS = [150, 126, 100, 126, 150, 100, 75, 100];

function outputPath() {
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex >= 0) {
    const supplied = process.argv[outputIndex + 1];
    if (!supplied) throw new TypeError("--output requires a path");
    return resolve(supplied);
  }
  const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  return join(repositoryRoot, "projects", "loop-bgm-lab", "assets", "demo-reference.wav");
}

function triangle(sampleIndex, period) {
  const phase = (sampleIndex % period) / period;
  return 1 - 4 * Math.abs(phase - 0.5);
}

function synthesizePcm() {
  const wav = Buffer.alloc(44 + DATA_BYTES);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + DATA_BYTES, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(DATA_BYTES, 40);

  let noise = 0x4c4f4f50;
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const withinBeat = index % BEAT_SAMPLES;
    const beat = Math.floor(index / BEAT_SAMPLES);
    const melodicTone = triangle(index, TONE_PERIODS[beat % TONE_PERIODS.length]);
    const bassTone = triangle(index, 600);
    const melodicEnvelope = Math.max(0, 1 - withinBeat / (BEAT_SAMPLES * 0.62));

    noise ^= noise << 13;
    noise ^= noise >>> 17;
    noise ^= noise << 5;
    const clickEnvelope = withinBeat < 420 ? (420 - withinBeat) / 420 : 0;
    const click = ((noise >>> 16) / 32767.5 - 1) * clickEnvelope;
    const barPulse = beat % 4 === 0 ? Math.max(0, 1 - withinBeat / 1800) : 0;
    const sample = Math.max(-1, Math.min(1,
      0.34 * melodicTone * melodicEnvelope +
      0.13 * bassTone +
      0.20 * click +
      0.08 * barPulse
    ));
    wav.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  }
  return wav;
}

const destination = outputPath();
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, synthesizePcm());
console.log(`Wrote deterministic 10s mono PCM WAV: ${destination}`);
