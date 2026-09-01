import { applyAcquisitionCounts, sortItems, validateItems } from "./core/items.js";
import {
  clearItemImages,
  DATA_STORAGE_KEY,
  loadItemImages,
  loadLocalState,
  removeLocalState,
  replaceItemImages,
  saveItemImage,
  saveLocalState,
  validateImportedState,
} from "./core/storage.js";

const STORAGE_KEY = "trinket-market-v1-preferences";
const DEFAULT_THEME = "a";
const THEMES = new Set(["a", "b", "c", "d"]);
const grid = document.querySelector("#item-grid");
const searchInput = document.querySelector("#search-input");
const sortMode = document.querySelector("#sort-mode");
const sortDirection = document.querySelector("#sort-direction");
const sortDirectionLabel = document.querySelector("#sort-direction-label");
const valueToggle = document.querySelector("#value-toggle");
const themeSelect = document.querySelector("#theme-select");
const emptyState = document.querySelector("#empty-state");
const resultCount = document.querySelector("#result-count");
const dragStatus = document.querySelector("#drag-status");
const errorPanel = document.querySelector("#error-panel");
const errorMessage = document.querySelector("#error-message");
const retryButton = document.querySelector("#retry-button");
const editModeButton = document.querySelector("#edit-mode");
const exportButton = document.querySelector("#export-json");
const importInput = document.querySelector("#import-json");
const resetButton = document.querySelector("#reset-data");
const editStatus = document.querySelector("#edit-status");
const itemDialog = document.querySelector("#item-dialog");
const itemForm = document.querySelector("#item-form");
const dialogError = document.querySelector("#dialog-error");
const editImageInput = document.querySelector("#edit-image");
const editImagePreview = document.querySelector("#edit-image-preview");
const dataUpdated = document.querySelector("#data-updated");
const dataUpdatedCaption = document.querySelector("#data-updated-caption");
const dialogCloseButton = document.querySelector("#dialog-close");
const dialogCancelButton = document.querySelector("#dialog-cancel");
const editIdInput = document.querySelector("#edit-id");
const editNameInput = document.querySelector("#edit-name");
const editPinyinInput = document.querySelector("#edit-pinyin");
const editRarityInput = document.querySelector("#edit-rarity");
const editAcquiredInput = document.querySelector("#edit-acquired");
const editValueInput = document.querySelector("#edit-value");
const editChangeInput = document.querySelector("#edit-change");

const state = {
  canonicalItems: [],
  items: [],
  manualOrder: [],
  imageBlobs: new Map(),
  imageUrls: new Map(),
  query: "",
  sort: "acquired",
  direction: "desc",
  showValue: false,
  theme: DEFAULT_THEME,
  editMode: false,
  editingId: 0,
  previewUrl: "",
};

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function setEditStatus(message, isError = false) {
  editStatus.textContent = message;
  editStatus.dataset.error = isError ? "true" : "false";
}

function imageSource(item) {
  return state.imageUrls.get(item.id) || item.image;
}

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return;
    if (THEMES.has(saved.theme)) state.theme = saved.theme;
    if (Array.isArray(saved.manualOrder)) state.manualOrder = saved.manualOrder.map(Number).filter(Number.isInteger);
  } catch {
    // Browser storage is optional; canonical data still works.
  }
}

function savePreferences() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: state.theme, manualOrder: state.manualOrder }));
  } catch {
    // Browser storage is optional; keep the current session usable.
  }
}

function persistEditableState(message = "修改已保存到当前浏览器") {
  const saved = saveLocalState(localStorage, { version: 1, items: state.items, order: state.manualOrder });
  setEditStatus(saved ? message : "当前修改已生效，但未能保存到浏览器", !saved);
  return saved;
}

function revokeImageUrls() {
  for (const url of state.imageUrls.values()) URL.revokeObjectURL(url);
  state.imageUrls.clear();
}

function revokePreviewUrl() {
  if (!state.previewUrl) return;
  URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = "";
}

async function refreshImageOverrides() {
  revokeImageUrls();
  try {
    state.imageBlobs = await loadItemImages();
  } catch {
    state.imageBlobs = new Map();
  }
  for (const [id, blob] of state.imageBlobs) state.imageUrls.set(id, URL.createObjectURL(blob));
}

