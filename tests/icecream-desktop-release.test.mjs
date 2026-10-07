import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";
import { readZipEntries, validateZipEntries } from "./helpers/zip-central-directory.mjs";

const runtime = readFileSync("app-20260706-restore-games.js", "utf8");
const project = loadDefaultAppsFromRuntime(runtime).find(app => app.id === "icecream");

test("IceCream offers real Windows and Mac players alongside the online game", () => {
  assert.equal(project.platforms.windows?.href, "./downloads/icecream-windows.zip");
  assert.equal(project.platforms.windows?.label, "Wins下载");
  assert.equal(project.platforms.mac?.href, "./downloads/icecream-mac.zip");
  assert.equal(project.platforms.mac?.label, "Mac下载");
  assert.equal(project.entry, "./projects/icecream/index.html");
  assert.equal(project.video, "./projects/icecream/video/index.html");
});

test("IceCream desktop ZIPs contain players rather than Unity source projects", () => {
  const windows = validateZipEntries(readZipEntries("downloads/icecream-windows.zip"));
  const mac = validateZipEntries(readZipEntries("downloads/icecream-mac.zip"));
  assert.ok(windows.some(entry => entry.name === "IceCream.exe"));
  assert.ok(windows.some(entry => entry.name === "IceCream_Data/globalgamemanagers"));
  const executable = mac.find(entry => entry.name === "IceCream.app/Contents/MacOS/IceCream");
  assert.ok(executable);
  assert.equal(executable.hostSystem, 3);
  assert.equal(executable.unixMode & 0o111, 0o111);
  assert.ok(mac.some(entry => entry.name === "IceCream.app/Contents/Info.plist"));
  for (const entry of [...windows, ...mac]) {
    assert.doesNotMatch(entry.name, /^(?:Library|Assets|ProjectSettings)\//);
  }
});

test("IceCream release hashes match the exact downloadable and WebGL bytes", () => {
  const manifest = JSON.parse(readFileSync("projects/icecream/release-manifest.json", "utf8"));
  assert.equal(manifest.unityVersion, "2022.3.62f3c1");
  assert.equal(manifest.levels, 10);
  const check = (path, record) => {
    const bytes = readFileSync(path);
    assert.equal(bytes.length, record.bytes, path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), record.sha256, path);
  };
  check("downloads/icecream-windows.zip", manifest.assets.windows);
  check("downloads/icecream-mac.zip", manifest.assets.mac);
  for (const [path, record] of Object.entries(manifest.assets.web.files)) {
    check(`projects/icecream/${path}`, record);
  }
  assert.deepEqual(manifest.assets.mac.architectures, ["arm64", "x86_64"]);
  assert.equal(manifest.assets.mac.notarized, false);
  assert.ok(manifest.verification.nativeRunUrl.includes("37649868542"));
});
