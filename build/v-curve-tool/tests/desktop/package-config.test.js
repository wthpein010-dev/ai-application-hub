import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

describe("Windows portable package contract", () => {
  it("pins the desktop runtime and exposes deterministic scripts", () => {
    expect(packageJson.version).toBe("1.2.0");
    expect(packageJson.main).toBe("desktop/main.cjs");
    expect(packageJson.scripts).toMatchObject({
      desktop: "npm run build && electron desktop/main.cjs",
      "verify:electron": "npm run build && node scripts/verify-electron-app.mjs",
      "verify:electron:bundled": "npm run build && node scripts/verify-electron-bundled-app.mjs",
      "build:win": "npm run build && electron-builder --win portable --x64",
      "verify:win": "node scripts/verify-windows-build.mjs",
      "package:bundled": "npm run build:win && node scripts/package-bundled-release.mjs",
      "verify:bundle": "node scripts/verify-bundled-release.mjs",
    });
    expect(packageJson.devDependencies).toMatchObject({
      electron: "44.0.0",
      "electron-builder": "26.15.3",
      "playwright-core": "1.62.1",
      html2canvas: "1.4.1",
    });
    expect(packageJson.dependencies ?? {}).not.toHaveProperty("html2canvas");
  });

  it("builds only the hardened shell and final HTML as a portable x64 app", () => {
    expect(packageJson.build).toMatchObject({
      appId: "com.pawshome.vcurve",
      productName: "V曲线对比工具",
      asar: true,
      compression: "maximum",
      directories: { output: "release" },
      files: ["desktop/**/*", "dist/V曲线对比工具.html", "package.json"],
      win: {
        target: [{ target: "portable", arch: ["x64"] }],
        artifactName: "V曲线对比工具-${version}-Windows-x64.${ext}",
      },
    });
  });

  it("builds native macOS archives with the same bundled Editorlevel data", () => {
    expect(packageJson.scripts).toMatchObject({
      "build:mac:arm64": "npm run build && electron-builder --mac zip --arm64",
      "build:mac:x64": "npm run build && electron-builder --mac zip --x64",
    });
    expect(packageJson.build).toMatchObject({
      mac: {
        extraResources: [
          {
            from: "bundled-levels/Editorlevel",
            to: "Editorlevel",
          },
        ],
        target: [{ target: "zip", arch: ["arm64", "x64"] }],
        category: "public.app-category.developer-tools",
        identity: null,
        artifactName: "V曲线对比工具-${version}-macOS-${arch}.${ext}",
      },
    });
    expect(packageJson.build).not.toHaveProperty("extraResources");
  });
});