function rankMap(items) {
  return new Map(items.slice().sort((a, b) => b.acquired - a.acquired || a.id - b.id).map((item, index) => [item.id, index + 1]));
}

function currentItems() {
  const query = state.query.trim().toLocaleLowerCase("zh-CN");
  const sorted = sortItems(state.items, state.sort, state.direction, state.manualOrder);
  if (!query) return sorted;
  return sorted.filter((item) => item.name.toLocaleLowerCase("zh-CN").includes(query)
    || item.pinyin.includes(query)
    || `hand-${String(item.id).padStart(4, "0")}`.includes(query));
}

function cardMarkup(item, rank) {
  const direction = item.change >= 0 ? "up" : "down";
  const change = `${item.change >= 0 ? "+" : ""}${item.change.toFixed(1)}%`;
  const name = escapeHtml(item.name);
  const rarity = escapeHtml(item.rarity);
  const source = escapeHtml(imageSource(item));
  const editButton = state.editMode ? `<button class="item-edit" type="button" aria-label="编辑${name}">编辑</button>` : "";
  return `
    <article class="item-card" data-id="${item.id}" aria-label="${name}，全服获得 ${formatNumber(item.acquired)} 次，数量排名第 ${rank}">
      ${editButton}
      <div class="item-card-content">
        <div class="item-card-top">
          <span class="item-id">HAND-${String(item.id).padStart(4, "0")}</span>
          <span class="item-rarity">${rarity}</span>
        </div>
        <div class="item-art"><img src="${source}" alt="${name}" draggable="false"></div>
        <div class="item-info">
          <h3 class="item-name">${name}</h3>
          <span class="item-change ${direction}">${change}</span>
          <div class="item-meta">
            <div><small>全服获得</small><strong class="item-count">${formatNumber(item.acquired)} 次</strong></div>
            <div class="item-price" ${state.showValue ? "" : "hidden"}><small>参考估值</small><strong>¥${item.value.toFixed(2)}</strong></div>
            <div class="item-rank" ${state.showValue ? "hidden" : ""}><small>数量排名</small><strong>#${rank}</strong></div>
          </div>
        </div>
      </div>
    </article>`;
}

function updateStats() {
  const totalAcquired = state.items.reduce((sum, item) => sum + item.acquired, 0);
  const totalValue = state.items.reduce((sum, item) => sum + item.value * item.acquired, 0);
  document.querySelector("#total-acquired").textContent = formatNumber(totalAcquired);
  document.querySelector("#total-items").textContent = String(state.items.length);
  document.querySelector("#third-stat-label").textContent = state.showValue ? "参考总估值" : "参考估值隐藏";
  document.querySelector("#third-stat").textContent = state.showValue ? `¥${formatNumber(Math.round(totalValue))}` : "--";
  document.querySelector("#third-stat-caption").textContent = state.showValue ? "按示例单价估算" : "开启开关后显示";
}

function updateDataTimestamp(date = new Date(), caption = "实时数量更新") {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  dataUpdated.dateTime = `${year}-${month}-${day}`;
  dataUpdated.textContent = `${month}/${day}`;
  dataUpdatedCaption.textContent = `${year} ${caption}`;
}

function centerImageOnAlpha(image) {
  if (!image.naturalWidth || !image.naturalHeight) return;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (pixels[(y * canvas.width + x) * 4 + 3] > 12) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX >= minX && maxY >= minY) {
    const scale = 163 / canvas.width;
    image.style.setProperty("--art-x", `${((canvas.width - 1) / 2 - (minX + maxX) / 2) * scale}px`);
    image.style.setProperty("--art-y", `${((canvas.height - 1) / 2 - (minY + maxY) / 2) * scale}px`);
  }
  image.dataset.centered = "true";
}

function centerImages() {
  grid.querySelectorAll(".item-art img").forEach((image) => {
    if (image.complete) centerImageOnAlpha(image);
    else image.addEventListener("load", () => centerImageOnAlpha(image), { once: true });
  });
}

function render() {
  const items = currentItems();
  const ranks = rankMap(state.items);
  grid.innerHTML = items.map((item) => cardMarkup(item, ranks.get(item.id))).join("");
  resultCount.textContent = `显示 ${items.length} / ${state.items.length} 件小物`;
  emptyState.hidden = items.length !== 0;
  grid.hidden = items.length === 0;
  updateStats();
  centerImages();
}

