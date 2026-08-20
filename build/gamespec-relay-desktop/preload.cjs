"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const channels = Object.freeze({
  openSources: "gamespec-relay:open-sources",
  saveProject: "gamespec-relay:save-project",
  loadProject: "gamespec-relay:load-project",
  exportFile: "gamespec-relay:export-file",
  getModelStatus: "gamespec-relay:get-model-status",
  configureModel: "gamespec-relay:configure-model",
});

contextBridge.exposeInMainWorld("gameSpecDesktop", {
  openSources: () => ipcRenderer.invoke(channels.openSources),
  saveProject: (project) => ipcRenderer.invoke(channels.saveProject, project),
  loadProject: () => ipcRenderer.invoke(channels.loadProject),
  exportFile: (request) => ipcRenderer.invoke(channels.exportFile, request),
  getModelStatus: () => ipcRenderer.invoke(channels.getModelStatus),
  configureModel: (settings) => ipcRenderer.invoke(channels.configureModel, settings),
});
