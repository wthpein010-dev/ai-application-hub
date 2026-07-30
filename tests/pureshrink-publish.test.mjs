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
    href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/pureshrink-v1.0.0/PureShrink-Windows-x64.zip",
    label: "Wins下载",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(item.platforms.mac)), {
    href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/pureshrink-v1.0.0/PureShrink-macOS.zip",
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
  assert.match(publicFiles, /pureshrink-v1\.0\.0/);
  assert.match(publicFiles, /PureShrink-Windows-x64\.zip/);
  assert.match(publicFiles, /PureShrink-macOS\.zip/);
});

test("PureShrink manifest identifies independently built platform assets", () => {
  const manifest = JSON.parse(readFileSync(project("release-manifest.json"), "utf8"));

  assert.equal(manifest.tag, "pureshrink-v1.0.0");
  assert.equal(manifest.releaseUrl, "https://github.com/wthpein010-dev/ai-application-hub/releases/tag/pureshrink-v1.0.0");
  assert.equal(manifest.assets.windows.name, "PureShrink-Windows-x64.zip");
  assert.equal(manifest.assets.windows.builtOn, "windows-latest");
  assert.equal(manifest.assets.mac.name, "PureShrink-macOS.zip");
  assert.deepEqual(manifest.assets.mac.architectures, ["arm64", "x64"]);
  assert.deepEqual(manifest.assets.mac.builtOn, ["macos-14", "macos-15-intel"]);
});

test("homepage cache key is refreshed for the PureShrink card", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(html, /app-20260706-restore-games\.js\?v=20260730-pureshrink/);
});
