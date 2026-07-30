import { outputNameFor } from "../core/policy.mjs";

const FFMPEG_SCRIPT_URL = "./vendor/ffmpeg.min.js";
const FFMPEG_CORE_URL = "./vendor/ffmpeg-core.js";
const ARCHIVE_WORKER_URL = "./workers/archive-worker.js";
const MAX_BROWSER_BYTES = 2_000_000_000;
export const MAX_BROWSER_ARCHIVE_BYTES = 64 * 1024 * 1024;
export const MAX_BROWSER_BUNDLE_BYTES = 128 * 1024 * 1024;

let ffmpegAdapterPromise;
let archiveAdapterPromise;

function abortIfNeeded(signal) {
  if (!signal?.aborted) return;
  throw new DOMException("任务已取消", "AbortError");
}

function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function abortError() {
  return new DOMException("任务已取消", "AbortError");
}

function comparableHashOutput(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .join("\n");
}

function collisionSafeEntries(entries) {
  const used = new Set();
  return entries.map((entry) => {
    const original = String(entry.name || "resource");
    let name = original;
    if (used.has(name)) {
      const dot = original.lastIndexOf(".");
      const stem = dot > 0 ? original.slice(0, dot) : original;
      const extension = dot > 0 ? original.slice(dot) : "";
      let sequence = 2;
      do {
        name = `${stem}-${sequence}${extension}`;
        sequence += 1;
      } while (used.has(name));
    }
    used.add(name);
    return { ...entry, name };
  });
}

function browserAssetUrl(url) {
  if (typeof document === "undefined") return url;
  return new URL(url, document.baseURI).href;
}

export function createArchiveWorkerAdapter(options = {}) {
  const workerFactory = options.workerFactory || (() => new Worker(
    browserAssetUrl(ARCHIVE_WORKER_URL),
    { name: "pureshrink-archive" },
  ));

  const execute = (payload, transfers, signal) => new Promise((resolve, reject) => {
    abortIfNeeded(signal);
    const worker = workerFactory();
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.terminate();
    };
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => finish(abortError());
    const onMessage = (event) => {
      const message = event.data;
      if (message?.ok) {
        finish(null, message);
      } else {
        finish(new Error(message?.error || "PureShrink ZIP worker failed"));
      }
    };
    const onError = (event) => {
      finish(event.error || new Error(event.message || "PureShrink ZIP worker failed"));
    };

    signal?.addEventListener("abort", abort, { once: true });
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    try {
      worker.postMessage(payload, transfers);
    } catch (error) {
      finish(error);
    }
  });

  return {
    async zip(name, bytes, { signal } = {}) {
      const result = await execute(
        { operation: "zip", name, bytes },
        [bytes.buffer],
        signal,
      );
      return {
        name: `${name}.zip`,
        bytes: new Uint8Array(result.bytes),
        verified: result.verified === true,
      };
    },
    async bundle(entries, { signal } = {}) {
      const transferableEntries = entries.map((entry) => ({
        name: entry.name,
        bytes: entry.bytes,
      }));
      const result = await execute(
        { operation: "bundle", entries: transferableEntries },
        transferableEntries.map((entry) => entry.bytes.buffer),
        signal,
      );
      return new Uint8Array(result.bytes);
    },
  };
}

