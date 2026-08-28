"use strict";

function isAllowedNavigation(targetUrl, allowedFileUrl) {
  return targetUrl === allowedFileUrl || targetUrl.startsWith(`${allowedFileUrl}#`);
}

function registerSecurityGuards({ webContents, session, allowedFileUrl }) {
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-navigate", (event, targetUrl) => {
    if (!isAllowedNavigation(targetUrl, allowedFileUrl)) event.preventDefault();
  });
  webContents.on("will-attach-webview", (event) => event.preventDefault());
  session.setPermissionCheckHandler(() => false);
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}

module.exports = { isAllowedNavigation, registerSecurityGuards };
