import { spawnSync } from "node:child_process";

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";

export function inspectMedia(filePath) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-i", filePath], { encoding: "utf8" });
  if (result.error) throw result.error;

  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const duration = output.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const video = output.match(/Video:\s*([\w.-]+).*?(\d{3,5})x(\d{3,5})\b/);
  const audio = output.match(/Audio:\s*([\w.-]+)/);
  if (!duration || !video) throw new Error(`Unable to inspect ${filePath}: ${output}`);

  return {
    audioCodec: audio?.[1] || "",
    duration: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
    height: Number(video[3]),
    videoCodec: video[1],
    width: Number(video[2])
  };
}

export function decodeMedia(filePath) {
  const result = spawnSync(ffmpeg, ["-v", "error", "-i", filePath, "-f", "null", "-"], { encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}
