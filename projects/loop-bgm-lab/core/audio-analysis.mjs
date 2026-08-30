const FFT_SIZE = 2048;
const HOP_SIZE = 512;
const DEFAULT_MAX_FRAMES = 1024;
const MIN_TEMPO_BPM = 70;
const MAX_TEMPO_BPM = 160;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const LOOP_WEIGHTS = { envelope: 0.30, chroma: 0.35, centroid: 0.20, boundary: 0.15 };
const WARNING_DEFINITIONS = {
  "short-audio": "音频短于 8 秒，分析结果可能不稳定。",
  "low-sample-rate": "采样率较低，频谱与调性分析精度可能受限。",
  "near-silence": "音频接近静音，无法可靠提取音乐特征。",
  "channel-cancellation": "声道混合后出现明显相消，请检查立体声相位。",
  "low-tempo-confidence": "速度置信度较低，建议人工核对节拍。",
  "low-key-confidence": "调性置信度较低，建议人工核对调性。"
};

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

function assertSampleRate(sampleRate) {
  if (typeof sampleRate !== "number" || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new TypeError("sampleRate must be a positive finite number");
  }
}

function assertSamples(samples, label = "samples") {
  if (!(samples instanceof Float32Array)) throw new TypeError(`${label} must be a Float32Array`);
  for (let index = 0; index < samples.length; index += 1) {
    if (!Number.isFinite(samples[index])) throw new TypeError(`${label} must contain only finite samples`);
  }
}

function validatePcm(pcm) {
  if (!pcm || typeof pcm !== "object" || Array.isArray(pcm)) throw new TypeError("PCM must be an object");
  assertSampleRate(pcm.sampleRate);
  if (!Array.isArray(pcm.channels) || pcm.channels.length === 0) {
    throw new TypeError("channels must be a non-empty array");
  }
  let length = null;
  pcm.channels.forEach((channel, index) => {
    if (!(channel instanceof Float32Array)) throw new TypeError(`channel ${index} must be a Float32Array`);
    if (length === null) length = channel.length;
    if (channel.length !== length) throw new TypeError("all channels must have the same length");
    for (let sampleIndex = 0; sampleIndex < channel.length; sampleIndex += 1) {
      if (!Number.isFinite(channel[sampleIndex])) throw new TypeError(`channel ${index} must contain only finite samples`);
    }
  });
}

function normalizedMaxFrames(options) {
  const supplied = options && Number.isFinite(options.maxFrames) ? Math.floor(options.maxFrames) : DEFAULT_MAX_FRAMES;
  return Math.max(8, Math.min(4096, supplied));
}

function hann(index) {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1));
}

const HANN_WINDOW = Float64Array.from({ length: FFT_SIZE }, (_, index) => hann(index));

function fft(real, imaginary) {
  const length = real.length;
  for (let index = 1, reversed = 0; index < length; index += 1) {
    let bit = length >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }

  for (let blockSize = 2; blockSize <= length; blockSize <<= 1) {
    const angle = (-2 * Math.PI) / blockSize;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < length; start += blockSize) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      const half = blockSize >> 1;
      for (let offset = 0; offset < half; offset += 1) {
        const even = start + offset;
        const odd = even + half;
        const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
}

function frameStarts(sampleLength, maxFrames, { contiguous = false } = {}) {
  if (sampleLength <= FFT_SIZE) return [0];
  const available = Math.floor((sampleLength - FFT_SIZE) / HOP_SIZE) + 1;
  const count = Math.min(available, maxFrames);
  if (available <= maxFrames) return Array.from({ length: count }, (_, index) => index * HOP_SIZE);
  if (contiguous) {
    const firstFrame = Math.floor((available - count) / 2);
    return Array.from({ length: count }, (_, index) => (firstFrame + index) * HOP_SIZE);
  }
  return Array.from({ length: count }, (_, index) => (
    Math.round((index * (available - 1)) / (count - 1)) * HOP_SIZE
  ));
}

function spectraFor(samples, maxFrames = DEFAULT_MAX_FRAMES, frameOptions = {}) {
  const starts = frameStarts(samples.length, maxFrames, frameOptions);
  const spectra = [];
  for (const start of starts) {
    const real = new Float64Array(FFT_SIZE);
    const imaginary = new Float64Array(FFT_SIZE);
    for (let index = 0; index < FFT_SIZE; index += 1) {
      real[index] = (samples[start + index] ?? 0) * HANN_WINDOW[index];
    }
    fft(real, imaginary);
    const powers = new Float64Array(FFT_SIZE / 2 + 1);
    for (let bin = 0; bin < powers.length; bin += 1) {
      powers[bin] = real[bin] * real[bin] + imaginary[bin] * imaginary[bin];
    }
    spectra.push(powers);
  }
  return { spectra, starts };
}

function vectorCosine(left, right) {
  let dot = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftEnergy += left[index] * left[index];
    rightEnergy += right[index] * right[index];
  }
  if (leftEnergy <= 1e-20 && rightEnergy <= 1e-20) return 1;
  if (leftEnergy <= 1e-20 || rightEnergy <= 1e-20) return 0;
  return clamp01(dot / Math.sqrt(leftEnergy * rightEnergy));
}

