import { diagnoseCopy } from "./core/copy-diagnostics.js";
import {
  createAtlasState,
  formatAtlasLocation,
  parseAtlasLocation,
  selectAtlasItem,
  setAtlasPage,
  setAtlasQuery,
  setAtlasSort,
  setAtlasTab,
} from "./core/atlas-state.js";
import { createTrinketDraft, discardDraft, hasUnsavedDraft, randomizeDraft, saveDraft, toggleDraftItem } from "./core/trinket-draft.js";
import { applyGiftPreview, availableGiftCount, ownedTrinkets, sortTrinkets } from "./core/trinket-inventory.js";
import { createCharacterFigure, renderCharacterDetail, renderCharacterGrid, renderRewardPreview } from "./components/character-view.js";
import { renderEquippedPreview, renderTrinketDetail, renderTrinketGrid, trinketImagePath } from "./components/trinket-view.js";
import { closeInlineFlow, giftNodes, saveConfirmNodes, showInlineFlow, successNodes, warehouseNodes } from "./components/trinket-flow.js";

const CHARACTER_PAGE_SIZE = 12;
const CHARACTER_FAVORITES_KEY = "brick-gallery-favorites-v1";
const TRINKET_PREVIEW_KEY = "brick-gallery-trinket-preview-v1";

const elements = {
  tabs: document.querySelector("[role='tablist']"),
  tabCharacters: document.querySelector("#tab-characters"),
  tabTrinkets: document.querySelector("#tab-trinkets"),
  charactersPanel: document.querySelector("#characters-panel"),
  trinketsPanel: document.querySelector("#trinkets-panel"),
  characterGrid: document.querySelector("#character-grid"),
  trinketGrid: document.querySelector("#trinket-grid"),
  characterEmpty: document.querySelector("#gallery-empty"),
  trinketEmpty: document.querySelector("#trinket-empty"),
  count: document.querySelector("#gallery-count"),
  page: document.querySelector("#gallery-page"),
  status: document.querySelector("#gallery-status"),
  characterSearch: document.querySelector("#gallery-search"),
  trinketSearch: document.querySelector("#trinket-search"),
  trinketSort: document.querySelector("#trinket-sort"),
  trinketSummary: document.querySelector("#trinket-summary"),
  favoritesOnly: document.querySelector("#favorites-only"),
  batchFavorite: document.querySelector("#batch-favorite"),
  pagePrev: document.querySelector("#page-prev"),
  pageNext: document.querySelector("#page-next"),
  empty: document.querySelector("#detail-empty"),
  characterDetail: document.querySelector("#character-detail"),
  trinketDetail: document.querySelector("#trinket-detail"),
  detailName: document.querySelector("#detail-name"),
  detailCharacter: document.querySelector("#detail-character"),
  detailDescription: document.querySelector("#detail-description"),
  detailUnlock: document.querySelector("#detail-unlock"),
  detailPosition: document.querySelector("#detail-position"),
  detailPrev: document.querySelector("#detail-prev"),
  detailNext: document.querySelector("#detail-next"),
  detailFavorite: document.querySelector("#detail-favorite"),
  detailEquip: document.querySelector("#detail-equip"),
  detailShare: document.querySelector("#detail-share"),
  inspectorSequence: document.querySelector("#inspector-sequence"),
  inspectorName: document.querySelector("#inspector-name"),
  inspectorBlockId: document.querySelector("#inspector-block-id"),
  inspectorUnlock: document.querySelector("#inspector-unlock"),
  inspectorGallery: document.querySelector("#inspector-gallery"),
  diagnosticName: document.querySelector("#diagnostic-name"),
  diagnosticUnlock: document.querySelector("#diagnostic-unlock"),
  diagnosticGallery: document.querySelector("#diagnostic-gallery"),
  renderedLines: document.querySelector("#diagnostic-rendered-lines"),
  diagnosticIssues: document.querySelector("#diagnostic-issues"),
  trinketStage: document.querySelector("#trinket-stage-figure"),
  trinketId: document.querySelector("#trinket-detail-id"),
  trinketName: document.querySelector("#trinket-detail-name"),
  trinketRarity: document.querySelector("#trinket-detail-rarity"),
  trinketFavorite: document.querySelector("#trinket-favorite"),
  trinketOwned: document.querySelector("#trinket-owned-count"),
  trinketGiftCount: document.querySelector("#trinket-gift-count"),
  trinketAcquisition: document.querySelector("#trinket-acquisition"),
  trinketToggleDraft: document.querySelector("#trinket-toggle-draft"),
  trinketRandomize: document.querySelector("#trinket-randomize"),
  trinketSave: document.querySelector("#trinket-save"),
  warehouse: document.querySelector("#open-warehouse"),
  gift: document.querySelector("#open-gift"),
  inlineFlow: document.querySelector("#trinket-inline-flow"),
  rewardCharacter: document.querySelector("#reward-character"),
  rewardName: document.querySelector("#reward-name"),
  rewardDescription: document.querySelector("#reward-description"),
  rewardUnowned: document.querySelector("#reward-unowned"),
};

