import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimePath = join(root, "app-20260706-restore-games.js");
const project = (...parts) => join(root, "projects", "pureshrink", ...parts);

function loadDefaultApps() {
  return loadDefaultAppsFromRuntime(readFileSync(runtimePath, "utf8"));
}

function isApplication(app) {
  return !["game", "engineering", "ai"].includes(app.status);
}

test("PureShrink is the final application and exposes four publication actions", () => {
  const apps = loadDefaultApps();
  const item = apps.find((app) => app.id === "pureshrink");

  assert.ok(item, "PureShrink should be registered");
  assert.equal(apps.filter(isApplication).at(-1)?.id, "pureshrink");
  assert.equal(item.status, "desktop");
  assert.equal(item.video, "./projects/pureshrink/video/index.html");
  assert.equal(item.platforms.web, "./projects/pureshrink/index.html");
  assert.deepEqual(JSON.parse(JSON.stringify(item.platforms.windows)), {
    href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/pureshrink-v1.0.3/PureShrink-Windows-x64.zip",
    label: "Wins下载",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(item.platforms.mac)), {
    href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/pureshrink-v1.0.3/PureShrink-macOS.zip",
    label: "Mac下载",
  });
});

test("PureShrink page and release metadata use only public production URLs", () => {
  assert.equal(existsSync(project("index.html")), true);
  assert.equal(existsSync(project("release-manifest.json")), true);

  const publicFiles = [
    readFileSync(project("index.html"), "utf8"),
    readFileSync(project("README.md"), "utf8"),
    readFileSync(project("release-manifest.json"), "utf8"),
    readFileSync(runtimePath, "utf8"),
  ].join("\n");

  assert.doesNotMatch(publicFiles, /C:\\Users|localhost|127\.0\.0\.1|file:\/\//);
  assert.match(publicFiles, /pureshrink-v1\.0\.2/);
  assert.match(publicFiles, /PureShrink-Windows-x64\.zip/);
  assert.match(publicFiles, /PureShrink-macOS\.zip/);
});

test("PureShrink manifest identifies independently built platform assets", () => {
  const manifest = JSON.parse(readFileSync(project("release-manifest.json"), "utf8"));

  assert.equal(manifest.tag, "pureshrink-v1.0.2");
  assert.equal(manifest.releaseUrl, "https://github.com/wthpein010-dev/ai-application-hub/releases/tag/pureshrink-v1.0.2");
  assert.equal(manifest.assets.windows.name, "PureShrink-Windows-x64.zip");
  assert.equal(manifest.assets.windows.builtOn, "windows-latest");
  assert.equal(manifest.assets.mac.name, "PureShrink-macOS.zip");
  assert.deepEqual(manifest.assets.mac.architectures, ["arm64", "x64"]);
  assert.deepEqual(manifest.assets.mac.builtOn, ["macos-14", "macos-15-intel"]);
});

test("PureShrink manifest records immutable release assets and native verification", () => {
  const manifest = JSON.parse(readFileSync(project("release-manifest.json"), "utf8"));

  assert.equal(manifest.commit, "9856222eb8aa5739ebe4122d2e5dfe97e5bbc078");
  assert.equal(manifest.publishedAt, "2026-07-30T05:36:55Z");
  assert.deepEqual(
    {
      runId: manifest.releaseWorkflow.runId,
      conclusion: manifest.releaseWorkflow.conclusion,
      windowsJobId: manifest.releaseWorkflow.jobs.windows.jobId,
      arm64JobId: manifest.releaseWorkflow.jobs.macArm64.jobId,
      x64JobId: manifest.releaseWorkflow.jobs.macX64.jobId,
      publishJobId: manifest.releaseWorkflow.jobs.publish.jobId,
    },
    {
      runId: 30516864689,
      conclusion: "success",
      windowsJobId: 90788579680,
      arm64JobId: 90788579629,
      x64JobId: 90788579677,
      publishJobId: 90789119679,
    },
  );

  assert.deepEqual(
    {
      bytes: manifest.assets.windows.bytes,
      sha256: manifest.assets.windows.sha256,
      smokeExitCode: manifest.assets.windows.verification.smokeExitCode,
      archiveTest: manifest.assets.windows.verification.archiveTest,
      proof: manifest.assets.windows.verification.nativeRunner.proof,
    },
    {
      bytes: 117975871,
      sha256: "bda264203028946b58543710b2595f82f21c887f1016ebcbca2dbbdc128d1e18",
      smokeExitCode: 0,
      archiveTest: "Everything is Ok",
      proof: "PURESHRINK_NATIVE_PROCESSING_OK",
    },
  );

  assert.deepEqual(
    manifest.assets.mac.verification.architectures.map((item) => ({
      name: item.name,
      appMachO: item.appMachO,
      ffmpegMachO: item.ffmpegMachO,
      adHocSignatureVerified: item.adHocSignatureVerified,
      launchSmokeExitCode: item.launchSmokeExitCode,
      nativeProof: item.nativeRunner.proof,
    })),
    [
      {
        name: "arm64",
        appMachO: "arm64",
        ffmpegMachO: "arm64",
        adHocSignatureVerified: true,
        launchSmokeExitCode: 0,
        nativeProof: "PURESHRINK_NATIVE_PROCESSING_OK",
      },
      {
        name: "x64",
        appMachO: "x86_64",
        ffmpegMachO: "x86_64",
        adHocSignatureVerified: true,
        launchSmokeExitCode: 0,
        nativeProof: "PURESHRINK_NATIVE_PROCESSING_OK",
      },
    ],
  );
});

test("PureShrink manifest records the deployed Pages and public acceptance evidence", () => {
  const manifest = JSON.parse(readFileSync(project("release-manifest.json"), "utf8"));

  assert.deepEqual(
    {
      runId: manifest.pagesWorkflow.runId,
      commit: manifest.pagesWorkflow.commit,
      conclusion: manifest.pagesWorkflow.conclusion,
    },
    {
      runId: 30516853754,
      commit: "9856222eb8aa5739ebe4122d2e5dfe97e5bbc078",
      conclusion: "success",
    },
  );
  assert.deepEqual(manifest.evidenceDeployment, {
    commit: "7168e9a36829965adc4bdbf15e189a5eafaf9c9b",
    runId: 30519070236,
    url: "https://github.com/wthpein010-dev/ai-application-hub/actions/runs/30519070236",
    conclusion: "success",
    deployedAt: "2026-07-30T06:18:05Z",
  });
  assert.deepEqual(manifest.publicVerification.onlineLossless, {
    passed: 3,
    total: 3,
    genericFile: "README -> ZIP -> extracted bytes identical",
    png: "decoded RGBA identical; original retained when smaller",
    mp4: "audio and video stream SHA-256 fingerprints identical",
  });
  assert.deepEqual(manifest.publicVerification.responsive, {
    compressorWidths: [1440, 390],
    hubWidth: 390,
    horizontalOverflow: false,
  });
  assert.deepEqual(manifest.publicVerification.video, {
    codec: "H.264",
    width: 1280,
    height: 720,
    durationSeconds: 42.433333,
    readyState: 4,
    playedToSeconds: 3.45,
    captionsMode: "showing",
    rangeStatus: 206,
  });
  assert.deepEqual(manifest.publicVerification.vendor, {
    ffmpegCoreJs: {
      url: "https://wthpein010-dev.github.io/ai-application-hub/projects/pureshrink/vendor/ffmpeg-core.js",
      status: 200,
      bytes: 86309,
    },
    ffmpegCoreWasm: {
      url: "https://wthpein010-dev.github.io/ai-application-hub/projects/pureshrink/vendor/ffmpeg-core.wasm",
      status: 200,
      bytes: 24383038,
    },
  });
  assert.equal(manifest.publicVerification.browserErrors, 0);
});

test("homepage cache key is refreshed for the PureShrink card", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(html, /app-20260706-restore-games\.js\?v=20260730-pureshrink-103/);
});
