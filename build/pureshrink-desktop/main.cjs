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
const { fileURLToPath } = require("node:url");
const { NativeRunner, runProcess } = require("./native/runner.cjs");
const { runNativeProof } = require("./native/proof.cjs");

const runner = new NativeRunner();
const smokeTest = process.argv.includes("--smoke-test");
const PUBLIC_HUB_URL = "https://wthpein010-dev.github.io/ai-application-hub/#apps";
let mainWindow;
let outputDirectory;
const allowedSourcePaths = new Set();
const allowedResultPaths = new Set();

const channels = Object.freeze({
  pickFiles: "pureshrink:pick-files",
  describeDroppedFiles: "pureshrink:describe-dropped-files",
  chooseOutput: "pureshrink:choose-output",
  compress: "pureshrink:compress",
  cancel: "pureshrink:cancel",
  showItem: "pureshrink:show-item",
  environment: "pureshrink:environment",
  progress: "pureshrink:progress",
});

function appPagePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", "projects", "pureshrink", "index.html")
    : path.join(__dirname, "..", "..", "projects", "pureshrink", "index.html");
}

function pathInside(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === ""
    || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function pathKey(candidatePath) {
  const resolved = path.resolve(candidatePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isTrustedRendererUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:") return false;
    const projectRoot = path.dirname(appPagePath());
    const candidatePath = fileURLToPath(parsed);
    const allowedDocuments = new Set([
      pathKey(appPagePath()),
      pathKey(path.join(projectRoot, "video", "index.html")),
    ]);
    return pathInside(projectRoot, candidatePath)
      && allowedDocuments.has(pathKey(candidatePath));
  } catch {
    return false;
  }
}

function localNavigationTarget(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:") return null;
    const candidatePath = fileURLToPath(parsed);
    const projectRoot = path.dirname(appPagePath());
    if (pathKey(candidatePath) === pathKey(path.resolve(projectRoot, "..", "..", "index.html"))) {
      return { type: "external", value: PUBLIC_HUB_URL };
    }
    if (
      pathKey(candidatePath)
      === pathKey(path.join(projectRoot, "video", "pureshrink-demo.mp4"))
    ) {
      return { type: "local-media", value: candidatePath };
    }
  } catch {
    // Non-file navigation is handled by the caller.
  }
  return null;
}

function isTrustedRenderer(event) {
  return Boolean(
    mainWindow
    && event?.sender === mainWindow.webContents
    && event.senderFrame
    && isTrustedRendererUrl(event.senderFrame.url),
  );
}

function assertTrustedSender(event) {
  if (!isTrustedRenderer(event)) {
    throw new Error("PureShrink rejected an untrusted IPC sender");
  }
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
    if (isTrustedRendererUrl(url)) return;
    event.preventDefault();
    const target = localNavigationTarget(url);
    if (target?.type === "external") shell.openExternal(target.value);
    if (target?.type === "local-media") shell.openPath(target.value);
    if (!target && url.startsWith("https://")) shell.openExternal(url);
  });
  window.once("ready-to-show", () => window.show());
  window.loadFile(appPagePath());
  return window;
}

function registerHandlers() {
  ipcMain.handle(channels.pickFiles, async (event) => {
    assertTrustedSender(event);
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
    return result.filePaths.map((nativePath) => {
      allowedSourcePaths.add(pathKey(nativePath));
      return {
        name: path.basename(nativePath),
        nativePath,
        size: statSync(nativePath).size,
        type: "",
      };
    });
  });

  ipcMain.handle(channels.describeDroppedFiles, (event, candidatePaths) => {
    assertTrustedSender(event);
    const paths = Array.isArray(candidatePaths) ? candidatePaths.slice(0, 1_000) : [];
    return paths.flatMap((nativePath) => {
      if (
        typeof nativePath !== "string"
        || !path.isAbsolute(nativePath)
        || !existsSync(nativePath)
        || !statSync(nativePath).isFile()
      ) return [];
      allowedSourcePaths.add(pathKey(nativePath));
      return [{
        name: path.basename(nativePath),
        nativePath,
        size: statSync(nativePath).size,
        type: "",
      }];
    });
  });

  ipcMain.handle(channels.chooseOutput, async (event) => {
    assertTrustedSender(event);
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
    assertTrustedSender(event);
    const sourcePath = request?.sourcePath || "";
    if (
      !path.isAbsolute(sourcePath)
      || !allowedSourcePaths.has(pathKey(sourcePath))
      || !existsSync(sourcePath)
      || !statSync(sourcePath).isFile()
    ) {
      throw new Error("源文件未由 PureShrink 选择器授权，请重新选择");
    }
    try {
      const result = await runner.compress(
        request,
        outputDirectory || defaultOutputDirectory(),
        (progress) => event.sender.send(channels.progress, {
          id: request.id,
          progress,
        }),
      );
      if (result?.path) allowedResultPaths.add(pathKey(result.path));
      return result;
    } catch (error) {
      throw new Error(safeError(error, sourcePath));
    }
  });

  ipcMain.handle(channels.cancel, (event, taskId) => {
    assertTrustedSender(event);
    if (!Number.isInteger(taskId)) return false;
    return runner.cancel(taskId);
  });
  ipcMain.handle(channels.showItem, (event, resultPath) => {
    assertTrustedSender(event);
    if (
      !path.isAbsolute(resultPath || "")
      || !allowedResultPaths.has(pathKey(resultPath))
      || !existsSync(resultPath)
    ) return false;
    shell.showItemInFolder(resultPath);
    return true;
  });
  ipcMain.handle(channels.environment, (event) => {
    assertTrustedSender(event);
    return {
      desktop: true,
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
      outputDirectory: outputDirectory || defaultOutputDirectory(),
    };
  });
}

app.whenReady().then(async () => {
  if (smokeTest) {
    try {
      const result = await runProcess(runner.ffmpegPath, ["-version"]);
      if (result.code !== 0 || !result.stdout.includes("ffmpeg version")) {
        throw new Error(`FFmpeg smoke exited with code ${result.code}`);
      }
      const proof = await runNativeProof(runner, app.getPath("temp"));
      console.log("PURESHRINK_SMOKE_OK", JSON.stringify(proof));
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
  assertTrustedSender,
  channels,
  isTrustedRendererUrl,
  localNavigationTarget,
  pathInside,
  safeError,
};
