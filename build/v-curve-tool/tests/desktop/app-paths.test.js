import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { resolveHtmlPath } = require("../../desktop/app-paths.cjs");

describe("desktop HTML path resolution", () => {
  it("loads dist from the repository root while running unpackaged", () => {
    const projectRoot = path.resolve("C:\\project");
    const mainDirectory = path.join(projectRoot, "desktop");

    expect(resolveHtmlPath({
      isPackaged: false,
      appPath: mainDirectory,
      mainDirectory,
    })).toBe(path.join(projectRoot, "dist", "V曲线对比工具.html"));
  });

  it("loads dist from the asar root after packaging", () => {
    const appPath = path.resolve("C:\\portable\\resources\\app.asar");

    expect(resolveHtmlPath({
      isPackaged: true,
      appPath,
      mainDirectory: path.join(appPath, "desktop"),
    })).toBe(path.join(appPath, "dist", "V曲线对比工具.html"));
  });
});
