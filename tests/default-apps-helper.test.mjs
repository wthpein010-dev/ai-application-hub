import test from "node:test";
import assert from "node:assert/strict";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

test("default app extraction works with LF and CRLF source files", () => {
  for (const newline of ["\n", "\r\n"]) {
    const runtime = [
      "const defaultApps = [",
      '  { id: "example", brief: HUB_BRIEF },',
      "];",
      "",
      "let apps = [];",
    ].join(newline);

    assert.deepEqual(
      JSON.parse(JSON.stringify(loadDefaultAppsFromRuntime(runtime))),
      [
      { id: "example", brief: "" },
      ],
    );
  }
});
