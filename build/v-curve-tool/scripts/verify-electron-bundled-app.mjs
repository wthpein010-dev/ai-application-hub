import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronExecutable from "electron";
import { _electron as electron } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const levelsPath = path.resolve(
  process.argv[2] ?? "E:\\Mahjong\\PawsHomeClient\\Assets\\Editor\\Res\\Config\\Gameplay\\Editorlevel",
);
let electronApp;

try {
  electronApp = await electron.launch({
    executablePath: electronExecutable,
    args: [path.join(root, "desktop", "main.cjs")],
    cwd: root,
    env: {
      ...process.env,
      V_CURVE_E2E: "1",
      V_CURVE_BUNDLED_LEVELS_PATH: levelsPath,
    },
  });
  const page = await electronApp.firstWindow();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.waitForFunction(() => (
    document.querySelector("#import-summary")?.textContent.includes("已导入 31 个关卡")
  ), null, { timeout: 15_000 });
  await page.waitForFunction(() => (
    document.querySelector("#analysis-status")?.textContent.includes("分析完成")
  ), null, { timeout: 120_000 });

  const state = await page.evaluate(() => ({
    summary: document.querySelector("#import-summary")?.textContent,
    status: document.querySelector("#analysis-status")?.textContent,
    selected: document.querySelector("#level-select")?.selectedOptions?.[0]?.textContent,
  }));
  assert.match(state.summary, /已导入 31 个关卡 · 忽略 31 个文件 · 5 项警告/);
  assert.match(state.selected, /level_0020 · 368 砖 · 21 层/);
  assert.match(state.status, /level_0020 分析完成 · 300 seeds/);
  assert.deepEqual(consoleErrors, []);

  console.log(JSON.stringify({ levelsPath, state, consoleErrors }, null, 2));
} finally {
  if (electronApp) await electronApp.close();
}
