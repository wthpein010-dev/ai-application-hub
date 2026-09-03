# Windows Portable EXE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the verified offline V-curve comparison HTML as a single Windows x64 portable EXE without changing its analysis semantics.

**Architecture:** Add a minimal hardened Electron main process that loads the existing single-file Vite build from the packaged asar. Keep all level import, Worker analysis, rendering, and exports in the existing renderer, then use electron-builder for the portable artifact and Playwright Core plus native artifact checks for verification.

**Tech Stack:** Node.js 24, Vite 7, Vitest 3, Electron 44.0.0, electron-builder 26.15.3, Playwright Core 1.62.1, Windows x64.

**Spec:** `docs/superpowers/specs/2026-08-27-windows-portable-exe-design.md`

## Global Constraints

- Target only 64-bit Windows 10/11.
- Deliver `release/V曲线对比工具-1.1.0-Windows-x64.exe` as a portable single EXE; do not add an installer, auto-update, Start Menu entry, or uninstaller.
- Keep the existing UI, algorithms, Sheep 900121 data, Paws parser, PNG export, and JSON export behavior unchanged.
- Keep folder access user-initiated through the existing `webkitdirectory` input; never remember or silently read the absolute level path.
- Run fully offline with no external navigation, network dependency, telemetry, or upload.
- Do not modify `E:\Mahjong\PawsHomeClient` or any imported level file.
- The renderer must keep `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, and packaged `devTools: false`; do not add a preload bridge.
- Pin `electron@44.0.0`, `electron-builder@26.15.3`, and `playwright-core@1.62.1` exactly.
- Do not sign the executable; document the possible Windows unknown-publisher warning.
- Work only on `feature/v-curve-tool`; do not merge, push, or create a PR.

---

### Task 1: Lock the desktop packaging contract and dependencies

**Files:**
- Create: `tests/desktop/package-config.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing Vite `build` output `dist/V曲线对比工具.html`.
- Produces: package scripts `desktop`, `verify:electron`, `build:win`, and `verify:win`; electron-builder configuration consumed by Tasks 2–5.

- [ ] **Step 1: Write the failing package contract test**

```js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

describe("Windows portable package contract", () => {
  it("pins the desktop runtime and exposes deterministic scripts", () => {
    expect(packageJson.version).toBe("1.1.0");
    expect(packageJson.main).toBe("desktop/main.cjs");
    expect(packageJson.scripts).toMatchObject({
      desktop: "npm run build && electron desktop/main.cjs",
      "verify:electron": "npm run build && node scripts/verify-electron-app.mjs",
      "build:win": "npm run build && electron-builder --win portable --x64",
      "verify:win": "node scripts/verify-windows-build.mjs",
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
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run: `npx vitest run tests/desktop/package-config.test.js`

Expected: FAIL because version is `1.0.0`, `main`, desktop scripts, pinned packages, and `build` are absent.

- [ ] **Step 3: Apply the package contract and ignore generated releases**

Set these exact `package.json` fields while preserving the existing Vite/Vitest scripts and versions:

```json
{
  "version": "1.1.0",
  "main": "desktop/main.cjs",
  "scripts": {
    "desktop": "npm run build && electron desktop/main.cjs",
    "verify:electron": "npm run build && node scripts/verify-electron-app.mjs",
    "build:win": "npm run build && electron-builder --win portable --x64",
    "verify:win": "node scripts/verify-windows-build.mjs"
  },
  "build": {
    "appId": "com.pawshome.vcurve",
    "productName": "V曲线对比工具",
    "asar": true,
    "compression": "maximum",
    "directories": { "output": "release" },
    "files": ["desktop/**/*", "dist/V曲线对比工具.html", "package.json"],
    "win": {
      "target": [{ "target": "portable", "arch": ["x64"] }],
      "artifactName": "V曲线对比工具-${version}-Windows-x64.${ext}"
    }
  }
}
```

Append `release/` to `.gitignore`. Install exact build-only dependencies and move `html2canvas` to development dependencies:

```powershell
npm install --save-dev --save-exact electron@44.0.0 electron-builder@26.15.3 playwright-core@1.62.1 html2canvas@1.4.1
```

- [ ] **Step 4: Run the targeted and full tests**

Run: `npx vitest run tests/desktop/package-config.test.js`

Expected: PASS, 2 tests.

Run: `npm test`

Expected: PASS, original 60 tests plus the 2 package tests.

- [ ] **Step 5: Commit the dependency and packaging contract**

```powershell
git add -- package.json package-lock.json .gitignore tests/desktop/package-config.test.js
git commit -m "build: define Windows portable package contract"
```

---

### Task 2: Build the hardened Electron shell and real renderer acceptance test

**Files:**
- Create: `desktop/app-paths.cjs`
- Create: `desktop/window-options.cjs`
- Create: `desktop/security.cjs`
- Create: `desktop/main.cjs`
- Create: `tests/desktop/app-paths.test.js`
- Create: `tests/desktop/window-options.test.js`
- Create: `tests/desktop/security.test.js`
- Create: `scripts/verify-electron-app.mjs`

**Interfaces:**
- Consumes: `dist/V曲线对比工具.html`, package entry `desktop/main.cjs`, and the real level directory argument/default.
- Produces: `resolveHtmlPath({ isPackaged, appPath, mainDirectory }): string`, `createWindowOptions({ allowDevelopmentTools?: boolean }): Electron.BrowserWindowConstructorOptions`, `registerSecurityGuards({ webContents, session, allowedFileUrl }): void`, and a source-Electron end-to-end verifier.

- [ ] **Step 1: Write failing tests for default window isolation**

```js
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createWindowOptions } = require("../../desktop/window-options.cjs");