function updateEditMode(enabled) {
  state.editMode = Boolean(enabled);
  editModeButton.setAttribute("aria-pressed", String(state.editMode));
  editModeButton.textContent = state.editMode ? "完成编辑" : "编辑物品";
  render();
}

function openItemEditor(id) {
  const item = state.items.find((candidate) => candidate.id === Number(id));
  if (!item) return;
  state.editingId = item.id;
  dialogError.textContent = "";
  editImageInput.value = "";
  editIdInput.value = `HAND-${String(item.id).padStart(4, "0")}`;
  editNameInput.value = item.name;
  editPinyinInput.value = item.pinyin;
  editRarityInput.value = item.rarity;
  editAcquiredInput.value = String(item.acquired);
  editValueInput.value = String(item.value);
  editChangeInput.value = String(item.change);
  editImagePreview.src = imageSource(item);
  itemDialog.showModal();
  editNameInput.focus();
}

function closeItemEditor() {
  revokePreviewUrl();
  state.editingId = 0;
  editImageInput.value = "";
  dialogError.textContent = "";
  itemDialog.close();
}

function acceptedImage(file) {
  return file && ["image/png", "image/jpeg", "image/webp"].includes(file.type) && file.size <= 8 * 1024 * 1024;
}

function imageTypeError(file) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return "仅支持 PNG、JPG 和 WebP 图片";
  if (file.size > 8 * 1024 * 1024) return "图片不能超过 8 MB";
  return "";
}

function blobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
    reader.readAsDataURL(blob);
  });
}

function dataUrlAsBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(",", 2);
  const mimeType = /^data:([^;]+);base64$/i.exec(header)?.[1];
  if (!mimeType || !encoded) throw new TypeError("图片数据无效");
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

