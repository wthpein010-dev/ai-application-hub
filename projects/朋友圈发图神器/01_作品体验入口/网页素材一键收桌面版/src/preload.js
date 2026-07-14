const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopAPI", {
  getEnvironment: () => ipcRenderer.invoke("app:get-environment"),
  setAlwaysOnTop: (value) => ipcRenderer.invoke("window:set-always-on-top", value),
  fetchPage: (url) => ipcRenderer.invoke("page:fetch", url),
  downloadItems: (payload) => ipcRenderer.invoke("download:items", payload),
  openDownloadFolder: () => ipcRenderer.invoke("download:open-folder"),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url)
});
