import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "projects", "lighthouse-rescue");

test("public shell embeds the real Unity WebGL build and discloses simulation mode", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  const play = readFileSync(join(root, "play.js"), "utf8");
  assert.match(html, /index\.html#games/);
  assert.match(html, /本地试玩|模拟事件/);
  assert.match(play, /createUnityInstance/);
  const builtPage = readFileSync(join(root, "game", "index.html"), "utf8");
  const shellVersion = play.match(/productVersion:\s*"([^"]+)"/)?.[1];
  const buildVersion = builtPage.match(/productVersion:\s*"([^"]+)"/)?.[1];
  assert.ok(shellVersion && buildVersion, "both loaders declare a Unity product version");
  assert.equal(shellVersion, buildVersion, "public shell must load the current Unity build version");
  assert.equal(shellVersion, "1.4.12");
  assert.match(play, /autoSyncPersistentDataPath:\s*true/, "the public shell must persist WebGL checkpoints");
  assert.match(builtPage, /^\s*config\.autoSyncPersistentDataPath = true;/m,
    "the standalone Unity page must persist WebGL checkpoints");
  const projectSettings = readFileSync(join(root, "..", "..", "build", "lighthouse-rescue-unity",
    "ProjectSettings", "ProjectSettings.asset"), "utf8");
  assert.match(projectSettings, /bundleVersion:\s*1\.4\.12\b/);
  assert.match(html, /lighthouse-canvas/);
  assert.match(html, /subpage-shell\.css/);
  const build = join(root, "game", "Build");
  assert.ok(existsSync(build));
  const files = readdirSync(build);
  assert.ok(files.some((name) => name.endsWith(".loader.js")));
  assert.ok(files.some((name) => name.endsWith(".data")));
  assert.ok(files.some((name) => name.endsWith(".wasm")));
});
