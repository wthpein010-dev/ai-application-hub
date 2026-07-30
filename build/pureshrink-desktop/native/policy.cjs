"use strict";

const path = require("node:path");

function pathApiFor(...values) {
  return values.some((value) => /^[a-zA-Z]:\\|\\/.test(String(value || "")))
    ? path.win32
    : path.posix;
}

function assertRequest(request, outputPath) {
  if (!request || typeof request !== "object") {
    throw new TypeError("PureShrink native request is required");
  }
  const paths = pathApiFor(request.sourcePath, outputPath);
  if (!paths.isAbsolute(request.sourcePath || "")) {
    throw new Error("PureShrink source path must be absolute");
  }
  if (!paths.isAbsolute(outputPath || "")) {
    throw new Error("PureShrink output path must be absolute");
  }
  if (paths.resolve(request.sourcePath).toLowerCase() === paths.resolve(outputPath).toLowerCase()) {
    throw new Error("PureShrink refuses to overwrite the source file");
  }
}

function buildArguments(request, outputPath) {
  assertRequest(request, outputPath);
  const input = request.sourcePath;
  const { kind, mode, outputExtension } = request.plan || {};

  if (kind === "archive") return null;

  if (mode === "lossless") {
    if (kind === "image" && outputExtension === "png") {
      return [
        "-y",
        "-i", input,
        "-map_metadata", "-1",
        "-compression_level", "100",
        outputPath,
      ];
    }

    const args = [
      "-y",
      "-i", input,
      "-map", "0",
      "-c", "copy",
      "-map_metadata", "-1",
    ];
    if (["mp4", "mov", "m4v"].includes(outputExtension)) {
      args.push("-movflags", "+faststart");
    }
    args.push(outputPath);
    return args;
  }

  if (kind === "image") {
    return [
      "-y",
      "-i", input,
      "-c:v", "libwebp",
      "-quality", "95",
      outputPath,
    ];
  }
  if (kind === "gif") {
    return [
      "-y",
      "-i", input,
      "-filter_complex",
      "[0:v]fps=15,split[a][b];[a]palettegen=max_colors=256[p];[b][p]paletteuse=dither=sierra2_4a",
      "-loop", "0",
      outputPath,
    ];
  }
  if (kind === "audio") {
    return [
      "-y",
      "-i", input,
      "-vn",
      "-c:a", "aac",
      "-b:a", "192k",
      outputPath,
    ];
  }
  return [
    "-y",
    "-i", input,
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "medium",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outputPath,
  ];
}

function resolveOutputPath(sourcePath, outputDirectory, extension, exists = require("node:fs").existsSync) {
  const paths = pathApiFor(sourcePath, outputDirectory);
  if (!paths.isAbsolute(sourcePath || "") || !paths.isAbsolute(outputDirectory || "")) {
    throw new Error("PureShrink output resolution requires absolute paths");
  }
  const parsed = paths.parse(sourcePath);
  const safeExtension = String(extension || parsed.ext.slice(1) || "bin")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase() || "bin";

  let sequence = 1;
  while (sequence < 10_000) {
    const suffix = sequence === 1 ? "" : `-${sequence}`;
    const candidate = paths.join(
      outputDirectory,
      `${parsed.name}-pureshrink${suffix}.${safeExtension}`,
    );
    if (
      paths.resolve(candidate).toLowerCase() !== paths.resolve(sourcePath).toLowerCase()
      && !exists(candidate)
    ) {
      return candidate;
    }
    sequence += 1;
  }
  throw new Error("PureShrink could not find an available output name");
}

module.exports = {
  buildArguments,
  resolveOutputPath,
};

