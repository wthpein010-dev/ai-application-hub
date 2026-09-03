"use strict";

const path = require("node:path");

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
      preload: path.join(__dirname, "preload.cjs"),
    },
  };
}

module.exports = { createWindowOptions };
