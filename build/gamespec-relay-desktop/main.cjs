"use strict";

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell,
} = require("electron");
const { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const {
  normalizeExportRequest,
  normalizeModelSettings,
  publicModelStatus,
} = require("./policy.cjs");

const smokeTest = process.argv.includes("--smoke-test");
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const PUBLIC_HUB_URL = "https://wthpein010-dev.github.io/ai-application-hub/index.html#apps";
const channels = Object.freeze({
  openSources: "gamespec-relay:open-sources",
  saveProject: "gamespec-relay:save-project",
  loadProject: "gamespec-relay:load-project",
  exportFile: "gamespec-relay:export-file",
  getModelStatus: "gamespec-relay:get-model-status",
  configureModel: "gamespec-relay:configure-model",
});

let mainWindow;

function appPagePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", "projects", "gamespec-relay", "app", "index.html")
    : path.join(__dirname, "..", "..", "projects", "gamespec-relay", "app", "index.html");
}

function pathKey(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isTrustedRendererUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "file:" && pathKey(fileURLToPath(parsed)) === pathKey(appPagePath());
  } catch {
    return false;
  }
}

function assertTrustedSender(event) {
  if (
    !mainWindow
    || event?.sender !== mainWindow.webContents
    || !event.senderFrame
    || !isTrustedRendererUrl(event.senderFrame.url)
  ) throw new Error("游戏需求开工台拒绝了不可信的桌面请求");
}

function dataPath(name) {
  return path.join(app.getPath("userData"), name);
}

function readJson(filePath, fallback = null) {
  try { return JSON.parse(readFileSync(filePath, "utf8")); } catch { return fallback; }
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  renameSync(temporary, filePath);
}

function createWindow({ show = !smokeTest } = {}) {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: "游戏需求开工台",
    backgroundColor: "#07110f",
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
    if (url.startsWith("https://")) shell.openExternal(url);
  });
  if (show) window.once("ready-to-show", () => window.show());
  window.loadFile(appPagePath());
  return window;
}

function registerHandlers() {
  ipcMain.handle(channels.openSources, async (event) => {
    assertTrustedSender(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "导入游戏需求来源",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "文本资料", extensions: ["txt", "md", "json", "csv"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (result.canceled) return [];
    return result.filePaths.flatMap((filePath, index) => {
      const stats = statSync(filePath);
      if (!stats.isFile() || stats.size > MAX_SOURCE_BYTES) return [];
      return [{
        id: `SRC-DESKTOP-${index + 1}`,
        kind: "document",
        title: path.basename(filePath),
        content: readFileSync(filePath, "utf8"),
      }];
    });
  });

  ipcMain.handle(channels.saveProject, (event, project) => {
    assertTrustedSender(event);
    const serialized = JSON.stringify(project);
    if (!project || typeof project !== "object" || Buffer.byteLength(serialized, "utf8") > 10 * 1024 * 1024) {
      throw new TypeError("桌面项目无效或超过 10 MB");
    }
    if (/"(?:apiKey|authorization|accessToken)"\s*:/i.test(serialized)) {
      throw new TypeError("桌面项目不能包含凭据");
    }
    writeJsonAtomic(dataPath("current-project.json"), project);
    return true;
  });

  ipcMain.handle(channels.loadProject, (event) => {
    assertTrustedSender(event);
    return readJson(dataPath("current-project.json"), null);
  });

  ipcMain.handle(channels.exportFile, async (event, request) => {
    assertTrustedSender(event);
    const exportRequest = normalizeExportRequest(request);
    let filePath;
    if (smokeTest) {
      const directory = path.join(app.getPath("temp"), "gamespec-relay-smoke");
      mkdirSync(directory, { recursive: true });
      filePath = path.join(directory, exportRequest.name);
    } else {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "导出游戏需求开工台资料",
        defaultPath: path.join(app.getPath("documents"), exportRequest.name),
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      filePath = result.filePath;
    }
    writeFileSync(filePath, exportRequest.content, "utf8");
    return { canceled: false, name: path.basename(filePath), path: filePath };
  });

  ipcMain.handle(channels.getModelStatus, (event) => {
    assertTrustedSender(event);
    return publicModelStatus(readJson(dataPath("model-settings.json"), {}));
  });

  ipcMain.handle(channels.configureModel, (event, value) => {
    assertTrustedSender(event);
    const settings = normalizeModelSettings(value);
    if (!safeStorage.isEncryptionAvailable()) throw new Error("系统安全存储不可用，访问密钥未保存");
    writeJsonAtomic(dataPath("model-settings.json"), {
      endpoint: settings.endpoint,
      model: settings.model,
      encryptedApiKey: safeStorage.encryptString(settings.apiKey).toString("base64"),
    });
    return { configured: true };
  });
}

async function runSmoke() {
  mainWindow = createWindow({ show: false });
  await new Promise((resolve, reject) => {
    mainWindow.webContents.once("did-finish-load", resolve);
    mainWindow.webContents.once("did-fail-load", (_event, code, description) => reject(new Error(`${code}: ${description}`)));
  });
  const result = await mainWindow.webContents.executeJavaScript(`(async () => {
    document.querySelector("#loadSample").click();
    document.querySelector("#analyzeButton").click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const stored = JSON.parse(localStorage.getItem("gamespec-relay:v1"));
    const pack = stored.projects["boss-phase-demo"];
    const exported = await window.gameSpecDesktop.exportFile({
      name: "游戏需求开工台-启动检查.json",
      mime: "application/json",
      content: JSON.stringify(pack),
    });
    return {
      criteriaCount: pack.tasks.flatMap((task) => task.acceptanceCriteria).length,
      exported,
      taskCount: pack.tasks.length,
    };
  })()`);
  if (result.taskCount < 5 || result.criteriaCount < 8 || !existsSync(result.exported.path)) {
    throw new Error("渲染器未生成完整交付包");
  }
  const exportedPack = JSON.parse(readFileSync(result.exported.path, "utf8"));
  if (exportedPack.tasks.length !== result.taskCount) throw new Error("导出的任务数量不一致");
  console.log("GAMESPEC_RELAY_SMOKE_OK", JSON.stringify({
    arch: process.arch,
    platform: process.platform,
    taskCount: result.taskCount,
    criteriaCount: result.criteriaCount,
  }));
}

app.whenReady().then(async () => {
  registerHandlers();
  if (smokeTest) {
    try {
      await runSmoke();
    } catch (error) {
      process.exitCode = 1;
      console.error("GAMESPEC_RELAY_SMOKE_FAILED", error instanceof Error ? error.message : String(error));
    } finally {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
      app.quit();
    }
    return;
  }
  mainWindow = createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

module.exports = {
  appPagePath,
  assertTrustedSender,
  channels,
  isTrustedRendererUrl,
  writeJsonAtomic,
};