let atlas = createAtlasState();
let characters = [];
let trinkets = [];
let draft = createTrinketDraft();
let favoritesOnly = false;
let diagnosticFrame = 0;
let detailResizeObserver = null;
let flowTrigger = null;
let deferredNavigation = null;
let equippedCharacterId = null;
const characterFavorites = new Set(loadArray(CHARACTER_FAVORITES_KEY).map(Number).filter(Number.isInteger));
let preview = loadTrinketPreview();
const trinketFavorites = new Set(preview.favoriteItemIds);

function loadArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function loadTrinketPreview() {
  try {
    const stored = JSON.parse(localStorage.getItem(TRINKET_PREVIEW_KEY) || "null");
    if (!stored || stored.version !== 1) throw new Error("No compatible preview state");
    const equippedByCharacter = Object.fromEntries(Object.entries(stored.equippedByCharacter || {})
      .filter(([key, value]) => Number.isInteger(Number(key)) && Number(key) > 0 && (value === null || (Number.isInteger(value) && value > 0))));
    const ownedCountByItemId = Object.fromEntries(Object.entries(stored.ownedCountByItemId || {})
      .filter(([key, value]) => Number.isInteger(Number(key)) && Number(key) > 0 && Number.isInteger(value) && value >= 0));
    return {
      equippedByCharacter,
      ownedCountByItemId,
      favoriteItemIds: (Array.isArray(stored.favoriteItemIds) ? stored.favoriteItemIds : []).filter((id) => Number.isInteger(id) && id > 0),
    };
  } catch {
    return { equippedByCharacter: {}, ownedCountByItemId: {}, favoriteItemIds: [] };
  }
}

function savePreview() {
  try {
    localStorage.setItem(TRINKET_PREVIEW_KEY, JSON.stringify({
      version: 1,
      equippedByCharacter: preview.equippedByCharacter,
      ownedCountByItemId: preview.ownedCountByItemId,
      favoriteItemIds: [...trinketFavorites].sort((left, right) => left - right),
    }));
  } catch {
    elements.trinketSummary.textContent = "浏览器存储不可用，本次试穿仅在当前页面生效";
  }
}

function saveCharacterFavorites() {
  try {
    localStorage.setItem(CHARACTER_FAVORITES_KEY, JSON.stringify([...characterFavorites].sort((left, right) => left - right)));
  } catch {
    elements.status.textContent = "浏览器存储不可用，收藏仅在当前页面生效";
  }
}

function selectedCharacter() {
  return characters.find((character) => character.blockId === atlas.characters.selection) || null;
}

function selectedTrinket() {
  return trinkets.find((item) => item.id === atlas.trinkets.selection) || null;
}

function previewCharacter() {
  return selectedCharacter() || characters[0] || null;
}

