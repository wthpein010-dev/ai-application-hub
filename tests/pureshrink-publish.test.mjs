import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimePath = join(root, "app-20260706-restore-games.js");
const runtime = readFileSync(runtimePath, "utf8");
const project = (...parts) => join(root, "projects", "pureshrink", ...parts);

function loadDefaultApps() {
  return loadDefaultAppsFromRuntime(runtime);
}

function loadAppsWithStoredValue(stored) {
  const start = runtime.indexOf("function loadApps");
  const end = runtime.indexOf("function projectHref", start);
  const storage = new Map([
    ["ai-competition-hub-v2-apps", JSON.stringify(stored)],
  ]);
  const context = {
    globalThis: { defaultApps: loadDefaultApps() },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
    },
  };
  const source = [
    'const STORAGE_KEY = "ai-competition-hub-v2-apps";',
    "const statusLabel = { desktop: true, assistant: true };",
    'const OLD_HUB_BRIEF = "";',
    'const HUB_BRIEF = "";',
    "const defaultApps = globalThis.defaultApps;",
    runtime.slice(start, end),
    "globalThis.loadApps = loadApps;",
  ].join("\n");
  vm.runInNewContext(source, context);
  return context.globalThis.loadApps();
}

function isApplication(app) {
  return !["game", "engineering", "ai"].includes(app.status);
}

