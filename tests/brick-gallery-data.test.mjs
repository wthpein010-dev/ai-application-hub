import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { buildBrickGalleryData, syncBrickGallery } from "../scripts/sync-brick-gallery-from-unity.mjs";
import { buildBrickGalleryDataFromSpreadsheets } from "../scripts/sync-brick-gallery-from-spreadsheets.mjs";
import { formatRewardDialogue } from "../projects/brick-character-copy-preview/components/character-view.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = join(root, "projects", "brick-character-copy-preview");
const unityRoot = process.env.PAWS_HOME_CLIENT_ROOT;
const spreadsheetDataRoot = process.env.PAWS_HOME_DATA_ROOT || "E:/Mahjong/PawsHomeData/data";
const previewSyncScript = join(root, "scripts", "sync-brick-character-previews.mjs");
const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const syntheticSpineAtlas = `character.png
size: 729,189
format: RGBA8888
filter: Linear,Linear
repeat: none
foot
  rotate: true
  xy: 681, 19
  size: 17, 10
  orig: 19, 12
  offset: 1, 1
  index: -1
leg1
  rotate: true
  xy: 697, 75
  size: 4, 20
  orig: 6, 22
  offset: 1, 1
  index: -1
leg2
  rotate: true
  xy: 697, 75
  size: 4, 20
  orig: 6, 22
  offset: 1, 1
  index: -1
`;
const malformedPngs = [
  ["signature-valid truncated PNG", Buffer.concat([transparentPng.subarray(0, 8), Buffer.alloc(8)])],
  ["CRC-corrupted PNG", (() => {
    const corrupted = Buffer.from(transparentPng);
    const idatOffset = corrupted.indexOf(Buffer.from("IDAT", "ascii"));
    corrupted[idatOffset + 4] ^= 0xff;
    return corrupted;
  })()],
  ["PNG without IEND", transparentPng.subarray(0, -12)],
];

test("victory speech fixes copy to one or two nine-character lines", () => {
  assert.equal(formatRewardDialogue("不加配饰自在生长，基础但绝不普通"), "不加配饰自在生长，\n基础但绝不普通");
  assert.equal(formatRewardDialogue("这是一句短台词"), "这是一句短台词");
  assert.equal(formatRewardDialogue("一二三四五六七八九一二三四五六七八九十"), "一二三四五六七八九\n一二三四五六七八…");
});

function fixtureCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function fixturePngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(fixtureCrc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function createResourceHeavyPng() {
  const width = 2048;
  const height = 2048;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * ((width * 4) + 1));
  return Buffer.concat([
    transparentPng.subarray(0, 8),
    fixturePngChunk("IHDR", header),
    fixturePngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    fixturePngChunk("IEND", Buffer.alloc(0)),
  ]);
}
const expectedUiAssets = [
  "save1.png", "save2.png", "save_btn1.png", "save_btn2.png", "tujian_btn_bright.png",
  "tujian_btn_dark.png", "tujian_btn_turn.png", "tujian_jues_save1.png", "tujian_jues_save2.png",
  "tujian_juese_kuang.png", "tujian_juese_title.png", "tujian_juese_turn.png", "tujian_kuang_juese.png",
  "tujian_kuang_juese2.png", "tujian_kuang_name.png", "tujian_save_xiao.png", "tujian_save_xiao2.png",
  "tujian_sousuo.png", "tujian_xuanzhong.png",
];
const expectedNames = [
  "原皮战神", "黑帽快客", "白了个白兔", "堡堡店长", "草场从容哥", "超前毛线团", "拆家能手", "刺身店学徒", "冬帽草团子",
  "袋鼠专员", "F1车手", "粉拳家政师", "福气小猪", "黑镜麦霸总", "红帽亿点快", "哈吉米", "海风配送员", "火辣辣",
  "卷毛阿灰", "枯木逢春", "邻家甜妹", "萝卜界甜心", "练习生", "萝卜工头", "李旺财", "龙虾天妇罗", "流苏灯娘",
  "满眼心动", "咩羊姐", "毛线架构师", "奶油云朵", "清汤达人", "热量收藏家", "融化甜心", "神游小龙", "薯条二重奏",
  "桃之夭夭", "停播先生", "维特先生", "野生总裁", "鱼子酱小姐", "银壶和事佬", "嘴硬喵", "直爽虎姐", "早安先锋",
];

