import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const desktop = (...parts) => join(root, "build", "pureshrink-desktop", ...parts);

const {
  buildArguments,
  resolveOutputPath,
} = require(desktop("native", "policy.cjs"));
const {
  mediaFingerprint,
  resolveBundledBinaryPath,
  runProcess,
  zipLosslessly,
} = require(desktop("native", "runner.cjs"));

test("native lossless policy re-encodes PNG without a lossy quality flag", () => {
  const args = buildArguments({
    sourcePath: "C:\\media\\hero.png",
    plan: {
      kind: "image",
      mode: "lossless",
      outputExtension: "png",
      isLossless: true,
    },
  }, "D:\\output\\hero-pureshrink.png");

  assert.deepEqual(args, [
    "-y",
    "-i", "C:\\media\\hero.png",
    "-map_metadata", "-1",
    "-compression_level", "9",
    "D:\\output\\hero-pureshrink.png",
  ]);
  assert.equal(args.includes("-q:v"), false);
});

test("native lossless media policy copies every stream", () => {
  const args = buildArguments({
    sourcePath: "C:\\media\\clip.mp4",
    plan: {
      kind: "video",
      mode: "lossless",
      outputExtension: "mp4",
      isLossless: true,
    },
  }, "D:\\output\\clip-pureshrink.mp4");

  assert.deepEqual(args, [
    "-y",
    "-i", "C:\\media\\clip.mp4",
    "-map", "0",
    "-c", "copy",
    "-map_metadata", "-1",
    "-movflags", "+faststart",
    "D:\\output\\clip-pureshrink.mp4",
  ]);
});

test("native high-fidelity video policy uses documented H.264 and AAC settings", () => {
  const args = buildArguments({
    sourcePath: "C:\\media\\clip.mov",
    plan: {
      kind: "video",
      mode: "fidelity",
      outputExtension: "mp4",
      isLossless: false,
    },
  }, "D:\\output\\clip-pureshrink.mp4");

  assert.deepEqual(args, [
    "-y",
    "-i", "C:\\media\\clip.mov",
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "medium",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    "D:\\output\\clip-pureshrink.mp4",
  ]);
});

test("desktop output paths never overwrite a source or existing result", () => {
  const occupied = new Set([
    "D:\\output\\clip-pureshrink.mp4".toLowerCase(),
    "D:\\output\\clip-pureshrink-2.mp4".toLowerCase(),
  ]);

  const result = resolveOutputPath(
    "C:\\media\\clip.mov",
    "D:\\output",
    "mp4",
    (candidate) => occupied.has(candidate.toLowerCase()),
  );

  assert.equal(result, "D:\\output\\clip-pureshrink-3.mp4");
  assert.notEqual(result.toLowerCase(), "C:\\media\\clip.mov");
});

test("native process runner passes arguments directly without a shell", async () => {
  const result = await runProcess(
    process.execPath,
    ["-e", "process.stdout.write('pureshrink-ok')"],
  );

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "pureshrink-ok");
  assert.equal(result.stderr, "");
});

test("desktop ZIP work runs in a cancellable worker and removes partial output", async (t) => {
  const proofDirectory = mkdtempSync(join(tmpdir(), "pureshrink-archive-cancel-"));
  t.after(() => rmSync(proofDirectory, { recursive: true, force: true }));
  const sourcePath = join(proofDirectory, "source.bin");
  const outputPath = join(proofDirectory, "result.zip");
  writeFileSync(sourcePath, Buffer.alloc(1024, 7));
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    zipLosslessly(sourcePath, outputPath, { signal: controller.signal }),
    { name: "AbortError" },
  );
  assert.equal(existsSync(outputPath), false);
});

test("packaged FFmpeg resolves from app.asar.unpacked", () => {
  const virtualPath = join(
    "tmp",
    "PureShrink",
    "resources",
    "app.asar",
    "node_modules",
    "ffmpeg-static",
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
  );
  const unpackedPath = virtualPath.replace(
    `app.asar${sep}`,
    `app.asar.unpacked${sep}`,
  );

  assert.equal(
    resolveBundledBinaryPath(virtualPath, (candidate) => candidate === unpackedPath),
    unpackedPath,
  );
});

test("image fingerprint normalizes decoded pixel formats", async (t) => {
  const ffmpegPath = require(desktop(
    "node_modules",
    "ffmpeg-static",
    "index.js",
  ));
  const proofDirectory = mkdtempSync(join(tmpdir(), "pureshrink-fingerprint-"));
  t.after(() => rmSync(proofDirectory, { recursive: true, force: true }));
  const bmpPath = join(proofDirectory, "source.bmp");
  const pngPath = join(proofDirectory, "result.png");

  for (const args of [
    ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=64x64:d=0.1", "-frames:v", "1", "-y", bmpPath],
    ["-v", "error", "-i", bmpPath, "-compression_level", "9", "-y", pngPath],
  ]) {
    const result = spawnSync(ffmpegPath, args, { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }

  assert.equal(
    await mediaFingerprint(ffmpegPath, bmpPath, "image"),
    await mediaFingerprint(ffmpegPath, pngPath, "image"),
  );
});

test("Electron entry uses an isolated renderer and a narrow preload", () => {
  const main = readFileSync(desktop("main.cjs"), "utf8");
  const preload = readFileSync(desktop("preload.cjs"), "utf8");

  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /isTrustedRenderer/);
  assert.match(main, /assertTrustedSender/);
  assert.match(main, /allowedSourcePaths/);
  assert.match(main, /allowedResultPaths/);
  assert.match(main, /pathInside/);
  assert.match(main, /describeDroppedFiles/);
  assert.match(main, /localNavigationTarget/);
  assert.match(main, /wthpein010-dev\.github\.io\/ai-application-hub/);
  assert.doesNotMatch(main, /webSecurity:\s*false/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("pureShrinkDesktop"/);
  assert.match(preload, /webUtils\.getPathForFile/);
  assert.doesNotMatch(preload, /require:\s*require|process:\s*process/);
});

test("Electron entry provides a native-runner smoke mode for platform CI", () => {
  const main = readFileSync(desktop("main.cjs"), "utf8");

  assert.match(main, /--smoke-test/);
  assert.match(main, /PURESHRINK_SMOKE_OK/);
  assert.match(main, /runNativeProof/);
  assert.match(main, /app\.quit\(\)/);
  assert.match(main, /catch\s*\(error\)[\s\S]*PURESHRINK_SMOKE_FAILED/);
  assert.match(main, /finally\s*{\s*app\.quit\(\)/);
});

test("desktop install explicitly fetches the Electron runtime", () => {
  const packageJson = JSON.parse(readFileSync(desktop("package.json"), "utf8"));

  assert.equal(packageJson.scripts.postinstall, "install-electron");
});

test("desktop package keeps the local tutorial video functional", () => {
  const packageJson = JSON.parse(readFileSync(desktop("package.json"), "utf8"));
  const filter = packageJson.build.extraResources[0].filter;

  assert.equal(packageJson.build.extraResources[0].to, "app");
  assert.equal(filter.includes("projects/pureshrink/**/*"), true);
  assert.equal(filter.includes("assets/subpage-shell.css"), true);
  assert.equal(filter.includes("assets/hub-video-player.css"), true);
  assert.equal(filter.includes("assets/hub-video-player.js"), true);
  assert.equal(packageJson.build.asarUnpack.includes("native/archive-worker.cjs"), true);
  assert.equal(packageJson.build.asarUnpack.includes("node_modules/fflate/**/*"), true);
});
