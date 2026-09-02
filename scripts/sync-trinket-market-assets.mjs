import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve } from "node:path";

const HAND_FILE = /^hand_([1-9]\d*)\.png$/i;

function newItem(id) {
  return {
    id,
    name: `随身小物 ${id}`,
    pinyin: `hand${id}`,
    rarity: "待配置",
    acquired: 0,
    value: 0,
    change: 0,
    image: `./assets/items/hand_${id}.png`,
    ownedCount: 1,
    obtainedAt: null,
    acquisitionText: "获取方式待配置",
    isNew: true,
    giftable: false,
    activitySort: null,
    slot: "hand",
    needsNaming: true,
  };
}

async function fileChanged(source, target) {
  try {
    const [from, to] = await Promise.all([readFile(source), readFile(target)]);
    return !from.equals(to);
  } catch {
    return true;
  }
}

export async function syncTrinketCatalog({ sourceRoot, projectRoot }) {
  const source = resolve(sourceRoot);
  const project = resolve(projectRoot);
  const itemsDir = join(project, "assets", "items");
  const dataPath = join(project, "data", "items.json");
  const entries = await readdir(source, { withFileTypes: true });
  const handFiles = entries
    .filter((entry) => entry.isFile() && HAND_FILE.test(entry.name))
    .map((entry) => ({ id: Number(HAND_FILE.exec(entry.name)[1]), name: entry.name }))
    .sort((left, right) => left.id - right.id);
  const items = JSON.parse(await readFile(dataPath, "utf8"));
  const byId = new Map(items.map((item) => [item.id, item]));
  const addedIds = [];
  const copiedIds = [];

  await mkdir(itemsDir, { recursive: true });
  for (const hand of handFiles) {
    const sourcePath = join(source, hand.name);
    const targetPath = join(itemsDir, hand.name);
    if (await fileChanged(sourcePath, targetPath)) {
      await copyFile(sourcePath, targetPath);
      copiedIds.push(hand.id);
    }
    if (!byId.has(hand.id)) {
      const item = newItem(hand.id);
      items.push(item);
      byId.set(hand.id, item);
      addedIds.push(hand.id);
    }
  }

  items.sort((left, right) => left.id - right.id);
  await writeFile(dataPath, `${JSON.stringify(items, null, 2)}\n`);
  return { items, addedIds, copiedIds };
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (executedPath && resolve(fileURLToPath(import.meta.url)) === executedPath) {
  const sourceRoot = process.env.TRINKET_HAND_ROOT;
  if (!sourceRoot) throw new Error("TRINKET_HAND_ROOT is required");
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "projects", "trinket-market");
  const result = await syncTrinketCatalog({ sourceRoot, projectRoot });
  console.log(`Synced ${basename(sourceRoot)}: ${result.copiedIds.length} art files, ${result.addedIds.length} catalog items.`);
}