async function createSyntheticUnityFixture({ firstBody = "", firstName = "角色01" } = {}) {
  const tempRoot = await mkdtemp(join(tmpdir(), "brick-gallery-sync-"));
  const syntheticUnityRoot = join(tempRoot, "unity");
  const syntheticProjectRoot = join(tempRoot, "public-project");
  const configRoot = join(syntheticUnityRoot, "Assets", "GameRes", "Runtime", "ConfigData");
  const atlasRoot = join(syntheticUnityRoot, "Assets", "GameRes", "Runtime", "UI", "AtlasSystem", "Sprites", "Atlas1");
  const levelWinAtlasRoot = join(syntheticUnityRoot, "Assets", "GameRes", "Runtime", "UI", "LevelWin", "Sprites", "Atlas1");
  const levelWinIgnoreRoot = join(syntheticUnityRoot, "Assets", "GameRes", "Runtime", "UI", "LevelWin", "Sprites", "AtlasIgnore");
  const spineRoot = join(syntheticUnityRoot, "Assets", "GameRes", "Runtime", "Spine", "Character");
  await Promise.all([
    mkdir(configRoot, { recursive: true }),
    mkdir(atlasRoot, { recursive: true }),
    mkdir(levelWinAtlasRoot, { recursive: true }),
    mkdir(levelWinIgnoreRoot, { recursive: true }),
    mkdir(spineRoot, { recursive: true }),
  ]);

  const skins = [];
  const blocks = [];
  const languages = [{ id: "unowned_shared", zh: "未获得说明" }];
  for (let index = 0; index < 45; index += 1) {
    const sequence = index + 1;
    const blockId = 100001 + index;
    skins.push({
      id: sequence,
      blockid: blockId,
      show: "1",
      stringsequence: sequence,
      blockname: `name_${sequence}`,
      UnownedDesc: "unowned_shared",
      UnlockDesc: `unlock_${sequence}`,
      GalleryDesc: `gallery_${sequence}`,
    });
    blocks.push({ id: blockId, block: "", body: index === 0 ? firstBody : "", head: "", dress: "" });
    languages.push(
      { id: `name_${sequence}`, zh: index === 0 ? firstName : `角色${String(sequence).padStart(2, "0")}` },
      { id: `unlock_${sequence}`, zh: `获取文案${sequence}` },
      { id: `gallery_${sequence}`, zh: `图鉴描述${sequence}` },
    );
  }
  await Promise.all([
    writeFile(join(configRoot, "cfg_gdblockskin.json"), JSON.stringify(skins), "utf8"),
    writeFile(join(configRoot, "cfg_gdblock.json"), JSON.stringify(blocks), "utf8"),
    writeFile(join(configRoot, "cfg_gdlanguage.json"), JSON.stringify(languages), "utf8"),
    writeFile(join(spineRoot, "character.png"), transparentPng),
    writeFile(join(spineRoot, "character.atlas.txt"), syntheticSpineAtlas, "utf8"),
    ...expectedUiAssets.map((asset) => writeFile(join(atlasRoot, asset), asset, "utf8")),
    ...["light.png", "public_share_icon.png"].map((asset) => writeFile(join(levelWinAtlasRoot, asset), transparentPng)),
    ...["shengli_pop1.png", "shengli_pop2.png"].map((asset) => writeFile(join(levelWinIgnoreRoot, asset), transparentPng)),
  ]);
  return { tempRoot, syntheticUnityRoot, syntheticProjectRoot };
}

