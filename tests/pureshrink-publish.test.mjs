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
    href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/pureshrink-v1.0.4/PureShrink-Windows-x64.zip",
    label: "Wins下载",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(item.platforms.mac)), {
    href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/pureshrink-v1.0.4/PureShrink-macOS.zip",
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

test("PureShrink exposes only the published 1.0.4 downloads", () => {
  assert.equal(existsSync(project("index.html")), true);
  assert.equal(existsSync(project("release-manifest.json")), true);

  const publicFiles = [
    readFileSync(project("index.html"), "utf8"),
    readFileSync(project("README.md"), "utf8"),
    readFileSync(runtimePath, "utf8"),
  ].join("\n");

  assert.doesNotMatch(publicFiles, /C:\\Users|localhost|127\.0\.0\.1|file:\/\//);
  assert.match(publicFiles, /pureshrink-v1\.0\.4/);
  assert.doesNotMatch(publicFiles, /pureshrink-v1\.0\.3/);
  assert.match(publicFiles, /PureShrink-Windows-x64\.zip/);
  assert.match(publicFiles, /PureShrink-macOS\.zip/);
});

test("PureShrink manifest identifies independently built platform assets", () => {
  const manifest = JSON.parse(readFileSync(project("release-manifest.json"), "utf8"));

  assert.equal(manifest.tag, "pureshrink-v1.0.4");
  assert.equal(manifest.releaseUrl, "https://github.com/wthpein010-dev/ai-application-hub/releases/tag/pureshrink-v1.0.4");
  assert.equal(manifest.assets.windows.name, "PureShrink-Windows-x64.zip");
  assert.equal(manifest.assets.windows.builtOn, "windows-latest");
  assert.equal(manifest.assets.mac.name, "PureShrink-macOS.zip");
  assert.deepEqual(manifest.assets.mac.architectures, ["arm64", "x64"]);
  assert.deepEqual(manifest.assets.mac.builtOn, ["macos-14", "macos-15-intel"]);
});

test("PureShrink manifest records immutable release assets and native verification", () => {
  const manifest = JSON.parse(readFileSync(project("release-manifest.json"), "utf8"));

  assert.equal(manifest.commit, "4cb206a7a1acc59b126c0bc58ed63738455fdfb5");
  assert.equal(manifest.publishedAt, "2026-08-20T02:02:10Z");
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
      runId: 32322762106,
      conclusion: "success",
      windowsJobId: 96287999527,
      arm64JobId: 96287999680,
      x64JobId: 96287999618,
      publishJobId: 96288829560,
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
      bytes: 117971010,
      sha256: "075be39c64b91cd5a94da06f5187970eebe923ab21bb702e00a9ddb4d633e827",
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
      executableBytes: 117952799,
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
        appSha256: "ea73bcfcf4231ad1dc10cc746fef2131fdf6807acb5d247637a5617e0fa8b939",
        ffmpegMachO: "arm64",
        adHocSignatureVerified: true,
        launchSmokeExitCode: 0,
        nativeProof: "PURESHRINK_NATIVE_PROCESSING_OK",
      },
      {
        name: "x64",
        appMachO: "x86_64",
        appSha256: "c4cdcbb0b703a0d6ba593b4af3085feda6d7d8248b3319c336f3affccb6a9cb6",
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
      bytes: 313423419,
      sha256: "49cccbed9a1c083398eac0601ba40aebd3d72c98eb3f26e76358fa14ec49199d",
      archiveTest: "Public ZIP central directory verified",
      packagedFilesPerArchitecture: 335,
      publicArchiveEntries: 1341,
      checksumBytes: 196,
      checksumSha256: "1eb7aee8dcd773a9531146f50ad0ea8eaaa6355b7631aa109582a01031d8b27e",
    },
  );
});

test("PureShrink manifest does not claim deployment evidence before 1.0.4 reaches Pages", () => {
  const manifest = JSON.parse(readFileSync(project("release-manifest.json"), "utf8"));

  assert.equal(manifest.pagesWorkflow, null);
  assert.equal(manifest.evidenceDeployment, null);
  assert.deepEqual(manifest.publicVerification, {
    status: "pending",
    reason: "Awaiting the first GitHub Pages deployment that contains PureShrink 1.0.4",
  });
});

test("homepage cache key preserves the Hub audit before the PureShrink refresh", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  const cacheKey = html.match(/app-20260706-restore-games\.js\?v=([^"]+)/)?.[1];
  assert.ok(cacheKey, "runtime cache key should be present");
  const auditIndex = cacheKey.indexOf("20260820-hub-quality-audit");
  const pureShrinkIndex = cacheKey.indexOf("20260820-pureshrink-v104");
  assert.notEqual(auditIndex, -1);
  assert.notEqual(pureShrinkIndex, -1);
  assert.ok(auditIndex < pureShrinkIndex, cacheKey);
});
