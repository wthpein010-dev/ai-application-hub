import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { isAllowedNavigation, registerSecurityGuards } = require("../../desktop/security.cjs");

describe("desktop security guards", () => {
  it("allows only the packaged HTML URL and its hash fragments", () => {
    const trusted = "file:///C:/app/dist/V%E6%9B%B2%E7%BA%BF.html";
    expect(isAllowedNavigation(trusted, trusted)).toBe(true);
    expect(isAllowedNavigation(`${trusted}#report`, trusted)).toBe(true);
    expect(isAllowedNavigation("https://example.com", trusted)).toBe(false);
    expect(isAllowedNavigation("file:///C:/Windows/win.ini", trusted)).toBe(false);
  });

  it("denies popups, foreign navigation, webviews, and all permissions", () => {
    const listeners = new Map();
    let openHandler;
    let permissionCheck;
    let permissionRequest;
    const webContents = {
      setWindowOpenHandler: vi.fn((handler) => { openHandler = handler; }),
      on: vi.fn((name, handler) => listeners.set(name, handler)),
    };
    const session = {
      setPermissionCheckHandler: vi.fn((handler) => { permissionCheck = handler; }),
      setPermissionRequestHandler: vi.fn((handler) => { permissionRequest = handler; }),
    };

    registerSecurityGuards({ webContents, session, allowedFileUrl: "file:///app/tool.html" });
    expect(openHandler()).toEqual({ action: "deny" });
    expect(permissionCheck()).toBe(false);
    const callback = vi.fn();
    permissionRequest(null, "camera", callback);
    expect(callback).toHaveBeenCalledWith(false);

    const navigationEvent = { preventDefault: vi.fn() };
    listeners.get("will-navigate")(navigationEvent, "https://example.com");
    expect(navigationEvent.preventDefault).toHaveBeenCalledOnce();
    const webviewEvent = { preventDefault: vi.fn() };
    listeners.get("will-attach-webview")(webviewEvent);
    expect(webviewEvent.preventDefault).toHaveBeenCalledOnce();
  });
});