function equippedFor(character) {
  const itemId = preview.equippedByCharacter[String(character?.blockId)] ?? null;
  return trinkets.find((item) => item.id === itemId) || null;
}

function filteredCharacters() {
  const term = atlas.characters.query.trim().toLocaleLowerCase("zh-CN");
  return characters.filter((character) => {
    if (favoritesOnly && !characterFavorites.has(character.blockId)) return false;
    if (!term) return true;
    return [character.name, character.unlockDesc, character.galleryDesc, character.blockId].join(" ").toLocaleLowerCase("zh-CN").includes(term);
  });
}

function characterPage() {
  const matches = filteredCharacters();
  const totalPages = Math.max(1, Math.ceil(matches.length / CHARACTER_PAGE_SIZE));
  const current = Math.min(atlas.characters.page, totalPages);
  if (current !== atlas.characters.page) atlas = setAtlasPage(atlas, "characters", current);
  const start = (current - 1) * CHARACTER_PAGE_SIZE;
  return { matches, totalPages, visible: matches.slice(start, start + CHARACTER_PAGE_SIZE) };
}

function visibleTrinkets() {
  const term = atlas.trinkets.query.trim().toLocaleLowerCase("zh-CN");
  return sortTrinkets(trinkets.filter((item) => [item.name, item.pinyin, item.id].join(" ").toLocaleLowerCase("zh-CN").includes(term)), atlas.trinkets.sort);
}

function updateLocation(mode = "push") {
  const url = new URL(location.href);
  url.search = formatAtlasLocation(atlas);
  history[`${mode}State`]({ dualAtlas: atlas.tab }, "", url);
}

function setDetail(kind) {
  elements.empty.hidden = kind !== "empty";
  elements.characterDetail.hidden = kind !== "character";
  elements.trinketDetail.hidden = kind !== "trinket";
}

function renderTabs() {
  const charactersActive = atlas.tab === "characters";
  elements.tabCharacters.classList.toggle("is-active", charactersActive);
  elements.tabTrinkets.classList.toggle("is-active", !charactersActive);
  elements.tabCharacters.setAttribute("aria-selected", String(charactersActive));
  elements.tabTrinkets.setAttribute("aria-selected", String(!charactersActive));
  elements.charactersPanel.hidden = !charactersActive;
  elements.trinketsPanel.hidden = charactersActive;
}

function renderCharacterList(announcement = "") {
  const { matches, totalPages, visible } = characterPage();
  renderCharacterGrid({
    characters: visible,
    selectedId: atlas.characters.selection,
    equippedId: equippedCharacterId,
    newId: 100014,
    favorites: characterFavorites,
    grid: elements.characterGrid,
    onSelect: (blockId, trigger) => requestCharacter(blockId, trigger),
  });
  elements.characterEmpty.hidden = visible.length !== 0;
  elements.characterGrid.hidden = visible.length === 0;
  elements.count.textContent = `${characters.length}/${characters.length}`;
  elements.page.textContent = `${atlas.characters.page}/${totalPages}`;
  elements.pagePrev.disabled = atlas.characters.page <= 1;
  elements.pageNext.disabled = atlas.characters.page >= totalPages;
  const allFavorited = visible.length > 0 && visible.every((item) => characterFavorites.has(item.blockId));
  elements.batchFavorite.textContent = allFavorited ? "☆ 取消本页收藏" : "★ 批量收藏本页";
  elements.batchFavorite.disabled = visible.length === 0;
  elements.status.textContent = announcement || (matches.length === characters.length ? "全部角色默认解锁，可直接查看右侧详情" : `筛选结果 ${matches.length} 个角色`);
}

