import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBrickGalleryData } from "../scripts/sync-brick-gallery-from-unity.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = join(root, "projects", "brick-character-copy-preview");
const unityRoot = process.env.PAWS_HOME_CLIENT_ROOT;
const expectedNames = [
  "原皮战神", "黑帽快客", "白了个白兔", "堡堡店长", "草场从容哥", "超前毛线团", "拆家能手", "刺身店学徒", "冬帽草团子",
  "袋鼠专员", "F1车手", "粉拳家政师", "福气小猪", "黑镜麦霸总", "红帽亿点快", "哈吉米", "海风配送员", "火辣辣",
  "卷毛阿灰", "枯木逢春", "邻家甜妹", "萝卜界甜心", "练习生", "萝卜工头", "李旺财", "龙虾天妇罗", "流苏灯娘",
  "满眼心动", "咩羊姐", "毛线架构师", "奶油云朵", "清汤达人", "热量收藏家", "融化甜心", "神游小龙", "薯条二重奏",
  "桃之夭夭", "停播先生", "维特先生", "野生总裁", "鱼子酱小姐", "银壶和事佬", "嘴硬喵", "直爽虎姐", "早安先锋",
];

test("Unity join produces exactly the 45 approved visible characters in display order", { skip: !unityRoot }, async () => {
  const characters = await buildBrickGalleryData({ unityRoot });

  assert.equal(characters.length, 45);
  assert.deepEqual(characters.map((character) => character.sequence), Array.from({ length: 45 }, (_, index) => index + 1));
  assert.deepEqual(characters.map((character) => character.name), expectedNames);
  assert.equal(new Set(characters.map((character) => character.id)).size, 45);
  assert.equal(new Set(characters.map((character) => character.blockId)).size, 45);
  assert.deepEqual(characters[0], {
    id: 1,
    blockId: 100001,
    sequence: 1,
    name: "原皮战神",
    unlockDesc: "不加配饰自在生长，基础但绝不普通",
    galleryDesc: "没有配饰也敢直接出场，原皮才是最强皮肤。",
    layers: { block: "block_1", body: "body_1", head: "", dress: "" },
  });
  assert.equal(characters.at(-1).name, "早安先锋");
  assert.equal(characters.at(-1).galleryDesc, "眼睛还没睁，铃声先开工。");
});

test("generated public catalog contains the approved order and every referenced layer exists", () => {
  const generated = JSON.parse(readFileSync(join(projectRoot, "data", "characters.json"), "utf8"));

  assert.equal(generated.length, 45);
  assert.deepEqual(generated.map((character) => character.name), expectedNames);
  for (const character of generated) {
    for (const [kind, asset] of Object.entries(character.layers)) {
      if (!asset) continue;
      assert.equal(
        existsSync(resolve(projectRoot, "assets", "skin", kind, `${asset}.png`)),
        true,
        `${character.name} should bundle ${kind}/${asset}.png`,
      );
    }
  }
});

test("generated public catalog mirrors the current Unity checkout", { skip: !unityRoot }, async () => {
  const generated = JSON.parse(readFileSync(join(projectRoot, "data", "characters.json"), "utf8"));
  const source = await buildBrickGalleryData({ unityRoot });
  assert.deepEqual(generated, source);
});

test("public catalog contains no unresolved localization keys or local source paths", () => {
  const source = readFileSync(join(projectRoot, "data", "characters.json"), "utf8");
  const generated = JSON.parse(source);

  assert.doesNotMatch(source, /System_text_|PawsHomeClient|E:\\\\/i);
  assert.equal(generated.every(({ name, unlockDesc, galleryDesc }) => name && unlockDesc && galleryDesc), true);
});
