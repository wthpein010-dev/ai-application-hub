import { diagnoseCopy } from "./core/copy-diagnostics.js";

const PAGE_SIZE = 12;
const FAVORITES_KEY = "brick-gallery-favorites-v1";
const layerOrder = ["body", "block", "dress", "head"];

const elements = {
  grid: document.querySelector("#character-grid"),
  empty: document.querySelector("#gallery-empty"),
  count: document.querySelector("#gallery-count"),
  page: document.querySelector("#gallery-page"),
  status: document.querySelector("#gallery-status"),
  search: document.querySelector("#gallery-search"),
  favoritesOnly: document.querySelector("#favorites-only"),
  batchFavorite: document.querySelector("#batch-favorite"),
  pagePrev: document.querySelector("#page-prev"),
  pageNext: document.querySelector("#page-next"),
  detail: document.querySelector("#detail-dialog"),
  detailClose: document.querySelector("#detail-close"),
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
};
const modalBackground = [
  document.querySelector(".hub-home-link"),
  document.querySelector(".gallery-topbar"),
  document.querySelector(".gallery-layout"),
].filter(Boolean);

let characters = [];
let currentPage = 1;
let selectedIndex = 0;
let lastTriggerBlockId = null;
let searchTerm = "";
let showFavoritesOnly = false;
let diagnosticFrame = 0;
let detailResizeObserver = null;
const favorites = new Set(loadFavorites());

function loadFavorites() {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(stored) ? stored.map(Number).filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites].sort((left, right) => left - right)));
  } catch {
    // The gallery remains usable when browser storage is unavailable.
  }
}