function loadExternalScript(url, globalName) {
  if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
  if (typeof document === "undefined") {
    return Promise.reject(new Error(`${globalName} 只能在浏览器中加载`));
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-pureshrink-src="${url}"]`);
    if (existing) {
      existing.addEventListener("load", () => {
        const loaded = globalThis[globalName];
        if (loaded) resolve(loaded);
        else reject(new Error(`${globalName} 已加载但未注册运行时`));
      }, { once: true });
      existing.addEventListener("error", () => {
        existing.remove();
        reject(new Error(`无法加载 ${globalName}`));
      }, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.pureshrinkSrc = url;
    script.addEventListener("load", () => {
      const loaded = globalThis[globalName];
      if (loaded) resolve(loaded);
      else reject(new Error(`${globalName} 已加载但未注册运行时`));
    }, { once: true });
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error(`无法加载 ${globalName}`));
    }, { once: true });
    document.head.append(script);
  });
}

async function defaultLoadFFmpeg() {
  if (!ffmpegAdapterPromise) {
    ffmpegAdapterPromise = (async () => {
      const legacy = await loadExternalScript(browserAssetUrl(FFMPEG_SCRIPT_URL), "FFmpeg");
      const recentLogs = [];

      return {
        async transform({
          inputName,
          outputName,
          inputBytes,
          args,
          onProgress,
          signal,
          verifyLossless,
        }) {
          abortIfNeeded(signal);
          recentLogs.length = 0;
          let aborted = false;
          let activeInstance;
          let transformInstance;
          let verificationInstance;
          const createInstance = async () => {
            const created = legacy.createFFmpeg({
              corePath: browserAssetUrl(FFMPEG_CORE_URL),
              mainName: "main",
              log: false,
            });
            activeInstance = created;
            created.setLogger(({ message }) => {
              if (!message) return;
              recentLogs.push(String(message));
              if (recentLogs.length > 40) recentLogs.shift();
            });
            await created.load();
            return created;
          };
          const removeFiles = (instance, names) => {
            if (!instance) return;
            for (const name of names) {
              try {
                instance.FS("unlink", name);
              } catch {
                // A terminated or failed core may not retain its virtual files.
              }
            }
          };
          const abort = () => {
            aborted = true;
            try {
              activeInstance?.exit();
            } catch {
              // The core may already have terminated after a worker failure.
            } finally {
              ffmpegAdapterPromise = null;
            }
          };
          signal?.addEventListener("abort", abort, { once: true });
          try {
            transformInstance = await createInstance();
            abortIfNeeded(signal);
            transformInstance.setProgress(({ ratio }) => {
              if (Number.isFinite(ratio)) onProgress(Math.min(96, Math.max(1, ratio * 96)));
            });
            transformInstance.FS("writeFile", inputName, inputBytes);
            await transformInstance.run(...args);
            abortIfNeeded(signal);
            const bytes = new Uint8Array(
              transformInstance.FS("readFile", outputName),
            );
            let losslessMatch;
            if (verifyLossless) {
              const sourceHashName = `${inputName}.streamhash`;
              const outputHashName = `${outputName}.streamhash`;
              try {
                verificationInstance = await createInstance();
                abortIfNeeded(signal);
                verificationInstance.FS("writeFile", inputName, inputBytes);
                verificationInstance.FS("writeFile", outputName, bytes);
                await verificationInstance.run(
                  "-v", "error",
                  "-i", inputName,
                  "-i", outputName,
                  "-map", "0",
                  "-c", "copy",
                  "-f", "streamhash",
                  "-hash", "sha256",
                  sourceHashName,
                  "-map", "1",
                  "-c", "copy",
                  "-f", "streamhash",
                  "-hash", "sha256",
                  outputHashName,
                );
                const decoder = new TextDecoder();
                const sourceHash = comparableHashOutput(
                  decoder.decode(verificationInstance.FS("readFile", sourceHashName)),
                );
                const outputHash = comparableHashOutput(
                  decoder.decode(verificationInstance.FS("readFile", outputHashName)),
                );
                losslessMatch = Boolean(sourceHash) && sourceHash === outputHash;
              } finally {
                removeFiles(verificationInstance, [
                  inputName,
                  outputName,
                  sourceHashName,
                  outputHashName,
                ]);
              }
            }
            return {
              name: outputName,
              bytes,
              losslessMatch,
            };
          } catch (error) {
            if (aborted || signal?.aborted) throw abortError();
            if (error instanceof Error) throw error;
            const detail = recentLogs.slice(-8).join(" | ");
            throw new Error(
              error?.message
              || detail
              || String(error || "FFmpeg WebAssembly 处理失败"),
            );
          } finally {
            signal?.removeEventListener("abort", abort);
            if (!aborted) {
              removeFiles(transformInstance, [inputName, outputName]);
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
    archiveAdapterPromise = Promise.resolve(createArchiveWorkerAdapter()).catch((error) => {
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
        "-compression_level", "9",
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
  const maxArchiveBytes = options.maxArchiveBytes || MAX_BROWSER_ARCHIVE_BYTES;
  const maxBundleBytes = options.maxBundleBytes || MAX_BROWSER_BUNDLE_BYTES;

  return {
    async compress(task, onProgress = () => {}, signal) {
      abortIfNeeded(signal);
      if (
        task.plan.kind === "archive"
        && Number(task.file.size || 0) >= maxArchiveBytes
      ) {
        throw new Error("网页端通用文件 ZIP 安全上限为 64 MB，请改用桌面版；桌面版上限为 256 MB");
      }
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
        const candidate = await archive.zip(task.file.name, inputBytes, { signal });
        abortIfNeeded(signal);
        const bytes = new Uint8Array(candidate.bytes);
        let verified = candidate.verified === true;
        if (!verified && typeof archive.unzip === "function") {
          const restored = await archive.unzip(task.file.name, bytes);
          verified = Boolean(restored)
            && bytesEqual(inputBytes, new Uint8Array(restored));
        }
        if (!verified) {
          throw new Error("ZIP 回读验证未通过，已拒绝输出");
        }
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
        verifyLossless: task.plan.isLossless && !(
          task.plan.kind === "image"
          && task.plan.outputExtension === "png"
        ),
      });
      abortIfNeeded(signal);

      const bytes = new Uint8Array(candidate.bytes);
      if (!bytes.byteLength) throw new Error("压缩引擎没有生成有效输出");

      let verification = task.plan.isLossless
        ? "无损码流复制完成；当前引擎未提供哈希复核"
        : "高保真参数重新编码完成";
      if (
        task.plan.isLossless
        && task.plan.kind === "image"
        && task.plan.outputExtension === "png"
      ) {
        const pixelsMatch = await verifyPng(inputBytes, bytes);
        if (!pixelsMatch) throw new Error("PNG 像素验证未通过，已拒绝输出");
        verification = "逐像素 RGBA 一致";
      } else if (task.plan.isLossless && candidate.losslessMatch === false) {
        throw new Error("媒体码流 SHA-256 验证未通过，已拒绝输出");
      } else if (task.plan.isLossless && candidate.losslessMatch === true) {
        verification = "音视频码流 SHA-256 一致";
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
      const totalBytes = results.reduce(
        (sum, result) => sum + Number(result.blob?.size || 0),
        0,
      );
      if (totalBytes >= maxBundleBytes) {
        throw new Error("批量下载 ZIP 安全上限为 128 MB，请逐个下载结果");
      }
      const archive = await loadArchive();
      const entries = collisionSafeEntries(await Promise.all(results.map(async (result) => ({
        name: result.name,
        bytes: new Uint8Array(await result.blob.arrayBuffer()),
      }))));
      const bytes = await archive.bundle(entries);
      return new Blob([bytes], { type: "application/zip" });
    },
  };
}

export const browserEngineVersions = Object.freeze({
  ffmpeg: "0.11.6",
  ffmpegCoreSt: "0.11.1",
  fflate: "0.8.2",
});
