"use strict";

const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const { resolveHtmlPath } = require("./app-paths.cjs");
const {
  readBundledLevelFiles,
  resolveBundledLevelDirectories,
} = require("./bundled-levels.cjs");
const { createWindowOptions } = require("./window-options.cjs");
const { registerSecurityGuards } = require("./security.cjs");

let mainWindow = null;

async function createMainWindow() {
  const htmlPath = resolveHtmlPath({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    mainDirectory: __dirname,
  });
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
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  await window.loadFile(htmlPath);
  return window;
}

app.whenReady().then(() => {
  const bundledLevelDirectories = resolveBundledLevelDirectories({
    allowOverride: !app.isPackaged && process.env.V_CURVE_E2E === "1",
    overrideDirectory: process.env.V_CURVE_BUNDLED_LEVELS_PATH,
    portableExecutableDirectory: process.env.PORTABLE_EXECUTABLE_DIR,
    resourcesPath: process.resourcesPath,
    executablePath: process.execPath,
    isPackaged: app.isPackaged,
  });
  ipcMain.handle(
    "vcurve:load-bundled-levels",
    () => readBundledLevelFiles(bundledLevelDirectories),
  );
  return createMainWindow();
}).catch((error) => {
  dialog.showErrorBox("V 曲线对比工具启动失败", error?.message || String(error));
  app.quit();
});

app.on("window-all-closed", () => app.quit());
