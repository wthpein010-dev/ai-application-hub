import { applyAcquisitionCounts, sortItems, validateItems } from "./core/items.js";

const STORAGE_KEY = "trinket-market-v1-preferences";
const DEFAULT_THEME = "a";
const THEMES = new Set(["a", "b", "c"]);
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

const state = {
  items: [],
  manualOrder: [],
  query: "",
  sort: "acquired",
  direction: "desc",
  showValue: false,
  theme: DEFAULT_THEME,
};

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
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
  return `
    <article class="item-card" data-id="${item.id}" aria-label="${item.name}，全服获得 ${formatNumber(item.acquired)} 次，数量排名第 ${rank}">
      <div class="item-card-content">
        <div class="item-card-top">
          <span class="item-id">HAND-${String(item.id).padStart(4, "0")}</span>
          <span class="item-rarity">${item.rarity}</span>
        </div>
        <div class="item-art"><img src="${item.image}" alt="${item.name}" draggable="false"></div>
        <div class="item-info">
          <h3 class="item-name">${item.name}</h3>
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
  if (event.button !== 0 || state.query) return;
  event.preventDefault();
  const rect = card.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;
  const ghost = card.cloneNode(true);
  ghost.className = "drag-ghost";
  ghost.removeAttribute("aria-label");
  Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, left: `${rect.left}px`, top: `${rect.top}px` });
  ghost.querySelectorAll("img").forEach((image) => { image.dataset.centered = "true"; });
  document.body.append(ghost);
  card.classList.add("is-dragging");
  grid.classList.add("is-drag-active");
  card.setPointerCapture?.(event.pointerId);

  function move(pointerEvent) {
    ghost.style.left = `${pointerEvent.clientX - offsetX}px`;
    ghost.style.top = `${pointerEvent.clientY - offsetY}px`;
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
    ghost.remove();
    card.classList.remove("is-dragging");
    grid.classList.remove("is-drag-active");
    state.manualOrder = itemOrderFromGrid();
    savePreferences();
    const position = state.manualOrder.indexOf(Number(card.dataset.id)) + 1;
    dragStatus.textContent = `已移动到第 ${position} 位`;
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
  window.addEventListener("pointercancel", end, { once: true });
}

grid.addEventListener("pointerdown", (event) => {
  const card = event.target.closest(".item-card");
  if (card) beginDrag(event, card);
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

window.TrinketMarketAPI = Object.freeze({
  setAcquisitionCounts(counts) {
    state.items = applyAcquisitionCounts(state.items, counts);
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
    state.items = validateItems(await response.json());
    if (!state.manualOrder.length) state.manualOrder = state.items.map((item) => item.id);
    render();
    document.body.dataset.ready = "true";
  } catch (error) {
    errorMessage.textContent = error instanceof Error ? error.message : "请稍后重试。";
    errorPanel.hidden = false;
    document.body.dataset.ready = "error";
  }
}

loadPreferences();
applyTheme(state.theme);
setDirection("desc");
loadCatalog();
