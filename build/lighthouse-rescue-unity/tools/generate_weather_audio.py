"""Create reproducible original storm cues for the local Lighthouse game.

The sounds are synthesized from seeded noise and oscillators; no third-party
recording is embedded. Run with ``--ffmpeg <path-to-ffmpeg>``.
"""

import argparse
import math
import random
import struct
import subprocess
import tempfile
import wave
from pathlib import Path


RATE = 24_000
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "Assets" / "Resources" / "Audio"


def rain():
    rng = random.Random(1762)
    total = RATE * 12
    slow = 0.0
    samples = []
    for i in range(total):
        noise = rng.uniform(-1, 1)
        slow = slow * 0.985 + noise * 0.015
        gust = 0.82 + 0.11 * math.sin(2 * math.pi * i / total * 3)
        hiss = (noise * 0.13 + slow * 0.48) * gust
        # Gentle recurring surf gives the loop a maritime pulse.
        swell = 0.05 * math.sin(2 * math.pi * i / total * 7) * math.sin(2 * math.pi * 73 * i / RATE)
        samples.append(hiss + swell)
    # Crossfade the last half second to the opening so the seam is quiet.
    fade = RATE // 2
    for i in range(fade):
        amount = i / fade
        samples[total - fade + i] = samples[total - fade + i] * (1 - amount) + samples[i] * amount
    return samples


def thunder():
    rng = random.Random(2718)
    low = 0.0
    samples = []
    for i in range(int(RATE * 3.5)):
        t = i / RATE
        noise = rng.uniform(-1, 1)
        low = low * 0.955 + noise * 0.045
        crack = noise * math.exp(-t * 13) * 0.5
        rumble = (0.56 * low + 0.15 * math.sin(2 * math.pi * 57 * t)) * (1 - math.exp(-t * 16)) * math.exp(-t * 0.85)
        samples.append(crack + rumble)
    return samples


def splash():
    rng = random.Random(3141)
    low = 0.0
    samples = []
    for i in range(int(RATE * 1.45)):
        t = i / RATE
        noise = rng.uniform(-1, 1)
        low = low * 0.88 + noise * 0.12
        attack = 1 - math.exp(-t * 140)
        decay = math.exp(-t * 3.2)
        samples.append((noise * 0.31 + low * 0.48) * attack * decay)
    return samples


def write_wav(path, samples):
    peak = max(max(abs(value) for value in samples), 0.001)
    scale = min(1.0, 0.77 / peak)
    with wave.open(str(path), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(RATE)
        stream.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, value * scale)) * 32767)) for value in samples))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffmpeg", required=True)
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="lighthouse-weather-") as directory:
        for name, samples in (("StormRain", rain()), ("Thunder", thunder()), ("Splash", splash())):
            wav = Path(directory) / f"{name}.wav"
            ogg = OUTPUT / f"{name}.ogg"
            write_wav(wav, samples)
            subprocess.run([args.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
                            "-codec:a", "libvorbis", "-qscale:a", "4", str(ogg)], check=True)
            print(f"{name}: {ogg.stat().st_size} bytes")


if __name__ == "__main__":
    main()
