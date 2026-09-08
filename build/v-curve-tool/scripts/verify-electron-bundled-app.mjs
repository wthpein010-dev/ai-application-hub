import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronExecutable from "electron";
import { _electron as electron } from "playwright-core";
import { importLevelFiles } from "../src/io/import-levels.js";
import { readBundledLevelFiles } from "../desktop/bundled-levels.cjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const levelsPath = path.resolve(
  process.argv[2] ?? path.join(root, "bundled-levels", "EditorLevels-v150"),
);
const sourcePayload = await readBundledLevelFiles([levelsPath]);
assert.equal(sourcePayload.available, true, "随包目录必须存在");
const expectedImport = await importLevelFiles(sourcePayload.files.map((file) => ({
  ...file, text: async () => file.text,
})));
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

  try {
    await page.waitForFunction((count) => (
      document.querySelector("#right-level-select")?.options.length === count + 1
      && !document.querySelector("#export-json")?.disabled
    ), expectedImport.importedCount, { timeout: 30_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      summary: document.querySelector("#right-import-summary")?.textContent,
      status: document.querySelector("#analysis-status")?.textContent,
      hasBridge: typeof globalThis.vCurveDesktop?.loadBundledLevels === "function",
    }));
    throw new Error(`随包右侧导入未完成：${JSON.stringify({ diagnostic, consoleErrors })}`, { cause: error });
  }
  await page.waitForFunction(() => (
    document.querySelector("#analysis-status")?.textContent.includes("分析完成")
  ), null, { timeout: 120_000 });

  const state = await page.evaluate(() => ({
    leftSummary: document.querySelector("#left-import-summary")?.textContent,
    leftSelected: document.querySelector("#left-level-select")?.selectedOptions?.[0]?.textContent,
    leftOptionCount: document.querySelector("#left-level-select")?.options?.length,
    rightSummary: document.querySelector("#right-import-summary")?.textContent,
    status: document.querySelector("#analysis-status")?.textContent,
    rightSelected: document.querySelector("#right-level-select")?.selectedOptions?.[0]?.textContent,
    rightOptionCount: document.querySelector("#right-level-select")?.options?.length,
    model: document.querySelector("#model-select")?.value,
    leftId: document.querySelector("#left-metrics-title")?.textContent,
    rightId: document.querySelector("#right-metrics-title")?.textContent,
  }));
  assert.match(state.leftSummary, /内置羊关卡库/);
  assert.match(state.leftSelected, /900121.*参考图快照/);
  assert.equal(state.leftOptionCount, 38);
  assert.ok(state.rightSummary.includes(`${expectedImport.importedCount} 个工程关卡`));
  assert.equal(state.rightOptionCount, expectedImport.importedCount + 1);
  assert.match(state.rightSelected, /level_0020/);
  assert.match(state.status, /900121-reference vs level_0020-reference 分析完成 · 300 seeds/);
  assert.equal(state.model, "reference");
  assert.equal(state.leftId, "900121-reference");
  assert.equal(state.rightId, "level_0020-reference");

  const realLevelValue = await page.evaluate(() => (
    [...document.querySelector("#right-level-select").options].find((option) => (
      option.textContent.startsWith("level_0020 ·")
    ))?.value
  ));
  assert.notEqual(realLevelValue, undefined, "启动时应同时加载当前工程关卡库");
  await page.selectOption("#right-level-select", realLevelValue);
  await page.waitForFunction(() => (
    document.querySelector("#right-metrics-title")?.textContent === "level_0020"
    && !document.querySelector("#export-json")?.disabled
  ), null, { timeout: 60_000 });
  assert.equal(await page.textContent("#left-metrics-title"), "900121-reference");
  await page.selectOption("#model-select", "runtime");
  await page.waitForFunction(() => !document.querySelector("#export-json")?.disabled, null, { timeout: 60_000 });
  assert.equal(await page.textContent("#right-metrics-title"), "level_0020");
  assert.equal(await page.textContent("#left-metrics-title"), "900121-reference");
  assert.deepEqual(consoleErrors, []);

  console.log(JSON.stringify({ levelsPath, state, consoleErrors }, null, 2));
} finally {
  if (electronApp) await electronApp.close();
}
