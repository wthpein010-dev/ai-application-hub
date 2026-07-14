const KIND_BY_EXTENSION = {
  image: ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg"],
  video: ["mp4", "webm", "mov", "m4v", "mkv", "avi", "flv", "m3u8"],
  audio: ["mp3", "wav", "ogg", "aac", "m4a", "flac", "wma"],
  document: ["pdf", "zip", "rar", "7z", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "json"]
};

const state = {
  pageUrl: "",
  pageTitle: "",
  items: [],
  visible: [],
  selected: new Set(),
  kind: "all",
  query: "",
  minWidth: 0,
  minHeight: 0
};

const $ = (selector) => document.querySelector(selector);
const list = $("#list");
const statusBox = $("#status");

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  await hydrateEnvironment();
  render();
});

function bindEvents() {
  $("#scanForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await scanUrl($("#urlInput").value);
  });
  $("#topToggle").addEventListener("change", async (event) => {
    const enabled = await window.desktopAPI.setAlwaysOnTop(event.target.checked);
    event.target.checked = enabled;
    setStatus(enabled ? "窗口已保持置顶。" : "窗口已取消置顶。");
  });
  $("#openFolderButton").addEventListener("click", () => window.desktopAPI.openDownloadFolder());
  $("#searchInput").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });
  $("#minWidthInput").addEventListener("input", (event) => {
    state.minWidth = Number(event.target.value || 0);
    render();
  });
  $("#minHeightInput").addEventListener("input", (event) => {
    state.minHeight = Number(event.target.value || 0);
    render();
  });
  $("#selectAllButton").addEventListener("click", () => {
    state.visible.forEach((item) => state.selected.add(item.url));
    render();
  });
  $("#clearButton").addEventListener("click", () => {
    state.selected.clear();
    render();
  });
  $("#downloadButton").addEventListener("click", downloadSelected);

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.kind = button.dataset.kind;
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab === button));
      render();
    });
  });
}

async function hydrateEnvironment() {
  const environment = await window.desktopAPI.getEnvironment();
  $("#topToggle").checked = environment.alwaysOnTop;
}

async function scanUrl(rawUrl) {
  const url = rawUrl.trim();
  if (!url) {
    return;
  }

  $("#scanButton").disabled = true;
  setStatus("正在读取网页...");
  state.selected.clear();
  state.items = [];
  render();

  try {
    const page = await window.desktopAPI.fetchPage(url);
    state.pageUrl = page.url;
    const parsed = parsePage(page.html, page.url);
    state.pageTitle = parsed.title || new URL(page.url).hostname;
    state.items = mergeItems(parsed.items);
    $("#pageTitle").textContent = state.pageTitle;
    setStatus(state.items.length ? `扫描完成：发现 ${state.items.length} 个候选资源。` : "未发现可下载资源。");
    await hydrateImageSizes();
    render();
  } catch (error) {
    setStatus(`扫描失败：${error.message}`, true);
  } finally {
    $("#scanButton").disabled = false;
  }
}

function parsePage(html, baseUrl) {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  const items = new Map();

  document.querySelectorAll("img, picture source[srcset]").forEach((node) => {
    if (node.tagName.toLowerCase() === "source") {
      addSrcset(items, node.getAttribute("srcset"), baseUrl, "image", node);
      return;
    }
    addUrl(items, bestImageUrl(node), baseUrl, "image", node, {
      width: numberAttr(node, "width"),
      height: numberAttr(node, "height"),
      alt: node.getAttribute("alt") || ""
    });
    addSrcset(items, node.getAttribute("srcset"), baseUrl, "image", node);
  });

  document.querySelectorAll("video, video source").forEach((node) => {
    addUrl(items, node.getAttribute("src") || node.getAttribute("poster"), baseUrl, "video", node);
  });
  document.querySelectorAll("audio, audio source").forEach((node) => {
    addUrl(items, node.getAttribute("src"), baseUrl, "audio", node);
  });
  document.querySelectorAll("a[href]").forEach((node) => {
    const href = node.getAttribute("href");
    const kind = detectKind(href, baseUrl);
    if (kind) {
      addUrl(items, href, baseUrl, kind, node, { alt: node.textContent.trim() });
    }
  });
  document.querySelectorAll("[style]").forEach((node) => {
    const style = node.getAttribute("style") || "";
    Array.from(style.matchAll(/url\(["']?(.+?)["']?\)/g)).forEach((match) => {
      addUrl(items, match[1], baseUrl, "image", node);
    });
  });

  return {
    title: document.querySelector("title")?.textContent?.trim() || "",
    items: Array.from(items.values())
  };
}

function addSrcset(items, srcset, baseUrl, kind, node) {
  if (!srcset) {
    return;
  }
  srcset.split(",").forEach((candidate) => {
    const url = candidate.trim().split(/\s+/)[0];
    addUrl(items, url, baseUrl, kind, node);
  });
}

function addUrl(items, rawUrl, baseUrl, kind, node, extra = {}) {
  if (!rawUrl || rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) {
    return;
  }

  let url;
  try {
    url = new URL(rawUrl, baseUrl).href;
  } catch {
    return;
  }

  if (!/^https?:/.test(url)) {
    return;
  }

  const existing = items.get(url) || {};
  items.set(url, {
    id: stableId(url),
    url,
    pageUrl: baseUrl,
    kind,
    source: existing.source || "page",
    width: Math.max(Number(existing.width || 0), Number(extra.width || 0)),
    height: Math.max(Number(existing.height || 0), Number(extra.height || 0)),
    title: titleFor(url, extra.alt || node.getAttribute?.("aria-label") || node.getAttribute?.("title") || "")
  });
}

async function hydrateImageSizes() {
  const images = state.items.filter((item) => item.kind === "image" && (!item.width || !item.height)).slice(0, 80);
  await Promise.allSettled(images.map((item) => getImageSize(item.url).then((size) => {
    item.width = size.width;
    item.height = size.height;
  })));
}

function getImageSize(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
    image.onerror = reject;
    image.src = url;
  });
}

