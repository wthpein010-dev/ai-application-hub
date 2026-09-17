import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const marketRoot = join(root, "projects", "trinket-market");
const galleryRoot = join(root, "projects", "brick-character-copy-preview");

test("catalog follows the 44 fully configured hand resources and copy fields", () => {
  const catalog = JSON.parse(readFileSync(join(marketRoot, "data", "items.json"), "utf8"));
  const expectedIds = [...Array.from({ length: 42 }, (_, index) => index + 1), 48, 50];

  assert.equal(catalog.length, 44);
  assert.deepEqual(catalog.map((item) => item.id), expectedIds);
  assert.deepEqual(catalog.slice(0, 2).map((item) => ({
    image: item.image,
    name: item.name,
    acquisitionText: item.acquisitionText,
    galleryDescription: item.galleryDescription,
  })), [
    {
      image: "./assets/items/hand_1.png",
      name: "保温杯",
      acquisitionText: "保温杯里的枸杞去哪了？",
      galleryDescription: "杯里泡的不是枸杞，是成年人不肯服输的最后一点倔强",
    },
    {
      image: "./assets/items/hand_2.png",
      name: "八卦早报",
      acquisitionText: "大事缓缓，八卦不能迟到",
      galleryDescription: "消息可以晚点回，瓜必须趁热吃，错过一点今天都算白过",
    },
  ]);
  assert.deepEqual(catalog.find((item) => item.id === 26), {
    id: 26,
    name: "安心泳圈",
    pinyin: "anxinyongquan",
    rarity: "普通",
    acquired: 0,
    value: 0,
    change: 0,
    image: "./assets/items/hand_26.png",
    ownedCount: 1,
    obtainedAt: null,
    acquisitionText: "浪再大，也有人稳稳托住",
    galleryDescription: "不会游也别慌，先稳稳浮着，放心，岸总会一点点慢慢靠近你",
    isNew: false,
    giftable: true,
    activitySort: null,
    slot: "hand",
  });
  assert.equal(catalog.find((item) => item.id === 48).name, "精致小斜挎");
  assert.equal(catalog.at(-1).name, "公文包");
  assert.equal(catalog.some((item) => item.id === 43), false, "entries without complete source copy must stay unpublished");
});

test("gallery detail renders the configured trinket gallery description", () => {
  const html = readFileSync(join(galleryRoot, "index.html"), "utf8");
  const app = readFileSync(join(galleryRoot, "app.js"), "utf8");
  const view = readFileSync(join(galleryRoot, "components", "trinket-view.js"), "utf8");

  assert.match(html, /id="trinket-gallery-description"/);
  assert.match(app, /trinketGalleryDescription/);
  assert.match(view, /elements\.galleryDescription\.textContent\s*=\s*item\.galleryDescription/);
});
