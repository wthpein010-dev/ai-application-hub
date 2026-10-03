import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("the PlanMap interaction entry stays below the 500 kB initial chunk warning", async () => {
  const manifest = JSON.parse(await readFile(new URL("../dist/client/.vite/manifest.json", import.meta.url), "utf8"));
  const entry = manifest["app/components/PlanMapApp.tsx"];
  assert.ok(entry?.file, "PlanMapApp client entry must exist in the Vite manifest");
  const file = new URL(`../dist/client/${entry.file}`, import.meta.url);
  const size = (await stat(file)).size;
  assert.ok(size < 500_000, `PlanMapApp client entry is ${size} bytes; export-only libraries must remain lazy`);
});
