"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vCurveDesktop", Object.freeze({
  loadBundledLevels: () => ipcRenderer.invoke("vcurve:load-bundled-levels"),
}));
