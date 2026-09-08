import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronExecutable from "electron";
import { _electron as electron } from "playwright-core";
import { importLevelFiles } from "../src/io/import-levels.js";
import { readBundledLevelFiles } from "../desktop/bundled-levels.cjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const levelsPath = path.resolve(
  process.argv[2] ?? "E:\\Mahjong\\PawsHomeClient\\Assets\\Editor\\Res\\Config\\Gameplay\\EditorLevels",
);
const leftFixture = await readFile(path.join(root, "tests", "fixtures", "paws-small.json"));
const leftFixtureName = JSON.parse(leftFixture.toString("utf8")).name;
const sourcePayload = await readBundledLevelFiles([levelsPath]);
const expectedImport = await importLevelFiles(sourcePayload.files.map((file) => ({
  ...file, text: async () => file.text,
})));
const referenceCurves = JSON.parse(await readFile(path.join(root, "tests", "fixtures", "reference-curves.json"), "utf8"));
const temp = await mkdtemp(path.join(os.tmpdir(), "vcurve-electron-"));
const qaDirectory = path.join(root, "artifacts", ".qa-temp");
const screenshots = {
  reference: path.join(qaDirectory, "vcurve-1.5.0-reference.png"),
  runtime: path.join(qaDirectory, "vcurve-1.5.0-runtime.png"),
  desktop: path.join(qaDirectory, "vcurve-1.5.0-desktop.png"),
  compact: path.join(qaDirectory, "vcurve-1.5.0-compact.png"),
  mobile: path.join(qaDirectory, "vcurve-1.5.0-mobile.png"),
  importedSheep: path.join(qaDirectory, "vcurve-1.5.0-imported-sheep.png"),
};
let electronApp;

async function completed(page) {
  await page.waitForFunction(() => !document.querySelector("#export-json")?.disabled, null, { timeout: 60_000 });
}

async function exportedJson(page, name) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#export-json", { force: true }),
  ]);
  const destination = path.join(temp, name);
  await download.saveAs(destination);
  return JSON.parse(await readFile(destination, "utf8"));
}

function roundedCurve(points, field = "y") {
  return points.map((point) => ({
    x: Number((point.progress * 100).toFixed(2)),
    y: Number(point[field].toFixed(2)),
  }));
}

function verifyReferenceReport(comparison, leftId = "900121-reference") {
  assert.equal(comparison.model.id, "reference");
  assert.equal(comparison.model.version, "1.5.0");
  assert.equal(comparison.model.progressDefinition, "board-departed");
  assert.equal(comparison.left.level.id, leftId);
  assert.equal(comparison.right.level.id, "level_0020-reference");
  for (const [key, report] of [["sheep", comparison.left], ["paws", comparison.right]]) {
    const original = referenceCurves[key];
    assert.deepEqual(roundedCurve(report.curves.expected.filter((point) => point.removed % 2 === 0)), original.ev);
    assert.deepEqual(roundedCurve(report.curves.riverUpper), original.hi);
    const lower = roundedCurve(report.curves.riverLower);
    assert.deepEqual(lower.slice(0, original.lo.length), original.lo);
    assert.ok(lower.length > original.lo.length, "河道下界应扩展到后续重启的已观察尾段");
    for (const field of ["p10", "p50", "p90"]) {
      assert.deepEqual(roundedCurve(report.curves.mc, field), original[field]);
    }
  }
}

