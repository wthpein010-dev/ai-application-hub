import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseLevelDocument,
} from "../projects/paws-level-editor/core/level-adapter.mjs";

const DEFAULT_MODIFIED_AT = "2026-07-20T00:00:00.000Z";

function parseLevelJson(raw, fileName) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`关卡 JSON 损坏：${fileName}（${error.message}）`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`关卡根节点必须是对象：${fileName}`);
  }
  return value;
}

function createSummary(value, fileName, modifiedAt) {
  const document = parseLevelDocument(value, { fileName });
  return {
    id: document.id,
    fileName,
    name: document.name || fileName.replace(/\.json$/iu, ""),
    difficulty: document.difficulty,
    tileCount: document.tiles.length,
    layerCount: Math.max(0, ...document.tiles.map((tile) => tile.layer)),
    modifiedAt,
  };
}

export async function syncPublishedLevels({
  sourceDir,
  targetDir,
  defaultFileName,
  modifiedAt = DEFAULT_MODIFIED_AT,
}) {
  if (!sourceDir || !targetDir || !defaultFileName) {
    throw new Error("必须提供源目录、目标目录和默认关卡文件名。");
  }
  const names = (await readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  if (!names.length) {
    throw new Error("源目录没有 JSON 关卡。");
  }
  if (!names.includes(defaultFileName)) {
    throw new Error(`默认关卡不存在：${defaultFileName}`);
  }

  const prepared = await Promise.all(names.map(async (fileName) => {
    const raw = await readFile(join(sourceDir, fileName), "utf8");
    const value = parseLevelJson(raw, fileName);
    return {
      fileName,
      raw,
      summary: createSummary(value, fileName, modifiedAt),
    };
  }));
  const catalog = {
    defaultFileName,
    levels: prepared.map(({ summary }) => summary),
  };

  await mkdir(targetDir, { recursive: true });
  await Promise.all(prepared.map(({ fileName, raw }) =>
    writeFile(join(targetDir, fileName), raw, "utf8")));
  await writeFile(
    join(targetDir, "index.json"),
    `${JSON.stringify(catalog, null, 2)}\n`,
    "utf8",
  );
  return catalog;
}

async function runCli() {
  const [sourceDir, targetDir, defaultFileName] = process.argv.slice(2);
  if (!sourceDir || !targetDir || !defaultFileName) {
    throw new Error(
      "用法：node scripts/sync-paws-published-levels.mjs <源目录> <目标目录> <默认文件名>",
    );
  }
  const catalog = await syncPublishedLevels({
    sourceDir: resolve(sourceDir),
    targetDir: resolve(targetDir),
    defaultFileName,
  });
  console.log(
    `Synced ${catalog.levels.length} levels; default=${catalog.defaultFileName}`,
  );
}

if (process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
