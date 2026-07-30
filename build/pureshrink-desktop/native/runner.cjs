"use strict";

const { spawn } = require("node:child_process");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs");
const path = require("node:path");
const { zipSync, unzipSync } = require("fflate");
const { buildArguments, resolveOutputPath } = require("./policy.cjs");

function resolveBundledBinaryPath(binaryPath, pathExists = existsSync) {
  const asarSegment = `app.asar${path.sep}`;
  if (!binaryPath?.includes(asarSegment)) return binaryPath;
  const unpackedPath = binaryPath.replace(
    asarSegment,
    `app.asar.unpacked${path.sep}`,
  );
  return pathExists(unpackedPath) ? unpackedPath : binaryPath;
}

function runProcess(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    options.onSpawn?.(child);

    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderr.push(chunk);
      options.onStderr?.(chunk.toString("utf8"));
    });

    const abort = () => child.kill("SIGTERM");
    options.signal?.addEventListener("abort", abort, { once: true });

    child.once("error", reject);
    child.once("close", (code, signal) => {
      options.signal?.removeEventListener("abort", abort);
      const result = {
        code: Number(code ?? -1),
        signal: signal || "",
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (options.signal?.aborted) {
        const error = new Error("PureShrink task cancelled");
        error.name = "AbortError";
        reject(error);
        return;
      }
      resolve(result);
    });
  });
}

function comparableHashOutput(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .join("\n");
}

async function mediaFingerprint(ffmpegPath, filePath, kind) {
  const format = kind === "image" ? "framemd5" : "streamhash";
  const hashArgs = kind === "image"
    ? ["-v", "error", "-i", filePath, "-vf", "format=rgba", "-f", format, "-"]
    : ["-v", "error", "-i", filePath, "-map", "0", "-c", "copy", "-f", format, "-hash", "sha256", "-"];
  const result = await runProcess(ffmpegPath, hashArgs);
  if (result.code !== 0) {
    throw new Error(`PureShrink verification failed: ${result.stderr.slice(-600)}`);
  }
  return comparableHashOutput(result.stdout);
}

function zipLosslessly(sourcePath, outputPath) {
  const source = readFileSync(sourcePath);
  const zipped = zipSync({ [path.basename(sourcePath)]: new Uint8Array(source) }, { level: 9 });
  writeFileSync(outputPath, zipped);
  const restored = unzipSync(zipped)[path.basename(sourcePath)];
  if (!restored || !Buffer.from(restored).equals(source)) {
    unlinkSync(outputPath);
    throw new Error("PureShrink ZIP byte verification failed");
  }
}

class NativeRunner {
  constructor(options = {}) {
    this.ffmpegPath = resolveBundledBinaryPath(
      options.ffmpegPath || require("ffmpeg-static"),
    );
    this.active = new Map();
  }

  async compress(request, outputDirectory, onProgress = () => {}) {
    if (!Number.isInteger(request?.id)) throw new Error("PureShrink task ID is invalid");
    mkdirSync(outputDirectory, { recursive: true });
    const outputPath = resolveOutputPath(
      request.sourcePath,
      outputDirectory,
      request.plan?.outputExtension,
    );
    const controller = new AbortController();
    this.active.set(request.id, controller);

    try {
      onProgress(4);
      if (request.plan?.kind === "archive") {
        zipLosslessly(request.sourcePath, outputPath);
        onProgress(96);
      } else {
        const args = buildArguments(request, outputPath);
        const result = await runProcess(this.ffmpegPath, args, {
          signal: controller.signal,
          onStderr: (line) => {
            if (/time=|frame=/.test(line)) onProgress(62);
          },
        });
        if (result.code !== 0) {
          throw new Error(`FFmpeg exited with code ${result.code}: ${result.stderr.slice(-800)}`);
        }
      }

      const sourceBytes = statSync(request.sourcePath).size;
      const outputBytes = statSync(outputPath).size;
      if (request.plan?.isLossless && outputBytes >= sourceBytes) {
        unlinkSync(outputPath);
        onProgress(100);
        return {
          name: path.basename(request.sourcePath),
          outputBytes: sourceBytes,
          verification: "原件已是更优结果",
          keptOriginal: true,
        };
      }

      let verification = "高保真参数重新编码完成";
      if (request.plan?.isLossless && request.plan?.kind !== "archive") {
        const [sourceFingerprint, outputFingerprint] = await Promise.all([
          mediaFingerprint(this.ffmpegPath, request.sourcePath, request.plan.kind),
          mediaFingerprint(this.ffmpegPath, outputPath, request.plan.kind),
        ]);
        if (!sourceFingerprint || sourceFingerprint !== outputFingerprint) {
          unlinkSync(outputPath);
          throw new Error("PureShrink lossless verification did not match");
        }
        verification = request.plan.kind === "image"
          ? "逐像素解码指纹一致"
          : "音视频码流 SHA-256 一致";
      } else if (request.plan?.kind === "archive") {
        verification = "ZIP 解压后字节与原件一致";
      }

      onProgress(100);
      return {
        name: path.basename(outputPath),
        outputBytes,
        path: outputPath,
        verification,
      };
    } finally {
      this.active.delete(request.id);
    }
  }

  cancel(taskId) {
    const controller = this.active.get(taskId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  cancelAll() {
    for (const controller of this.active.values()) controller.abort();
  }
}

module.exports = {
  NativeRunner,
  mediaFingerprint,
  resolveBundledBinaryPath,
  runProcess,
  zipLosslessly,
};
