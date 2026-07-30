"use strict";

const { contextBridge, ipcRenderer, webUtils } = require("electron");

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

contextBridge.exposeInMainWorld("pureShrinkDesktop", {
  pickFiles: () => ipcRenderer.invoke(channels.pickFiles),
  describeDroppedFiles: async (files) => {
    const paths = Array.from(files || [], (file) => webUtils.getPathForFile(file))
      .filter(Boolean);
    return ipcRenderer.invoke(channels.describeDroppedFiles, paths);
  },
  chooseOutputDirectory: () => ipcRenderer.invoke(channels.chooseOutput),
  async compress(request, onProgress) {
    const listener = (_event, payload) => {
      if (payload?.id === request.id && typeof onProgress === "function") {
        onProgress(payload.progress);
      }
    };
    ipcRenderer.on(channels.progress, listener);
    try {
      return await ipcRenderer.invoke(channels.compress, request);
    } finally {
      ipcRenderer.removeListener(channels.progress, listener);
    }
  },
  cancel: (taskId) => ipcRenderer.invoke(channels.cancel, taskId),
  showItem: (resultPath) => ipcRenderer.invoke(channels.showItem, resultPath),
  getEnvironment: () => ipcRenderer.invoke(channels.environment),
});