function runPreviewSync(previewRoot, syntheticProjectRoot) {
  return spawnSync(process.execPath, [previewSyncScript], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      BRICK_CHARACTER_PREVIEW_ROOT: previewRoot,
      BRICK_GALLERY_PROJECT_ROOT: syntheticProjectRoot,
    },
  });
}

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
    unownedDesc: "常规模式或活动模式通关后获得",
    unlockDesc: "不加配饰自在生长，基础但绝不普通",
    galleryDesc: "没有配饰也敢直接出场，原皮才是最强皮肤。",
    sourceKeys: {
      name: "System_text_name_100001",
      unowned: "System_text_76",
      unlock: "System_text_100001",
      gallery: "System_text_100001_1",
    },
    layers: { block: "block_1", body: "body_1", head: "", dress: "" },
  });
  assert.equal(characters.at(-1).name, "早安先锋");
  assert.equal(characters.at(-1).galleryDesc, "两个铃铛轮流值班，谁也别想把早晨按掉。");
});

test("spreadsheet catalog resolves all visible skin copy from blockskin and language", {
  skip: !existsSync(join(spreadsheetDataRoot, "blockskin.xlsx")) || !existsSync(join(spreadsheetDataRoot, "language.xlsx")),
}, async () => {
  const characters = await buildBrickGalleryDataFromSpreadsheets({ dataRoot: spreadsheetDataRoot });

  assert.equal(characters.length, 45);
  assert.deepEqual(characters.map((character) => character.sequence), Array.from({ length: 45 }, (_, index) => index + 1));
  assert.deepEqual(characters[0], {
    id: 1,
    blockId: 100001,
    sequence: 1,
    name: "原皮战神",
    unownedDesc: "常规模式或活动模式通关后获得",
    unlockDesc: "不加配饰自在生长，基础但绝不普通",
    galleryDesc: "没有配饰也敢直接出场，原皮才是最强皮肤。",
    sourceKeys: {
      name: "System_text_name_100001",
      unowned: "System_text_76",
      unlock: "System_text_100001",
      gallery: "System_text_100001_1",
    },
  });
  assert.equal(characters.at(-1).name, "早安先锋");
  assert.equal(characters.every((character) => Object.values(character.sourceKeys).every(Boolean)), true);
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
  assert.deepEqual(generated.map(({ preview, ...character }) => character), source);
});

