import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
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
  MAX_DESKTOP_ARCHIVE_BYTES,
  mediaFingerprint,
  NativeRunner,
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

test("native process runner does not spawn an already-cancelled process", async (t) => {
  const proofDirectory = mkdtempSync(join(tmpdir(), "pureshrink-pre-cancel-"));
  t.after(() => rmSync(proofDirectory, { recursive: true, force: true }));
  const markerPath = join(proofDirectory, "spawned.txt");
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    runProcess(
      process.execPath,
      [
        "-e",
        "require('node:fs').writeFileSync(process.argv[1], 'spawned')",
        markerPath,
      ],
      { signal: controller.signal },
    ),
    { name: "AbortError" },
  );
  assert.equal(existsSync(markerPath), false);
});

test("native process runner keeps only a bounded diagnostic tail", async () => {
  const result = await runProcess(
    process.execPath,
    [
      "-e",
      "process.stderr.write('x'.repeat(2 * 1024 * 1024) + 'pureshrink-tail')",
    ],
  );

  assert.equal(result.code, 0);
  assert.ok(Buffer.byteLength(result.stderr, "utf8") <= 1024 * 1024);
  assert.match(result.stderr, /pureshrink-tail$/);
});

test("media fingerprint honors cancellation before verification starts", async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    mediaFingerprint(
      process.execPath,
      "ignored.mp4",
      "video",
      { signal: controller.signal },
    ),
    { name: "AbortError" },
  );
});

test("NativeRunner accepts controlled native process boundaries", async (t) => {
  const proofDirectory = mkdtempSync(join(tmpdir(), "pureshrink-runner-boundary-"));
  t.after(() => rmSync(proofDirectory, { recursive: true, force: true }));
  const sourcePath = join(proofDirectory, "source.mp4");
  const outputDirectory = join(proofDirectory, "output");
  writeFileSync(sourcePath, Buffer.alloc(8, 7));
  const runner = new NativeRunner({
    ffmpegPath: "controlled-ffmpeg",
    runProcess: async (_binary, args) => {
      writeFileSync(args.at(-1), Buffer.from([1]));
      return { code: 0, stdout: "", stderr: "" };
    },
    mediaFingerprint: async () => "matching-fingerprint",
  });

  const result = await runner.compress({
    id: 101,
    sourcePath,
    plan: {
      kind: "video",
      mode: "lossless",
      outputExtension: "mp4",
      isLossless: true,
    },
  }, outputDirectory);

  assert.equal(result.verification, "音视频码流 SHA-256 一致");
  assert.equal(result.outputBytes, 1);
  assert.equal(existsSync(result.path), true);
});

test("NativeRunner aborts and awaits a delayed fingerprint sibling before propagating failure", async (t) => {
  const proofDirectory = mkdtempSync(join(tmpdir(), "pureshrink-fingerprint-failure-"));
  t.after(() => rmSync(proofDirectory, { recursive: true, force: true }));
  const sourcePath = join(proofDirectory, "source.mp4");
  const outputDirectory = join(proofDirectory, "output");
  const outputPath = join(outputDirectory, "source-pureshrink.mp4");
  writeFileSync(sourcePath, Buffer.alloc(8, 7));
  const sourceError = new Error("source fingerprint failed");
  const events = [];
  let markOutputStarted;
  const outputStarted = new Promise((resolve) => { markOutputStarted = resolve; });
  let settleOutput;
  const runner = new NativeRunner({
    ffmpegPath: "controlled-ffmpeg",
    runProcess: async (_binary, args) => {
      writeFileSync(args.at(-1), Buffer.from([1]));
      return { code: 0, stdout: "", stderr: "" };
    },
    mediaFingerprint: async (_binary, filePath, _kind, { signal }) => {
      if (filePath === sourcePath) {
        events.push("source:start");
        await outputStarted;
        events.push("source:failed");
        throw sourceError;
      }
      events.push("output:start");
      markOutputStarted();
      return new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => events.push("output:aborted"), { once: true });
        settleOutput = () => {
          events.push("output:settled");
          if (signal.aborted) {
            const error = new Error("PureShrink task cancelled");
            error.name = "AbortError";
            reject(error);
          } else {
            resolve("matching-fingerprint");
          }
        };
      });
    },
  });
  let outcome;
  const completion = runner.compress({
    id: 102,
    sourcePath,
    plan: {
      kind: "video",
      mode: "lossless",
      outputExtension: "mp4",
      isLossless: true,
    },
  }, outputDirectory).then(
    (value) => { outcome = { value }; },
    (error) => { outcome = { error }; },
  );

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(outcome, undefined, "failure must wait for the delayed sibling");
  assert.equal(runner.active.has(102), true);
  assert.equal(existsSync(outputPath), true);
  assert.deepEqual(events, [
    "source:start",
    "output:start",
    "source:failed",
    "output:aborted",
  ]);

  settleOutput();
  await completion;
  assert.strictEqual(outcome.error, sourceError);
  assert.equal(runner.active.has(102), false);
  assert.equal(existsSync(outputPath), false);
  assert.equal(events.at(-1), "output:settled");
});