test("PureShrink follows ClickFlow and exposes four publication actions", () => {
  const apps = loadDefaultApps();
  const item = apps.find((app) => app.id === "pureshrink");
  const applicationIds = apps.filter(isApplication).map((app) => app.id);
  const pureShrinkIndex = applicationIds.indexOf("pureshrink");

  assert.ok(item, "PureShrink should be registered");
  assert.notEqual(pureShrinkIndex, -1);
  assert.equal(applicationIds[pureShrinkIndex - 1], "clickflow");
  assert.equal(item.name, "无损压缩工坊");
  assert.equal(item.category, "媒体压缩工具");
  assert.equal(item.status, "assistant");
  assert.equal(item.badge, "辅助工具");
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

test("legacy PureShrink defaults migrate to the auxiliary-tool card", () => {
  const current = loadDefaultApps().find((app) => app.id === "pureshrink");
  const legacy = {
    ...current,
    name: "PureShrink 无损压缩工坊",
    status: "desktop",
    badge: "网页 · Windows · macOS",
  };

  const migrated = loadAppsWithStoredValue([legacy]).find(
    (app) => app.id === "pureshrink",
  );

  assert.equal(migrated.name, "无损压缩工坊");
  assert.equal(migrated.status, "assistant");
  assert.equal(migrated.badge, "辅助工具");
  assert.equal(migrated.category, "媒体压缩工具");
});

test("PureShrink migration preserves a customized name", () => {
  const current = loadDefaultApps().find((app) => app.id === "pureshrink");
  const customized = {
    ...current,
    name: "我的压缩工具",
    status: "desktop",
    badge: "网页 · Windows · macOS",
  };

  const migrated = loadAppsWithStoredValue([customized]).find(
    (app) => app.id === "pureshrink",
  );

  assert.equal(migrated.name, "我的压缩工具");
  assert.equal(migrated.status, "assistant");
  assert.equal(migrated.badge, "辅助工具");
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
  assert.match(publicFiles, /pureshrink-v1\.0\.3/);
  assert.match(publicFiles, /PureShrink-Windows-x64\.zip/);
  assert.match(publicFiles, /PureShrink-macOS\.zip/);
});

test("PureShrink manifest identifies independently built platform assets", () => {
  const manifest = JSON.parse(readFileSync(project("release-manifest.json"), "utf8"));

  assert.equal(manifest.tag, "pureshrink-v1.0.3");
  assert.equal(manifest.releaseUrl, "https://github.com/wthpein010-dev/ai-application-hub/releases/tag/pureshrink-v1.0.3");
  assert.equal(manifest.assets.windows.name, "PureShrink-Windows-x64.zip");
  assert.equal(manifest.assets.windows.builtOn, "windows-latest");
  assert.equal(manifest.assets.mac.name, "PureShrink-macOS.zip");
  assert.deepEqual(manifest.assets.mac.architectures, ["arm64", "x64"]);
  assert.deepEqual(manifest.assets.mac.builtOn, ["macos-14", "macos-15-intel"]);
});

test("PureShrink manifest records immutable release assets and native verification", () => {
  const manifest = JSON.parse(readFileSync(project("release-manifest.json"), "utf8"));

  assert.equal(manifest.commit, "997f226e304c51a98eb2fc68cd15037aeb9f93e7");
  assert.equal(manifest.publishedAt, "2026-07-30T07:11:32Z");
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
      runId: 30521751161,
      conclusion: "success",
      windowsJobId: 90803504070,
      arm64JobId: 90803504082,
      x64JobId: 90803504054,
      publishJobId: 90804296989,
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
      bytes: 117970855,
      sha256: "a1f5533b77d40600bad8cd7ff042486768242bf5b236d35448c92d8537d46489",
      smokeExitCode: 0,
      archiveTest: "Public ZIP central directory verified",
      proof: "PURESHRINK_NATIVE_PROCESSING_OK",
    },
  );

  assert.deepEqual(
    {
      packagedFiles: manifest.assets.windows.verification.ciPackagedFiles,
      publicArchiveEntries: manifest.assets.windows.verification.publicArchiveEntries,
      requiredEntries: manifest.assets.windows.verification.requiredEntries,
      executableBytes: manifest.assets.windows.verification.downloadedExecutable.bytes,
    },
    {
      packagedFiles: 128,
      publicArchiveEntries: 2,
      requiredEntries: [
        "PureShrink-Windows-x64/PureShrink.exe",
        "PureShrink-Windows-x64/README.md",
      ],
      executableBytes: 117952680,
    },
  );

  assert.deepEqual(
    manifest.assets.mac.verification.architectures.map((item) => ({
      name: item.name,
      appMachO: item.appMachO,
      appSha256: item.appSha256,
      ffmpegMachO: item.ffmpegMachO,
      adHocSignatureVerified: item.adHocSignatureVerified,
      launchSmokeExitCode: item.launchSmokeExitCode,
      nativeProof: item.nativeRunner.proof,
    })),
    [
      {
        name: "arm64",
        appMachO: "arm64",
        appSha256: "8a00548d5415ff0719a5f3251bd16f8a23f8f2d23d5fb1a65a26aaf7024ba611",
        ffmpegMachO: "arm64",
        adHocSignatureVerified: true,
        launchSmokeExitCode: 0,
        nativeProof: "PURESHRINK_NATIVE_PROCESSING_OK",
      },
      {
        name: "x64",
        appMachO: "x86_64",
        appSha256: "a5c232cbaa4d695403b549a71424cd636d45b5d7f57a14303f51f0ac6727d1fa",
        ffmpegMachO: "x86_64",
        adHocSignatureVerified: true,
        launchSmokeExitCode: 0,
        nativeProof: "PURESHRINK_NATIVE_PROCESSING_OK",
      },
    ],
  );

  assert.deepEqual(
    {
      bytes: manifest.assets.mac.bytes,
      sha256: manifest.assets.mac.sha256,
      archiveTest: manifest.assets.mac.verification.archiveTest,
      packagedFilesPerArchitecture: manifest.assets.mac.verification.ciPackagedFilesPerArchitecture,
      publicArchiveEntries: manifest.assets.mac.verification.publicArchiveEntries,
      checksumBytes: manifest.assets.checksums.bytes,
      checksumSha256: manifest.assets.checksums.sha256,
    },
    {
      bytes: 313421626,
      sha256: "d3ad9964171ba5943b2fb520846918e5ba5b142a0eb398d5fd2a17d328280ed1",
      archiveTest: "Public ZIP central directory verified",
      packagedFilesPerArchitecture: 335,
      publicArchiveEntries: 1341,
      checksumBytes: 196,
      checksumSha256: "15507b0831eb7bd5443d4dbf180984a6ac29d8402ab84985e6c2f9e2b0dba8b4",
    },
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
      runId: 30523519262,
      commit: "d37bf1e52747fb7180569f2e40165474774247dc",
      conclusion: "success",
    },
  );
  assert.deepEqual(manifest.evidenceDeployment, {
    commit: "d37bf1e52747fb7180569f2e40165474774247dc",
    runId: 30523519262,
    url: "https://github.com/wthpein010-dev/ai-application-hub/actions/runs/30523519262",
    conclusion: "success",
    deployedAt: "2026-07-30T07:38:08Z",
  });
  assert.deepEqual(manifest.publicVerification.onlineLossless, {
    passed: 4,
    total: 4,
    genericFile: "README.txt -> inner ZIP -> extracted 1048576 bytes identical",
    batchZip: "batch ZIP -> inner ZIP -> original bytes identical",
    png: "decoded RGBA identical; unchanged path covered by regression suite",
    mp4: "audio and video stream SHA-256 identical; unchanged path covered by regression suite",
  });
  assert.deepEqual(manifest.publicVerification.responsive, {
    compressorWidths: [1440, 390],
    hubWidth: 390,
    videoWidth: 390,
    horizontalOverflow: false,
  });
  assert.deepEqual(manifest.publicVerification.video, {
    codec: "H.264",
    width: 1280,
    height: 720,
    durationSeconds: 42.433333,
    readyState: 4,
    playedToSeconds: 1.784415,
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
  assert.deepEqual(manifest.publicVerification.batchDownload, {
    sourceBytes: 1048576,
    innerZipBytes: 1151,
    batchZipBytes: 234,
    restoredBytes: 1048576,
    errorRecovered: true,
    cancellationAborted: true,
    archiveSignalForwarded: true,
    workerStatus: 200,
    fflateStatus: 200,
  });
  assert.deepEqual(manifest.publicVerification.deployedHashes.worker, {
    sha256: "1f892a72b964365dc04115f745d38f9e30b0116aefe88dbc5a4d28dfd638ca03",
    matchedCommit: true,
  });
  assert.equal(manifest.publicVerification.browserErrors, 0);
});

test("homepage cache key is refreshed for the PureShrink card", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(html, /app-20260706-restore-games\.js\?v=20260730-pureshrink-auxiliary/);
});
