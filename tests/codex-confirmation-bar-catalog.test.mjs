import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const apps = loadDefaultAppsFromRuntime(runtime);

test("catalog exposes the rebranded confirmation bar with four real entrances", () => {
  const app = apps.find((item) => item.id === "codex-confirmation-bar");

  assert.ok(app, "codex-confirmation-bar should replace the legacy Workbench card");
  assert.equal(app.name, "Codex 待确认悬浮助手");
  assert.equal(app.status, "desktop");
  assert.equal(app.entry, "./projects/codex-confirmation-bar/index.html");
  assert.equal(app.video, "./projects/codex-confirmation-bar/video/index.html");
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.platforms)),
    {
      web: {
        href: "./projects/codex-confirmation-bar/index.html",
        label: "演示",
      },
      windows: {
        href: "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-confirmation-bar/download/",
        label: "Wins下载",
      },
      mac: {
        href: "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-confirmation-bar/download/mac/",
        label: "Mac下载",
      },
    },
  );
  assert.equal(apps.some((item) => item.id === "codex-thread-workbench"), false);
});

test("rebranded card keeps the legacy Workbench catalog position", () => {
  const index = apps.findIndex((item) => item.id === "codex-confirmation-bar");

  assert.equal(apps[index - 1]?.id, "codex-quota-bar");
  assert.equal(apps[index + 1]?.id, "web-media-collector");
});

test("legacy Workbench routes redirect to all canonical confirmation bar pages", () => {
  const routes = [
    ["projects/codex-thread-workbench/index.html", "../codex-confirmation-bar/index.html", "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-confirmation-bar/"],
    ["projects/codex-thread-workbench/video/index.html", "../../codex-confirmation-bar/video/index.html", "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-confirmation-bar/video/"],
    ["projects/codex-thread-workbench/download/index.html", "../../codex-confirmation-bar/download/index.html", "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-confirmation-bar/download/"],
    ["projects/codex-thread-workbench/download/mac/index.html", "../../../codex-confirmation-bar/download/mac/index.html", "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-confirmation-bar/download/mac/"],
  ];

  for (const [path, relativeTarget, canonicalTarget] of routes) {
    const html = readFileSync(join(root, ...path.split("/")), "utf8");
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonicalTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), `${path} canonical`);
    assert.ok(html.includes(`content="0; url=${relativeTarget}"`), `${path} immediate redirect`);
    assert.ok(html.includes(`href="${relativeTarget}"`), `${path} visible fallback`);
    assert.ok(html.includes(`location.replace("${relativeTarget}")`), `${path} history replacement`);
  }
});