test("NativeRunner cancellation waits for both active fingerprint jobs to settle", async (t) => {
  const proofDirectory = mkdtempSync(join(tmpdir(), "pureshrink-fingerprint-cancel-"));
  t.after(() => rmSync(proofDirectory, { recursive: true, force: true }));
  const sourcePath = join(proofDirectory, "source.mp4");
  const outputDirectory = join(proofDirectory, "output");
  const outputPath = join(outputDirectory, "source-pureshrink.mp4");
  writeFileSync(sourcePath, Buffer.alloc(8, 7));
  const events = [];
  let startedCount = 0;
  let markBothStarted;
  const bothStarted = new Promise((resolve) => { markBothStarted = resolve; });
  let settleOutput;
  const runner = new NativeRunner({
    ffmpegPath: "controlled-ffmpeg",
    runProcess: async (_binary, args) => {
      writeFileSync(args.at(-1), Buffer.from([1]));
      return { code: 0, stdout: "", stderr: "" };
    },
    mediaFingerprint: async (_binary, filePath, _kind, { signal }) => new Promise((resolve, reject) => {
      const side = filePath === sourcePath ? "source" : "output";
      events.push(`${side}:start`);
      startedCount += 1;
      if (startedCount === 2) markBothStarted();
      signal.addEventListener("abort", () => {
        events.push(`${side}:aborted`);
        const error = new Error("PureShrink task cancelled");
        error.name = "AbortError";
        if (side === "source") {
          events.push("source:settled");
          reject(error);
        } else {
          settleOutput = () => {
            events.push("output:settled");
            reject(error);
          };
        }
      }, { once: true });
    }),
  });
  let outcome;
  const completion = runner.compress({
    id: 103,
    sourcePath,
    plan: {
      kind: "video",
      mode: "lossless",
      outputExtension: "mp4",
      isLossless: true,
    },
  }, outputDirectory).then(
    (value) => { outcome = { value }; },
    (error) => { outcome = { error }; },
  );

  await bothStarted;
  assert.equal(runner.cancel(103), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(outcome, undefined, "cancellation must wait for the delayed sibling");
  assert.equal(runner.active.has(103), true);
  assert.equal(existsSync(outputPath), true);
  assert.deepEqual(events, [
    "source:start",
    "output:start",
    "source:aborted",
    "source:settled",
    "output:aborted",
  ]);

  settleOutput();
  await completion;
  assert.equal(outcome.error?.name, "AbortError");
  assert.equal(runner.active.has(103), false);
  assert.equal(existsSync(outputPath), false);
  assert.equal(events.at(-1), "output:settled");
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

test("desktop ZIP work rejects oversized generic files before starting a worker", async (t) => {
  const proofDirectory = mkdtempSync(join(tmpdir(), "pureshrink-archive-limit-"));
  t.after(() => rmSync(proofDirectory, { recursive: true, force: true }));
  const sourcePath = join(proofDirectory, "source.bin");
  const outputPath = join(proofDirectory, "result.zip");
  writeFileSync(sourcePath, Buffer.alloc(1024, 7));

  await assert.rejects(
    zipLosslessly(sourcePath, outputPath, { maxBytes: 1024 }),
    /256 MB/,
  );
  assert.equal(existsSync(outputPath), false);
  assert.equal(MAX_DESKTOP_ARCHIVE_BYTES, 256 * 1024 * 1024);
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
  const ffmpegPath = process.env.FFMPEG_PATH || require(desktop(
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

test("desktop package prepares 1.0.5 and keeps the local tutorial video functional", () => {
  const packageJson = JSON.parse(readFileSync(desktop("package.json"), "utf8"));
  const packageLock = JSON.parse(readFileSync(desktop("package-lock.json"), "utf8"));
  const releaseNotes = readFileSync(
    join(root, "projects", "pureshrink", "release-notes.md"),
    "utf8",
  );
  const [projectResources, sharedResources] = packageJson.build.extraResources;

  assert.equal(packageJson.version, "1.0.5");
  assert.equal(packageLock.version, "1.0.5");
  assert.equal(packageLock.packages[""].version, "1.0.5");
  assert.match(releaseNotes, /^# PureShrink 1\.0\.5\s+## 1\.0\.5 生命周期修复/m);
  assert.equal(packageJson.build.extraResources.length, 2);
  assert.equal(projectResources.from, "../../projects/pureshrink");
  assert.equal(projectResources.to, "app/projects/pureshrink");
  assert.equal(projectResources.filter.includes("**/*"), true);
  assert.equal(sharedResources.from, "../../assets");
  assert.equal(sharedResources.to, "app/assets");
  assert.deepEqual(sharedResources.filter, [
    "subpage-shell.css",
    "hub-video-player.css",
    "hub-video-player.js",
  ]);
  assert.equal(packageJson.build.asarUnpack.includes("native/archive-worker.cjs"), true);
  assert.equal(packageJson.build.asarUnpack.includes("node_modules/fflate/**/*"), true);
});

test("desktop package verifier accepts macOS Contents/Resources casing", (t) => {
  const dist = mkdtempSync(join(tmpdir(), "pureshrink-macos-package-"));
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  const files = [
    "PureShrink-macOS-arm64.zip",
    "mac/PureShrink.app/Contents/MacOS/PureShrink",
    "mac/PureShrink.app/Contents/Resources/app/projects/pureshrink/index.html",
    "mac/PureShrink.app/Contents/Resources/app/projects/pureshrink/video/pureshrink-demo.mp4",
    "mac/PureShrink.app/Contents/Resources/app/projects/pureshrink/video/pureshrink-demo.vtt",
    "mac/PureShrink.app/Contents/Resources/app/assets/subpage-shell.css",
    "mac/PureShrink.app/Contents/Resources/app/assets/hub-video-player.css",
    "mac/PureShrink.app/Contents/Resources/app/assets/hub-video-player.js",
    "mac/PureShrink.app/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg",
    "mac/PureShrink.app/Contents/Resources/app.asar.unpacked/native/archive-worker.cjs",
    "mac/PureShrink.app/Contents/Resources/app.asar.unpacked/node_modules/fflate/lib/index.cjs",
  ];

  for (const relativePath of files) {
    const file = join(dist, ...relativePath.split("/"));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "pureshrink");
  }

  const missingWorkerResult = spawnSync(
    process.execPath,
    [desktop("scripts", "verify-package.mjs"), dist, "macos"],
    { encoding: "utf8" },
  );
  assert.notEqual(missingWorkerResult.status, 0);
  assert.match(
    `${missingWorkerResult.stdout}\n${missingWorkerResult.stderr}`,
    /Browser archive worker is missing/,
  );

  const browserWorker = join(
    dist,
    "mac",
    "PureShrink.app",
    "Contents",
    "Resources",
    "app",
    "projects",
    "pureshrink",
    "workers",
    "archive-worker.js",
  );
  mkdirSync(dirname(browserWorker), { recursive: true });
  writeFileSync(browserWorker, "pureshrink");

  const result = spawnSync(
    process.execPath,
    [desktop("scripts", "verify-package.mjs"), dist, "macos"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
});
