"use strict";

const path = require("node:path");

function resolveHtmlPath({ isPackaged, appPath, mainDirectory }) {
  const root = isPackaged ? appPath : path.resolve(mainDirectory, "..");
  return path.join(root, "dist", "V曲线对比工具.html");
}

module.exports = { resolveHtmlPath };
