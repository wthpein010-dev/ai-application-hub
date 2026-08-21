import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(root, "projects", "gamespec-relay", "video");
const rawRoot = join(tmpdir(), "gamespec-relay-video");
const inputPath = join(rawRoot, "gamespec-relay-demo.webm");
const outputPath = join(videoRoot, "gamespec-relay-demo.mp4");

if (!existsSync(inputPath)) {
  throw new Error(`Missing raw recording: ${inputPath}. Run record-gamespec-relay-demo.mjs first.`);
}

const conversion = spawnSync(process.env.FFMPEG_PATH || ffmpegPath, [
  "-y",
  "-hide_banner",
  "-i", inputPath,
  "-t", "168",
  "-vf", "scale=1280:720:flags=lanczos,fps=30",
  "-an",
  "-c:v", "libx264",
  "-profile:v", "high",
  "-level", "4.0",
  "-pix_fmt", "yuv420p",
  "-preset", "veryfast",
  "-crf", "21",
  "-movflags", "+faststart",
  "-metadata", "title=需求接力站教学视频",
  outputPath,
], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
if (conversion.status !== 0) throw new Error(conversion.stderr || "ffmpeg conversion failed");
if ((await stat(outputPath)).size <= 1_000_000) throw new Error("Encoded tutorial is unexpectedly small");

await rm(rawRoot, { recursive: true, force: true });
process.stdout.write(`${outputPath}\n`);
