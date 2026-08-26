import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";
import {
  assertSafeConfiguredPublicBase,
  resolveSafeCaptureUrl,
} from "../scripts/build-hub-showcase-media.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const mediaRuntime = readFileSync(join(root, "hub-project-media.js"), "utf8");

function loadMediaRegistry(source) {
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  return context.globalThis.HUB_PROJECT_MEDIA;
}

test("project media registry covers every production id without loading ClickFlow locally", () => {
  const apps = loadDefaultAppsFromRuntime(runtime);
  const media = loadMediaRegistry(mediaRuntime);
  assert.deepEqual(Object.keys(media), Array.from(apps, ({ id }) => id));
  assert.equal(media.clickflow.src, "");
  assert.equal(media.clickflow.fallback, "ClickFlow 鼠标自动化");
  for (const app of apps.filter(({ id }) => id !== "clickflow")) {
    assert.match(media[app.id].src, /^\.\/assets\/hub-showcase\/[a-z0-9-]+\.(?:webp|jpg|png)$/u);
    const assetPath = join(root, media[app.id].src);
    assert.ok(existsSync(assetPath));
    assert.ok(statSync(assetPath).size <= 750 * 1024);
    assert.ok(media[app.id].alt.includes(app.name));
    assert.ok(["standard", "wide", "tall"].includes(media[app.id].layout));
  }
});

test("capture sources require an explicit public entry when the local page is absent", () => {
  assert.throws(
    () => resolveSafeCaptureUrl("missing-project", { entry: "./projects/missing-project/index.html" }, "http://127.0.0.1:9000"),
    /Missing capture source for missing-project/u,
  );
  assert.equal(
    resolveSafeCaptureUrl(
      "explicit-public-project",
      {
        entry: "./projects/missing-project/index.html",
        publicEntry: "https://example.invalid/projects/explicit-public-project/index.html",
      },
      "http://127.0.0.1:9000",
    ),
    "https://example.invalid/projects/explicit-public-project/index.html",
  );
});

test("capture URL guards reject ClickFlow before browser navigation", () => {
  assert.throws(
    () => resolveSafeCaptureUrl("safe-id", { publicEntry: "https://example.invalid/projects/clickflow/index.html" }, "http://127.0.0.1:9000"),
    /ClickFlow capture URL is prohibited/u,
  );
  assert.throws(
    () => assertSafeConfiguredPublicBase("https://example.invalid/clickflow/"),
    /ClickFlow public base is prohibited/u,
  );
});
