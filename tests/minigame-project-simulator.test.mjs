import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

test("minigame project simulator card has required metadata", () => {
  const gameDisplayRankBody = source.match(/function gameDisplayRank\(app\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(source, /id:\s*"minigame-project-simulator"/);
  assert.match(source, /name:\s*"小游戏立项工具"/);
  assert.match(source, /category:\s*"游戏立项与需求工具"/);
  assert.match(source, /status:\s*"assistant"/);
  assert.match(source, /entry:\s*"\.\/projects\/minigame-project-tool\/index\.html"/);
  assert.match(source, /video:\s*"\.\/projects\/minigame-project-tool\/video\/index\.html"/);
  assert.match(source, /package:\s*"\.\/downloads\/minigame-project-simulator-windows\.zip"/);
  assert.match(source, /tags:\s*\["微信小游戏",\s*"Unity",\s*"需求文档",\s*"Codex"\]/);
  assert.doesNotMatch(gameDisplayRankBody, /minigame-project-simulator/);
});

test("minigame project simulator site artifacts exist", () => {
  assert.equal(existsSync(join(root, "downloads", "minigame-project-simulator-windows.zip")), true);
  assert.equal(existsSync(join(root, "assets", "minigame-project-simulator-preview.png")), true);
});

test("stored legacy simulator metadata migrates into the app collection", () => {
  assert.match(source, /if \(normalized\.id === "minigame-project-simulator"\)/);
  assert.match(source, /normalized\.name = "小游戏立项工具"/);
  assert.match(source, /normalized\.status = "assistant"/);
  assert.match(source, /normalized\.entry = "\.\/projects\/minigame-project-tool\/index\.html"/);
  assert.match(source, /normalized\.video = "\.\/projects\/minigame-project-tool\/video\/index\.html"/);
});
