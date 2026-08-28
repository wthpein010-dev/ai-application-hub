import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronExecutable from "electron";
import { _electron as electron } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const levelsPath = path.resolve(
  process.argv[2] ?? "E:\\Mahjong\\PawsHomeClient\\Assets\\Editor\\Res\\Config\\Gameplay\\EditorLevels",
);
const temp = await mkdtemp(path.join(os.tmpdir(), "vcurve-electron-"));
let electronApp;

try {
  electronApp = await electron.launch({
    acceptDownloads: true,
    executablePath: electronExecutable,
    args: [path.join(root, "desktop", "main.cjs")],
    cwd: root,
    env: { ...process.env, V_CURVE_E2E: "1" },
  });
  const page = await electronApp.firstWindow();
  await page.waitForSelector("#folder-input");
  await page.setInputFiles("#folder-input", levelsPath);
  await page.waitForFunction(() => (
    document.querySelector("#import-summary")?.textContent.includes("已导入 25 个关卡")
  ));
  await page.waitForFunction(() => (
    document.querySelector("#analysis-status")?.textContent.includes("分析完成")
  ), null, { timeout: 120_000 });

  const state = await page.evaluate(() => ({
    summary: document.querySelector("#import-summary")?.textContent,
    status: document.querySelector("#analysis-status")?.textContent,
    selected: document.querySelector("#level-select")?.selectedOptions?.[0]?.textContent,
    title: document.title,
  }));
  assert.match(state.summary, /已导入 25 个关卡 · 忽略 92 个文件 · 0 项警告/);
  assert.match(state.selected, /level_0020 · 280 砖 · 22 层/);
  assert.match(state.status, /level_0020 分析完成 · 300 seeds/);
  assert.equal(state.title, "V 曲线对比工具");

  const jsonPath = path.join(temp, "comparison.json");
  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#export-json"),
  ]);
  await jsonDownload.saveAs(jsonPath);
  const json = JSON.parse(await readFile(jsonPath, "utf8"));
  assert.equal(json.schemaVersion, "vcurve-comparison/1");
  assert.equal(json.paws.level.id, "level_0020");

  const pngPath = path.join(temp, "comparison.png");
  const [pngDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.click("#export-png"),
  ]);
  await pngDownload.saveAs(pngPath);
  const png = await readFile(pngPath);
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.ok(png.readUInt32BE(16) >= 2000);
  assert.ok(png.readUInt32BE(20) >= 2000);

  console.log(JSON.stringify({
    levelsPath,
    state,
    jsonSchema: json.schemaVersion,
    png: {
      bytes: png.length,
      width: png.readUInt32BE(16),
      height: png.readUInt32BE(20),
    },
  }, null, 2));
} finally {
  if (electronApp) await electronApp.close();
  await rm(temp, { recursive: true, force: true });
}