function chromaFromSpectra(spectra, sampleRate) {
  const chroma = new Float64Array(12);
  const upperFrequency = Math.min(5000, sampleRate * 0.45);
  let total = 0;
  for (const powers of spectra) {
    for (let bin = 1; bin < powers.length; bin += 1) {
      const frequency = (bin * sampleRate) / FFT_SIZE;
      if (frequency < 55 || frequency > upperFrequency) continue;
      const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
      const pitchClass = ((midi % 12) + 12) % 12;
      const value = Math.sqrt(powers[bin]);
      chroma[pitchClass] += value;
      total += value;
    }
  }
  if (total > 1e-12) {
    for (let index = 0; index < chroma.length; index += 1) chroma[index] /= total;
  }
  return [...chroma];
}

function profileCosine(chroma, profile, tonic) {
  let dot = 0;
  let chromaEnergy = 0;
  let profileEnergy = 0;
  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    const profileValue = profile[(pitchClass - tonic + 12) % 12];
    dot += chroma[pitchClass] * profileValue;
    chromaEnergy += chroma[pitchClass] * chroma[pitchClass];
    profileEnergy += profileValue * profileValue;
  }
  return chromaEnergy > 1e-20 ? dot / Math.sqrt(chromaEnergy * profileEnergy) : 0;
}

function spectrumFromSpectra(spectra, sampleRate) {
  let weightedFrequency = 0;
  let totalPower = 0;
  const upperFrequency = Math.min(sampleRate / 2, 5000);
  for (const powers of spectra) {
    for (let bin = 1; bin < powers.length; bin += 1) {
      const frequency = (bin * sampleRate) / FFT_SIZE;
      if (frequency > upperFrequency) break;
      const power = powers[bin];
      weightedFrequency += frequency * power;
      totalPower += power;
    }
  }
  const centroidHz = totalPower > 1e-20 ? weightedFrequency / totalPower : 0;
  return { centroidHz, brightness: clamp01(centroidHz / Math.max(1, Math.min(5000, sampleRate * 0.45))) };
}

function rmsOf(samples) {
  if (samples.length === 0) return 0;
  let energy = 0;
  for (let index = 0; index < samples.length; index += 1) energy += samples[index] * samples[index];
  return Math.sqrt(energy / samples.length);
}

function envelopeVector(samples, bins = 24) {
  if (samples.length === 0) return new Array(bins).fill(0);
  const output = [];
  for (let bin = 0; bin < bins; bin += 1) {
    const start = Math.floor((bin * samples.length) / bins);
    const end = Math.max(start + 1, Math.floor(((bin + 1) * samples.length) / bins));
    let energy = 0;
    for (let index = start; index < Math.min(end, samples.length); index += 1) energy += samples[index] * samples[index];
    output.push(Math.sqrt(energy / Math.max(1, Math.min(end, samples.length) - start)));
  }
  return output;
}

function warning(code) {
  return { code, message: WARNING_DEFINITIONS[code] };
}

export function mixToMono(channels) {
  if (!Array.isArray(channels) || channels.length === 0) throw new TypeError("channels must be a non-empty array");
  const length = channels[0] instanceof Float32Array ? channels[0].length : null;
  channels.forEach((channel, index) => {
    assertSamples(channel, `channel ${index}`);
    if (channel.length !== length) throw new TypeError("all channels must have the same length");
  });
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[index];
    output[index] = sum / channels.length;
  }
  return output;
}

