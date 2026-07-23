import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(
  join(root, "app-20260706-restore-games.js"),
  "utf8",
);

function loadDefaultApps() {
  const start = runtime.indexOf("const defaultApps = [");
  const closing = /\r?\n\];\r?\n\r?\nlet apps/.exec(runtime.slice(start));
  assert.notEqual(start, -1);
  assert.ok(closing);
  const end = start + closing.index + 3;
  const source = runtime
    .slice(start, end + 3)
    .replace("const defaultApps =", "globalThis.defaultApps =")
    .replace(/\bHUB_BRIEF\b/g, '""');
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  return context.globalThis.defaultApps;
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
    app.entry,
    "https://gamepulse-mini-radar.polite-chord-7994.chatgpt.site",
  );
  assert.equal(app.platforms.web.href, app.entry);
  assert.equal(app.platforms.web.label, "演示");
  assert.equal(
    app.video,
    "./projects/gamepulse-mini-radar/video/index.html",
  );
  assert.match(app.brief, /国内.*海外.*前十/);
  assert.doesNotMatch(app.brief, /Top 10/);
  assert.match(app.aiUse, /07:10/);
  assert.deepEqual(
    [...app.tags],
    ["小游戏排行", "微信小游戏", "iOS 休闲榜", "产品洞察"],
  );
});

test("the page cache key changes for the GamePulse release", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(
    html,
    /app-20260706-restore-games\.js\?v=20260723-nang-app-catalog/,
  );
});