function renderTrinketList() {
  const items = visibleTrinkets();
  renderTrinketGrid({
    items,
    selectedId: atlas.trinkets.selection,
    draft,
    grid: elements.trinketGrid,
    onSelect: (itemId, trigger) => selectTrinket(itemId, trigger),
  });
  elements.trinketEmpty.hidden = items.length !== 0;
  elements.trinketGrid.hidden = items.length === 0;
  elements.trinketSort.value = atlas.trinkets.sort;
  elements.trinketSummary.textContent = items.length === trinkets.length ? `全部 ${trinkets.length} 件随身小物均可试穿` : `搜索到 ${items.length} 件随身小物`;
}

function measureRenderedLines(element) {
  const textNode = element.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return [];
  const range = document.createRange();
  const grouped = [];
  const text = textNode.textContent || "";
  for (let index = 0; index < text.length; index += 1) {
    range.setStart(textNode, index);
    range.setEnd(textNode, index + 1);
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    const top = Math.round(rect.top * 2) / 2;
    let line = grouped.find((entry) => Math.abs(entry.top - top) < 1);
    if (!line) {
      line = { top, text: "" };
      grouped.push(line);
    }
    line.text += text[index];
  }
  range.detach?.();
  return grouped.sort((left, right) => left.top - right.top).map((entry) => entry.text);
}

function renderedMetrics() {
  const element = elements.detailDescription;
  const computed = getComputedStyle(element);
  const scale = element.getBoundingClientRect().width / 420;
  const defaultHeight = 126 * scale;
  return {
    renderedLines: measureRenderedLines(element),
    horizontalOverflow: element.scrollWidth > element.clientWidth + 1,
    verticalOverflow: element.scrollHeight > defaultHeight + 1 || parseFloat(computed.height) > defaultHeight + 1,
  };
}

function setDiagnosticItem(element, ok, value) {
  element.classList.toggle("is-warning", !ok);
  element.querySelector("[data-diagnostic-value]").textContent = value;
}

function updateInspector(character, metrics) {
  const diagnostic = diagnoseCopy(character, metrics);
  elements.inspectorSequence.textContent = String(character.sequence).padStart(2, "0");
  elements.inspectorName.textContent = character.name;
  elements.inspectorBlockId.textContent = `Block ${character.blockId}`;
  elements.inspectorUnlock.textContent = character.unlockDesc;
  elements.inspectorGallery.textContent = character.galleryDesc;
  setDiagnosticItem(elements.diagnosticName, diagnostic.name.ok, `${diagnostic.name.positions} / 3–5`);
  setDiagnosticItem(elements.diagnosticUnlock, diagnostic.unlock.ok, `${diagnostic.unlock.positions} / 15`);
  setDiagnosticItem(elements.diagnosticGallery, diagnostic.gallery.ok, `${diagnostic.gallery.plannedLineCount} / 3 行`);
  elements.renderedLines.textContent = `${diagnostic.gallery.renderedLineCount} 行 · ${metrics ? "真实" : "规则预估"}`;
  const issues = [];
  if (diagnostic.gallery.horizontalOverflow) issues.push("描述出现横向溢出");
  if (diagnostic.gallery.verticalOverflow) issues.push("描述超出 Unity 默认 126 高度，文案框会向下扩展");
  for (const issue of diagnostic.gallery.awkwardBreaks) {
    if (issue.type === "leading-punctuation") issues.push(`第 ${issue.line} 行以标点开头`);
    if (issue.type === "trailing-opening-punctuation") issues.push(`第 ${issue.line} 行以左括号或左引号结尾`);
    if (issue.type === "orphan-line") issues.push(`第 ${issue.line} 行只有一个视觉位置`);
  }
  if (!issues.length) issues.push("当前排版未发现溢出或明显坏换行");
  elements.diagnosticIssues.replaceChildren(...issues.map((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    item.classList.toggle("is-warning", !diagnostic.gallery.ok);
    return item;
  }));
}

function scheduleRenderedDiagnostics() {
  cancelAnimationFrame(diagnosticFrame);
  diagnosticFrame = requestAnimationFrame(() => requestAnimationFrame(() => {
    const character = selectedCharacter();
    if (atlas.tab === "characters" && character && !elements.characterDetail.hidden) updateInspector(character, renderedMetrics());
  }));
}

