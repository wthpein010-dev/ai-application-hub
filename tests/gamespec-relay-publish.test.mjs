import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditCatalog } from "../scripts/hub-publication-audit.mjs";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = await readFile(join(root, "app-20260706-restore-games.js"), "utf8");

test("需求接力站 keeps four real actions immediately before the newer Radar card", () => {
  const apps = loadDefaultAppsFromRuntime(runtime);
  const matches = apps.filter((app) => app.id === "gamespec-relay");

  assert.equal(matches.length, 1, "the catalog should contain one 需求接力站 card");
  const relay = matches[0];
  assert.equal(relay.name, "需求接力站");
  assert.equal(relay.badge, "辅助工具");
  assert.match(relay.brief, /能开工、能验收/);
  assert.equal([relay.name, relay.badge, relay.brief, relay.problem, relay.aiUse, ...relay.tags].some((value) => /[A-Za-z]/.test(value)), false);
  assert.equal(relay.status, "assistant");
  assert.equal(apps[apps.indexOf(relay) + 1]?.id, "x-ai-codex-radar");
  assert.equal(relay.entry, "./projects/gamespec-relay/index.html");
  assert.equal(relay.video, "./projects/gamespec-relay/video/index.html");
  assert.equal(
    relay.package,
    "https://github.com/wthpein010-dev/ai-application-hub/releases/tag/gamespec-relay-v1.1.0",
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(relay.platforms)),
    {
      web: {
        href: "./projects/gamespec-relay/index.html",
        label: "演示",
      },
      windows: {
        href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/gamespec-relay-v1.1.0/xuqiu-jielizhan-windows-x64.zip",
        label: "微软版下载",
      },
      mac: {
        href: "https://github.com/wthpein010-dev/ai-application-hub/releases/download/gamespec-relay-v1.1.0/xuqiu-jielizhan-macos.zip",
        label: "苹果电脑版下载",
      },
    },
  );

  const renderedActionLabels = [
    relay.platforms.web.label,
    relay.video && "视频",
    relay.platforms.windows.label,
    relay.platforms.mac.label,
  ].filter(Boolean);
  assert.deepEqual(renderedActionLabels, ["演示", "视频", "微软版下载", "苹果电脑版下载"]);
});

test("Hub audit treats GameSpec Relay downloads as verified native platforms", async () => {
  const report = await auditCatalog({ root, runtime });
  const relay = report.projects.find((project) => project.id === "gamespec-relay");

  assert.ok(relay, "the publication audit should include GameSpec Relay");
  assert.deepEqual(relay.actions.map((action) => action.type), [
    "web",
    "video",
    "windows",
    "mac",
  ]);
  assert.deepEqual(
    report.findings.filter(
      (finding) => finding.projectId === "gamespec-relay" && finding.rule === "platform-artifact",
    ),
    [],
  );
});
