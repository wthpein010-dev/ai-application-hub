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
    href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/pureshrink-v1.0.5/PureShrink-Windows-x64.zip",
    label: "Wins下载",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(item.platforms.mac)), {
    href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/pureshrink-v1.0.5/PureShrink-macOS.zip",
    label: "Mac下载",
  });
});

test("legacy PureShrink 1.0.3 actions migrate while customized copy stays intact", () => {
  const current = loadDefaultApps().find((app) => app.id === "pureshrink");
  const legacy = {
    ...current,
    name: "PureShrink 无损压缩工坊",
    status: "desktop",
    badge: "网页 · Windows · macOS",
    brief: "我的压缩流程简介",
    problem: "我的媒体整理问题",
    aiUse: "我的自动化说明",
    folder: "./cached/pureshrink/",
    entry: "./cached/pureshrink/index.html",
    video: "./cached/pureshrink/video.html",
    package: "https://github.com/wthpein010-dev/ai-application-hub/releases/tag/pureshrink-v1.0.3",
    platforms: {
      web: "./cached/pureshrink/index.html",
      windows: {
        href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/pureshrink-v1.0.3/PureShrink-Windows-x64.zip",
        label: "Wins下载",
      },
      mac: {
        href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/pureshrink-v1.0.3/PureShrink-macOS.zip",
        label: "Mac下载",
      },
    },
  };

  const migrated = loadAppsWithStoredValue([legacy]).find(
    (app) => app.id === "pureshrink",
  );

  assert.equal(migrated.name, "无损压缩工坊");
  assert.equal(migrated.status, "assistant");
  assert.equal(migrated.badge, "辅助工具");
  assert.equal(migrated.category, "媒体压缩工具");
  assert.equal(migrated.brief, "我的压缩流程简介");
  assert.equal(migrated.problem, "我的媒体整理问题");
  assert.equal(migrated.aiUse, "我的自动化说明");
  assert.deepEqual(
    JSON.parse(JSON.stringify({
      package: migrated.package,
      folder: migrated.folder,
      entry: migrated.entry,
      video: migrated.video,
      platforms: migrated.platforms,
    })),
    JSON.parse(JSON.stringify({
      package: current.package,
      folder: current.folder,
      entry: current.entry,
      video: current.video,
      platforms: current.platforms,
    })),
  );
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

test("PureShrink exposes only the published 1.0.5 downloads", () => {
  assert.equal(existsSync(project("index.html")), true);
  assert.equal(existsSync(project("release-manifest.json")), true);

  const publicFiles = [
    readFileSync(project("index.html"), "utf8"),
    readFileSync(project("README.md"), "utf8"),
    readFileSync(runtimePath, "utf8"),
  ].join("\n");

  assert.doesNotMatch(publicFiles, /C:\\Users|localhost|127\.0\.0\.1|file:\/\//);
  assert.match(publicFiles, /pureshrink-v1\.0\.5/);
  assert.doesNotMatch(publicFiles, /pureshrink-v1\.0\.[34]/);
  assert.match(publicFiles, /PureShrink-Windows-x64\.zip/);
  assert.match(publicFiles, /PureShrink-macOS\.zip/);
});

test("PureShrink manifest identifies independently built platform assets", () => {
  const manifest = JSON.parse(readFileSync(project("release-manifest.json"), "utf8"));

  assert.equal(manifest.tag, "pureshrink-v1.0.5");
  assert.equal(manifest.releaseUrl, "https://github.com/wthpein010-dev/ai-application-hub/releases/tag/pureshrink-v1.0.5");
  assert.equal(manifest.assets.windows.name, "PureShrink-Windows-x64.zip");
  assert.equal(manifest.assets.windows.builtOn, "windows-latest");
  assert.equal(manifest.assets.mac.name, "PureShrink-macOS.zip");
  assert.deepEqual(manifest.assets.mac.architectures, ["arm64", "x64"]);
  assert.deepEqual(manifest.assets.mac.builtOn, ["macos-14", "macos-15-intel"]);
});

test("PureShrink manifest records immutable release assets and native verification", () => {
  const manifest = JSON.parse(readFileSync(project("release-manifest.json"), "utf8"));

  assert.equal(manifest.commit, "781806096c852f9242808e3063a57d102fba70a2");
  assert.equal(manifest.publishedAt, "2026-08-20T03:38:40Z");
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
      runId: 32328655224,
      conclusion: "success",
      windowsJobId: 96304910292,
      arm64JobId: 96304910103,
      x64JobId: 96304910228,
      publishJobId: 96305539474,
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
      bytes: 117971902,
      sha256: "09e8e0d795a67ba9f63ce15b52c54dfc9f83c740189831f9a718d82a136a67ea",
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
      executableBytes: 117953652,
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
        appSha256: "2fe571ca04b14ba998b066b14aaca54cf6c750870fa331c4a6bc57714d408c7c",
        ffmpegMachO: "arm64",
        adHocSignatureVerified: true,
        launchSmokeExitCode: 0,
        nativeProof: "PURESHRINK_NATIVE_PROCESSING_OK",
      },
      {
        name: "x64",
        appMachO: "x86_64",
        appSha256: "a39d8a5de17bdda5d8fbe99b0e3ba4d218b7a36925ab36de4093910da0ee9733",
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
      bytes: 313422433,
      sha256: "228bce72358b2c8b20a30fccafaf7eb50380122023f3b775bfbceadb06f4d820",
      archiveTest: "Public ZIP central directory verified",
      packagedFilesPerArchitecture: 335,
      publicArchiveEntries: 1341,
      checksumBytes: 196,
      checksumSha256: "8febadfc3f0c78795e2e1dfe4fffbe9d3fdc0b08fbcc60a59b854638f31ae7e8",
    },
  );
});

test("PureShrink manifest records completed Pages and public acceptance evidence for 1.0.5", () => {
  const manifest = JSON.parse(readFileSync(project("release-manifest.json"), "utf8"));

  assert.deepEqual(manifest.pagesWorkflow, {
    runId: 32331640218,
    url: "https://github.com/wthpein010-dev/ai-application-hub/actions/runs/32331640218",
    commit: "f97f8eb65e54608f4e18e8709381bba8713f3aab",
    conclusion: "success",
    buildJobId: 96313291543,
    deployJobId: 96313472406,
  });
  assert.deepEqual(manifest.evidenceDeployment, {
    commit: "f97f8eb65e54608f4e18e8709381bba8713f3aab",
    runId: 32331640218,
    url: "https://github.com/wthpein010-dev/ai-application-hub/actions/runs/32331640218",
    conclusion: "success",
    deployedAt: "2026-08-20T04:23:51Z",
  });
  assert.deepEqual(manifest.publicVerification, {
    status: "passed",
    checkedAt: "2026-08-20T04:50:35Z",
    hubUrl: "https://wthpein010-dev.github.io/ai-application-hub/index.html",
    compressorUrl: "https://wthpein010-dev.github.io/ai-application-hub/projects/pureshrink/index.html",
    videoUrl: "https://wthpein010-dev.github.io/ai-application-hub/projects/pureshrink/video/index.html",
    workflowEvidence: {
      fullHubAndBrowser: {
        runId: 32331640775,
        url: "https://github.com/wthpein010-dev/ai-application-hub/actions/runs/32331640775",
        commit: "f97f8eb65e54608f4e18e8709381bba8713f3aab",
        conclusion: "success",
        jobId: 96313289710,
      },
      macDownloads: {
        runId: 32331640792,
        url: "https://github.com/wthpein010-dev/ai-application-hub/actions/runs/32331640792",
        commit: "f97f8eb65e54608f4e18e8709381bba8713f3aab",
        conclusion: "success",
        arm64JobId: 96313289649,
        x64JobId: 96313289802,
      },
    },
    http: {
      hub: 200,
      compressor: 200,
      video: 200,
      videoFile: 200,
      captions: 200,
      worker: 200,
      fflate: 200,
      ffmpeg: 200,
      ffmpegCoreJs: 200,
      ffmpegCoreWasmRange: 206,
      releaseManifest: 200,
      windowsDownload: 200,
      macDownload: 200,
      checksums: 200,
      videoRange: 206,
      videoContentRange: "bytes 0-1023/622199",
      wasmFirstContentRange: "bytes 0-1023/24383038",
      wasmLastContentRange: "bytes 24382014-24383037/24383038",
    },
    cardActions: [
      "演示",
      "视频",
      "Wins下载",
      "Mac下载",
    ],
    onlineLossless: {
      mode: "strict-lossless",
      format: "PDF -> ZIP",
      fixtureBytes: 1545,
      queueCompleted: true,
      result: "ZIP extracted bytes matched original",
      reductionPercent: 22.3,
    },
    responsive: {
      hubWidth: 390,
      compressorWidth: 390,
      videoWidth: 390,
      horizontalOverflow: false,
    },
    video: {
      codec: "H.264",
      width: 1280,
      height: 720,
      durationSeconds: 42.433333,
      readyState: 4,
      playedToSeconds: 2.64169,
      captionsMode: "showing",
      rangeStatus: 206,
    },
    releaseAssets: {
      windows: {
        status: 200,
        bytes: 117971902,
        sha256: "09e8e0d795a67ba9f63ce15b52c54dfc9f83c740189831f9a718d82a136a67ea",
        acceptRanges: true,
      },
      mac: {
        status: 200,
        bytes: 313422433,
        sha256: "228bce72358b2c8b20a30fccafaf7eb50380122023f3b775bfbceadb06f4d820",
        acceptRanges: true,
      },
      checksums: {
        status: 200,
        bytes: 196,
        sha256: "8febadfc3f0c78795e2e1dfe4fffbe9d3fdc0b08fbcc60a59b854638f31ae7e8",
      },
    },
    deployedHashes: {
      app: {
        sha256: "20bd0ec6247ed6a8235267b08a394fe95021a04ac071303736cbb1b642eced96",
        matchedCommit: true,
      },
      queue: {
        sha256: "48d0bf90d38adb5004682033dd3c003bfaf9f480d075c997d7bfc40d84139bec",
        matchedCommit: true,
      },
      engine: {
        sha256: "f8a803f7b9025580452f214e12a489581408e35b4c6f3b9ac0f326132b6b0256",
        matchedCommit: true,
      },
      worker: {
        sha256: "1f892a72b964365dc04115f745d38f9e30b0116aefe88dbc5a4d28dfd638ca03",
        matchedCommit: true,
      },
    },
    vendor: {
      ffmpegCoreJs: {
        url: "https://wthpein010-dev.github.io/ai-application-hub/projects/pureshrink/vendor/ffmpeg-core.js",
        status: 200,
        bytes: 86309,
      },
      ffmpegCoreWasm: {
        url: "https://wthpein010-dev.github.io/ai-application-hub/projects/pureshrink/vendor/ffmpeg-core.wasm",
        bytes: 24383038,
        rangeStatus: 206,
        firstRangeMatchedCommit: true,
        lastRangeMatchedCommit: true,
      },
    },
    browserErrors: 0,
    browserWarnings: 0,
  });
});

test("homepage cache key preserves the Hub audit before the PureShrink refresh", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  const cacheKey = html.match(/app-20260706-restore-games\.js\?v=([^"]+)/)?.[1];
  assert.ok(cacheKey, "runtime cache key should be present");
  const auditIndex = cacheKey.indexOf("20260820-hub-quality-audit");
  const pureShrinkIndex = cacheKey.indexOf("20260820-pureshrink-v105");
  assert.notEqual(auditIndex, -1);
  assert.notEqual(pureShrinkIndex, -1);
  assert.ok(auditIndex < pureShrinkIndex, cacheKey);
});
