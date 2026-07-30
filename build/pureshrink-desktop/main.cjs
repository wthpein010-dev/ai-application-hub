"use strict";

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
} = require("electron");
const { existsSync, statSync } = require("node:fs");
const path = require("node:path");
const { NativeRunner, runProcess } = require("./native/runner.cjs");

const runner = new NativeRunner();
const smokeTest = process.argv.includes("--smoke-test");
let mainWindow;
let outputDirectory;

const channels = Object.freeze({
  pickFiles: "pureshrink:pick-files",
  chooseOutput: "pureshrink:choose-output",
  compress: "pureshrink:compress",
  cancel: "pureshrink:cancel",
  showItem: "pureshrink:show-item",
  environment: "pureshrink:environment",
  progress: "pureshrink:progress",
});

function appPagePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", "index.html")
    : path.join(__dirname, "..", "..", "projects", "pureshrink", "index.html");
}

function defaultOutputDirectory() {
  return path.join(app.getPath("documents"), "PureShrink Output");
}

function safeError(error, sourcePath = "") {
  const raw = error instanceof Error ? error.message : String(error || "处理失败");
  const withoutSource = sourcePath
    ? raw.replaceAll(sourcePath, path.basename(sourcePath))
    : raw;
  return withoutSource.slice(0, 900);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1260,
    height: 880,
    minWidth: 820,
    minHeight: 640,
    backgroundColor: "#07100d",
    title: "PureShrink 无损压缩工坊",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:")) return;
    event.preventDefault();
    if (url.startsWith("https://")) shell.openExternal(url);
  });
  window.once("ready-to-show", () => window.show());
  window.loadFile(appPagePath());
  return window;
}

function registerHandlers() {
  ipcMain.handle(channels.pickFiles, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择要压缩的资源",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "媒体与一般文件",
          extensions: [
            "png", "jpg", "jpeg", "webp", "avif", "heic", "gif",
            "mp4", "mov", "mkv", "webm", "avi", "m4v",
            "mp3", "m4a", "wav", "flac", "ogg", "aac",
            "pdf", "zip", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
          ],
        },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (result.canceled) return [];
    return result.filePaths.map((nativePath) => ({
      name: path.basename(nativePath),
      nativePath,
      size: statSync(nativePath).size,
      type: "",
    }));
  });

  ipcMain.handle(channels.chooseOutput, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择 PureShrink 输出目录",
      defaultPath: outputDirectory || defaultOutputDirectory(),
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return "";
    outputDirectory = result.filePaths[0];
    return outputDirectory;
  });

  ipcMain.handle(channels.compress, async (event, request) => {
    const sourcePath = request?.sourcePath || "";
    if (!path.isAbsolute(sourcePath) || !existsSync(sourcePath)) {
      throw new Error("源文件不存在，请重新选择");
    }
    try {
      return await runner.compress(
        request,
        outputDirectory || defaultOutputDirectory(),
        (progress) => event.sender.send(channels.progress, {
          id: request.id,
          progress,
        }),
      );
    } catch (error) {
      throw new Error(safeError(error, sourcePath));
    }
  });

  ipcMain.handle(channels.cancel, (_event, taskId) => runner.cancel(taskId));
  ipcMain.handle(channels.showItem, (_event, resultPath) => {
    if (!path.isAbsolute(resultPath || "") || !existsSync(resultPath)) return false;
    shell.showItemInFolder(resultPath);
    return true;
  });
  ipcMain.handle(channels.environment, () => ({
    desktop: true,
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    outputDirectory: outputDirectory || defaultOutputDirectory(),
  }));
}

app.whenReady().then(async () => {
  if (smokeTest) {
    try {
      const result = await runProcess(runner.ffmpegPath, ["-version"]);
      if (result.code !== 0 || !result.stdout.includes("ffmpeg version")) {
        throw new Error(`FFmpeg smoke exited with code ${result.code}`);
      }
      console.log("PURESHRINK_SMOKE_OK");
    } catch (error) {
      process.exitCode = 1;
      console.error("PURESHRINK_SMOKE_FAILED", safeError(error));
    } finally {
      app.quit();
    }
    return;
  }
  registerHandlers();
  mainWindow = createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on("before-quit", () => runner.cancelAll());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

module.exports = {
  appPagePath,
  channels,
  safeError,
};
