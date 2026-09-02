function validItemId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function usable(item) {
  return item && item.slot === "hand" && Number.isInteger(item.ownedCount) && item.ownedCount > 0;
}

export function createTrinketDraft(savedItemId = null) {
  const itemId = validItemId(savedItemId);
  return { savedItemId: itemId, draftItemId: itemId };
}

export function toggleDraftItem(draft, item) {
  if (!usable(item)) return { ...draft };
  return {
    ...draft,
    draftItemId: draft.draftItemId === item.id ? null : item.id,
  };
}

export function randomizeDraft(draft, candidates, random = Math.random) {
  const available = (Array.isArray(candidates) ? candidates : []).filter(usable);
  if (!available.length) return { ...draft };
  const index = Math.min(available.length - 1, Math.max(0, Math.floor(Number(random()) * available.length)));
  return { ...draft, draftItemId: available[index].id };
}

export function hasUnsavedDraft(draft) {
  return draft.savedItemId !== draft.draftItemId;
}

export function saveDraft(draft) {
  return { savedItemId: draft.draftItemId, draftItemId: draft.draftItemId };
}

export function discardDraft(draft) {
  return { ...draft, draftItemId: draft.savedItemId };
}
