import test from "node:test";
import assert from "node:assert/strict";
import { resolveSafeCaptureUrl } from "../scripts/build-hub-showcase-media.mjs";

test("showcase capture keeps query parameters on an existing local entry", () => {
  const url = resolveSafeCaptureUrl(
    "brick-character-copy-preview",
    { entry: "./projects/brick-character-copy-preview/index.html?tab=trinkets&item=4" },
    "http://127.0.0.1:4173",
  );
  assert.equal(url, "http://127.0.0.1:4173/projects/brick-character-copy-preview/index.html?tab=trinkets&item=4");
});