async function downloadSelected() {
  const selectedItems = state.items.filter((item) => state.selected.has(item.url));
  if (!selectedItems.length) {
    return;
  }

  $("#downloadButton").disabled = true;
  setStatus(`正在下载 ${selectedItems.length} 个资源...`);

  try {
    const host = state.pageUrl ? new URL(state.pageUrl).hostname : "网页素材";
    const response = await window.desktopAPI.downloadItems({
      folderName: `网页素材一键收-${host}`,
      items: selectedItems
    });
    const okCount = response.results.filter((result) => result.ok).length;
    const failedCount = response.results.length - okCount;
    setStatus(failedCount ? `下载完成：成功 ${okCount} 个，失败 ${failedCount} 个。` : `下载完成：${okCount} 个文件已保存。`);
  } catch (error) {
    setStatus(`下载失败：${error.message}`, true);
  } finally {
    $("#downloadButton").disabled = false;
  }
}

function mergeItems(items) {
  const byUrl = new Map();
  items.forEach((item) => {
    const current = byUrl.get(item.url) || {};
    byUrl.set(item.url, {
      ...current,
      ...item,
      width: Math.max(Number(current.width || 0), Number(item.width || 0)),
      height: Math.max(Number(current.height || 0), Number(item.height || 0))
    });
  });
  return Array.from(byUrl.values()).sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || (b.width * b.height) - (a.width * a.height));
}

function render() {
  state.visible = state.items.filter((item) => {
    const inKind = state.kind === "all" || item.kind === state.kind;
    const inQuery = !state.query || `${item.title} ${item.url}`.toLowerCase().includes(state.query);
    const inWidth = !state.minWidth || Number(item.width || 0) >= state.minWidth;
    const inHeight = !state.minHeight || Number(item.height || 0) >= state.minHeight;
    return inKind && inQuery && inWidth && inHeight;
  });

  $("#visibleCount").textContent = String(state.visible.length);
  $("#selectedCount").textContent = String(state.selected.size);
  $("#totalCount").textContent = String(state.items.length);
  $("#downloadButton").disabled = state.selected.size === 0;

  if (!state.visible.length) {
    list.innerHTML = '<div class="empty">没有匹配当前筛选条件的资源</div>';
    return;
  }

  list.replaceChildren(...state.visible.map(renderItem));
}

function renderItem(item) {
  const row = document.createElement("article");
  row.className = "item";

  const checkbox = document.createElement("input");
  checkbox.className = "check";
  checkbox.type = "checkbox";
  checkbox.checked = state.selected.has(item.url);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      state.selected.add(item.url);
    } else {
      state.selected.delete(item.url);
    }
    render();
  });

  const thumb = document.createElement("div");
  thumb.className = "thumb";
  if (item.kind === "image") {
    const img = document.createElement("img");
    img.src = item.url;
    img.alt = "";
    img.loading = "lazy";
    thumb.append(img);
  } else {
    thumb.textContent = iconFor(item.kind);
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `
    <div class="name"></div>
    <div class="url"></div>
    <div class="chips"></div>
  `;
  meta.querySelector(".name").textContent = item.title || "media";
  meta.querySelector(".url").textContent = item.url;

  [
    labelForKind(item.kind),
    item.width && item.height ? `${item.width}x${item.height}` : "",
    extensionFromUrl(item.url).toUpperCase()
  ]
    .filter(Boolean)
    .forEach((text) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = text;
      meta.querySelector(".chips").append(chip);
    });

  row.append(checkbox, thumb, meta);
  return row;
}

function bestImageUrl(img) {
  return img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-original");
}

function numberAttr(node, name) {
  const value = Number(node.getAttribute(name) || 0);
  return Number.isFinite(value) ? value : 0;
}

function detectKind(url, baseUrl) {
  try {
    const ext = extensionFromUrl(new URL(url, baseUrl).href);
    for (const [kind, extensions] of Object.entries(KIND_BY_EXTENSION)) {
      if (extensions.includes(ext)) {
        return kind;
      }
    }
  } catch {
    return "";
  }
  return "";
}

function extensionFromUrl(url) {
  try {
    const last = new URL(url).pathname.toLowerCase().split("/").pop() || "";
    return last.includes(".") ? last.split(".").pop().replace(/[^a-z0-9]/g, "") : "";
  } catch {
    return "";
  }
}

function titleFor(url, fallback) {
  const cleanFallback = fallback.replace(/\s+/g, " ").trim();
  if (cleanFallback) {
    return cleanFallback.slice(0, 80);
  }
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    return last || "media";
  } catch {
    return "media";
  }
}

function iconFor(kind) {
  return {
    video: "VIDEO",
    audio: "AUDIO",
    document: "DOC"
  }[kind] || "URL";
}

function labelForKind(kind) {
  return { image: "图片", video: "视频", audio: "音频", document: "文档" }[kind] || kind;
}

function kindRank(kind) {
  return { image: 1, video: 2, audio: 3, document: 4 }[kind] || 9;
}

function setStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.toggle("is-error", isError);
}

function stableId(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `d-${Math.abs(hash)}`;
}