function renderCharacterPanel() {
  const character = selectedCharacter();
  if (atlas.tab !== "characters" || !character) return;
  setDetail("character");
  renderCharacterDetail({
    character,
    index: characters.findIndex((item) => item.blockId === character.blockId),
    total: characters.length,
    favorites: characterFavorites,
    elements: {
      name: elements.detailName,
      description: elements.detailDescription,
      unlock: elements.detailUnlock,
      position: elements.detailPosition,
      figure: elements.detailCharacter,
      favorite: elements.detailFavorite,
    },
  });
  const isEquipped = character.blockId === equippedCharacterId;
  elements.detailEquip.textContent = isEquipped ? "装扮中" : "装扮";
  elements.detailEquip.setAttribute("aria-pressed", String(isEquipped));
  updateInspector(character);
  scheduleRenderedDiagnostics();
}

function renderTrinketPanel() {
  const item = selectedTrinket();
  if (atlas.tab !== "trinkets" || !item) return;
  setDetail("trinket");
  const character = previewCharacter();
  renderEquippedPreview({ character: character ? createCharacterFigure(character) : null, item: trinkets.find((entry) => entry.id === draft.draftItemId) || null, stage: elements.trinketStage });
  renderTrinketDetail({
    item,
    draft,
    favoriteIds: trinketFavorites,
    equippedItemId: equippedFor(character)?.id || null,
    elements: {
      id: elements.trinketId,
      name: elements.trinketName,
      rarity: elements.trinketRarity,
      favorite: elements.trinketFavorite,
      ownedCount: elements.trinketOwned,
      giftCount: elements.trinketGiftCount,
      acquisition: elements.trinketAcquisition,
      toggleDraft: elements.trinketToggleDraft,
      save: elements.trinketSave,
    },
  });
}

function renderActivePanel() {
  if (atlas.tab === "characters" && selectedCharacter()) renderCharacterPanel();
  else if (atlas.tab === "trinkets" && selectedTrinket()) renderTrinketPanel();
  else setDetail("empty");
}

function renderRewardPanel() {
  renderRewardPreview({
    character: previewCharacter(),
    elements: {
      figure: elements.rewardCharacter,
      name: elements.rewardName,
      description: elements.rewardDescription,
      unowned: elements.rewardUnowned,
    },
  });
}

function render() {
  renderTabs();
  renderCharacterList();
  renderTrinketList();
  renderRewardPanel();
  renderActivePanel();
}

function refreshDraftFor(character) {
  draft = createTrinketDraft(equippedFor(character)?.id || null);
}

function changeCharacter(blockId, trigger, historyMode = "push") {
  const index = characters.findIndex((item) => item.blockId === Number(blockId));
  if (index < 0) return;
  atlas = selectAtlasItem(atlas, "characters", characters[index].blockId);
  atlas = setAtlasPage(atlas, "characters", Math.floor(index / CHARACTER_PAGE_SIZE) + 1);
  refreshDraftFor(characters[index]);
  closeCurrentFlow(false);
  if (historyMode) updateLocation(historyMode);
  render();
  if (trigger?.isConnected) trigger.setAttribute("aria-current", "true");
}

