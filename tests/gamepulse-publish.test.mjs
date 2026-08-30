import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(
  join(root, "app-20260706-restore-games.js"),
  "utf8",
);

function loadDefaultApps() {
  return loadDefaultAppsFromRuntime(runtime);
}

test("GamePulse is published once in the application collection", () => {
  const matches = loadDefaultApps().filter(
    (app) => app.id === "gamepulse-mini-radar",
  );
  assert.equal(matches.length, 1);

  const [app] = matches;
  assert.equal(app.name, "小游戏每日排行");
  assert.equal(app.status, "assistant");
  assert.equal(
    app.folder,
    "https://gamepulse-mini-radar.polite-chord-7994.chatgpt.site",
  );
  assert.equal(
    app.entry,
    "./projects/gamepulse-mini-radar/index.html",
  );
  assert.equal(app.platforms.web.href, app.entry);
  assert.equal(app.platforms.web.label, "只读预览");
  assert.equal(
    app.video,
    "./projects/gamepulse-mini-radar/video/index.html",
  );
  assert.match(app.brief, /国内.*海外.*行业知识库/);
  assert.match(app.brief, /玩法拆解.*发布合作.*开放接口/);
  assert.doesNotMatch(app.brief, /Top 10/);
  assert.match(app.aiUse, /07:10/);
  assert.deepEqual(
    [...app.tags],
    ["小游戏排行", "行业知识库", "玩法拆解", "发布合作", "开放接口"],
  );
});
