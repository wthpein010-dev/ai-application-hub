import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sheepRaw from "../src/data/sheep-900121.json" with { type: "json" };
import { analyzeLevel, compareReports } from "../src/analysis/report.js";
import { hasValidAverageDeadlockProgress } from "../src/analysis/verification.js";
import { importLevelFiles } from "../src/io/import-levels.js";
import { normalizeSheepLevel } from "../src/model/normalize.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultLevelsPath = "E:\\Mahjong\\PawsHomeClient\\Assets\\Editor\\Res\\Config\\Gameplay\\EditorLevels";
const levelsPath = path.resolve(process.argv[2] ?? defaultLevelsPath);

async function collectFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, root));
    } else if (entry.isFile()) {
      files.push({
        name: entry.name,
        webkitRelativePath: path.relative(path.dirname(root), absolutePath).replaceAll(path.sep, "/"),
        text: () => readFile(absolutePath, "utf8"),
      });
    }
  }
  return files;
}

function finiteTree(value, location = "report") {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${location} 必须是有限数值`);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => finiteTree(entry, `${location}[${index}]`));
  } else {
    for (const [key, entry] of Object.entries(value)) finiteTree(entry, `${location}.${key}`);
  }
}

function assertFinite(value, location) {
  assert.ok(Number.isFinite(value), `${location} 必须是有限数值`);
}

function assertBand(band, location) {
  assert.ok(band && typeof band === "object", `${location} 指标缺失`);
  for (const percentile of ["p10", "p50", "p90"]) {
    assertFinite(band[percentile], `${location}.${percentile}`);
  }
}

function assertScalarMetrics(report, label) {
  assertBand(report.metrics.mc25, `${label}.metrics.mc25`);
  assertBand(report.metrics.mc50, `${label}.metrics.mc50`);
  for (const key of ["openingV", "completionRate"]) {
    assertFinite(report.metrics[key], `${label}.metrics.${key}`);
  }
  assert.ok(report.metrics.midRiver, `${label}.metrics.midRiver 指标缺失`);
  assertFinite(report.metrics.midRiver.lower, `${label}.metrics.midRiver.lower`);
  assertFinite(report.metrics.midRiver.upper, `${label}.metrics.midRiver.upper`);
  assert.ok(
    hasValidAverageDeadlockProgress(report.simulation),
    `${label}.simulation.averageDeadlockProgress 与 deadlockedCount 不一致`,
  );
}

const imported = await importLevelFiles(await collectFiles(levelsPath));
assert.equal(imported.levels.length, 31, "当前正式目录应导入 31 个关卡");
assert.equal(imported.errors.length, 0, "正式关卡不应包含损坏 JSON");
assert.equal(imported.selectedLevel?.id, "level_0020", "应默认选择 level_0020");

const sheep = normalizeSheepLevel(sheepRaw);
const sheepSummary = {
  tiles: sheep.tiles.length,
  layers: new Set(sheep.tiles.map((tile) => tile.layer)).size,
  types: sheep.rules.fullTypeMax,
};
assert.deepEqual(sheepSummary, { tiles: 258, layers: 23, types: 15 });

const analysisOptions = {
  seeds: 300,
  traySlots: 1,
  policy: "greedy",
  riverRestarts: 20,
};
const sheepReport = analyzeLevel(sheep, analysisOptions);
assertScalarMetrics(sheepReport, "sheep");

const level20 = imported.selectedLevel;
const level20Summary = {
  tiles: level20.tiles.length,
  layers: new Set(level20.tiles.map((tile) => tile.layer)).size,
  fullTypeMin: level20.rules.fullTypeMin,
  fullTypeMax: level20.rules.fullTypeMax,
};
assert.deepEqual(level20Summary, {
  tiles: 368,
  layers: 21,
  fullTypeMin: 1,
  fullTypeMax: 19,
});

const startedAt = performance.now();
const report = analyzeLevel(level20, analysisOptions);
for (const curve of ["riverUpper", "riverLower", "expected", "mc"]) {
  assert.ok(report.curves[curve].length > 0, `${curve} 曲线不能为空`);
}
for (const metric of ["openingV", "mc25", "mc50", "midRiver", "completionRate", "averageDeadlockProgress"]) {
  assert.notEqual(report.metrics[metric], undefined, `${metric} 指标缺失`);
}
finiteTree(report);
assertScalarMetrics(report, "level_0020");

const comparison = compareReports(sheepReport, report);
const serializedComparison = JSON.stringify(comparison);
const parsedComparison = JSON.parse(serializedComparison);
assert.equal(parsedComparison.schemaVersion, "vcurve-comparison/1");
assert.equal(parsedComparison.sheep.schemaVersion, "vcurve-report/1");
assert.equal(parsedComparison.paws.schemaVersion, "vcurve-report/1");
assert.equal(parsedComparison.sheep.level.id, "900121");
assert.equal(parsedComparison.paws.level.id, "level_0020");
assertScalarMetrics(parsedComparison.sheep, "comparison.sheep");
assertScalarMetrics(parsedComparison.paws, "comparison.paws");

console.log(JSON.stringify({
  projectRoot,
  levelsPath,
  imported: imported.levels.length,
  ignored: imported.ignored.length,
  warnings: imported.warningCount,
  sheep: sheepSummary,
  level20: level20Summary,
  analysis: {
    seeds: report.options.seeds,
    mcPoints: report.curves.mc.length,
    completionRate: report.metrics.completionRate,
    averageDeadlockProgress: report.metrics.averageDeadlockProgress,
    elapsedMs: Math.round(performance.now() - startedAt),
  },
  comparison: {
    schemaVersion: parsedComparison.schemaVersion,
    serializedBytes: Buffer.byteLength(serializedComparison),
  },
}, null, 2));