try {
  electronApp = await electron.launch({
    acceptDownloads: true,
    executablePath: electronExecutable,
    args: [path.join(root, "desktop", "main.cjs")],
    cwd: root,
    env: { ...process.env, V_CURVE_E2E: "1" },
  });
  const page = await electronApp.firstWindow();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.waitForSelector("#right-folder-input");
  await completed(page);
  assert.equal(await page.inputValue("#model-select"), "reference");
  await mkdir(qaDirectory, { recursive: true });
  const referenceJson = await exportedJson(page, "reference-initial.json");
  verifyReferenceReport(referenceJson);
  await page.screenshot({ path: screenshots.reference, fullPage: true, animations: "disabled" });

  await page.selectOption("#model-select", "runtime");
  await completed(page);
  const runtimeJson = await exportedJson(page, "runtime-same-selection.json");
  assert.equal(runtimeJson.model.id, "runtime");
  assert.equal(runtimeJson.model.progressDefinition, "removed");
  assert.equal(runtimeJson.left.level.id, referenceJson.left.level.id);
  assert.equal(runtimeJson.right.level.id, referenceJson.right.level.id);
  await page.screenshot({ path: screenshots.runtime, fullPage: true, animations: "disabled" });
  await page.selectOption("#model-select", "reference");
  await completed(page);
  await page.fill("#seed-input", "20");
  await page.setInputFiles("#right-folder-input", levelsPath);
  try {
    await page.waitForFunction((count) => (
      document.querySelector("#right-import-summary")?.textContent.includes(`已导入 ${count} 个关卡`)
    ), expectedImport.importedCount);
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      files: document.querySelector("#right-folder-input")?.files?.length,
      summary: document.querySelector("#right-import-summary")?.textContent,
      status: document.querySelector("#analysis-status")?.textContent,
    }));
    throw new Error(`右侧导入未完成：${JSON.stringify({ diagnostic, consoleErrors })}`, { cause: error });
  }
  await page.waitForFunction(() => (
    document.querySelector("#analysis-status")?.textContent.includes("分析完成")
  ), null, { timeout: 120_000 });

  const state = await page.evaluate(() => ({
    leftSummary: document.querySelector("#left-import-summary")?.textContent,
    rightSummary: document.querySelector("#right-import-summary")?.textContent,
    status: document.querySelector("#analysis-status")?.textContent,
    leftSelected: document.querySelector("#left-level-select")?.selectedOptions?.[0]?.textContent,
    leftOptions: [...document.querySelector("#left-level-select").options]
      .map((option) => option.textContent),
    rightSelected: document.querySelector("#right-level-select")?.selectedOptions?.[0]?.textContent,
    leftTitle: document.querySelector("#left-chart-title")?.textContent,
    rightTitle: document.querySelector("#right-chart-title")?.textContent,
    metricHeaders: [
      document.querySelector("#left-metrics-title")?.textContent,
      document.querySelector("#right-metrics-title")?.textContent,
    ],
    title: document.title,
  }));
  assert.match(state.leftSummary, /内置羊关卡库/);
  assert.ok(state.rightSummary.includes(`已导入 ${expectedImport.importedCount} 个关卡`));
  assert.ok(state.rightSummary.includes(`${expectedImport.warningCount} 项警告`));
  assert.match(state.leftSelected, /900121.*参考图快照/);
  assert.equal(state.leftOptions.length, 38);
  assert.ok(state.leftOptions.some((label) => label.includes("羊 90014（版本1/2）")));
  assert.ok(state.leftOptions.some((label) => label.includes("羊 90014（版本2/2）")));
  assert.ok(state.leftOptions.some((label) => label.includes("羊 900121（备用）")));
  assert.ok(state.leftOptions.some((label) => label.includes("参考图快照")));
  assert.match(state.rightSelected, /level_0020 · 368 砖 · 21 层/);
  assert.match(state.status, /900121-reference vs level_0020 分析完成 · 20 seeds/);
  assert.match(state.leftTitle, /羊 900121.*参考图快照/);
  assert.equal(state.rightTitle, expectedImport.selectedLevel.name);
  assert.deepEqual(state.metricHeaders, ["900121-reference", "level_0020"]);
  assert.equal(state.title, "V 曲线对比工具");
  assert.deepEqual(consoleErrors, []);

  const desktopLayout = await page.evaluate(() => {
    const leftImport = document.querySelector('.import-panel[data-side="left"]').getBoundingClientRect();
    const rightImport = document.querySelector('.import-panel[data-side="right"]').getBoundingClientRect();
    const leftChart = document.querySelector('.chart-card[data-side="left"]').getBoundingClientRect();
    const rightChart = document.querySelector('.chart-card[data-side="right"]').getBoundingClientRect();
    return {
      noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      importsSideBySide: leftImport.right <= rightImport.left + 1,
      chartsSideBySide: leftChart.right <= rightChart.left + 1,
    };
  });
  assert.deepEqual(desktopLayout, { noOverflow: true, importsSideBySide: true, chartsSideBySide: true });

  await page.setInputFiles("#left-file-input", {
    name: "level_0010.json",
    mimeType: "application/json",
    buffer: leftFixture,
  });
  await page.waitForFunction(() => document.querySelector("#left-import-summary")?.textContent.includes("已导入 1 个关卡"));
  await page.waitForFunction(() => document.querySelector("#analysis-status")?.textContent.includes("level_0010 vs level_0020 分析完成"), null, { timeout: 120_000 });
  const leftImported = await page.evaluate(() => ({
    leftOptions: [...document.querySelector("#left-level-select").options].map((option) => option.textContent),
    leftTitle: document.querySelector("#left-chart-title")?.textContent,
    rightTitle: document.querySelector("#right-chart-title")?.textContent,
    rightSelected: document.querySelector("#right-level-select")?.selectedOptions?.[0]?.textContent,
  }));
  assert.equal(leftImported.leftOptions.length, 38);
  assert.ok(leftImported.leftOptions.some((label) => label.includes("羊 90009")));
  assert.ok(leftImported.leftOptions.some((label) => label.includes("羊 900121（备用）")));
  assert.ok(leftImported.leftOptions.some((label) => label.includes("level_0010")));
  assert.equal(leftImported.leftTitle, leftFixtureName);
  assert.equal(leftImported.rightTitle, expectedImport.selectedLevel.name);
  assert.match(leftImported.rightSelected, /level_0020/);

  await page.selectOption("#right-level-select", "0");
  await completed(page);
  assert.equal(await page.textContent("#left-metrics-title"), "level_0010");
  assert.equal(await page.textContent("#right-metrics-title"), expectedImport.levels[0].id);
  assert.equal(await page.textContent("#left-chart-title"), leftFixtureName);
  assert.equal(await page.textContent("#right-chart-title"), expectedImport.levels[0].name);

  const sheep90009Value = await page.evaluate(() => (
    [...document.querySelector("#left-level-select").options].find((option) => option.textContent.startsWith("羊 90009 ·"))?.value
  ));
  assert.notEqual(sheep90009Value, undefined);
  await page.selectOption("#left-level-select", sheep90009Value);
  await completed(page);
  assert.equal(await page.textContent("#left-metrics-title"), "90009");
  assert.equal(await page.textContent("#right-metrics-title"), expectedImport.levels[0].id);
  assert.equal(await page.textContent("#left-chart-title"), "羊 90009");
  assert.equal(await page.textContent("#right-chart-title"), expectedImport.levels[0].name);

  await mkdir(qaDirectory, { recursive: true });

  const jsonPath = path.join(temp, "comparison.json");
  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#export-json", { force: true }),
  ]);
  await jsonDownload.saveAs(jsonPath);
  const json = JSON.parse(await readFile(jsonPath, "utf8"));
  assert.equal(json.schemaVersion, "vcurve-comparison/2");
  assert.equal(json.left.level.id, "90009");
  assert.equal(json.right.level.id, "level_0001");

  const pngPath = path.join(temp, "comparison.png");
  const [pngDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.click("#export-png", { force: true }),
  ]);
  await pngDownload.saveAs(pngPath);
  const png = await readFile(pngPath);
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.ok(png.readUInt32BE(16) >= 2000);
  assert.ok(png.readUInt32BE(20) >= 2000);
  await page.screenshot({ path: screenshots.desktop, fullPage: true, animations: "disabled" });

  await page.setViewportSize({ width: 1000, height: 900 });
  const compactLayout = await page.evaluate(() => {
    const leftImport = document.querySelector('.import-panel[data-side="left"]').getBoundingClientRect();
    const rightImport = document.querySelector('.import-panel[data-side="right"]').getBoundingClientRect();
    const leftChart = document.querySelector('.chart-card[data-side="left"]').getBoundingClientRect();
    const rightChart = document.querySelector('.chart-card[data-side="right"]').getBoundingClientRect();
    return {
      noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      importsStacked: leftImport.bottom <= rightImport.top + 1,
      chartsStacked: leftChart.bottom <= rightChart.top + 1,
    };
  });
  assert.deepEqual(compactLayout, { noOverflow: true, importsStacked: true, chartsStacked: true });
  await page.screenshot({ path: screenshots.compact, fullPage: false, animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
  await page.screenshot({ path: screenshots.mobile, fullPage: true, animations: "disabled" });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  await page.setInputFiles("#right-file-input", {
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await page.waitForFunction(() => document.querySelector("#right-import-summary")?.textContent.includes("已导入 0 个关卡"));
  const invalidImport = await page.evaluate(() => ({
    status: document.querySelector("#analysis-status")?.textContent,
    rightTitle: document.querySelector("#right-chart-title")?.textContent,
    rightOptions: document.querySelector("#right-level-select")?.options?.length,
    exportJsonDisabled: document.querySelector("#export-json")?.disabled,
    exportPngDisabled: document.querySelector("#export-png")?.disabled,
  }));
  assert.match(invalidImport.status, /右侧未发现有效关卡；1 个文件解析失败/);
  assert.equal(invalidImport.rightTitle, "右侧待选关卡");
  assert.equal(invalidImport.rightOptions, 0);
  assert.equal(invalidImport.exportJsonDisabled, true);
  assert.equal(invalidImport.exportPngDisabled, true);

  const leftLongId = `left-${"L".repeat(180)}`;
  const rightLongId = `right-${"R".repeat(180)}`;
  const fixture = JSON.parse(leftFixture.toString("utf8"));
  await page.setInputFiles("#right-file-input", {
    name: "right-long.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...fixture, id: rightLongId, name: `Paws ${rightLongId}` })),
  });
  await page.setInputFiles("#left-file-input", {
    name: "left-long.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...fixture, id: leftLongId, name: `Paws ${leftLongId}` })),
  });
  await page.waitForFunction(({ leftId, rightId }) => (
    document.querySelector("#left-chart-title")?.textContent === `Paws ${leftId}`
    && document.querySelector("#right-chart-title")?.textContent === `Paws ${rightId}`
    && !document.querySelector("#export-json")?.disabled
  ), { leftId: leftLongId, rightId: rightLongId }, { timeout: 120_000 });
  await page.setViewportSize({ width: 390, height: 844 });
  const longIdLayout = await page.evaluate(() => ({
    noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    leftTitleContained: document.querySelector("#left-chart-title").getBoundingClientRect().right
      <= document.querySelector('.chart-card[data-side="left"]').getBoundingClientRect().right + 1,
    rightTitleContained: document.querySelector("#right-chart-title").getBoundingClientRect().right
      <= document.querySelector('.chart-card[data-side="right"]').getBoundingClientRect().right + 1,
  }));
  assert.deepEqual(longIdLayout, {
    noOverflow: true,
    leftTitleContained: true,
    rightTitleContained: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const [longIdDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#export-json", { force: true }),
  ]);
  assert.ok(Array.from(longIdDownload.suggestedFilename()).length <= 150);

  // Restoring the reference sample is an actual user operation after arbitrary imports.
  await page.click("#load-reference-sample");
  await completed(page);
  const restored = await exportedJson(page, "reference-restored.json");
  verifyReferenceReport(restored);
  assert.equal(await page.inputValue("#seed-input"), "300");

  // Upload the user's actual levelData JSON through the visible import input.
  await page.setInputFiles("#left-file-input", path.join(root, "src", "data", "sheep-900121.json"));
  await page.waitForFunction(() => (
    document.querySelector("#left-metrics-title")?.textContent === "900121"
    && !document.querySelector("#export-json")?.disabled
  ), null, { timeout: 60_000 });
  const importedSheep = await exportedJson(page, "reference-imported-900121.json");
  verifyReferenceReport(importedSheep, "900121");
  await page.screenshot({ path: screenshots.importedSheep, fullPage: true, animations: "disabled" });

  await page.setInputFiles("#left-file-input", {
    name: "game_map.json",
    mimeType: "application/json",
    buffer: await readFile(path.join(root, "src", "data", "sheep-game-map.json")),
  });
  await page.waitForFunction(() => (
    document.querySelector("#left-import-summary")?.textContent.includes("已导入 36 个关卡")
    && !document.querySelector("#export-json")?.disabled
  ), null, { timeout: 60_000 });
  const importedLibrary = await page.evaluate(() => ({
    options: [...document.querySelector("#left-level-select").options].map((option) => option.textContent),
    leftId: document.querySelector("#left-metrics-title")?.textContent,
    rightId: document.querySelector("#right-metrics-title")?.textContent,
  }));
  assert.equal(importedLibrary.options.length, 73, "37个固定库条目 + 36个实际导入版本");
  assert.equal(new Set(importedLibrary.options.slice(-36)).size, 36, "导入库的36个版本必须独立可选");
  assert.equal(importedLibrary.leftId, "90009");
  assert.equal(importedLibrary.rightId, "level_0020-reference");
  assert.deepEqual(consoleErrors, []);

  console.log(JSON.stringify({
    levelsPath,
    referenceCurvesVerified: 12,
    modelSwitchPreservesSelections: true,
    originalSheepFileCurvesVerified: 6,
    gameMapVersionsImported: 36,
    state,
    jsonSchema: json.schemaVersion,
    png: {
      bytes: png.length,
      width: png.readUInt32BE(16),
      height: png.readUInt32BE(20),
    },
    screenshots,
    invalidImport,
    longIdLayout,
    longIdFilename: longIdDownload.suggestedFilename(),
  }, null, 2));
} finally {
  if (electronApp) await electronApp.close();
  await rm(temp, { recursive: true, force: true });
}
