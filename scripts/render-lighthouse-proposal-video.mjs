import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Usage: node scripts/render-lighthouse-proposal-video.mjs <capture-directory|recording.webm> [--dry-run]
// WebGL recording is silent. This fixed sound design uses original project assets in post-production.
// Captions remain in lighthouse-demo.vtt; no captions are burned into the recording.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static");
const disclosure = "雨、风、雷、浪音轨由工程素材后期合成，并非浏览器录屏实时音频。";
const videoRoot = join(root, "projects", "lighthouse-rescue", "video");
const audioRoot = join(root, "build", "lighthouse-rescue-unity", "Assets", "Resources", "Audio");

function recordingPath(argument) {
  const input = resolve(argument);
  if (!existsSync(input)) throw new Error(`录制路径不存在：${input}`);
  if (statSync(input).isDirectory()) {
    const captures = readdirSync(input).filter(name => extname(name).toLowerCase() === ".webm" && statSync(join(input, name)).isFile());
    if (captures.length > 1) throw new Error("录制目录含多个 WebM，请明确传入本次录制文件，避免选中旧视频。");
    if (captures.length === 0) throw new Error("录制目录没有 WebM 文件。");
    return join(input, captures[0]);
  }
  if (!statSync(input).isFile() || extname(input).toLowerCase() !== ".webm") throw new Error("请传入 WebM 文件或录制目录。");
  return input;
}

function planVideo(inputPath, duration = 240) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 240) throw new Error("录制时长须大于 0 且不超过 240 秒；请检查录制流程。");
  const audioPaths = ["StormRain.ogg", "WindGust.ogg", "Thunder.ogg", "Splash.ogg"].map(name => join(audioRoot, name));
  for (const path of audioPaths) if (!existsSync(path)) throw new Error(`缺少工程音效：${path}`);
  const outputPath = join(videoRoot, "lighthouse-demo.mp4");
  const posterPath = join(videoRoot, "poster.jpg");
  const stormWindows = "between(t,40,147)+between(t,196,218)";
  const splashes = [76, 111, 146, 202, 207, 212];
  const format = "aresample=48000,aformat=channel_layouts=stereo";
  const filter = [
    `[1:a]${format},volume='if(gt(${stormWindows},0),0.14,0.035)':eval=frame[rain]`,
    `[2:a]${format},apad=whole_dur=12,aloop=loop=-1:size=576000,volume='if(gt(${stormWindows},0),0.12,0.025)':eval=frame[wind]`,
    `[3:a]${format},apad=whole_dur=18,aloop=loop=-1:size=864000,adelay=48000|48000,volume='if(gt(${stormWindows},0),0.22,0)':eval=frame[thunder]`,
    `[4:a]${format},asplit=${splashes.length}${splashes.map((_, index) => `[s${index}]`).join("")}`,
    ...splashes.map((second, index) => `[s${index}]volume=0.14,adelay=${second * 1000}|${second * 1000}[wave${index}]`),
    `[rain][wind][thunder]${splashes.map((_, index) => `[wave${index}]`).join("")}amix=inputs=${3 + splashes.length}:duration=longest:normalize=0,afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(0, duration - 2).toFixed(3)}:d=2,alimiter=limit=0.9[sound]`,
  ].join(";");
  return {
    inputPath, outputPath, posterPath, disclosure,
    encodeArgs: [
      "-y", "-hide_banner", "-loglevel", "error", "-i", inputPath,
      "-stream_loop", "-1", "-i", audioPaths[0],
      "-i", audioPaths[1], "-i", audioPaths[2], "-i", audioPaths[3],
      "-filter_complex", filter, "-map", "0:v:0", "-map", "[sound]", "-sn",
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,fps=25",
      "-t", String(duration), "-shortest", "-map_metadata", "-1",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart",
      "-metadata", "title=灯塔救援队实机回放（后期合成环境音）", "-metadata", `comment=${disclosure}`, outputPath,
    ],
    posterArgs: [
      "-y", "-hide_banner", "-loglevel", "error", "-ss", String(Math.min(90, duration / 2)),
      "-i", outputPath, "-frames:v", "1", "-update", "1", "-q:v", "2", posterPath,
    ],
  };
}

function invoke(args) {
  const result = spawnSync(ffmpeg, args, { encoding: "utf8", shell: false, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  return result;
}

function run(args, label) {
  const result = invoke(args);
  if (result.status !== 0) throw new Error(`${label}失败 (${result.status})：${result.stderr || result.stdout}`);
}

function inspect(path) {
  // ffmpeg returns 1 when inspecting an input without selecting an output; valid stream metadata is the evidence.
  const result = invoke(["-hide_banner", "-i", path]);
  const info = `${result.stderr || ""}${result.stdout || ""}`;
  const duration = info.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const video = info.match(/Video:\s*([\w.-]+)/);
  if (!duration || !video) throw new Error(`无法读取录屏或视频元数据：${info}`);
  return { duration: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
    video: video[1], audio: info.match(/Audio:\s*([\w.-]+)/)?.[1] || "" };
}

try {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.includes("--help")) {
    console.log("node scripts/render-lighthouse-proposal-video.mjs <录制目录|input.webm> [--dry-run]\n--dry-run 只输出参数计划，不探测、转码或改动素材。");
  } else {
    if (argumentsList.some(argument => argument.startsWith("--") && argument !== "--dry-run")) throw new Error("未知选项；使用 --help 查看用法。");
    const inputs = argumentsList.filter(argument => argument !== "--dry-run");
    if (inputs.length > 1) throw new Error("只接受一个录制目录或 WebM 路径。");
    const input = recordingPath(inputs[0] || process.env.LIGHTHOUSE_DEMO_OUTPUT || join(root, ".scratch", "lighthouse-proposal-demo"));
    if (argumentsList.includes("--dry-run")) console.log(JSON.stringify(planVideo(input), null, 2));
    else {
      if (!ffmpeg || !existsSync(ffmpeg)) throw new Error("ffmpeg-static 不可用，请先安装工程依赖。");
      const plan = planVideo(input, inspect(input).duration);
      mkdirSync(videoRoot, { recursive: true });
      console.log(disclosure);
      run(plan.encodeArgs, "H264/AAC 转码");
      const encoded = inspect(plan.outputPath);
      if (encoded.duration <= 0 || encoded.duration > 240 || encoded.video !== "h264" || encoded.audio !== "aac")
        throw new Error(`输出须为不超过 240 秒的 H264/AAC 视频：${JSON.stringify(encoded)}`);
      run(plan.posterArgs, "封面提取");
      run(["-v", "error", "-i", plan.outputPath, "-f", "null", "-"], "视频解码校验");
      if (!existsSync(plan.posterPath) || statSync(plan.posterPath).size === 0) throw new Error("封面未生成。");
      console.log(`Video: ${plan.outputPath}\nPoster: ${plan.posterPath}\nDuration: ${encoded.duration}s\nVTT 保持原样，由播放器外挂。`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
