import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

test("trinket market immediately precedes the final V curve engineering experience with web-only actions", () => {
  const apps = loadDefaultAppsFromRuntime(runtime);
  const project = apps.find((app) => app.id === "trinket-market");
  const engineering = apps.filter((app) => ["engineering", "ai"].includes(app.status));

  assert.ok(project);
  assert.deepEqual(
    Array.from(engineering.slice(-2), (app) => app.id),
    ["trinket-market", "v-curve-tool"],
  );
  assert.equal(project.name, "随身小物交易市场");
  assert.equal(project.status, "engineering");
  assert.equal(project.badge, "工程体验");
  assert.equal(project.entry, "./projects/trinket-market/index.html");
  assert.equal(project.video, "./projects/trinket-market/video/index.html");
  assert.equal(project.package, "");
  assert.deepEqual(JSON.parse(JSON.stringify(project.platforms)), {
    web: { href: "./projects/trinket-market/index.html", label: "演示" },
    windows: "",
    mac: "",
  });
});

test("trinket market owns a Hub showcase and public editing affordances", () => {
  const media = readFileSync(join(root, "hub-project-media.js"), "utf8");
  const page = readFileSync(join(root, "projects", "trinket-market", "index.html"), "utf8");

  assert.match(media, /"trinket-market": Object\.freeze\(\{/);
  assert.match(media, /\.\/assets\/hub-showcase\/trinket-market\.webp/);
  assert.equal(existsSync(join(root, "assets", "hub-showcase", "trinket-market.webp")), true);
  assert.match(page, /id="edit-mode"/);
  assert.match(page, /id="export-json"/);
  assert.match(page, /id="import-json"/);
  assert.match(page, /github\.com\/wthpein010-dev\/ai-application-hub/);
});
