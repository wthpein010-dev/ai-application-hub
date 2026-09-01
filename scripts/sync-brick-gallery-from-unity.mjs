import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultProjectRoot = join(repositoryRoot, "projects", "brick-character-copy-preview");
const configRoot = join("Assets", "GameRes", "Runtime", "ConfigData");
const skinRoot = join("Assets", "GameRes", "Runtime", "Textures", "Skin");
const atlasRoot = join("Assets", "GameRes", "Runtime", "UI", "AtlasSystem", "Sprites", "Atlas1");
const layerKinds = ["block", "body", "head", "dress"];
const uiAssets = [
  "save1.png",
  "save2.png",
  "save_btn1.png",
  "save_btn2.png",
  "tujian_btn_bright.png",
  "tujian_btn_dark.png",
  "tujian_btn_turn.png",
  "tujian_jues_save1.png",
  "tujian_jues_save2.png",
  "tujian_juese_kuang.png",
  "tujian_juese_title.png",
  "tujian_juese_turn.png",
  "tujian_kuang_juese.png",
  "tujian_kuang_juese2.png",
  "tujian_kuang_name.png",
  "tujian_save_xiao.png",
  "tujian_save_xiao2.png",
  "tujian_sousuo.png",
  "tujian_xuanzhong.png",
];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function requiredText(language, key, label) {
  const value = language.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing ${label} localization for ${key}`);
  }
  return value;
}

function safeAssetName(value, kind, blockId) {
  const asset = String(value || "");
  if (!asset) return "";
  if (basename(asset) !== asset || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(asset)) {
    throw new Error(`Unsafe ${kind} asset name for block ${blockId}: ${asset}`);
  }
  return asset;
}

export async function buildBrickGalleryData({ unityRoot = process.env.PAWS_HOME_CLIENT_ROOT } = {}) {
  if (!unityRoot) throw new Error("Set PAWS_HOME_CLIENT_ROOT to the local Unity project root");
  const root = resolve(unityRoot);
  const [skins, blocks, languages] = await Promise.all([
    readJson(join(root, configRoot, "cfg_gdblockskin.json")),
    readJson(join(root, configRoot, "cfg_gdblock.json")),
    readJson(join(root, configRoot, "cfg_gdlanguage.json")),
  ]);
  const blocksById = new Map(blocks.map((block) => [Number(block.id), block]));
  const language = new Map(languages.map((entry) => [entry.id, entry.zh]));
  const visible = skins
    .filter((skin) => String(skin.show) === "1")
    .sort((left, right) => Number(left.stringsequence) - Number(right.stringsequence));

  if (visible.length !== 45) throw new Error(`Expected 45 visible brick characters, received ${visible.length}`);

  const characters = visible.map((skin, index) => {
    const block = blocksById.get(Number(skin.blockid));
    if (!block) throw new Error(`Missing block configuration ${skin.blockid}`);
    const sequence = Number(skin.stringsequence);
    if (sequence !== index + 1) throw new Error(`Expected sequence ${index + 1}, received ${sequence}`);
    return {
      id: Number(skin.id),
      blockId: Number(skin.blockid),
      sequence,
      name: requiredText(language, skin.blockname, "name"),
      unlockDesc: requiredText(language, skin.UnlockDesc, "unlock description"),
      galleryDesc: requiredText(language, skin.GalleryDesc, "gallery description"),
      layers: Object.fromEntries(layerKinds.map((kind) => [kind, safeAssetName(block[kind], kind, block.id)])),
    };
  });

  if (new Set(characters.map(({ id }) => id)).size !== characters.length) throw new Error("Duplicate skin IDs");
  if (new Set(characters.map(({ blockId }) => blockId)).size !== characters.length) throw new Error("Duplicate block IDs");
  return characters;
}

async function copyReferencedLayers(characters, unityRoot, projectRoot) {
  for (const kind of layerKinds) {
    const targetDirectory = join(projectRoot, "assets", "skin", kind);
    await mkdir(targetDirectory, { recursive: true });
    const assets = [...new Set(characters.map((character) => character.layers[kind]).filter(Boolean))].sort();
    const desiredFiles = assets.map((asset) => `${asset}.png`);
    await Promise.all(assets.map((asset) => copyFile(
      join(unityRoot, skinRoot, kind, `${asset}.png`),
      join(targetDirectory, `${asset}.png`),
    )));
    await pruneManagedPngs(targetDirectory, desiredFiles);
  }
}

async function pruneManagedPngs(targetDirectory, desiredFiles) {
  const desired = new Set(desiredFiles);
  const entries = await readdir(targetDirectory, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && /\.png$/iu.test(entry.name) && !desired.has(entry.name))
    .map((entry) => rm(join(targetDirectory, entry.name), { force: true })));
}

async function copyUiAssets(unityRoot, projectRoot) {
  const targetDirectory = join(projectRoot, "assets", "ui");
  await mkdir(targetDirectory, { recursive: true });
  await Promise.all(uiAssets.map((asset) => copyFile(join(unityRoot, atlasRoot, asset), join(targetDirectory, asset))));
  await pruneManagedPngs(targetDirectory, uiAssets);
}

export async function syncBrickGallery({
  unityRoot = process.env.PAWS_HOME_CLIENT_ROOT,
  projectRoot = defaultProjectRoot,
} = {}) {
  if (!unityRoot) throw new Error("Set PAWS_HOME_CLIENT_ROOT to the local Unity project root");
  const resolvedUnityRoot = resolve(unityRoot);
  const resolvedProjectRoot = resolve(projectRoot);
  const characters = await buildBrickGalleryData({ unityRoot: resolvedUnityRoot });
  await copyReferencedLayers(characters, resolvedUnityRoot, resolvedProjectRoot);
  await copyUiAssets(resolvedUnityRoot, resolvedProjectRoot);
  const dataPath = join(resolvedProjectRoot, "data", "characters.json");
  await mkdir(dirname(dataPath), { recursive: true });
  await writeFile(dataPath, `${JSON.stringify(characters, null, 2)}\n`, "utf8");
  return characters;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const characters = await syncBrickGallery();
  console.log(`Synced ${characters.length} brick characters from the Unity project.`);
}
