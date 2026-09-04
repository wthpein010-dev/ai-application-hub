function itemImage(item) {
  return `../trinket-market/${String(item.image || "").replace(/^\.\//, "")}`;
}

// The source sprites are 180–200px hand canvases. Their transparent padding
// encodes left/right hand placement for the character preview, while a catalog
// card needs the painted part centered and readable.
const thumbnailPresentation = new Map([
  [1, { centerX: 0.831, centerY: 0.733, scale: 1.85 }],
  [2, { centerX: 0.225, centerY: 0.744, scale: 2.4 }],
  [3, { centerX: 0.178, centerY: 0.717, scale: 2.1 }],
  [4, { centerX: 0.778, centerY: 0.655, scale: 1.4 }],
  [5, { centerX: 0.222, centerY: 0.747, scale: 2.25 }],
  [6, { centerX: 0.833, centerY: 0.638, scale: 2 }],
  [7, { centerX: 0.8, centerY: 0.719, scale: 1.8 }],
  [8, { centerX: 0.258, centerY: 0.728, scale: 2 }],
  [9, { centerX: 0.772, centerY: 0.664, scale: 1.5 }],
  [10, { centerX: 0.818, centerY: 0.725, scale: 1.4 }],
  [11, { centerX: 0.492, centerY: 0.769, scale: 1.1 }],
]);

function applyThumbnailPresentation(image, presentation) {
  image.style.setProperty("--trinket-thumb-scale", String(presentation.scale));
  image.style.setProperty("--trinket-thumb-shift-x", `${((0.5 - presentation.centerX) * presentation.scale * 100).toFixed(2)}%`);
  image.style.setProperty("--trinket-thumb-shift-y", `${((0.5 - presentation.centerY) * presentation.scale * 100).toFixed(2)}%`);
}

function paintedCenter(image) {
  if (!image.naturalWidth || !image.naturalHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (data[(y * width + x) * 4 + 3] > 4) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { centerX: (minX + maxX) / (2 * width), centerY: (minY + maxY) / (2 * height) };
}

function presentThumbnail(image, item) {
  const presentation = thumbnailPresentation.get(item.id) || { centerX: 0.5, centerY: 0.5, scale: 1 };
  applyThumbnailPresentation(image, presentation);
  const centerPaintedPixels = () => {
    try {
      const center = paintedCenter(image);
      if (center) applyThumbnailPresentation(image, { ...presentation, ...center });
    } catch {
      // Keep the authored presentation when a browser refuses canvas sampling.
    }
  };
  if (image.complete) centerPaintedPixels();
  else image.addEventListener("load", centerPaintedPixels, { once: true });
}

function presentRewardArt(image, item) {
  const presentation = thumbnailPresentation.get(item.id) || { centerX: 0.5, centerY: 0.5 };
  image.style.setProperty("--trinket-reward-scale", "1");
  image.style.setProperty("--trinket-reward-shift-x", `${((0.5 - presentation.centerX) * 100).toFixed(2)}%`);
  image.style.setProperty("--trinket-reward-shift-y", `${((0.5 - presentation.centerY) * 100).toFixed(2)}%`);
}

export function renderTrinketGrid({ items, selectedId, equippedItemId, grid, onSelect }) {
  const cards = items.map((item) => {
    const card = document.createElement("button");
    const equipped = equippedItemId === item.id;
    card.className = "trinket-card";
    card.type = "button";
    card.dataset.itemId = String(item.id);
    card.dataset.new = String(Boolean(item.isNew));
    card.dataset.equipped = String(equipped);
    card.setAttribute("aria-current", String(item.id === selectedId));
    card.setAttribute("aria-label", equipped ? `${item.name}，已装扮` : `装扮${item.name}`);
    const art = document.createElement("span");
    art.className = "trinket-art";
    const image = document.createElement("img");
    image.src = itemImage(item);
    image.alt = "";
    image.draggable = false;
    presentThumbnail(image, item);
    art.append(image);
    const name = document.createElement("strong");
    name.textContent = item.name;
    const count = document.createElement("small");
    count.textContent = `×${item.ownedCount}`;
    card.append(art, name, count);
    card.addEventListener("click", () => onSelect(item.id, card));
    return card;
  });
  grid.replaceChildren(...cards);
}

export function renderEquippedPreview({ character, item, stage }) {
  stage.replaceChildren();
  const rig = document.createElement("div");
  rig.className = "trinket-preview-rig";
  if (character) rig.append(character);
  if (item) {
    const hand = document.createElement("span");
    hand.className = "trinket-hand-anchor";
    const image = document.createElement("img");
    image.className = "equipped-hand-layer";
    image.src = itemImage(item);
    image.alt = "";
    image.draggable = false;
    hand.append(image);
    rig.append(hand);
  }
  stage.append(rig);
}

export function renderTrinketRewardPreview({ item, stage }) {
  stage.replaceChildren();
  if (!item) return;
  const art = document.createElement("div");
  art.className = "trinket-reward-art";
  art.dataset.itemId = String(item.id);
  const image = document.createElement("img");
  image.src = itemImage(item);
  image.alt = item.name;
  image.draggable = false;
  presentRewardArt(image, item);
  art.append(image);
  stage.append(art);
}

export function renderTrinketDetail({ item, favoriteIds, equippedItemId, elements }) {
  const favorite = favoriteIds.has(item.id);
  elements.id.textContent = `HAND-${String(item.id).padStart(4, "0")}`;
  elements.name.textContent = item.name;
  elements.rarity.textContent = `${item.rarity} · 手持`;
  elements.favorite.setAttribute("aria-pressed", String(favorite));
  elements.favorite.textContent = favorite ? "★ 已收藏" : "☆ 收藏";
  elements.ownedCount.textContent = `×${item.ownedCount}`;
  elements.giftCount.textContent = `×${Math.max(0, item.ownedCount - (equippedItemId === item.id ? 1 : 0))}`;
  elements.acquisition.textContent = item.acquisitionText || "获取方式待配置";
  elements.remove.disabled = !equippedItemId;
  elements.remove.setAttribute("aria-label", equippedItemId ? "卸下当前装扮的小物" : "当前没有已装扮的小物");
}

export function trinketImagePath(item) {
  return itemImage(item);
}
