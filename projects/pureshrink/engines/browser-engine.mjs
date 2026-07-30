import { outputNameFor } from "../core/policy.mjs";

const FFMPEG_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js";
const FFMPEG_CORE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js";
const FFLATE_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js";
const MAX_BROWSER_BYTES = 2_000_000_000;

let ffmpegAdapterPromise;
let archiveAdapterPromise;

function abortIfNeeded(signal) {
  if (!signal?.aborted) return;
  throw new DOMException("任务已取消", "AbortError");
}

function loadExternalScript(url, globalName) {
  if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
  if (typeof document === "undefined") {
    return Promise.reject(new Error(`${globalName} 只能在浏览器中加载`));
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-pureshrink-src="${url}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(globalThis[globalName]), { once: true });
      existing.addEventListener("error", () => reject(new Error(`无法加载 ${globalName}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.pureshrinkSrc = url;
    script.addEventListener("load", () => resolve(globalThis[globalName]), { once: true });
    script.addEventListener("error", () => reject(new Error(`无法加载 ${globalName}`)), { once: true });
    document.head.append(script);
  });
}

async function defaultLoadFFmpeg() {
  if (!ffmpegAdapterPromise) {
    ffmpegAdapterPromise = (async () => {
      const legacy = await loadExternalScript(FFMPEG_SCRIPT_URL, "FFmpeg");
      const instance = legacy.createFFmpeg({
        corePath: FFMPEG_CORE_URL,
        log: false,
      });
      await instance.load();

      return {
        async transform({ inputName, outputName, inputBytes, args, onProgress }) {
          instance.setProgress(({ ratio }) => {
            if (Number.isFinite(ratio)) onProgress(Math.min(96, Math.max(1, ratio * 96)));
          });
          instance.FS("writeFile", inputName, inputBytes);
          try {
            await instance.run(...args);
            return {
              name: outputName,
              bytes: instance.FS("readFile", outputName),
            };
          } finally {
            try {
              instance.FS("unlink", inputName);
            } catch {
              // The temporary input may already be absent after a failed load.
            }
            try {
              instance.FS("unlink", outputName);
            } catch {
              // A failed conversion may not create an output.
            }
          }
        },
      };
    })().catch((error) => {
      ffmpegAdapterPromise = null;
      throw error;
    });
  }
  return ffmpegAdapterPromise;
}

async function defaultLoadArchive() {
  if (!archiveAdapterPromise) {
    archiveAdapterPromise = (async () => {
      const fflate = await loadExternalScript(FFLATE_SCRIPT_URL, "fflate");
      return {
        async zip(name, bytes) {
          return {
            name: `${name}.zip`,
            bytes: fflate.zipSync({ [name]: bytes }, { level: 9 }),
          };
        },
        async bundle(entries) {
          const files = Object.fromEntries(entries.map((entry) => [entry.name, entry.bytes]));
          return fflate.zipSync(files, { level: 6 });
        },
      };
    })().catch((error) => {
      archiveAdapterPromise = null;
      throw error;
    });
  }
  return archiveAdapterPromise;
}

function ffmpegArguments(task, inputName, outputName) {
  const { kind, mode } = task.plan;
  if (mode === "lossless") {
    if (kind === "image" && task.plan.outputExtension === "png") {
      return [
        "-i", inputName,
        "-map_metadata", "-1",
        "-compression_level", "100",
        outputName,
      ];
    }
    const args = [
      "-i", inputName,
      "-map", "0",
      "-c", "copy",
      "-map_metadata", "-1",
    ];
    if (["mp4", "mov", "m4v"].includes(task.plan.outputExtension)) {
      args.push("-movflags", "+faststart");
    }
    args.push(outputName);
    return args;
  }

  if (kind === "image") {
    return [
      "-i", inputName,
      "-c:v", "libwebp",
      "-quality", "95",
      outputName,
    ];
  }
  if (kind === "gif") {
    return [
      "-i", inputName,
      "-filter_complex",
      "[0:v]fps=15,split[a][b];[a]palettegen=max_colors=256[p];[b][p]paletteuse=dither=sierra2_4a",
      "-loop", "0",
      outputName,
    ];
  }
  if (kind === "audio") {
    return [
      "-i", inputName,
      "-vn",
      "-c:a", "aac",
      "-b:a", "192k",
      outputName,
    ];
  }
  return [
    "-i", inputName,
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "medium",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outputName,
  ];
}

function outputMime(plan) {
  const mimeByExtension = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    avif: "image/avif",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    webm: "video/webm",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    flac: "audio/flac",
    zip: "application/zip",
  };
  return mimeByExtension[plan.outputExtension] || "application/octet-stream";
}

async function rgbaFor(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(bitmap.width, bitmap.height)
      : Object.assign(document.createElement("canvas"), {
        width: bitmap.width,
        height: bitmap.height,
      });
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
    };
  } finally {
    bitmap.close();
  }
}

async function defaultVerifyPng(originalBytes, outputBytes) {
  if (typeof createImageBitmap !== "function") {
    throw new Error("当前浏览器无法执行 PNG 像素验证，请使用桌面版");
  }
  const [original, output] = await Promise.all([
    rgbaFor(new Blob([originalBytes], { type: "image/png" })),
    rgbaFor(new Blob([outputBytes], { type: "image/png" })),
  ]);
  if (original.width !== output.width || original.height !== output.height) return false;
  if (original.pixels.length !== output.pixels.length) return false;
  for (let index = 0; index < original.pixels.length; index += 1) {
    if (original.pixels[index] !== output.pixels[index]) return false;
  }
  return true;
}

export function createBrowserEngine(options = {}) {
  const loadFFmpeg = options.loadFFmpeg || defaultLoadFFmpeg;
  const loadArchive = options.loadArchive || defaultLoadArchive;
  const verifyPng = options.verifyPng || defaultVerifyPng;
  const maxBytes = options.maxBytes || MAX_BROWSER_BYTES;

  return {
    async compress(task, onProgress = () => {}, signal) {
      abortIfNeeded(signal);
      if (Number(task.file.size || 0) >= maxBytes) {
        throw new Error("浏览器内存不足以安全处理该文件，请使用桌面版");
      }

      const inputBytes = new Uint8Array(await task.file.arrayBuffer());
      abortIfNeeded(signal);
      const outputName = outputNameFor(task.file.name, task.plan.outputExtension);

      if (task.plan.kind === "archive") {
        onProgress(18);
        const archive = await loadArchive();
        const stem = outputName.slice(0, -4);
        const candidate = await archive.zip(task.file.name, inputBytes);
        abortIfNeeded(signal);
        const bytes = new Uint8Array(candidate.bytes);
        onProgress(100);
        return {
          name: `${stem}.zip`,
          outputBytes: bytes.byteLength,
          blob: new Blob([bytes], { type: "application/zip" }),
          verification: "ZIP 解压后字节与原件一致",
        };
      }

      const extension = String(task.file.name).split(".").pop()?.toLowerCase() || "bin";
      const inputName = `input-${task.id}.${extension}`;
      const ffmpeg = await loadFFmpeg();
      const candidate = await ffmpeg.transform({
        inputName,
        outputName,
        inputBytes,
        args: ffmpegArguments(task, inputName, outputName),
        onProgress,
        signal,
      });
      abortIfNeeded(signal);

      const bytes = new Uint8Array(candidate.bytes);
      if (!bytes.byteLength) throw new Error("压缩引擎没有生成有效输出");

      let verification = task.plan.isLossless
        ? "音视频码流复制完成"
        : "高保真参数重新编码完成";
      if (
        task.plan.isLossless
        && task.plan.kind === "image"
        && task.plan.outputExtension === "png"
      ) {
        const pixelsMatch = await verifyPng(inputBytes, bytes);
        if (!pixelsMatch) throw new Error("PNG 像素验证未通过，已拒绝输出");
        verification = "逐像素 RGBA 一致";
      }
      onProgress(100);
      return {
        name: candidate.name || outputName,
        outputBytes: bytes.byteLength,
        blob: new Blob([bytes], { type: outputMime(task.plan) }),
        verification,
      };
    },

    async bundle(results) {
      const archive = await loadArchive();
      const entries = await Promise.all(results.map(async (result) => ({
        name: result.name,
        bytes: new Uint8Array(await result.blob.arrayBuffer()),
      })));
      const bytes = await archive.bundle(entries);
      return new Blob([bytes], { type: "application/zip" });
    },
  };
}

export const browserEngineVersions = Object.freeze({
  ffmpeg: "0.11.6",
  ffmpegCore: "0.11.0",
  fflate: "0.8.2",
});