test("preview synchronizer publishes stable character IDs without leaking the source path", async () => {
  const fixture = await createSyntheticUnityFixture();
  const previewRoot = join(fixture.tempRoot, "character-previews");
  const publishedPreviewRoot = join(fixture.syntheticProjectRoot, "assets", "preview");
  try {
    await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
    await mkdir(previewRoot, { recursive: true });
    await mkdir(publishedPreviewRoot, { recursive: true });
    await Promise.all([
      writeFile(join(previewRoot, "10角色10.png"), transparentPng),
      writeFile(join(previewRoot, "44角色44.png"), transparentPng),
      writeFile(join(previewRoot, "说明.txt"), "ignore", "utf8"),
      writeFile(join(publishedPreviewRoot, "9.png"), transparentPng),
      writeFile(join(publishedPreviewRoot, "notes.txt"), "keep", "utf8"),
    ]);

    const result = runPreviewSync(previewRoot, fixture.syntheticProjectRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const rawCatalog = readFileSync(join(fixture.syntheticProjectRoot, "data", "characters.json"), "utf8");
    const catalog = JSON.parse(rawCatalog);
    assert.equal(catalog.find(({ id }) => id === 10).preview, "assets/preview/10.png");
    assert.equal(catalog.find(({ id }) => id === 44).preview, "assets/preview/44.png");
    assert.equal("preview" in catalog.find(({ id }) => id === 9), false);
    assert.equal(existsSync(join(publishedPreviewRoot, "10.png")), true);
    assert.equal(existsSync(join(publishedPreviewRoot, "44.png")), true);
    assert.equal(existsSync(join(publishedPreviewRoot, "9.png")), false);
    assert.equal(existsSync(join(publishedPreviewRoot, "notes.txt")), true);
    assert.equal(rawCatalog.includes(previewRoot), false);
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test("preview synchronizer skips art whose filename label does not match the formal character name", async () => {
  const fixture = await createSyntheticUnityFixture();
  const previewRoot = join(fixture.tempRoot, "mismatched-previews");
  const publishedPreviewRoot = join(fixture.syntheticProjectRoot, "assets", "preview");
  try {
    await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
    await Promise.all([
      mkdir(previewRoot, { recursive: true }),
      mkdir(publishedPreviewRoot, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(previewRoot, "10角色10.png"), transparentPng),
      writeFile(join(previewRoot, "11另一角色.png"), transparentPng),
      writeFile(join(publishedPreviewRoot, "11.png"), transparentPng),
    ]);

    const result = runPreviewSync(previewRoot, fixture.syntheticProjectRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const catalog = JSON.parse(readFileSync(join(fixture.syntheticProjectRoot, "data", "characters.json"), "utf8"));
    assert.equal(catalog.find(({ id }) => id === 10).preview, "assets/preview/10.png");
    assert.equal("preview" in catalog.find(({ id }) => id === 11), false);
    assert.equal(existsSync(join(publishedPreviewRoot, "10.png")), true);
    assert.equal(existsSync(join(publishedPreviewRoot, "11.png")), false);
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test("preview synchronizer removes stale art when every source preview label mismatches", async () => {
  const fixture = await createSyntheticUnityFixture();
  const previewRoot = join(fixture.tempRoot, "all-mismatched-previews");
  const publishedPreviewRoot = join(fixture.syntheticProjectRoot, "assets", "preview");
  try {
    await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
    await mkdir(publishedPreviewRoot, { recursive: true });
    await writeFile(join(publishedPreviewRoot, "10.png"), transparentPng);
    await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
    await mkdir(previewRoot, { recursive: true });
    await writeFile(join(previewRoot, "10另一角色.png"), transparentPng);

    const result = runPreviewSync(previewRoot, fixture.syntheticProjectRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const catalog = JSON.parse(readFileSync(join(fixture.syntheticProjectRoot, "data", "characters.json"), "utf8"));
    assert.equal("preview" in catalog.find(({ id }) => id === 10), false);
    assert.equal(existsSync(join(publishedPreviewRoot, "10.png")), false);
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test("preview synchronizer rejects two files for the same character ID", async () => {
  const fixture = await createSyntheticUnityFixture();
  const previewRoot = join(fixture.tempRoot, "duplicate-previews");
  try {
    await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
    await mkdir(previewRoot, { recursive: true });
    await Promise.all([
      writeFile(join(previewRoot, "10版本甲.png"), transparentPng),
      writeFile(join(previewRoot, "10版本乙.png"), transparentPng),
    ]);

    const result = runPreviewSync(previewRoot, fixture.syntheticProjectRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Duplicate preview ID 10/u);
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test("preview synchronizer rejects an ID outside the published character catalog", async () => {
  const fixture = await createSyntheticUnityFixture();
  const previewRoot = join(fixture.tempRoot, "unknown-preview");
  try {
    await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
    await mkdir(previewRoot, { recursive: true });
    await writeFile(join(previewRoot, "46未配置.png"), transparentPng);

    const result = runPreviewSync(previewRoot, fixture.syntheticProjectRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unknown preview ID 46/u);
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test("preview synchronizer refuses an empty source before pruning published art", async () => {
  const fixture = await createSyntheticUnityFixture();
  const previewRoot = join(fixture.tempRoot, "empty-previews");
  const publishedPreviewRoot = join(fixture.syntheticProjectRoot, "assets", "preview");
  try {
    await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
    await mkdir(previewRoot, { recursive: true });
    await mkdir(publishedPreviewRoot, { recursive: true });
    await writeFile(join(publishedPreviewRoot, "10.png"), transparentPng);

    const result = runPreviewSync(previewRoot, fixture.syntheticProjectRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /No character preview PNG files found/u);
    assert.equal(existsSync(join(publishedPreviewRoot, "10.png")), true);
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test("preview synchronizer rejects invalid PNG bytes before changing published art", async () => {
  const fixture = await createSyntheticUnityFixture();
  const previewRoot = join(fixture.tempRoot, "invalid-previews");
  const publishedPreviewRoot = join(fixture.syntheticProjectRoot, "assets", "preview");
  try {
    await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
    await mkdir(previewRoot, { recursive: true });
    await mkdir(publishedPreviewRoot, { recursive: true });
    await writeFile(join(previewRoot, "10角色10.png"), "not-a-png", "utf8");
    await writeFile(join(publishedPreviewRoot, "10.png"), transparentPng);

    const result = runPreviewSync(previewRoot, fixture.syntheticProjectRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid PNG preview/u);
    assert.equal(readFileSync(join(publishedPreviewRoot, "10.png")).equals(transparentPng), true);
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test("preview synchronizer rejects structurally damaged PNGs before changing published art or catalog", async (t) => {
  for (const [label, damagedPng] of malformedPngs) {
    await t.test(label, async () => {
      const fixture = await createSyntheticUnityFixture();
      const previewRoot = join(fixture.tempRoot, "damaged-previews");
      const publishedPreviewRoot = join(fixture.syntheticProjectRoot, "assets", "preview");
      try {
        await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
        await mkdir(previewRoot, { recursive: true });
        await mkdir(publishedPreviewRoot, { recursive: true });
        await writeFile(join(previewRoot, "10角色10.png"), damagedPng);
        await writeFile(join(publishedPreviewRoot, "10.png"), transparentPng);
        await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
        const catalogPath = join(fixture.syntheticProjectRoot, "data", "characters.json");
        const catalogBefore = readFileSync(catalogPath);

        const result = runPreviewSync(previewRoot, fixture.syntheticProjectRoot);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Invalid PNG preview/u);
        assert.equal(readFileSync(join(publishedPreviewRoot, "10.png")).equals(transparentPng), true);
        assert.equal(readFileSync(catalogPath).equals(catalogBefore), true);
      } finally {
        await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
      }
    });
  }
});

test("preview synchronizer rejects PNG input and decompressed pixels above resource limits", async (t) => {
  const cases = [
    ["oversized source file", () => Buffer.concat([transparentPng, Buffer.alloc((8 * 1024 * 1024) + 1)])],
    ["compressed pixels above the decode budget", createResourceHeavyPng],
  ];
  for (const [label, createPng] of cases) {
    await t.test(label, async () => {
      const fixture = await createSyntheticUnityFixture();
      const previewRoot = join(fixture.tempRoot, "resource-heavy-previews");
      const publishedPreviewRoot = join(fixture.syntheticProjectRoot, "assets", "preview");
      try {
        await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
        await mkdir(previewRoot, { recursive: true });
        await mkdir(publishedPreviewRoot, { recursive: true });
        await writeFile(join(previewRoot, "10角色10.png"), createPng());
        await writeFile(join(publishedPreviewRoot, "10.png"), transparentPng);
        await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
        const catalogPath = join(fixture.syntheticProjectRoot, "data", "characters.json");
        const catalogBefore = readFileSync(catalogPath);

        const result = runPreviewSync(previewRoot, fixture.syntheticProjectRoot);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /PNG resource limit exceeded/u);
        assert.equal(readFileSync(join(publishedPreviewRoot, "10.png")).equals(transparentPng), true);
        assert.equal(readFileSync(catalogPath).equals(catalogBefore), true);
      } finally {
        await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
      }
    });
  }
});

test("preview synchronizer reserves IDs 1 through 9 and 45 for Unity layered rendering", async (t) => {
  for (const id of [1, 9, 45]) {
    await t.test(`ID ${id}`, async () => {
      const fixture = await createSyntheticUnityFixture();
      const previewRoot = join(fixture.tempRoot, `reserved-preview-${id}`);
      const publishedPreviewRoot = join(fixture.syntheticProjectRoot, "assets", "preview");
      try {
        await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
        await mkdir(previewRoot, { recursive: true });
        await mkdir(publishedPreviewRoot, { recursive: true });
        await writeFile(join(previewRoot, `${id}不应发布.png`), transparentPng);
        await writeFile(join(publishedPreviewRoot, "10.png"), transparentPng);
        await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
        const catalogPath = join(fixture.syntheticProjectRoot, "data", "characters.json");
        const catalogBefore = readFileSync(catalogPath);

        const result = runPreviewSync(previewRoot, fixture.syntheticProjectRoot);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, new RegExp(`Preview ID ${id} must use Unity layered rendering`, "u"));
        assert.equal(existsSync(join(publishedPreviewRoot, `${id}.png`)), false);
        assert.equal(readFileSync(join(publishedPreviewRoot, "10.png")).equals(transparentPng), true);
        assert.equal(readFileSync(catalogPath).equals(catalogBefore), true);
      } finally {
        await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
      }
    });
  }
});

test("preview transaction restores published art and catalog when a commit step fails", async () => {
  const fixture = await createSyntheticUnityFixture();
  const assetsRoot = join(fixture.syntheticProjectRoot, "assets");
  const publishedPreviewRoot = join(assetsRoot, "preview");
  const stagedPreviewRoot = join(assetsRoot, ".preview-staging-rollback-test");
  const catalogPath = join(fixture.syntheticProjectRoot, "data", "characters.json");
  const missingStagedCatalogPath = join(fixture.syntheticProjectRoot, "data", ".characters-missing.json");
  try {
    await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
    await mkdir(publishedPreviewRoot, { recursive: true });
    await mkdir(stagedPreviewRoot, { recursive: true });
    await writeFile(join(publishedPreviewRoot, "10.png"), transparentPng);
    await writeFile(join(stagedPreviewRoot, "10.png"), Buffer.from(transparentPng).fill(0, 40, 41));
    const catalogBefore = readFileSync(catalogPath);
    const previewBefore = readFileSync(join(publishedPreviewRoot, "10.png"));
    const module = await import(pathToFileURL(previewSyncScript).href);

    assert.equal(typeof module.commitCharacterPreviewTransaction, "function");
    await assert.rejects(
      module.commitCharacterPreviewTransaction({
        publishedRoot: publishedPreviewRoot,
        stagedRoot: stagedPreviewRoot,
        dataPath: catalogPath,
        stagedDataPath: missingStagedCatalogPath,
        transactionId: "rollback-test",
      }),
      /ENOENT|no such file or directory/iu,
    );
    assert.equal(readFileSync(join(publishedPreviewRoot, "10.png")).equals(previewBefore), true);
    assert.equal(readFileSync(catalogPath).equals(catalogBefore), true);
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test("Unity synchronization preserves references to already published preview PNGs", async () => {
  const fixture = await createSyntheticUnityFixture();
  const publishedPreviewRoot = join(fixture.syntheticProjectRoot, "assets", "preview");
  try {
    await mkdir(publishedPreviewRoot, { recursive: true });
    await writeFile(join(publishedPreviewRoot, "10.png"), transparentPng);

    const result = await syncBrickGallery({
      unityRoot: fixture.syntheticUnityRoot,
      projectRoot: fixture.syntheticProjectRoot,
    });
    const catalog = JSON.parse(readFileSync(join(fixture.syntheticProjectRoot, "data", "characters.json"), "utf8"));

    assert.equal(result.find(({ id }) => id === 10).preview, "assets/preview/10.png");
    assert.equal(catalog.find(({ id }) => id === 10).preview, "assets/preview/10.png");
    assert.equal("preview" in catalog.find(({ id }) => id === 9), false);
    assert.equal(existsSync(join(fixture.syntheticProjectRoot, "assets", "spine", "character.png")), true);
    const atlasModulePath = join(fixture.syntheticProjectRoot, "assets", "spine", "character-atlas.js");
    const atlas = await import(`${pathToFileURL(atlasModulePath).href}?test=official-limbs`);
    assert.deepEqual(atlas.spineAtlas, {
      image: { width: 729, height: 189 },
      regions: {
        foot: { x: 681, y: 19, width: 17, height: 10, rotated: true },
        leg1: { x: 697, y: 75, width: 4, height: 20, rotated: true },
        leg2: { x: 697, y: 75, width: 4, height: 20, rotated: true },
      },
    });
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test("Unity synchronization bundles the official victory-result visual assets", async () => {
  const fixture = await createSyntheticUnityFixture();
  try {
    await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });
    for (const asset of ["light.png", "public_share_icon.png", "shengli_pop1.png", "shengli_pop2.png"]) {
      const output = join(fixture.syntheticProjectRoot, "assets", "win", asset);
      assert.equal(existsSync(output), true, `${asset} should be copied from the formal LevelWin resources`);
      assert.equal(readFileSync(output).equals(transparentPng), true);
    }
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test("public catalog exposes spreadsheet source keys without local source paths", () => {
  const source = readFileSync(join(projectRoot, "data", "characters.json"), "utf8");
  const generated = JSON.parse(source);

  assert.doesNotMatch(source, /PawsHomeClient|PawsHomeData|E:\\\\/i);
  assert.equal(generated.every(({ name, unownedDesc, unlockDesc, galleryDesc, sourceKeys }) => (
    name && unownedDesc && unlockDesc && galleryDesc
      && sourceKeys?.name && sourceKeys?.unowned && sourceKeys?.unlock && sourceKeys?.gallery
  )), true);
});

test("synchronizer rejects traversal-like Unity layer names before copying", async () => {
  const fixture = await createSyntheticUnityFixture({ firstBody: "../outside" });
  try {
    await assert.rejects(
      syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot }),
      /Unsafe body asset name/u,
    );
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test("synchronizer prunes stale managed PNGs without deleting unrelated files", async () => {
  const fixture = await createSyntheticUnityFixture();
  const staleUi = join(fixture.syntheticProjectRoot, "assets", "ui", "stale.png");
  const unrelatedUi = join(fixture.syntheticProjectRoot, "assets", "ui", "notes.txt");
  const staleLayer = join(fixture.syntheticProjectRoot, "assets", "skin", "body", "stale.png");
  try {
    await mkdir(dirname(staleUi), { recursive: true });
    await mkdir(dirname(staleLayer), { recursive: true });
    await Promise.all([
      writeFile(staleUi, "stale", "utf8"),
      writeFile(staleLayer, "stale", "utf8"),
      writeFile(unrelatedUi, "keep", "utf8"),
    ]);

    await syncBrickGallery({ unityRoot: fixture.syntheticUnityRoot, projectRoot: fixture.syntheticProjectRoot });

    assert.equal(existsSync(staleUi), false);
    assert.equal(existsSync(staleLayer), false);
    assert.equal(existsSync(unrelatedUi), true);
    assert.equal(existsSync(join(fixture.syntheticProjectRoot, "assets", "ui", "save1.png")), true);
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test("Unity localization keeps approved leading and trailing whitespace exactly", async () => {
  const fixture = await createSyntheticUnityFixture({ firstName: " 原样角色 " });
  try {
    const result = await buildBrickGalleryData({ unityRoot: fixture.syntheticUnityRoot });
    assert.equal(result[0].name, " 原样角色 ");
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});