function openUnsavedFlow(continueAction, trigger) {
  deferredNavigation = continueAction;
  flowTrigger = trigger || document.activeElement;
  const copy = document.createElement("p");
  copy.textContent = "当前试穿尚未保存。你可以保存并继续，或放弃这次试穿。";
  const actions = document.createElement("div");
  actions.className = "flow-actions";
  const saveAndContinue = document.createElement("button");
  saveAndContinue.type = "button";
  saveAndContinue.textContent = "保存并继续";
  saveAndContinue.addEventListener("click", () => {
    commitDraft();
    closeCurrentFlow(false);
    deferredNavigation?.();
    deferredNavigation = null;
  });
  const discardAndContinue = document.createElement("button");
  discardAndContinue.type = "button";
  discardAndContinue.textContent = "放弃修改";
  discardAndContinue.addEventListener("click", () => {
    draft = discardDraft(draft);
    closeCurrentFlow(false);
    deferredNavigation?.();
    deferredNavigation = null;
  });
  const keepEditing = document.createElement("button");
  keepEditing.type = "button";
  keepEditing.textContent = "继续编辑";
  keepEditing.addEventListener("click", () => closeCurrentFlow());
  actions.append(saveAndContinue, discardAndContinue, keepEditing);
  const title = document.createElement("h3");
  title.tabIndex = -1;
  title.textContent = "未保存的试穿";
  showInlineFlow(elements.inlineFlow, "unsaved", [title, copy, actions]);
}

function requestCharacter(blockId, trigger) {
  if (selectedCharacter()?.blockId !== Number(blockId) && hasUnsavedDraft(draft)) {
    openUnsavedFlow(() => changeCharacter(blockId, trigger), trigger);
    return;
  }
  changeCharacter(blockId, trigger);
}

function selectTrinket(itemId, trigger, historyMode = "push") {
  const item = trinkets.find((entry) => entry.id === Number(itemId));
  if (!item) return;
  atlas = setAtlasTab(atlas, "trinkets");
  atlas = selectAtlasItem(atlas, "trinkets", item.id);
  closeCurrentFlow(false);
  if (historyMode) updateLocation(historyMode);
  render();
  if (trigger?.isConnected) trigger.setAttribute("aria-current", "true");
}

function selectTab(tab, trigger, historyMode = "push") {
  if (atlas.tab === tab) return;
  const proceed = () => {
    atlas = setAtlasTab(atlas, tab);
    closeCurrentFlow(false);
    if (historyMode) updateLocation(historyMode);
    render();
  };
  if (hasUnsavedDraft(draft)) openUnsavedFlow(proceed, trigger);
  else proceed();
}

function commitDraft() {
  const character = previewCharacter();
  if (!character) return;
  draft = saveDraft(draft);
  preview.equippedByCharacter[String(character.blockId)] = draft.savedItemId;
  savePreview();
  render();
}

function closeCurrentFlow(restoreFocus = true) {
  closeInlineFlow(elements.inlineFlow, restoreFocus ? flowTrigger : null);
  flowTrigger = null;
}

function openSaveFlow(trigger) {
  flowTrigger = trigger || document.activeElement;
  const item = trinkets.find((entry) => entry.id === draft.draftItemId) || null;
  showInlineFlow(elements.inlineFlow, "save", saveConfirmNodes({
    itemName: item?.name,
    onConfirm: () => {
      commitDraft();
      showInlineFlow(elements.inlineFlow, "success", successNodes("保存成功", () => closeCurrentFlow()));
    },
    onClose: () => closeCurrentFlow(),
  }));
}

function openWarehouse(trigger) {
  flowTrigger = trigger || document.activeElement;
  showInlineFlow(elements.inlineFlow, "warehouse", warehouseNodes({
    items: ownedTrinkets(sortTrinkets(trinkets, atlas.trinkets.sort)),
    imageFor: trinketImagePath,
    onPick: (itemId, card) => {
      closeCurrentFlow(false);
      selectTrinket(itemId, card);
    },
    onClose: () => closeCurrentFlow(),
  }));
}