function createCharacterFigure(character) {
  const figure = document.createElement("div");
  figure.className = "character-figure";
  figure.setAttribute("aria-hidden", "true");
  const limbs = document.createElement("span");
  limbs.className = "character-limbs";
  figure.append(limbs);

  for (const kind of layerOrder) {
    const asset = character.layers[kind];
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

function filteredCharacters() {
  const keyword = searchTerm.trim().toLocaleLowerCase("zh-CN");
  return characters.filter((character) => {
    if (showFavoritesOnly && !favorites.has(character.blockId)) return false;
    if (!keyword) return true;
    return [character.name, character.unlockDesc, character.galleryDesc, character.blockId]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(keyword);
  });
}

function pageCharacters() {
  const filtered = filteredCharacters();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  return { filtered, totalPages, visible: filtered.slice(start, start + PAGE_SIZE) };
}

function createCard(character, indexOnPage) {
  const card = document.createElement("button");
  card.className = "character-card";
  card.type = "button";
  card.dataset.blockId = String(character.blockId);
  card.dataset.name = character.name;
  card.style.setProperty("--appear-index", String(indexOnPage));
  card.setAttribute("aria-label", `打开${character.name}详情`);
  card.setAttribute("aria-current", String(characters[selectedIndex]?.blockId === character.blockId));

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

  card.addEventListener("click", () => openDetail(character.blockId));
  return card;
}

function renderGallery(announcement = "") {
  const { filtered, totalPages, visible } = pageCharacters();
  elements.grid.replaceChildren(...visible.map(createCard));
  elements.empty.hidden = visible.length !== 0;
  elements.grid.hidden = visible.length === 0;
  elements.count.textContent = `${characters.length}/${characters.length}`;
  elements.page.textContent = `${currentPage}/${totalPages}`;
  elements.pagePrev.disabled = currentPage <= 1;
  elements.pageNext.disabled = currentPage >= totalPages;
  const allVisibleFavorited = visible.length > 0 && visible.every(({ blockId }) => favorites.has(blockId));
  elements.batchFavorite.textContent = allVisibleFavorited ? "☆ 取消本页收藏" : "★ 批量收藏本页";
  elements.batchFavorite.disabled = visible.length === 0;
  elements.status.textContent = announcement || (filtered.length === characters.length
    ? "全部角色默认解锁，可直接打开详情"
    : `筛选结果 ${filtered.length} 个角色`);
}

function characterIndex(blockId) {
  return characters.findIndex((character) => character.blockId === Number(blockId));
}

function measureRenderedLines(element) {
  const textNode = element.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return [];
  const text = textNode.textContent || "";
  const grouped = [];
  const range = document.createRange();
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
  return grouped.sort((left, right) => left.top - right.top).map(({ text: value }) => value);
}

function setDiagnosticItem(element, ok, value) {
  element.classList.toggle("is-warning", !ok);
  element.querySelector("[data-diagnostic-value]").textContent = value;
}

function updateInspector(character, renderedMetrics) {
  const diagnostic = diagnoseCopy(character, renderedMetrics);
  elements.inspectorSequence.textContent = String(character.sequence).padStart(2, "0");
  elements.inspectorName.textContent = character.name;
  elements.inspectorBlockId.textContent = `Block ${character.blockId}`;
  elements.inspectorUnlock.textContent = character.unlockDesc;
  elements.inspectorGallery.textContent = character.galleryDesc;
  setDiagnosticItem(elements.diagnosticName, diagnostic.name.ok, `${diagnostic.name.positions} / 3–5`);
  setDiagnosticItem(elements.diagnosticUnlock, diagnostic.unlock.ok, `${diagnostic.unlock.positions} / 15`);
  setDiagnosticItem(elements.diagnosticGallery, diagnostic.gallery.ok, `${diagnostic.gallery.plannedLineCount} / 3 行`);

  const sourceLabel = renderedMetrics ? "真实" : "规则预估";
  elements.renderedLines.textContent = `${diagnostic.gallery.renderedLineCount} 行 · ${sourceLabel}`;
  const issues = [];
  if (diagnostic.gallery.horizontalOverflow) issues.push("描述出现横向溢出");
  if (diagnostic.gallery.verticalOverflow) issues.push("描述超出 Unity 默认 126 高度，文案框会向下扩展");
  for (const issue of diagnostic.gallery.awkwardBreaks) {
    if (issue.type === "leading-punctuation") issues.push(`第 ${issue.line} 行以标点开头`);
    if (issue.type === "trailing-opening-punctuation") issues.push(`第 ${issue.line} 行以左括号或左引号结尾`);
    if (issue.type === "orphan-line") issues.push(`第 ${issue.line} 行只有一个视觉位置`);
  }
  if (diagnostic.gallery.plannedLineCount > 3) issues.push("按每行 12 位规则会超过 3 行");
  if (!issues.length) issues.push("当前排版未发现溢出或明显坏换行");
  elements.diagnosticIssues.replaceChildren(...issues.map((message, index) => {
    const item = document.createElement("li");
    item.textContent = message;
    item.classList.toggle("is-warning", diagnostic.gallery.ok === false && index < issues.length);
    return item;
  }));
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

function detailIsOpen() {
  return elements.detail.getAttribute("aria-hidden") === "false";
}

function scheduleRenderedDiagnostics() {
  cancelAnimationFrame(diagnosticFrame);
  diagnosticFrame = requestAnimationFrame(() => {
    if (!detailIsOpen()) return;
    const character = characters[selectedIndex];
    if (character) updateInspector(character, renderedMetrics());
  });
}

function setModalBackgroundInert(inert) {
  modalBackground.forEach((element) => { element.inert = inert; });
}

function detailFocusableControls() {
  return Array.from(elements.detail.querySelectorAll("button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])"))
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function trapDetailFocus(event) {
  if (event.key !== "Tab" || !detailIsOpen()) return;
  const focusable = detailFocusableControls();
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || !elements.detail.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !elements.detail.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

function updateDetailHistory(blockId, mode) {
  const url = new URL(location.href);
  if (blockId === null) url.searchParams.delete("character");
  else url.searchParams.set("character", String(blockId));
  history[`${mode}State`]({ brickGalleryCharacter: blockId }, "", url);
}

function updateDetail() {
  const character = characters[selectedIndex];
  if (!character) return;
  elements.detailName.textContent = character.name;
  elements.detailDescription.textContent = character.galleryDesc;
  elements.detailUnlock.textContent = character.unlockDesc;
  elements.detailPosition.textContent = `${selectedIndex + 1} / ${characters.length}`;
  elements.detailCharacter.replaceChildren(createCharacterFigure(character));
  const isFavorite = favorites.has(character.blockId);
  elements.detailFavorite.setAttribute("aria-pressed", String(isFavorite));
  elements.detailFavorite.setAttribute("aria-label", isFavorite ? `取消收藏${character.name}` : `收藏${character.name}`);
  elements.detailFavorite.querySelector("img").src = isFavorite
    ? "./assets/ui/tujian_jues_save2.png"
    : "./assets/ui/tujian_jues_save1.png";
  updateInspector(character);
  scheduleRenderedDiagnostics();
}

function openDetail(blockId, { historyMode = "push", focusClose = true } = {}) {
  const index = characterIndex(blockId);
  if (index < 0) return;
  selectedIndex = index;
  currentPage = Math.floor(index / PAGE_SIZE) + 1;
  if (!detailIsOpen()) lastTriggerBlockId = characters[index].blockId;
  renderGallery();
  updateDetail();
  elements.detail.setAttribute("aria-hidden", "false");
  document.body.classList.add("detail-open");
  setModalBackgroundInert(true);
  if (historyMode) updateDetailHistory(characters[index].blockId, historyMode);
  if (focusClose) elements.detailClose.focus({ preventScroll: true });
  scheduleRenderedDiagnostics();
}

function closeDetail({ historyMode = "push", restoreFocus = true } = {}) {
  if (!detailIsOpen()) return;
  elements.detail.setAttribute("aria-hidden", "true");
  document.body.classList.remove("detail-open");
  setModalBackgroundInert(false);
  if (historyMode) updateDetailHistory(null, historyMode);
  if (!restoreFocus) return;
  const trigger = elements.grid.querySelector(`[data-block-id="${lastTriggerBlockId}"]`);
  (trigger || elements.search).focus({ preventScroll: true });
}

function moveDetail(delta, { historyMode = "push" } = {}) {
  selectedIndex = (selectedIndex + delta + characters.length) % characters.length;
  currentPage = Math.floor(selectedIndex / PAGE_SIZE) + 1;
  renderGallery();
  updateDetail();
  if (historyMode) updateDetailHistory(characters[selectedIndex].blockId, historyMode);
}

function applyDetailFromLocation() {
  const requestedBlockId = Number(new URL(location.href).searchParams.get("character"));
  if (characterIndex(requestedBlockId) >= 0) {
    openDetail(requestedBlockId, { historyMode: null });
  } else {
    closeDetail({ historyMode: null });
  }
}

function toggleCurrentFavorite() {
  const character = characters[selectedIndex];
  if (!character) return;
  if (favorites.has(character.blockId)) favorites.delete(character.blockId);
  else favorites.add(character.blockId);
  saveFavorites();
  renderGallery(`${character.name}${favorites.has(character.blockId) ? "已收藏" : "已取消收藏"}`);
  updateDetail();
}

async function shareCurrent() {
  const character = characters[selectedIndex];
  const text = `${character.name}：${character.galleryDesc}`;
  try {
    if (navigator.share) await navigator.share({ title: `${character.name}角色图鉴`, text, url: location.href });
    else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    elements.status.textContent = `${character.name}的图鉴文案已准备分享`;
  } catch (error) {
    if (error?.name !== "AbortError") elements.status.textContent = "当前浏览器无法分享，可直接复制右侧文案";
  }
}

function bindEvents() {
  elements.search.addEventListener("input", (event) => {
    searchTerm = event.target.value;
    currentPage = 1;
    renderGallery();
  });
  elements.favoritesOnly.addEventListener("change", (event) => {
    showFavoritesOnly = event.target.checked;
    currentPage = 1;
    renderGallery();
  });
  elements.pagePrev.addEventListener("click", () => { currentPage -= 1; renderGallery(); });
  elements.pageNext.addEventListener("click", () => { currentPage += 1; renderGallery(); });
  elements.batchFavorite.addEventListener("click", () => {
    const { visible } = pageCharacters();
    const remove = visible.length > 0 && visible.every(({ blockId }) => favorites.has(blockId));
    visible.forEach(({ blockId }) => remove ? favorites.delete(blockId) : favorites.add(blockId));
    saveFavorites();
    renderGallery(remove ? "已取消本页收藏" : "本页角色已全部收藏");
    updateDetail();
  });
  elements.detailClose.addEventListener("click", closeDetail);
  document.querySelector("[data-detail-close]").addEventListener("click", closeDetail);
  elements.detailPrev.addEventListener("click", () => moveDetail(-1));
  elements.detailNext.addEventListener("click", () => moveDetail(1));
  elements.detailFavorite.addEventListener("click", toggleCurrentFavorite);
  elements.detailEquip.addEventListener("click", () => { elements.status.textContent = `${characters[selectedIndex].name}已设为装扮排版预览`; });
  elements.detailShare.addEventListener("click", shareCurrent);
  document.querySelector("[data-home]").addEventListener("click", () => { location.href = "../../index.html#engineering"; });
  window.addEventListener("keydown", (event) => {
    if (!detailIsOpen()) return;
    trapDetailFocus(event);
    if (event.key === "Escape") closeDetail();
    if (event.key === "ArrowLeft") { event.preventDefault(); moveDetail(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); moveDetail(1); }
  });
  window.addEventListener("popstate", applyDetailFromLocation);
  window.addEventListener("resize", scheduleRenderedDiagnostics, { passive: true });
  if (typeof ResizeObserver === "function") {
    detailResizeObserver = new ResizeObserver(scheduleRenderedDiagnostics);
    detailResizeObserver.observe(elements.detailDescription);
  }
  document.fonts?.ready.then(scheduleRenderedDiagnostics);
}

async function start() {
  const response = await fetch("./data/characters.json");
  if (!response.ok) throw new Error(`角色数据加载失败（${response.status}）`);
  characters = await response.json();
  if (!Array.isArray(characters) || characters.length !== 45) throw new Error("角色图鉴数据必须包含 45 个角色");
  const requestedBlockId = Number(new URL(location.href).searchParams.get("character"));
  const requestedIndex = characterIndex(requestedBlockId);
  if (requestedIndex >= 0) {
    selectedIndex = requestedIndex;
    currentPage = Math.floor(requestedIndex / PAGE_SIZE) + 1;
  }
  bindEvents();
  renderGallery();
  updateInspector(characters[selectedIndex]);
  if (requestedIndex >= 0) openDetail(requestedBlockId, { historyMode: null });
}

start().catch((error) => {
  elements.status.textContent = error instanceof Error ? error.message : "角色图鉴加载失败";
  elements.status.style.color = "#b00020";
  console.error(error);
});
