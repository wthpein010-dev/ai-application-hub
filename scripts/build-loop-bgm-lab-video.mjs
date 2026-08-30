import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCaptureWorkspaceArgument } from "./loop-bgm-lab-capture-workspace.mjs";
import { STORY_DURATION_MS, validateRecordingMetadata } from "./loop-bgm-lab-video-contract.mjs";

const require = createRequire(import.meta.url);
const bundledFfmpeg = require("ffmpeg-static");
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { root: captureRoot, rawPath: inputPath, metadataPath } = parseCaptureWorkspaceArgument();
const videoRoot = join(root, "projects", "loop-bgm-lab", "video");
const outputPath = join(videoRoot, "loop-bgm-lab-demo.mp4");
const posterPath = join(videoRoot, "poster.jpg");
const ffmpegPath = process.env.FFMPEG_PATH || bundledFfmpeg;

function run(args, label) {
  const result = spawnSync(ffmpegPath, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed (${result.status})\n${result.stderr || result.stdout}`);
  return result;
}

if (!existsSync(inputPath) || !existsSync(metadataPath)) {
  throw new Error(`Missing raw recording in ${captureRoot}. Run scripts/record-loop-bgm-lab-video.mjs first and pass its capture workspace.`);
}
if (!ffmpegPath || !existsSync(ffmpegPath)) throw new Error("ffmpeg-static is unavailable; install repository dependencies first.");

const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
validateRecordingMetadata(metadata);
await mkdir(videoRoot, { recursive: true });

run([
  "-y", "-hide_banner", "-loglevel", "error",
  "-i", inputPath,
  "-ss", (metadata.storyStartOffsetMs / 1_000).toFixed(3),
  "-t", String(STORY_DURATION_MS / 1_000),
  "-map_metadata", "-1",
  "-vf", "scale=1280:720:flags=lanczos,fps=30",
  "-an",
  "-c:v", "libx264",
  "-profile:v", "high",
  "-level", "4.0",
  "-preset", "medium",
  "-crf", "20",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  "-metadata", "title=循环乐工房无声功能演示",
  outputPath,
], "H.264 encode");

run([
  "-y", "-hide_banner", "-loglevel", "error",
  "-ss", "00:00:10",
  "-i", outputPath,
  "-frames:v", "1",
  "-update", "1",
  "-vf", "scale=1280:720:flags=lanczos",
  "-q:v", "2",
  posterPath,
], "poster extraction");

run(["-v", "error", "-i", outputPath, "-f", "null", "-"], "decode verification");
const videoSize = (await stat(outputPath)).size;
const posterSize = (await stat(posterPath)).size;
if (videoSize < 500_000) throw new Error(`Encoded tutorial is unexpectedly small: ${videoSize}`);
if (posterSize < 20_000) throw new Error(`Poster is unexpectedly small: ${posterSize}`);

await rm(captureRoot, { recursive: true, force: true });
process.stdout.write(`Video: ${outputPath} (${videoSize} bytes)\nPoster: ${posterPath} (${posterSize} bytes)\n`);