describe("desktop window options", () => {
  it("uses the approved responsive size and secure renderer defaults", () => {
    expect(createWindowOptions()).toMatchObject({
      width: 1440,
      height: 900,
      minWidth: 1000,
      minHeight: 700,
      show: false,
      autoHideMenuBar: true,
      title: "V 曲线对比工具",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        devTools: false,
      },
    });
    expect(createWindowOptions().webPreferences).not.toHaveProperty("preload");
  });

  it("allows DevTools only for the explicit unpackaged E2E harness", () => {
    expect(createWindowOptions({ allowDevelopmentTools: true }).webPreferences.devTools).toBe(true);
  });
});
```

- [ ] **Step 2: Write failing tests for navigation and permission denial**

```js
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { isAllowedNavigation, registerSecurityGuards } = require("../../desktop/security.cjs");

describe("desktop security guards", () => {
  it("allows only the packaged HTML URL and its hash fragments", () => {
    const trusted = "file:///C:/app/dist/V%E6%9B%B2%E7%BA%BF.html";
    expect(isAllowedNavigation(trusted, trusted)).toBe(true);
    expect(isAllowedNavigation(`${trusted}#report`, trusted)).toBe(true);
    expect(isAllowedNavigation("https://example.com", trusted)).toBe(false);
    expect(isAllowedNavigation("file:///C:/Windows/win.ini", trusted)).toBe(false);
  });

  it("denies popups, foreign navigation, webviews, and all permissions", () => {
    const listeners = new Map();
    let openHandler;
    let permissionCheck;
    let permissionRequest;
    const webContents = {
      setWindowOpenHandler: vi.fn((handler) => { openHandler = handler; }),
      on: vi.fn((name, handler) => listeners.set(name, handler)),
    };
    const session = {
      setPermissionCheckHandler: vi.fn((handler) => { permissionCheck = handler; }),
      setPermissionRequestHandler: vi.fn((handler) => { permissionRequest = handler; }),
    };

    registerSecurityGuards({ webContents, session, allowedFileUrl: "file:///app/tool.html" });
    expect(openHandler()).toEqual({ action: "deny" });
    expect(permissionCheck()).toBe(false);
    const callback = vi.fn();
    permissionRequest(null, "camera", callback);
    expect(callback).toHaveBeenCalledWith(false);

    const navigationEvent = { preventDefault: vi.fn() };
    listeners.get("will-navigate")(navigationEvent, "https://example.com");
    expect(navigationEvent.preventDefault).toHaveBeenCalledOnce();
    const webviewEvent = { preventDefault: vi.fn() };
    listeners.get("will-attach-webview")(webviewEvent);
    expect(webviewEvent.preventDefault).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run both tests and verify the red state**

Run: `npx vitest run tests/desktop/window-options.test.js tests/desktop/security.test.js`

Expected: FAIL because `desktop/window-options.cjs` and `desktop/security.cjs` do not exist.

- [ ] **Step 4: Implement the minimal window and security modules**

`desktop/window-options.cjs`:

```js
"use strict";

function createWindowOptions({ allowDevelopmentTools = false } = {}) {
  return {
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    center: true,
    autoHideMenuBar: true,
    backgroundColor: "#0b1020",
    title: "V 曲线对比工具",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: allowDevelopmentTools,
    },
  };
}

module.exports = { createWindowOptions };
```

`desktop/security.cjs`:

```js
"use strict";

function isAllowedNavigation(targetUrl, allowedFileUrl) {
  return targetUrl === allowedFileUrl || targetUrl.startsWith(`${allowedFileUrl}#`);
}

function registerSecurityGuards({ webContents, session, allowedFileUrl }) {
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-navigate", (event, targetUrl) => {
    if (!isAllowedNavigation(targetUrl, allowedFileUrl)) event.preventDefault();
  });
  webContents.on("will-attach-webview", (event) => event.preventDefault());
  session.setPermissionCheckHandler(() => false);
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}

module.exports = { isAllowedNavigation, registerSecurityGuards };
```

- [ ] **Step 5: Add the Electron main process**

`desktop/main.cjs` must:

```js
"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, dialog, Menu } = require("electron");
const { createWindowOptions } = require("./window-options.cjs");
const { registerSecurityGuards } = require("./security.cjs");

let mainWindow = null;

async function createMainWindow() {
  const htmlPath = path.join(app.getAppPath(), "dist", "V曲线对比工具.html");
  const allowedFileUrl = pathToFileURL(htmlPath).href;
  const allowDevelopmentTools = !app.isPackaged && process.env.V_CURVE_E2E === "1";
  const window = new BrowserWindow(createWindowOptions({ allowDevelopmentTools }));
  mainWindow = window;
  Menu.setApplicationMenu(null);
  window.removeMenu();
  registerSecurityGuards({
    webContents: window.webContents,
    session: window.webContents.session,
    allowedFileUrl,
  });
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => { if (mainWindow === window) mainWindow = null; });
  await window.loadFile(htmlPath);
  return window;
}