function openGift(trigger) {
  const item = selectedTrinket();
  if (!item) return;
  flowTrigger = trigger || document.activeElement;
  const character = previewCharacter();
  const count = availableGiftCount(item, equippedFor(character)?.id || null);
  if (!item.giftable || count < 1) {
    showInlineFlow(elements.inlineFlow, "gift", successNodes(item.giftable ? "当前没有可赠送的副本" : "该小物不可参与本地赠送演示", () => closeCurrentFlow()));
    return;
  }
  showInlineFlow(elements.inlineFlow, "gift", giftNodes({
    itemName: item.name,
    onConfirm: () => {
      trinkets = applyGiftPreview(trinkets, item.id);
      preview.ownedCountByItemId[String(item.id)] = trinkets.find((entry) => entry.id === item.id)?.ownedCount || 0;
      savePreview();
      render();
      showInlineFlow(elements.inlineFlow, "success", successNodes("赠送成功", () => closeCurrentFlow()));
    },
    onClose: () => closeCurrentFlow(),
  }));
}

function moveCharacter(delta) {
  const current = selectedCharacter();
  if (!current) return;
  const index = characters.findIndex((item) => item.blockId === current.blockId);
  const next = characters[(index + delta + characters.length) % characters.length];
  changeCharacter(next.blockId, null);
}

function toggleCharacterFavorite() {
  const character = selectedCharacter();
  if (!character) return;
  if (characterFavorites.has(character.blockId)) characterFavorites.delete(character.blockId);
  else characterFavorites.add(character.blockId);
  saveCharacterFavorites();
  render();
}

function toggleTrinketFavorite() {
  const item = selectedTrinket();
  if (!item) return;
  if (trinketFavorites.has(item.id)) trinketFavorites.delete(item.id);
  else trinketFavorites.add(item.id);
  savePreview();
  render();
}

function toggleTrial() {
  const item = selectedTrinket();
  if (!item) return;
  draft = toggleDraftItem(draft, item);
  closeCurrentFlow(false);
  render();
}

function randomTrial() {
  draft = randomizeDraft(draft, trinkets);
  closeCurrentFlow(false);
  render();
}

function equipCurrentCharacter() {
  const character = selectedCharacter();
  if (!character) return;
  equippedCharacterId = character.blockId;
  render();
  elements.status.textContent = `${character.name}已设为当前装扮`;
}

async function shareCurrent() {
  const character = selectedCharacter();
  if (!character) return;
  const text = `${character.name}：${character.galleryDesc}`;
  try {
    if (navigator.share) await navigator.share({ title: `${character.name}角色图鉴`, text, url: location.href });
    else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    elements.status.textContent = `${character.name}的图鉴文案已准备分享`;
  } catch (error) {
    if (error?.name !== "AbortError") elements.status.textContent = "当前浏览器无法分享，可直接复制右侧文案";
  }
}

function applyLocation(historyMode = null) {
  const locationState = parseAtlasLocation(location.href);
  atlas = setAtlasTab(createAtlasState(), locationState.tab);
  if (locationState.characterId && characters.some((item) => item.blockId === locationState.characterId)) {
    atlas = selectAtlasItem(atlas, "characters", locationState.characterId);
    const index = characters.findIndex((item) => item.blockId === locationState.characterId);
    atlas = setAtlasPage(atlas, "characters", Math.floor(index / CHARACTER_PAGE_SIZE) + 1);
    refreshDraftFor(characters[index]);
  }
  if (locationState.itemId && trinkets.some((item) => item.id === locationState.itemId)) atlas = selectAtlasItem(atlas, "trinkets", locationState.itemId);
  if (historyMode) updateLocation(historyMode);
  render();
}

