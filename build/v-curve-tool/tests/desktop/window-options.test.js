import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createWindowOptions } = require("../../desktop/window-options.cjs");

describe("desktop window options", () => {
  it("uses the approved responsive size and secure renderer defaults", () => {
    expect(createWindowOptions()).toMatchObject({
      width: 1440,
      height: 900,
      minWidth: 1000,
      minHeight: 700,
      show: false,
      autoHideMenuBar: true,
      title: "V 曲线对比工具",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        devTools: false,
      },
    });
    expect(createWindowOptions().webPreferences.preload.replaceAll("\\", "/"))
      .toMatch(/\/desktop\/preload\.cjs$/);
  });

  it("allows DevTools only for the explicit unpackaged E2E harness", () => {
    expect(createWindowOptions({ allowDevelopmentTools: true }).webPreferences.devTools).toBe(true);
  });
});