app.whenReady().then(createMainWindow).catch((error) => {
  dialog.showErrorBox("V 曲线对比工具启动失败", error?.message || String(error));
  app.quit();
});

app.on("window-all-closed", () => app.quit());
```

- [ ] **Step 6: Run the unit tests and verify green**

Run: `npx vitest run tests/desktop/window-options.test.js tests/desktop/security.test.js`

Expected: PASS, 4 tests.

- [ ] **Step 7: Write the real Electron acceptance verifier before running it**

Create `scripts/verify-electron-app.mjs` with these exact checks:

```js
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronExecutable from "electron";
import { _electron as electron } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const levelsPath = path.resolve(process.argv[2] ?? "E:\\Mahjong\\PawsHomeClient\\Assets\\Editor\\Res\\Config\\Gameplay\\EditorLevels");
const temp = await mkdtemp(path.join(os.tmpdir(), "vcurve-electron-"));
let electronApp;

try {
  electronApp = await electron.launch({
    executablePath: electronExecutable,
    args: [path.join(root, "desktop", "main.cjs")],
    cwd: root,
    env: { ...process.env, V_CURVE_E2E: "1" },
  });
  const page = await electronApp.firstWindow();
  await page.waitForSelector("#folder-input");
  await page.setInputFiles("#folder-input", levelsPath);
  await page.waitForFunction(() => document.querySelector("#import-summary")?.textContent.includes("已导入 25 个关卡"));
  await page.waitForFunction(() => document.querySelector("#analysis-status")?.textContent.includes("分析完成"), null, { timeout: 120_000 });

  const state = await page.evaluate(() => ({
    summary: document.querySelector("#import-summary")?.textContent,
    status: document.querySelector("#analysis-status")?.textContent,
    selected: document.querySelector("#level-select")?.selectedOptions?.[0]?.textContent,
    title: document.title,
  }));
  assert.match(state.summary, /已导入 25 个关卡 · 忽略 92 个文件 · 0 项警告/);
  assert.match(state.selected, /level_0020 · 280 砖 · 22 层/);
  assert.match(state.status, /level_0020 分析完成 · 300 seeds/);
  assert.equal(state.title, "V 曲线对比工具");

  const jsonPath = path.join(temp, "comparison.json");
  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#export-json"),
  ]);
  await jsonDownload.saveAs(jsonPath);
  const json = JSON.parse(await readFile(jsonPath, "utf8"));
  assert.equal(json.schemaVersion, "vcurve-comparison/1");
  assert.equal(json.paws.level.id, "level_0020");

  const pngPath = path.join(temp, "comparison.png");
  const [pngDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.click("#export-png"),
  ]);
  await pngDownload.saveAs(pngPath);
  const png = await readFile(pngPath);
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.ok(png.readUInt32BE(16) >= 2000);
  assert.ok(png.readUInt32BE(20) >= 2000);

  console.log(JSON.stringify({ levelsPath, state, jsonSchema: json.schemaVersion, pngBytes: png.length }, null, 2));
} finally {
  if (electronApp) await electronApp.close();
  await rm(temp, { recursive: true, force: true });
}
```

- [ ] **Step 8: Run the source Electron acceptance verifier**

Run: `npm run verify:electron`

Expected: PASS; output contains 25 imported levels, 92 ignored files, zero warnings, `level_0020`, 300 seeds, JSON schema `vcurve-comparison/1`, and a PNG larger than 2000×2000.

- [ ] **Step 9: Run the full suite and commit the shell**

Run: `npm test`

Expected: PASS, original 60 tests plus 8 desktop tests from Tasks 1–2, including the unpackaged/packaged path resolver regression.

```powershell
git add -- desktop tests/desktop scripts/verify-electron-app.mjs
git commit -m "feat: add hardened Electron desktop shell"
```

---

### Task 3: Verify the portable Windows artifact and emit its checksum

**Files:**
- Create: `scripts/windows-artifact.mjs`
- Create: `scripts/verify-windows-build.mjs`
- Create: `tests/desktop/windows-artifact.test.js`

**Interfaces:**
- Consumes: package version and the portable EXE written to `release/`.
- Produces: `artifactNames(version): { exe: string, checksum: string }`, `readPeMachine(buffer): number`, `assertPortableArchitectures({ bootstrapperMachine, appMachine }): void`, `checksumLine(buffer, fileName): string`, and the final `.sha256.txt` file.

- [ ] **Step 1: Write failing unit tests for artifact naming, PE parsing, and checksum format**

```js
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { artifactNames, assertPortableArchitectures, checksumLine, readPeMachine } from "../../scripts/windows-artifact.mjs";