function bindEvents() {
  elements.tabCharacters.addEventListener("click", (event) => selectTab("characters", event.currentTarget));
  elements.tabTrinkets.addEventListener("click", (event) => selectTab("trinkets", event.currentTarget));
  elements.tabs.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const controls = [elements.tabCharacters, elements.tabTrinkets];
    const current = controls.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (current + (event.key === "ArrowLeft" ? -1 : 1) + controls.length) % controls.length;
    controls[next].focus();
    selectTab(next === 0 ? "characters" : "trinkets", controls[next]);
  });
  elements.characterSearch.addEventListener("input", (event) => { atlas = setAtlasQuery(atlas, "characters", event.target.value); renderCharacterList(); });
  elements.trinketSearch.addEventListener("input", (event) => { atlas = setAtlasQuery(atlas, "trinkets", event.target.value); renderTrinketList(); });
  elements.trinketSort.addEventListener("change", (event) => { atlas = setAtlasSort(atlas, event.target.value); renderTrinketList(); });
  elements.favoritesOnly.addEventListener("change", (event) => { favoritesOnly = event.target.checked; atlas = setAtlasPage(atlas, "characters", 1); renderCharacterList(); });
  elements.pagePrev.addEventListener("click", () => { atlas = setAtlasPage(atlas, "characters", atlas.characters.page - 1); renderCharacterList(); });
  elements.pageNext.addEventListener("click", () => { atlas = setAtlasPage(atlas, "characters", atlas.characters.page + 1); renderCharacterList(); });
  elements.batchFavorite.addEventListener("click", () => {
    const { visible } = characterPage();
    const remove = visible.length > 0 && visible.every((item) => characterFavorites.has(item.blockId));
    visible.forEach((item) => remove ? characterFavorites.delete(item.blockId) : characterFavorites.add(item.blockId));
    saveCharacterFavorites();
    render();
    elements.status.textContent = remove ? "已取消本页收藏" : "本页角色已全部收藏";
  });
  elements.detailPrev.addEventListener("click", () => moveCharacter(-1));
  elements.detailNext.addEventListener("click", () => moveCharacter(1));
  elements.detailFavorite.addEventListener("click", toggleCharacterFavorite);
  elements.detailEquip.addEventListener("click", equipCurrentCharacter);
  elements.detailShare.addEventListener("click", shareCurrent);
  elements.trinketFavorite.addEventListener("click", toggleTrinketFavorite);
  elements.trinketToggleDraft.addEventListener("click", toggleTrial);
  elements.trinketRandomize.addEventListener("click", randomTrial);
  elements.trinketSave.addEventListener("click", (event) => openSaveFlow(event.currentTarget));
  elements.warehouse.addEventListener("click", (event) => openWarehouse(event.currentTarget));
  elements.gift.addEventListener("click", (event) => openGift(event.currentTarget));
  window.addEventListener("keydown", (event) => {
    if (atlas.tab !== "characters" || !selectedCharacter()) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); moveCharacter(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); moveCharacter(1); }
  });
  window.addEventListener("popstate", () => applyLocation());
  window.addEventListener("resize", scheduleRenderedDiagnostics, { passive: true });
  if (typeof ResizeObserver === "function") {
    detailResizeObserver = new ResizeObserver(scheduleRenderedDiagnostics);
    detailResizeObserver.observe(elements.detailDescription);
  }
  document.fonts?.ready.then(scheduleRenderedDiagnostics);
}

async function start() {
  const [charactersResponse, trinketsResponse] = await Promise.all([fetch("./data/characters.json"), fetch("../trinket-market/data/items.json")]);
  if (!charactersResponse.ok) throw new Error(`角色数据加载失败（${charactersResponse.status}）`);
  if (!trinketsResponse.ok) throw new Error(`随身小物数据加载失败（${trinketsResponse.status}）`);
  characters = await charactersResponse.json();
  const catalog = await trinketsResponse.json();
  if (!Array.isArray(characters) || characters.length !== 45) throw new Error("角色图鉴数据必须包含 45 个角色");
  if (!Array.isArray(catalog) || catalog.length < 1) throw new Error("随身小物目录为空");
  equippedCharacterId = characters[0].blockId;
  trinkets = catalog.map((item) => ({ ...item, ownedCount: preview.ownedCountByItemId[String(item.id)] ?? item.ownedCount }));
  bindEvents();
  applyLocation();
}

start().catch((error) => {
  elements.status.textContent = error instanceof Error ? error.message : "图鉴加载失败";
  elements.status.style.color = "#b00020";
  console.error(error);
});