function tempoFromSpectra(spectra, starts, sampleRate) {
  if (spectra.length < 3) return { bpm: 0, confidence: 0 };
  const flux = new Float64Array(spectra.length - 1);
  let maximumFlux = 0;
  for (let frame = 1; frame < spectra.length; frame += 1) {
    let value = 0;
    let previousTotal = 0;
    let currentTotal = 0;
    for (let bin = 1; bin < spectra[frame].length; bin += 1) {
      previousTotal += Math.sqrt(spectra[frame - 1][bin]);
      currentTotal += Math.sqrt(spectra[frame][bin]);
    }
    for (let bin = 1; bin < spectra[frame].length; bin += 1) {
      const previous = Math.sqrt(spectra[frame - 1][bin]) / Math.max(previousTotal, 1e-20);
      const current = Math.sqrt(spectra[frame][bin]) / Math.max(currentTotal, 1e-20);
      value += Math.max(0, current - previous);
    }
    flux[frame - 1] = value;
    maximumFlux = Math.max(maximumFlux, value);
  }
  if (maximumFlux < 1e-8) return { bpm: 0, confidence: 0 };
  for (let index = 0; index < flux.length; index += 1) flux[index] /= maximumFlux;

  const meanStepSamples = starts.length > 1 ? (starts.at(-1) - starts[0]) / (starts.length - 1) : HOP_SIZE;
  const fluxRate = sampleRate / Math.max(1, meanStepSamples);
  const autocorrelation = lag => {
    if (lag < 1 || lag >= flux.length - 1) return 0;
    const lower = Math.floor(lag);
    const upper = Math.min(flux.length - 1, lower + 1);
    const fraction = lag - lower;
    const atIntegerLag = integerLag => {
      let dot = 0;
      let leftEnergy = 0;
      let rightEnergy = 0;
      for (let index = integerLag; index < flux.length; index += 1) {
        const left = flux[index];
        const right = flux[index - integerLag];
        dot += left * right;
        leftEnergy += left * left;
        rightEnergy += right * right;
      }
      return leftEnergy > 1e-12 && rightEnergy > 1e-12 ? dot / Math.sqrt(leftEnergy * rightEnergy) : 0;
    };
    return atIntegerLag(lower) * (1 - fraction) + atIntegerLag(upper) * fraction;
  };

  let bestBpm = MIN_TEMPO_BPM;
  let bestScore = -1;
  for (let bpm = MIN_TEMPO_BPM; bpm <= MAX_TEMPO_BPM; bpm += 0.25) {
    const lag = (60 * fluxRate) / bpm;
    const terms = [[lag, 1], [lag * 2, 0.5], [lag / 2, 0.25]];
    let score = 0;
    let weight = 0;
    for (const [termLag, termWeight] of terms) {
      if (termLag >= 1 && termLag < flux.length - 1) {
        score += autocorrelation(termLag) * termWeight;
        weight += termWeight;
      }
    }
    score /= Math.max(weight, 1);
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  return { bpm: Math.round(bestBpm * 100) / 100, confidence: clamp01(bestScore) };
}

function keyFromSpectra(spectra, sampleRate) {
  const chroma = chromaFromSpectra(spectra, sampleRate);
  const total = chroma.reduce((sum, value) => sum + value, 0);
  if (total <= 1e-12) return { name: "Unknown", tonic: "", mode: "unknown", confidence: 0, chroma };
  const candidates = [];
  for (let tonic = 0; tonic < 12; tonic += 1) {
    candidates.push({ tonic, mode: "major", score: profileCosine(chroma, MAJOR_PROFILE, tonic) });
    candidates.push({ tonic, mode: "minor", score: profileCosine(chroma, MINOR_PROFILE, tonic) });
  }
  candidates.sort((left, right) => right.score - left.score || left.tonic - right.tonic || left.mode.localeCompare(right.mode));
  const best = candidates[0];
  const runnerUp = candidates[1];
  const confidence = clamp01((best.score - runnerUp.score) * 4);
  return {
    name: `${NOTE_NAMES[best.tonic]} ${best.mode}`,
    tonic: NOTE_NAMES[best.tonic],
    mode: best.mode,
    confidence,
    chroma
  };
}

export function estimateTempo(samples, sampleRate, options = {}) {
  assertSamples(samples);
  assertSampleRate(sampleRate);
  const { spectra, starts } = spectraFor(samples, normalizedMaxFrames(options), { contiguous: true });
  return tempoFromSpectra(spectra, starts, sampleRate);
}

export function estimateKey(samples, sampleRate, options = {}) {
  assertSamples(samples);
  assertSampleRate(sampleRate);
  const { spectra } = spectraFor(samples, normalizedMaxFrames(options));
  return keyFromSpectra(spectra, sampleRate);
}

export function measureSpectrum(samples, sampleRate, options = {}) {
  assertSamples(samples);
  assertSampleRate(sampleRate);
  const { spectra } = spectraFor(samples, normalizedMaxFrames(options));
  return spectrumFromSpectra(spectra, sampleRate);
}

export function scoreLoopBoundary(samples, sampleRate, options = {}) {
  assertSamples(samples);
  assertSampleRate(sampleRate);
  if (samples.length === 0) {
    return { score: 1, components: { envelope: 1, chroma: 1, centroid: 1, boundary: 1 } };
  }
  const requestedWindow = Number.isFinite(options.endpointWindowSeconds) ? options.endpointWindowSeconds : 2;
  const windowLength = Math.max(1, Math.min(Math.floor(samples.length / 2), Math.round(sampleRate * Math.max(0.1, requestedWindow))));
  const start = samples.slice(0, windowLength);
  const end = samples.slice(samples.length - windowLength);
  const maxFrames = normalizedMaxFrames(options);
  const startSpectra = spectraFor(start, maxFrames).spectra;
  const endSpectra = spectraFor(end, maxFrames).spectra;
  const startChroma = chromaFromSpectra(startSpectra, sampleRate);
  const endChroma = chromaFromSpectra(endSpectra, sampleRate);
  const startSpectrum = spectrumFromSpectra(startSpectra, sampleRate);
  const endSpectrum = spectrumFromSpectra(endSpectra, sampleRate);
  const envelope = vectorCosine(envelopeVector(start), envelopeVector(end));
  const chroma = vectorCosine(startChroma, endChroma);
  const centroid = clamp01(1 - Math.abs(startSpectrum.centroidHz - endSpectrum.centroidHz) / Math.max(1, Math.min(5000, sampleRate * 0.45)));

  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) peak = Math.max(peak, Math.abs(samples[index]));
  const first = samples[0];
  const last = samples[samples.length - 1];
  const seamStep = first - last;
  const beforeStep = samples.length > 1 ? last - samples[samples.length - 2] : 0;
  const afterStep = samples.length > 1 ? samples[1] - first : 0;
  const stepScale = Math.max(Math.abs(seamStep), Math.abs(beforeStep), Math.abs(afterStep));
  const stepCadence = stepScale <= 1e-12 ? 1 : clamp01(1 - Math.min(
    Math.abs(Math.abs(seamStep) - Math.abs(beforeStep)),
    Math.abs(Math.abs(seamStep) - Math.abs(afterStep))
  ) / stepScale);
  const levelDifference = Math.abs(seamStep) / Math.max(peak * 2, 1e-8);
  const levelContinuity = clamp01(1 - levelDifference);
  const boundary = clamp01(stepCadence * 0.8 + levelContinuity * 0.2);
  const components = { envelope, chroma, centroid, boundary };
  const score = clamp01(Object.entries(LOOP_WEIGHTS).reduce((sum, [name, weight]) => sum + components[name] * weight, 0));
  return { score, components };
}

