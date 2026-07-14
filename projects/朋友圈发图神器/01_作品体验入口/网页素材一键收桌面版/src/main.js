const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require("electron");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

let mainWindow;
let lastDownloadFolder = "";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 620,
    x: Math.max(workArea.x, workArea.x + workArea.width - 1000),
    y: workArea.y,
    title: "网页素材一键收",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenu(null);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile(path.join(__dirname, "renderer.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("app:get-environment", () => ({
  platform: process.platform,
  downloadsPath: app.getPath("downloads"),
  alwaysOnTop: Boolean(mainWindow?.isAlwaysOnTop())
}));

ipcMain.handle("window:set-always-on-top", (_event, value) => {
  const enabled = Boolean(value);
  if (!mainWindow) {
    return false;
  }
  mainWindow.setAlwaysOnTop(enabled, "floating");
  mainWindow.setVisibleOnAllWorkspaces(enabled, { visibleOnFullScreen: true });
  return mainWindow.isAlwaysOnTop();
});

ipcMain.handle("page:fetch", async (_event, rawUrl) => {
  const url = normalizeHttpUrl(rawUrl);
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(18000),
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`网页请求失败：HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("xml") && !contentType.includes("text/plain")) {
    throw new Error("这个地址不像网页，暂时无法扫描。");
  }

  const html = await response.text();
  return {
    url: response.url || url,
    contentType,
    html
  };
});

ipcMain.handle("download:items", async (_event, payload) => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!items.length) {
    return { folder: "", results: [] };
  }

  const baseFolder = sanitizePathSegment(payload?.folderName || "网页素材一键收");
  const targetFolder = path.join(app.getPath("downloads"), `${baseFolder}-${timestamp()}`);
  await fs.mkdir(targetFolder, { recursive: true });
  lastDownloadFolder = targetFolder;

  const results = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    try {
      const url = normalizeHttpUrl(item.url);
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
        headers: {
          "user-agent": USER_AGENT,
          referer: item.pageUrl || ""
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = buildFilename(item, index + 1, response.headers.get("content-type") || "");
      const targetFile = path.join(targetFolder, filename);
      await fs.writeFile(targetFile, buffer);
      results.push({ ok: true, url, filename, bytes: buffer.length });
    } catch (error) {
      results.push({ ok: false, url: item?.url || "", error: error.message });
    }
  }

  return { folder: targetFolder, results };
});

ipcMain.handle("download:open-folder", async () => {
  const folder = lastDownloadFolder || app.getPath("downloads");
  await shell.openPath(folder);
  return folder;
});

ipcMain.handle("dialog:choose-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"]
  });
  return result.canceled ? "" : result.filePaths[0] || "";
});

ipcMain.handle("shell:open-external", async (_event, url) => {
  await shell.openExternal(normalizeHttpUrl(url));
});

function normalizeHttpUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("只支持 http 或 https 地址。");
  }
  return url.href;
}

function buildFilename(item, index, contentType) {
  const base = sanitizePathSegment(item.title || filenameFromUrl(item.url) || "media");
  const ext = extensionFromUrl(item.url) || extensionFromContentType(contentType);
  const numbered = `${String(index).padStart(3, "0")}-${base}`;
  if (!ext || numbered.toLowerCase().endsWith(`.${ext}`)) {
    return numbered;
  }
  return `${numbered}.${ext}`;
}

function filenameFromUrl(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "") || "media";
  } catch {
    return "media";
  }
}

function extensionFromUrl(url) {
  try {
    const last = new URL(url).pathname.toLowerCase().split("/").pop() || "";
    return last.includes(".") ? last.split(".").pop().replace(/[^a-z0-9]/g, "") : "";
  } catch {
    return "";
  }
}

function extensionFromContentType(contentType) {
  const type = contentType.split(";")[0].trim().toLowerCase();
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "audio/mpeg": "mp3",
    "application/pdf": "pdf"
  }[type] || "";
}

function sanitizePathSegment(value) {
  return String(value)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "media";
}

function timestamp() {
  const date = new Date();
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0")
  ];
  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}`;
}
