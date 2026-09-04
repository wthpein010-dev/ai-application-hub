import { spineAtlas } from "../assets/spine/character-atlas.js";

const layerOrder = ["body", "block", "dress", "head"];
const spineLimbOrder = [
  "leg-left-upper",
  "leg-left-lower",
  "leg-right-upper",
  "leg-right-lower",
  "foot-left",
  "foot-right",
];
const spineLimbRegions = {
  "leg-left-upper": "leg1",
  "leg-left-lower": "leg2",
  "leg-right-upper": "leg1",
  "leg-right-lower": "leg2",
  "foot-left": "foot",
  "foot-right": "foot",
};
const spineAtlasSource = new URL("../assets/spine/character.png", import.meta.url).href;
let spineAtlasImage;

function getSpineAtlasImage() {
  if (!spineAtlasImage) {
    spineAtlasImage = new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image), { once: true });
      image.addEventListener("error", () => reject(new Error("Unable to load the formal Character Spine atlas")), { once: true });
      image.src = spineAtlasSource;
    });
  }
  return spineAtlasImage;
}

function createSpineAtlasSlice(part) {
  const region = spineAtlas.regions[spineLimbRegions[part]];
  const canvas = document.createElement("canvas");
  canvas.className = "character-spine-sprite__atlas";
  // The Atlas stores rotated regions as a physical narrow-by-tall rectangle.
  // Restore its source orientation first; CSS then applies the attachment rotation.
  const width = region.rotated ? region.height : region.width;
  const height = region.rotated ? region.width : region.height;
  canvas.width = width;
  canvas.height = height;
  getSpineAtlasImage().then((image) => {
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    if (region.rotated) {
      context.translate(0, height);
      context.rotate(-Math.PI / 2);
      context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
      return;
    }
    context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, width, height);
  }).catch(() => {});
  return canvas;
}

export function formatRewardDialogue(text) {
  const characters = Array.from(String(text ?? "").trim());
  const visible = characters.length > 18
    ? [...characters.slice(0, 17), "…"]
    : characters.slice(0, 18);
  const firstLine = visible.slice(0, 9).join("");
  const secondLine = visible.slice(9).join("");
  return secondLine ? `${firstLine}\n${secondLine}` : firstLine;
}

function createSpineLimbs() {
  const limbs = document.createElement("span");
  limbs.className = "character-spine-limbs";
  for (const part of spineLimbOrder) {
    const sprite = document.createElement("span");
    sprite.className = `character-spine-sprite character-spine-sprite--${part}`;
    sprite.append(createSpineAtlasSlice(part));
    limbs.append(sprite);
  }
  return limbs;
}

export function createCharacterFigure(character) {
  const figure = document.createElement("div");
  figure.className = "character-figure";
  figure.setAttribute("aria-hidden", "true");
  if (character.preview) {
    const preview = document.createElement("img");
    preview.className = "character-preview";
    preview.src = `./${character.preview}`;
    preview.alt = "";
    preview.draggable = false;
    figure.append(preview);
    return figure;
  }

  figure.classList.add("character-figure--layered");
  figure.append(createSpineLimbs());
  for (const kind of layerOrder) {
    const asset = character.layers?.[kind];
    if (!asset) continue;
    const image = document.createElement("img");
    image.className = `character-layer character-layer--${kind}`;
    image.src = `./assets/skin/${kind}/${asset}.png`;
    image.alt = "";
    image.draggable = false;
    figure.append(image);
  }
  return figure;
}

export function renderRewardPreview({ character, elements }) {
  if (!character) return;
  elements.name.textContent = character.name;
  const speech = character.unlockDesc || character.unownedDesc || character.galleryDesc;
  elements.description.textContent = formatRewardDialogue(speech);
  elements.description.title = speech;
  elements.description.setAttribute("aria-label", `角色台词：${speech}`);
  elements.unowned.textContent = character.unownedDesc || character.unlockDesc;
  elements.figure.replaceChildren(createCharacterFigure(character));
}

export function renderCharacterGrid({ characters, selectedId, equippedId, newId, favorites, grid, onSelect }) {
  const cards = characters.map((character, index) => {
    const card = document.createElement("button");
    card.className = "character-card";
    card.type = "button";
    card.dataset.blockId = String(character.blockId);
    card.dataset.name = character.name;
    card.dataset.state = character.blockId === equippedId ? "equipped" : character.blockId === newId ? "new" : "owned";
    card.style.setProperty("--appear-index", String(index));
    card.setAttribute("aria-label", `查看${character.name}详情`);
    card.setAttribute("aria-current", String(character.blockId === selectedId));

    const art = document.createElement("span");
    art.className = "character-art";
    art.append(createCharacterFigure(character));
    const name = document.createElement("span");
    name.className = "character-name";
    name.textContent = character.name;
    card.append(art, name);
    if (card.dataset.state !== "owned") {
      const state = document.createElement("span");
      state.className = "character-state";
      state.textContent = card.dataset.state === "equipped" ? "装扮中" : "新";
      card.append(state);
    }
    if (favorites.has(character.blockId)) {
      const favorite = document.createElement("img");
      favorite.className = "favorite-mark";
      favorite.src = "./assets/ui/tujian_save_xiao.png";
      favorite.alt = "已收藏";
      card.append(favorite);
    }
    card.addEventListener("click", () => onSelect(character.blockId, card));
    return card;
  });
  grid.replaceChildren(...cards);
}

export function renderCharacterDetail({ character, index, total, favorites, elements }) {
  elements.name.textContent = character.name;
  elements.description.textContent = character.galleryDesc;
  elements.unlock.textContent = character.unownedDesc || character.unlockDesc;
  elements.position.textContent = `${index + 1} / ${total}`;
  elements.figure.replaceChildren(createCharacterFigure(character));
  const favorite = favorites.has(character.blockId);
  elements.favorite.setAttribute("aria-pressed", String(favorite));
  elements.favorite.setAttribute("aria-label", favorite ? `取消收藏${character.name}` : `收藏${character.name}`);
  elements.favorite.querySelector("img").src = favorite
    ? "./assets/ui/tujian_jues_save2.png"
    : "./assets/ui/tujian_jues_save1.png";
}
