function itemImage(item) {
  return `../trinket-market/${String(item.image || "").replace(/^\.\//, "")}`;
}

export function renderTrinketGrid({ items, selectedId, draft, grid, onSelect }) {
  const cards = items.map((item) => {
    const card = document.createElement("button");
    card.className = "trinket-card";
    card.type = "button";
    card.dataset.itemId = String(item.id);
    card.dataset.new = String(Boolean(item.isNew));
    card.dataset.draftSelected = String(draft?.draftItemId === item.id);
    card.setAttribute("aria-current", String(item.id === selectedId));
    card.setAttribute("aria-label", `查看${item.name}`);
    const art = document.createElement("span");
    art.className = "trinket-art";
    const image = document.createElement("img");
    image.src = itemImage(item);
    image.alt = "";
    image.draggable = false;
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
  if (character) stage.append(character);
  if (!item) return;
  const hand = document.createElement("img");
  hand.className = "equipped-hand-layer";
  hand.src = itemImage(item);
  hand.alt = "";
  hand.draggable = false;
  stage.append(hand);
}

export function renderTrinketDetail({ item, draft, favoriteIds, equippedItemId, elements }) {
  const favorite = favoriteIds.has(item.id);
  elements.id.textContent = `HAND-${String(item.id).padStart(4, "0")}`;
  elements.name.textContent = item.name;
  elements.rarity.textContent = `${item.rarity} · 手持`;
  elements.favorite.setAttribute("aria-pressed", String(favorite));
  elements.favorite.textContent = favorite ? "★ 已收藏" : "☆ 收藏";
  elements.ownedCount.textContent = `×${item.ownedCount}`;
  elements.giftCount.textContent = `×${Math.max(0, item.ownedCount - (equippedItemId === item.id ? 1 : 0))}`;
  elements.acquisition.textContent = item.acquisitionText || "获取方式待配置";
  const chosen = draft?.draftItemId === item.id;
  elements.toggleDraft.textContent = chosen ? "卸下试穿" : "试穿";
  elements.toggleDraft.setAttribute("aria-pressed", String(chosen));
  elements.save.disabled = !draft || draft.savedItemId === draft.draftItemId;
}

export function trinketImagePath(item) {
  return itemImage(item);
}
