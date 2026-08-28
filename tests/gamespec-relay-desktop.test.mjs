import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const desktop = (...parts) => join(root, "build", "gamespec-relay-desktop", ...parts);

test("desktop BrowserWindow isolates the renderer and rejects untrusted IPC", () => {
  const main = readFileSync(desktop("main.cjs"), "utf8");

  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /assertTrustedSender/);
  assert.match(main, /isTrustedRendererUrl/);
  assert.match(main, /setWindowOpenHandler/);
  assert.doesNotMatch(main, /enableRemoteModule:\s*true|webSecurity:\s*false/);
});

test("preload exposes only the six documented GameSpec Relay capabilities", () => {
  const preload = readFileSync(desktop("preload.cjs"), "utf8");

  assert.match(preload, /contextBridge\.exposeInMainWorld\("gameSpecDesktop"/);
  for (const method of ["openSources", "saveProject", "loadProject", "exportFile", "getModelStatus", "configureModel"]) {
    assert.match(preload, new RegExp(`\\b${method}\\b`));
  }
  assert.doesNotMatch(preload, /require:\s*require|process:\s*process|ipcRenderer:\s*ipcRenderer/);
});

test("desktop policy removes path traversal and never exposes model credentials", () => {
  const { normalizeExportRequest, publicModelStatus } = require(desktop("policy.cjs"));

  assert.deepEqual(normalizeExportRequest({
    name: "../unsafe/DeliveryPack.json",
    mime: "application/json",
    content: "{\"ok\":true}",
  }), {
    name: "DeliveryPack.json",
    mime: "application/json",
    content: "{\"ok\":true}",
  });
  const status = publicModelStatus({
    endpoint: "https://model.example/v1",
    model: "relay-model",
    encryptedApiKey: "must-not-leak",
  });
  assert.deepEqual(status, { configured: true });
  assert.doesNotMatch(JSON.stringify(status), /model\.example|relay-model|must-not-leak/);
});

test("desktop package embeds the shared app and defines native Windows and macOS builds", () => {
  const packageJson = JSON.parse(readFileSync(desktop("package.json"), "utf8"));

  assert.equal(packageJson.version, "1.2.0");
  assert.equal(packageJson.build.productName, "游戏需求开工台");
  assert.match(packageJson.scripts["dist:win"], /--win.*portable.*--x64/);
  assert.match(packageJson.scripts["dist:mac:x64"], /--mac.*zip.*--x64/);
  assert.match(packageJson.scripts["dist:mac:arm64"], /--mac.*zip.*--arm64/);
  assert.equal(packageJson.build.extraResources[0].from, "../../projects/gamespec-relay");
  assert.equal(packageJson.build.extraResources[0].to, "app/projects/gamespec-relay");
  assert.equal(packageJson.build.win.artifactName, "游戏需求开工台-微软系统.${ext}");
  assert.equal(packageJson.build.mac.artifactName, "游戏需求开工台-苹果电脑-${arch}.${ext}");
  assert.equal(packageJson.devDependencies.playwright, "1.61.1");
});

test("desktop package ships a square high-resolution product icon", () => {
  const icon = readFileSync(desktop("build", "icon.png"));

  assert.equal(icon.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(icon.readUInt32BE(16), 512);
  assert.equal(icon.readUInt32BE(20), 512);
});

test("desktop icon uses the Chinese product mark", () => {
  const generator = readFileSync(desktop("scripts", "build-icon.mjs"), "utf8");

  assert.match(generator, /class="letters">开</);
  assert.match(generator, /class="label">游戏需求开工台</);
  assert.doesNotMatch(generator, />GR<|>RELAY</);
});

test("packaged smoke mode drives the built-in sample and verifies a JSON export", () => {
  const main = readFileSync(desktop("main.cjs"), "utf8");

  assert.match(main, /--smoke-test/);
  assert.match(main, /#loadSample/);
  assert.match(main, /#analyzeButton/);
  assert.match(main, /GAMESPEC_RELAY_SMOKE_OK/);
  assert.match(main, /JSON\.parse/);
  assert.match(main, /app\.quit\(\)/);
});

test("web controller routes native file and export work through the desktop bridge", () => {
  const controller = readFileSync(join(root, "projects", "gamespec-relay", "app", "main.js"), "utf8");

  assert.match(controller, /window\.gameSpecDesktop/);
  assert.match(controller, /gameSpecDesktop\.openSources/);
  assert.match(controller, /gameSpecDesktop\.exportFile/);
  assert.match(controller, /gameSpecDesktop\.saveProject/);
});
