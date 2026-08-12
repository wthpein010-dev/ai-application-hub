import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const homepage = readFileSync(join(root, "index.html"), "utf8");
const apps = loadDefaultAppsFromRuntime(runtime);

test("SimuAI is the final engineering experience with demo and video only", () => {
  const matches = apps.filter((item) => item.id === "simuai");
  const engineering = apps.filter((item) => item.status === "engineering");

  assert.equal(matches.length, 1);
  assert.equal(engineering.at(-1).id, "simuai");
  const app = matches[0];
  assert.equal(app.name, "SimuAI 万物实验室");
  assert.equal(app.category, "AI 互动实验");
  assert.equal(app.status, "engineering");
  assert.equal(app.badge, "工程体验");
  assert.equal(app.entry, "./projects/simuai/index.html");
  assert.equal(app.video, "./projects/simuai/video/index.html");
  assert.equal(app.package, "");
  assert.match(app.brief, /12 个受控实验/);
  assert.match(app.brief, /本地匹配/);
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.platforms)),
    {
      web: { href: "./projects/simuai/index.html", label: "演示" },
      windows: "",
      mac: "",
    },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.tags)),
    ["问题模拟", "本地匹配", "参数实验", "透明模型"],
  );
});

test("SimuAI demo returns to the engineering catalog and Hub refreshes its runtime", () => {
  const demo = readFileSync(join(root, "projects", "simuai", "index.html"), "utf8");
  assert.match(demo, /class="hub-home-link"/);
  assert.match(demo, /href="\.\.\/\.\.\/index\.html#engineering"/);
  assert.match(
    homepage,
    /app-20260706-restore-games\.js\?v=[^"]*simuai-static-search/,
  );
});

test("SimuAI exact legacy default copy migrates without a broad overwrite", () => {
  assert.match(runtime, /normalized\.id === "simuai"/);
  assert.match(runtime, /SIMUAI_LEGACY_BRIEF/);
  assert.match(runtime, /normalized\.brief === SIMUAI_LEGACY_BRIEF/);
  assert.doesNotMatch(runtime, /normalized\.id === "simuai"[\s\S]{0,500}normalized\.brief = base\.brief;[\s\S]{0,80}normalized\.problem = base\.problem/);
});
