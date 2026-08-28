import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
let bundledLevels = {};
try {
  bundledLevels = require("../../desktop/bundled-levels.cjs");
} catch {
  // RED phase: the production module does not exist yet.
}

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe("bundled Editorlevel discovery", () => {
  it("uses the explicit E2E directory before portable executable locations", () => {
    expect(bundledLevels.resolveBundledLevelDirectories).toBeTypeOf("function");
    expect(bundledLevels.resolveBundledLevelDirectories({
      allowOverride: true,
      overrideDirectory: "D:\\fixtures\\Editorlevel",
      portableExecutableDirectory: "E:\\bundle",
      executablePath: "C:\\temp\\tool.exe",
      isPackaged: true,
    })).toEqual([path.resolve("D:\\fixtures\\Editorlevel")]);
  });

  it("ignores the test override unless the caller explicitly allows it", () => {
    expect(bundledLevels.resolveBundledLevelDirectories).toBeTypeOf("function");
    expect(bundledLevels.resolveBundledLevelDirectories({
      allowOverride: false,
      overrideDirectory: "D:\\private",
      portableExecutableDirectory: "E:\\bundle",
      executablePath: "C:\\temp\\tool.exe",
      isPackaged: true,
    })).toEqual([
      path.resolve("E:\\bundle\\Editorlevel"),
      path.resolve("E:\\bundle\\EditorLevels"),
    ]);
  });

  it("checks singular Editorlevel before plural EditorLevels beside the portable EXE", () => {
    expect(bundledLevels.resolveBundledLevelDirectories).toBeTypeOf("function");
    expect(bundledLevels.resolveBundledLevelDirectories({
      portableExecutableDirectory: "E:\\bundle",
      executablePath: "C:\\temp\\tool.exe",
      isPackaged: true,
    })).toEqual([
      path.resolve("E:\\bundle\\Editorlevel"),
      path.resolve("E:\\bundle\\EditorLevels"),
    ]);
  });

  it("checks packaged resources before the executable directory on macOS", () => {
    expect(bundledLevels.resolveBundledLevelDirectories).toBeTypeOf("function");
    expect(bundledLevels.resolveBundledLevelDirectories({
      resourcesPath: "/Applications/V曲线对比工具.app/Contents/Resources",
      executablePath: "/Applications/V曲线对比工具.app/Contents/MacOS/V曲线对比工具",
      isPackaged: true,
    })).toEqual([
      path.resolve("/Applications/V曲线对比工具.app/Contents/Resources/Editorlevel"),
      path.resolve("/Applications/V曲线对比工具.app/Contents/Resources/EditorLevels"),
      path.resolve("/Applications/V曲线对比工具.app/Contents/MacOS/Editorlevel"),
      path.resolve("/Applications/V曲线对比工具.app/Contents/MacOS/EditorLevels"),
    ]);
  });

  it("reads the first existing candidate recursively as relative File-like payloads", async () => {
    expect(bundledLevels.readBundledLevelFiles).toBeTypeOf("function");
    const root = await mkdtemp(path.join(os.tmpdir(), "vcurve-bundled-levels-"));
    temporaryDirectories.push(root);
    const levelDirectory = path.join(root, "Editorlevel");
    await mkdir(path.join(levelDirectory, "nested"), { recursive: true });
    await writeFile(path.join(levelDirectory, "level_0020.json"), "{\"id\":\"level_0020\"}", "utf8");
    await writeFile(path.join(levelDirectory, "nested", "level_0020.json.meta"), "meta", "utf8");

    const result = await bundledLevels.readBundledLevelFiles([
      path.join(root, "missing"),
      levelDirectory,
    ]);

    expect(result).toEqual({
      available: true,
      folderName: "Editorlevel",
      files: [
        {
          name: "level_0020.json",
          webkitRelativePath: "Editorlevel/level_0020.json",
          text: "{\"id\":\"level_0020\"}",
        },
        {
          name: "level_0020.json.meta",
          webkitRelativePath: "Editorlevel/nested/level_0020.json.meta",
          text: "meta",
        },
      ],
    });
  });

  it("returns an unavailable payload when neither adjacent directory exists", async () => {
    expect(bundledLevels.readBundledLevelFiles).toBeTypeOf("function");
    const root = await mkdtemp(path.join(os.tmpdir(), "vcurve-bundled-missing-"));
    temporaryDirectories.push(root);
    await expect(bundledLevels.readBundledLevelFiles([
      path.join(root, "Editorlevel"),
      path.join(root, "EditorLevels"),
    ])).resolves.toEqual({ available: false, folderName: null, files: [] });
  });
});