async function exportEditableState() {
  try {
    const items = await Promise.all(state.items.map(async (item) => {
      const imageBlob = state.imageBlobs.get(item.id);
      return imageBlob ? { ...item, imageData: await blobAsDataUrl(imageBlob) } : { ...item };
    }));
    const payload = JSON.stringify({ version: 1, items, order: state.manualOrder }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `trinket-market-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setEditStatus("已导出当前小物数据与本地图片");
  } catch (error) {
    setEditStatus(error instanceof Error ? `导出失败：${error.message}` : "导出失败", true);
  }
}

async function importEditableState(file) {
  try {
    const imported = validateImportedState(JSON.parse(await file.text()));
    const imageReplacements = new Map();
    for (const item of imported.items) {
      if (item.imageData) imageReplacements.set(item.id, dataUrlAsBlob(item.imageData));
    }
    const nextItems = imported.items.map(({ imageData, ...item }) => item);
    const previousLocalData = localStorage.getItem(DATA_STORAGE_KEY);
    if (!saveLocalState(localStorage, { version: 1, items: nextItems, order: imported.order })) {
      throw new Error("未能保存导入数据到当前浏览器");
    }
    try {
      await replaceItemImages(imageReplacements);
    } catch (error) {
      try {
        if (previousLocalData === null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousLocalData);
      } catch {
        // Keep the live session unchanged even if browser storage also rejects rollback.
      }
      throw error;
    }
    state.items = nextItems;
    state.manualOrder = imported.order;
    savePreferences();
    await refreshImageOverrides();
    render();
    setEditStatus("已导入小物数据并保存到当前浏览器");
  } catch (error) {
    setEditStatus(error instanceof Error ? `导入失败：${error.message}` : "导入文件无效", true);
  } finally {
    importInput.value = "";
  }
}

async function restoreCanonicalData() {
  if (!window.confirm("恢复后会清除当前浏览器里的物品修改、图片和拖拽顺序。是否继续？")) return;
  try {
    removeLocalState(localStorage);
    await clearItemImages();
    state.items = state.canonicalItems.map((item) => ({ ...item }));
    state.manualOrder = state.items.map((item) => item.id);
    savePreferences();
    await refreshImageOverrides();
    render();
    setEditStatus("已恢复官方数据");
  } catch (error) {
    setEditStatus(error instanceof Error ? `恢复失败：${error.message}` : "恢复失败", true);
  }
}

function setDirection(direction) {
  state.direction = direction === "asc" ? "asc" : "desc";
  sortDirection.dataset.direction = state.direction;
  const ascending = state.direction === "asc";
  sortDirectionLabel.textContent = state.sort === "name"
    ? (ascending ? "A → Z" : "Z → A")
    : (ascending ? "低 → 高" : "高 → 低");
}

function applyTheme(theme) {
  state.theme = THEMES.has(theme) ? theme : DEFAULT_THEME;
  document.body.dataset.theme = state.theme;
  themeSelect.value = state.theme;
  savePreferences();
}

function itemOrderFromGrid() {
  return [...grid.querySelectorAll(".item-card")].map((card) => Number(card.dataset.id));
}

function animateGridMove(before) {
  grid.querySelectorAll(".item-card").forEach((card) => {
    const first = before.get(card);
    if (!first || card.classList.contains("is-dragging")) return;
    const last = card.getBoundingClientRect();
    const x = first.left - last.left;
    const y = first.top - last.top;
    if (!x && !y) return;
    card.style.transition = "none";
    card.style.transform = `translate(${x}px, ${y}px)`;
    requestAnimationFrame(() => {
      card.style.transition = "transform .2s cubic-bezier(.2,.8,.2,1)";
      card.style.transform = "";
    });
  });
}

function beginDrag(event, card) {
  if (event.button !== 0 || state.query || event.target.closest("button, a, input, select, textarea, label")) return;
  event.preventDefault();
  const rect = card.getBoundingClientRect();
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;
  const ghost = card.cloneNode(true);
  ghost.className = "drag-ghost";
  ghost.removeAttribute("aria-label");
  Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, left: `${rect.left}px`, top: `${rect.top}px` });
  ghost.style.setProperty("--drag-x", "0px");
  ghost.style.setProperty("--drag-y", "0px");
  const lift = document.createElement("div");
  lift.className = "drag-ghost-lift";
  const wiggle = document.createElement("div");
  wiggle.className = "drag-ghost-wiggle";
  wiggle.append(...ghost.childNodes);
  lift.append(wiggle);
  ghost.append(lift);
  ghost.querySelectorAll("img").forEach((image) => { image.dataset.centered = "true"; });
  document.body.append(ghost);
  card.classList.add("is-dragging");
  grid.classList.add("is-drag-active");
  card.setPointerCapture?.(event.pointerId);

  function move(pointerEvent) {
    ghost.style.setProperty("--drag-x", `${pointerEvent.clientX - offsetX - rect.left}px`);
    ghost.style.setProperty("--drag-y", `${pointerEvent.clientY - offsetY - rect.top}px`);
    const target = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)?.closest(".item-card");
    if (!target || target === card || target.parentElement !== grid) return;
    const before = new Map([...grid.querySelectorAll(".item-card")].map((item) => [item, item.getBoundingClientRect()]));
    const targetRect = target.getBoundingClientRect();
    const afterTarget = pointerEvent.clientY > targetRect.top + targetRect.height / 2
      || (Math.abs(pointerEvent.clientY - (targetRect.top + targetRect.height / 2)) < targetRect.height / 3
        && pointerEvent.clientX > targetRect.left + targetRect.width / 2);
    grid.insertBefore(card, afterTarget ? target.nextSibling : target);
    state.manualOrder = itemOrderFromGrid();
    animateGridMove(before);
  }

  function end() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    const targetRect = card.getBoundingClientRect();
    ghost.classList.add("is-settling");
    ghost.style.setProperty("--drag-x", `${targetRect.left - rect.left}px`);
    ghost.style.setProperty("--drag-y", `${targetRect.top - rect.top}px`);
    state.manualOrder = itemOrderFromGrid();
    savePreferences();
    persistEditableState("拖拽顺序已保存到当前浏览器");
    const position = state.manualOrder.indexOf(Number(card.dataset.id)) + 1;
    dragStatus.textContent = `已移动到第 ${position} 位`;
    setTimeout(() => {
      ghost.remove();
      card.classList.remove("is-dragging");
      grid.classList.remove("is-drag-active");
    }, reduceMotion ? 0 : 230);
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
  window.addEventListener("pointercancel", end, { once: true });
}

grid.addEventListener("pointerdown", (event) => {
  const card = event.target.closest(".item-card");
  if (card) beginDrag(event, card);
});

grid.addEventListener("click", (event) => {
  const button = event.target.closest(".item-edit");
  if (button) openItemEditor(button.closest(".item-card")?.dataset.id);
});

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  render();
});

sortMode.addEventListener("change", () => {
  state.sort = sortMode.value;
  setDirection(state.sort === "acquired" ? "desc" : "asc");
  render();
});

sortDirection.addEventListener("click", () => {
  setDirection(state.direction === "asc" ? "desc" : "asc");
  render();
});

valueToggle.addEventListener("change", () => {
  state.showValue = valueToggle.checked;
  render();
});

themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));
retryButton.addEventListener("click", () => loadCatalog());
editModeButton.addEventListener("click", () => updateEditMode(!state.editMode));
exportButton.addEventListener("click", exportEditableState);
importInput.addEventListener("change", () => {
  const [file] = importInput.files;
  if (file) importEditableState(file);
});
resetButton.addEventListener("click", restoreCanonicalData);
dialogCloseButton.addEventListener("click", closeItemEditor);
dialogCancelButton.addEventListener("click", closeItemEditor);
itemDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeItemEditor();
});
editImageInput.addEventListener("change", () => {
  revokePreviewUrl();
  const [file] = editImageInput.files;
  if (!file) return;
  const error = imageTypeError(file);
  if (error) {
    dialogError.textContent = error;
    return;
  }
  dialogError.textContent = "";
  state.previewUrl = URL.createObjectURL(file);
  editImagePreview.src = state.previewUrl;
});
itemForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  dialogError.textContent = "";
  const [file] = editImageInput.files;
  const imageError = file ? imageTypeError(file) : "";
  if (imageError) {
    dialogError.textContent = imageError;
    return;
  }
  const current = state.items.find((item) => item.id === state.editingId);
  if (!current) {
    dialogError.textContent = "找不到要编辑的物品";
    return;
  }
  try {
    const [updated] = validateItems([{
      ...current,
      name: editNameInput.value,
      pinyin: editPinyinInput.value,
      rarity: editRarityInput.value,
      acquired: Number(editAcquiredInput.value),
      value: Number(editValueInput.value),
      change: Number(editChangeInput.value),
    }]);
    if (file && acceptedImage(file)) await saveItemImage(updated.id, file);
    state.items = state.items.map((item) => item.id === updated.id ? updated : item);
    persistEditableState();
    if (file) await refreshImageOverrides();
    closeItemEditor();
    render();
  } catch (error) {
    dialogError.textContent = error instanceof Error ? error.message : "保存失败，请检查输入内容";
  }
});

window.TrinketMarketAPI = Object.freeze({
  setAcquisitionCounts(counts) {
    state.items = applyAcquisitionCounts(state.items, counts);
    updateDataTimestamp();
    render();
    return state.items.map(({ id, acquired }) => ({ id, acquired }));
  },
});

window.addEventListener("trinket-market:counts", (event) => {
  window.TrinketMarketAPI.setAcquisitionCounts(event.detail);
});

async function loadCatalog() {
  errorPanel.hidden = true;
  document.body.removeAttribute("data-ready");
  try {
    const response = await fetch("./data/items.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`目录请求失败（${response.status}）`);
    state.canonicalItems = validateItems(await response.json());
    const saved = loadLocalState(localStorage);
    state.items = saved?.items || state.canonicalItems.map((item) => ({ ...item }));
    state.manualOrder = saved?.order || state.manualOrder;
    if (!state.manualOrder.length) state.manualOrder = state.items.map((item) => item.id);
    await refreshImageOverrides();
    render();
    document.body.dataset.ready = "true";
  } catch (error) {
    errorMessage.textContent = error instanceof Error ? error.message : "请稍后重试。";
    errorPanel.hidden = false;
    document.body.dataset.ready = "error";
  }
}

window.addEventListener("beforeunload", () => {
  revokePreviewUrl();
  revokeImageUrls();
});

loadPreferences();
applyTheme(state.theme);
setDirection("desc");
loadCatalog();
