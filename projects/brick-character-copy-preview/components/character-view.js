const layerOrder = ["body", "block", "dress", "head"];

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

  const limbs = document.createElement("span");
  limbs.className = "character-limbs";
  figure.append(limbs);
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

export function renderCharacterGrid({ characters, selectedId, favorites, grid, onSelect }) {
  const cards = characters.map((character, index) => {
    const card = document.createElement("button");
    card.className = "character-card";
    card.type = "button";
    card.dataset.blockId = String(character.blockId);
    card.dataset.name = character.name;
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
  elements.unlock.textContent = character.unlockDesc;
  elements.position.textContent = `${index + 1} / ${total}`;
  elements.figure.replaceChildren(createCharacterFigure(character));
  const favorite = favorites.has(character.blockId);
  elements.favorite.setAttribute("aria-pressed", String(favorite));
  elements.favorite.setAttribute("aria-label", favorite ? `取消收藏${character.name}` : `收藏${character.name}`);
  elements.favorite.querySelector("img").src = favorite
    ? "./assets/ui/tujian_jues_save2.png"
    : "./assets/ui/tujian_jues_save1.png";
}
