import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

test("minigame project simulator card has required metadata", () => {
  assert.match(source, /id:\s*"minigame-project-simulator"/);
  assert.match(source, /name:\s*"小游戏立项模拟器"/);
  assert.match(source, /category:\s*"小游戏开发辅助工具"/);
  assert.match(source, /status:\s*"game"/);
  assert.match(source, /package:\s*"\.\/downloads\/minigame-project-simulator-windows\.zip"/);
  assert.match(source, /tags:\s*\["Unity",\s*"微信小游戏",\s*"需求生成",\s*"UGUI"\]/);
});

test("minigame project simulator site artifacts exist", () => {
  assert.equal(existsSync(join(root, "downloads", "minigame-project-simulator-windows.zip")), true);
  assert.equal(existsSync(join(root, "assets", "minigame-project-simulator-preview.png")), true);
});