function x64PeFixture() {
  const buffer = Buffer.alloc(128);
  buffer.write("MZ", 0, "ascii");
  buffer.writeUInt32LE(64, 0x3c);
  buffer.write("PE\0\0", 64, "binary");
  buffer.writeUInt16LE(0x8664, 68);
  return buffer;
}

describe("Windows artifact verification", () => {
  it("uses deterministic Chinese portable artifact names", () => {
    expect(artifactNames("1.1.0")).toEqual({
      exe: "V曲线对比工具-1.1.0-Windows-x64.exe",
      checksum: "V曲线对比工具-1.1.0-Windows-x64.sha256.txt",
    });
  });

  it("reads the x64 PE machine code and rejects malformed files", () => {
    expect(readPeMachine(x64PeFixture())).toBe(0x8664);
    expect(() => readPeMachine(Buffer.from("not an exe"))).toThrow(/PE/);
  });

  it("writes a lowercase sha256sum-compatible line", () => {
    const bytes = Buffer.from("vcurve");
    const expected = createHash("sha256").update(bytes).digest("hex");
    expect(checksumLine(bytes, "tool.exe")).toBe(`${expected}  tool.exe\n`);
  });

  it("accepts the NSIS bootstrapper only when the embedded app is x64", () => {
    expect(() => assertPortableArchitectures({
      bootstrapperMachine: 0x014c,
      appMachine: 0x8664,
    })).not.toThrow();
    expect(() => assertPortableArchitectures({
      bootstrapperMachine: 0x014c,
      appMachine: 0x014c,
    })).toThrow(/内层应用.*x64/);
  });
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run: `npx vitest run tests/desktop/windows-artifact.test.js`

Expected: FAIL because `scripts/windows-artifact.mjs` is absent.

- [ ] **Step 3: Implement the artifact helper**

`scripts/windows-artifact.mjs`:

```js
import { createHash } from "node:crypto";

export function artifactNames(version) {
  const stem = `V曲线对比工具-${version}-Windows-x64`;
  return { exe: `${stem}.exe`, checksum: `${stem}.sha256.txt` };
}

export function readPeMachine(buffer) {
  if (buffer.length < 70 || buffer.subarray(0, 2).toString("ascii") !== "MZ") {
    throw new Error("文件不是有效 PE：缺少 MZ 头");
  }
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset + 6 > buffer.length || buffer.subarray(peOffset, peOffset + 4).toString("binary") !== "PE\0\0") {
    throw new Error("文件不是有效 PE：缺少 PE 签名");
  }
  return buffer.readUInt16LE(peOffset + 4);
}

export function checksumLine(buffer, fileName) {
  return `${createHash("sha256").update(buffer).digest("hex")}  ${fileName}\n`;
}
```

- [ ] **Step 4: Run the helper tests and verify green**

Run: `npx vitest run tests/desktop/windows-artifact.test.js`

Expected: PASS, 3 tests.

- [ ] **Step 5: Implement the release verifier**

`scripts/verify-windows-build.mjs` must:

1. Read `package.json` and derive names with `artifactNames(packageJson.version)`.
2. Require exactly one root-level `.exe` in `release/` and require its name to match.
3. Read the portable EXE and require `70 MiB <= size <= 250 MiB`.
4. Read `release/win-unpacked/V曲线对比工具.exe`; allow the standard NSIS bootstrapper machine `0x014c` or `0x8664`, but require the inner app machine to be `0x8664`.
5. Write the checksum file using `checksumLine(bytes, exeName)`.
6. Read the checksum file back and require exact equality.
7. Print JSON containing absolute paths, bytes, both machine codes, and SHA-256.

Use `node:assert/strict`, `node:fs/promises`, `node:path`, and `node:url`; do not add another dependency.

- [ ] **Step 6: Run all tests and commit the artifact verifier**

Run: `npm test`

Expected: PASS, original 60 tests plus 12 desktop tests from Tasks 1–3.

```powershell
git add -- scripts/windows-artifact.mjs scripts/verify-windows-build.mjs tests/desktop/windows-artifact.test.js
git commit -m "test: verify Windows portable artifact"
```

---

### Task 4: Build the EXE and document its use

**Files:**
- Modify: `README.md`
- Generate, ignored: `release/V曲线对比工具-1.1.0-Windows-x64.exe`
- Generate, ignored: `release/V曲线对比工具-1.1.0-Windows-x64.sha256.txt`

**Interfaces:**
- Consumes: Electron shell, Vite single-file dist, electron-builder config, Windows verifier.
- Produces: final user-facing EXE, checksum, and exact usage instructions.

- [ ] **Step 1: Run the pre-package regression gates**

Run in order:

```powershell
npm test
npm run verify:real
npm run build
npm run verify:dist
npm run verify:electron
```

Expected: all tests pass; real import reports 25 levels, 92 ignored, 0 warnings; dist contains one self-contained HTML; Electron E2E imports, analyzes, and exports successfully.

- [ ] **Step 2: Build the portable Windows executable**

Run: `npm run build:win`

Expected: electron-builder completes `portable` x64 packaging and creates `release/V曲线对比工具-1.1.0-Windows-x64.exe` plus an unpacked staging directory.

- [ ] **Step 3: Verify the PE and generate the checksum**

Run: `npm run verify:win`

Expected: PASS with inner-app x64 machine `0x8664`, size within 70–250 MiB, and the two final absolute paths.

- [ ] **Step 4: Add the EXE usage and build instructions to README**

Add a “Windows 便携 EXE” section before “直接使用” that states:

- Double-click `release/V曲线对比工具-1.1.0-Windows-x64.exe`; no installation or Node.js is required.
- Select `E:\Mahjong\PawsHomeClient\Assets\Editor\Res\Config\Gameplay\EditorLevels` inside the app.
- The app is offline and read-only for imported levels.
- The unsigned first release may show an unknown-publisher warning.
- SHA-256 can be checked with `Get-FileHash -Algorithm SHA256 -LiteralPath '<EXE path>'` and compared with the `.sha256.txt` file.

Extend “开发与验证” with `npm run verify:electron`, `npm run build:win`, and `npm run verify:win` in that order.

- [ ] **Step 5: Re-run documentation-adjacent validation and commit**

Run:

```powershell
npm test
npm run verify:win
git diff --check
```

Expected: all pass and no whitespace errors.

```powershell
git add -- README.md
git commit -m "docs: document Windows portable release"
```

---

### Task 5: Perform packaged Windows acceptance and final verification

**Files:**
- Verify, ignored: `release/V曲线对比工具-1.1.0-Windows-x64.exe`
- Verify, ignored: `release/V曲线对比工具-1.1.0-Windows-x64.sha256.txt`
- Update only if stable project state changed: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\麻将竞品.md`

**Interfaces:**
- Consumes: final portable EXE and real `EditorLevels` directory.
- Produces: verified packaged application, evidence summary, clean source worktree, and the final user handoff path/hash.

- [ ] **Step 1: Launch the actual portable EXE**

Use `Start-Process -FilePath '<absolute release EXE path>'`. Resolve the new process/window from returned Windows state; do not reuse or close another V-curve/browser process.

Expected: one foreground window titled “V 曲线对比工具”, normal 1440×900 size, no blank page, menu bar, or DevTools window.

- [ ] **Step 2: Import the exact real level directory in the packaged app**

Click “选择 EditorLevels 文件夹”, enter:

`E:\Mahjong\PawsHomeClient\Assets\Editor\Res\Config\Gameplay\EditorLevels`

Confirm the folder picker. This selection is explicitly user-authorized and read-only.

Expected: `已导入 25 个关卡 · 忽略 92 个文件 · 0 项警告`; selected item contains `level_0020 · 280 砖 · 22 层`; final status contains `level_0020 分析完成 · 300 seeds`.

- [ ] **Step 3: Check packaged visual states**

Capture and inspect the normal window, a maximized window, and the 1000px minimum-width window. At each size verify:

- both comparison charts are present;
- status/progress does not overlap controls;
- metrics and diagnostics remain readable;
- warning and export areas are not clipped;
- no horizontal scroll appears outside the intended narrow metrics table behavior.

- [ ] **Step 4: Export from the packaged app and read back both files**

Click “导出 JSON” and “导出 PNG”. Resolve the newly created files by modification time without deleting or overwriting unrelated downloads.

Expected JSON: schema `vcurve-comparison/1`, Sheep level `900121`, Paws level `level_0020`.

Expected PNG: valid PNG signature, dimensions at least 2000×2000, nonzero file size. The existing source-Electron acceptance verifier must already have passed the same export flow in an isolated temporary directory.

- [ ] **Step 5: Run the final fresh command suite**

Run in order after the packaged interaction:

```powershell
npm test
npm run verify:real
npm run build
npm run verify:dist
npm run verify:electron
npm run build:win
npm run verify:win
git diff --check
git status --short --branch
```

Expected: all commands pass; the source worktree is clean because `release/` and temporary QA outputs are ignored.

- [ ] **Step 6: Review the complete branch diff**

Run:

```powershell
git diff 93301c2..HEAD --stat
git diff 93301c2..HEAD --check
git log --oneline --decorate -8
```

Review specifically for renderer logic changes, untrusted navigation, Node exposure, packaged source leakage, hard-coded writes to Unity, missing errors, and accidental tracked binaries. Fix any finding, rerun the relevant red/green test, and commit the fix with a focused message.

- [ ] **Step 7: Update stable project memory and hand off**

Update the existing V-curve project-memory entry in place with the confirmed EXE path, version, commit, final test counts, real import result, packaged visual/export result, EXE size, and SHA-256. Do not store credentials, raw chats, or temporary paths.

Final response must link the absolute EXE and checksum paths, state that it is unsigned, give the real import/test evidence, and note that the branch was not merged or pushed.
