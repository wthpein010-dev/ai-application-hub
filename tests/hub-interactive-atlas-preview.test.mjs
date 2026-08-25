import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimePath = join(root, "app-20260706-restore-games.js");
const dataPath = join(
  root,
  "design-previews",
  "hub-interactive-atlas",
  "data.generated.js",
);
const runtime = readFileSync(runtimePath, "utf8");

test("preview data mirrors every production project in order", async () => {
  assert.ok(existsSync(dataPath), "preview data module must be generated");
  const sourceApps = loadDefaultAppsFromRuntime(runtime);
  const generated = await import(`${pathToFileURL(dataPath).href}?t=${Date.now()}`);

  assert.equal(sourceApps.length, 29);
  assert.equal(generated.projects.length, sourceApps.length);
  assert.deepEqual(
    generated.projects.map(({ id }) => id),
    Array.from(sourceApps, ({ id }) => id),
  );
  assert.deepEqual(
    [...new Set(generated.projects.map(({ kind }) => kind))].sort(),
    ["app", "engineering", "game"],
  );
  assert.ok(
    generated.projects.every(({ actions }) =>
      actions.every(({ href }) => href && href !== "#"),
    ),
  );
});
