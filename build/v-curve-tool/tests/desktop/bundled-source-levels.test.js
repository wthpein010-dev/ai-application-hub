import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  importLevelFiles,
  loadBundledLevelFiles,
} from "../../src/io/import-levels.js";

const require = createRequire(import.meta.url);
const { readBundledLevelFiles } = require("../../desktop/bundled-levels.cjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bundledDirectory = path.join(root, "bundled-levels", "EditorLevels-v150");

describe("tracked cross-platform Editorlevel payload", () => {
  it("ships the September 8 snapshot of 32 playable levels and their Unity metadata files", async () => {
    const payload = await readBundledLevelFiles([bundledDirectory]);
    expect(payload.available).toBe(true);
    expect(payload.files).toHaveLength(64);

    const bridged = await loadBundledLevelFiles({
      async loadBundledLevels() {
        return payload;
      },
    });
    const result = await importLevelFiles(bridged.files);
    expect(result.importedCount).toBe(32);
    expect(result.ignoredCount).toBe(32);
    expect(result.errors).toEqual([]);
    expect(result.selectedLevel?.id).toBe("level_0020");
  });
});