export function analyzePcm(pcm, options = {}) {
  validatePcm(pcm);
  const mono = mixToMono(pcm.channels);
  let peak = 0;
  let energy = 0;
  for (let index = 0; index < mono.length; index += 1) {
    peak = Math.max(peak, Math.abs(mono[index]));
    energy += mono[index] * mono[index];
  }
  const rms = mono.length > 0 ? Math.sqrt(energy / mono.length) : 0;
  const durationSeconds = mono.length / pcm.sampleRate;
  const maxFrames = normalizedMaxFrames(options);
  const tempoFrames = spectraFor(mono, maxFrames, { contiguous: true });
  const availableFrameCount = mono.length <= FFT_SIZE
    ? 1
    : Math.floor((mono.length - FFT_SIZE) / HOP_SIZE) + 1;
  const overviewFrames = availableFrameCount <= maxFrames
    ? tempoFrames
    : spectraFor(mono, maxFrames);
  const tempo = tempoFromSpectra(tempoFrames.spectra, tempoFrames.starts, pcm.sampleRate);
  const key = keyFromSpectra(overviewFrames.spectra, pcm.sampleRate);
  const spectrum = spectrumFromSpectra(overviewFrames.spectra, pcm.sampleRate);
  const loop = scoreLoopBoundary(mono, pcm.sampleRate, options);
  const warnings = [];
  if (durationSeconds < 8) warnings.push(warning("short-audio"));
  if (pcm.sampleRate < 12_000) warnings.push(warning("low-sample-rate"));
  if (rms < 1e-4) warnings.push(warning("near-silence"));
  if (pcm.channels.length > 1) {
    const channelEnergy = pcm.channels.reduce((sum, channel) => {
      const channelRms = rmsOf(channel);
      return sum + channelRms * channelRms;
    }, 0) / pcm.channels.length;
    if (channelEnergy > 1e-8 && rms * rms < channelEnergy * 0.05) warnings.push(warning("channel-cancellation"));
  }
  if (tempo.confidence < 0.30) warnings.push(warning("low-tempo-confidence"));
  if (key.confidence < 0.10) warnings.push(warning("low-key-confidence"));
  return {
    durationSeconds,
    sampleRate: pcm.sampleRate,
    channelCount: pcm.channels.length,
    peak,
    rms,
    tempo,
    key,
    spectrum,
    loop,
    warnings
  };
}
