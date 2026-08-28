import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

let bundledRelease = {};
try {
  bundledRelease = await import("../../scripts/bundled-release.mjs");
} catch {
  // RED phase: the production module does not exist yet.
}

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe("ready-to-run bundled release", () => {
  it("uses stable 1.2.0 artifact names", () => {
    expect(bundledRelease.bundleArtifactNames).toBeTypeOf("function");
    expect(bundledRelease.bundleArtifactNames("1.2.0")).toEqual({
      directory: "V曲线对比工具-1.2.0-开箱即用",
      executable: "V曲线对比工具-1.2.0-Windows-x64.exe",
      executableChecksum: "V曲线对比工具-1.2.0-Windows-x64.sha256.txt",
      zip: "V曲线对比工具-1.2.0-开箱即用-Windows-x64.zip",
      zipChecksum: "V曲线对比工具-1.2.0-开箱即用-Windows-x64.zip.sha256.txt",
    });
  });

  it("stages the portable EXE, untouched Editorlevel tree, instructions, and checksum", async () => {
    expect(bundledRelease.stageBundledRelease).toBeTypeOf("function");
    const root = await mkdtemp(path.join(os.tmpdir(), "vcurve-bundle-stage-"));
    temporaryDirectories.push(root);
    const releaseDirectory = path.join(root, "release");
    const levelsDirectory = path.join(root, "source", "Editorlevel");
    await mkdir(path.join(levelsDirectory, "nested"), { recursive: true });
    const executable = Buffer.from("portable-exe", "utf8");
    await writeFile(path.join(levelsDirectory, "level_0020.json"), "level-data", "utf8");
    await writeFile(path.join(levelsDirectory, "nested", "level_0020.json.meta"), "meta", "utf8");
    await mkdir(releaseDirectory, { recursive: true });
    await writeFile(
      path.join(releaseDirectory, "V曲线对比工具-1.2.0-Windows-x64.exe"),
      executable,
    );

    const result = await bundledRelease.stageBundledRelease({
      releaseDirectory,
      levelsDirectory,
      version: "1.2.0",
    });
    const bundleDirectory = path.join(releaseDirectory, "V曲线对比工具-1.2.0-开箱即用");
    const expectedHash = createHash("sha256").update(executable).digest("hex");

    expect(result).toMatchObject({ bundleDirectory, sourceFileCount: 2, executableSha256: expectedHash });
    await expect(readFile(path.join(bundleDirectory, "Editorlevel", "level_0020.json"), "utf8"))
      .resolves.toBe("level-data");
    await expect(readFile(path.join(bundleDirectory, "Editorlevel", "nested", "level_0020.json.meta"), "utf8"))
      .resolves.toBe("meta");
    await expect(readFile(path.join(bundleDirectory, "使用说明.txt"), "utf8"))
      .resolves.toMatch(/双击.*V曲线对比工具-1\.2\.0-Windows-x64\.exe/);
    await expect(readFile(
      path.join(bundleDirectory, "V曲线对比工具-1.2.0-Windows-x64.sha256.txt"),
      "utf8",
    )).resolves.toBe(`${expectedHash}  V曲线对比工具-1.2.0-Windows-x64.exe\n`);
    await expect(stat(path.join(levelsDirectory, "level_0020.json"))).resolves.toBeTruthy();
  });
});
