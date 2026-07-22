import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

test("吃了个冰 is published as a playable game with both downloads", () => {
  const source = readFileSync("app-20260706-restore-games.js", "utf8");
  assert.match(source, /id: "icecream"/);
  assert.match(source, /name: "吃了个冰"/);
  assert.match(source, /\.\/projects\/icecream\/index\.html/);
  assert.match(source, /\.\/downloads\/icecream-unity-project\.zip/);
  assert.match(source, /\.\/downloads\/icecream-wechat-minigame\.zip/);
});

test("吃了个冰 release artifacts are present and non-empty", () => {
  const files = [
    "projects/icecream/index.html",
    "projects/icecream/Build/WebGLPreview.wasm",
    "downloads/icecream-unity-project.zip",
    "downloads/icecream-wechat-minigame.zip"
  ];

  for (const file of files) {
    assert.equal(existsSync(file), true, `${file} should exist`);
    assert.ok(statSync(file).size > 0, `${file} should not be empty`);
  }
});
