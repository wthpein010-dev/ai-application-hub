const state = {
  tab: null,
  context: null,
  tree: [],
  files: [],
  filesById: new Map(),
  selected: new Set(),
  expanded: new Set(["root:my", "root:shared", "root:wiki"]),
  visibleFileIds: new Set(),
  type: "all",
  query: "",
  jobRows: new Map(),
  activeJob: null
};

const $ = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  init().catch((error) => showError(error.message));
});

function bindEvents() {
  $("#refreshButton").addEventListener("click", () => loadLibrary(true));
  $("#searchInput").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });
  $("#selectVisibleButton").addEventListener("click", () => {
    state.visibleFileIds.forEach((id) => state.selected.add(id));
    render();
  });
  $("#clearButton").addEventListener("click", () => {
    state.selected.clear();
    render();
  });
  $("#exportButton").addEventListener("click", startExport);

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      state.type = button.dataset.type;
      document.querySelectorAll(".segment").forEach((segment) => segment.classList.toggle("is-active", segment === button));
      render();
    });
  });
}

async function init() {
  if (!globalThis.chrome?.tabs || !globalThis.chrome?.runtime) {
    loadPreviewData();
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tab = tab;

  if (!tab?.id || !/^https?:/.test(tab.url || "")) {
    throw new Error("请先打开飞书云文档或知识库页面");
  }

  const context = await readPageContext(tab);
  state.context = context;
  $("#pageTitle").textContent = context.isFeishu ? `${context.section} · ${context.title}` : "当前页面不是飞书";

  if (!context.isFeishu) {
    throw new Error("请在飞书云文档、知识库或网盘页面打开插件");
  }

  await loadLibrary(false);
}

async function readPageContext(tab) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    if (result?.result) {
      return result.result;
    }
  } catch {
    // Some pages block script injection. The active tab URL still gives us the origin.
  }

  const url = new URL(tab.url);
  return {
    title: tab.title || "飞书",
    pageUrl: tab.url,
    origin: url.origin,
    host: url.hostname,
    isFeishu: /(^|\.)feishu\.cn$|(^|\.)larksuite\.com$/.test(url.hostname),
    section: "飞书",
    currentToken: ""
  };
}

async function loadLibrary(force) {
  state.selected.clear();
  setStatus(force ? "正在刷新飞书文件列表" : "正在读取飞书文件列表", "loading", force ? 15 : 8);

  const response = await sendMessage({
    type: "LOAD_FEISHU_LIBRARY",
    origin: state.context.origin,
    force
  });

  if (!response.ok) {
    throw new Error(response.error || "读取文件列表失败");
  }

  state.tree = response.tree || [];
  state.files = response.files || [];
  state.filesById = new Map(state.files.map((file) => [file.id, file]));
  setStatus(response.cached ? "已使用缓存文件列表" : "文件列表已更新", "ready", 100);
  render();
}

function render() {
  const tree = $("#tree");
  const filtered = filterNodes(state.tree);
  state.visibleFileIds = collectFileIds(filtered);

  $("#totalCount").textContent = String(state.files.length);
  $("#visibleCount").textContent = String(state.visibleFileIds.size);
  $("#selectedCount").textContent = String(state.selected.size);
  $("#exportButton").disabled = state.selected.size === 0 || Boolean(state.activeJob);

  if (!filtered.length) {
    tree.innerHTML = '<div class="empty">没有匹配当前筛选的文件</div>';
    return;
  }

  tree.replaceChildren(...filtered.map((node) => renderNode(node, 0)));
}

function filterNodes(nodes) {
  return nodes
    .map((node) => {
      if (node.kind === "file") {
        const children = filterNodes(node.children || []);
        return matchesFile(node) || children.length ? { ...node, children } : null;
      }

      const children = filterNodes(node.children || []);
      return children.length ? { ...node, children } : null;
    })
    .filter(Boolean);
}

function matchesFile(file) {
  const inType = state.type === "all" || file.extension === state.type;
  const haystack = `${file.name} ${file.path} ${file.typeLabel}`.toLowerCase();
  const inQuery = !state.query || haystack.includes(state.query);
  return inType && inQuery;
}

function renderNode(node, level) {
  const wrapper = document.createElement("div");
  wrapper.className = "node";

  const row = document.createElement("div");
  row.className = "tree-row";
  row.style.paddingLeft = `${Math.min(level * 12 + 6, 54)}px`;

  const children = node.children || [];
  const hasChildren = children.length > 0;
  const isExpanded = state.expanded.has(node.id);

  const twisty = document.createElement("button");
  twisty.className = `twisty${hasChildren ? "" : " is-empty"}`;
  twisty.type = "button";
  twisty.title = isExpanded ? "收起" : "展开";
  twisty.textContent = isExpanded ? "⌄" : "›";
  twisty.addEventListener("click", () => {
    if (isExpanded) {
      state.expanded.delete(node.id);
    } else {
      state.expanded.add(node.id);
    }
    render();
  });

  const checkbox = document.createElement("input");
  checkbox.className = "tree-check";
  checkbox.type = "checkbox";
  checkbox.checked = isNodeFullySelected(node);
  checkbox.indeterminate = !checkbox.checked && isNodePartlySelected(node);
  checkbox.addEventListener("change", () => toggleNode(node, checkbox.checked));

  const main = document.createElement("div");
  main.className = "node-main";

  const badge = document.createElement("span");
  badge.className = `badge ${node.kind === "folder" ? "folder" : node.extension || ""}`;
  badge.textContent = node.kind === "folder" ? "DIR" : badgeText(node.extension);

  const text = document.createElement("div");
  text.className = "node-text";

  const name = document.createElement("div");
  name.className = "node-name";
  name.textContent = node.name;

  const path = document.createElement("div");
  path.className = "node-path";
  path.textContent = node.kind === "folder" ? node.path : node.path || "未分类";

  text.append(name, path);
  main.append(badge, text);

  const meta = document.createElement("div");
  meta.className = "node-meta";
  meta.textContent = node.kind === "folder" ? `${collectFileIds([node]).size} 项` : node.typeLabel;

  row.append(twisty, checkbox, main, meta);
  wrapper.append(row);

  if (hasChildren && isExpanded) {
    const childWrap = document.createElement("div");
    childWrap.className = "children";
    children.forEach((child) => childWrap.append(renderNode(child, level + 1)));
    wrapper.append(childWrap);
  }

  return wrapper;
}

function toggleNode(node, checked) {
  const ids = collectFileIds([node]);
  ids.forEach((id) => {
    if (checked) {
      state.selected.add(id);
    } else {
      state.selected.delete(id);
    }
  });
  render();
}

function isNodeFullySelected(node) {
  const ids = collectFileIds([node]);
  return ids.size > 0 && Array.from(ids).every((id) => state.selected.has(id));
}

function isNodePartlySelected(node) {
  const ids = collectFileIds([node]);
  return Array.from(ids).some((id) => state.selected.has(id));
}

function collectFileIds(nodes) {
  const ids = new Set();
  const walk = (node) => {
    if (node.kind === "file") {
      ids.add(node.id);
    }
    (node.children || []).forEach(walk);
  };
  nodes.forEach(walk);
  return ids;
}

function badgeText(extension) {
  return {
    docx: "DOC",
    xlsx: "XLS",
    pptx: "PPT",
    mm: "MM"
  }[extension] || "FILE";
}

function startExport() {
  const files = Array.from(state.selected)
    .map((id) => state.filesById.get(id))
    .filter(Boolean);

  if (!files.length || state.activeJob) {
    return;
  }

  state.activeJob = {
    total: files.length,
    completed: 0,
    failed: 0
  };
  state.jobRows.clear();
  $("#jobPanel").hidden = false;
  $("#jobList").replaceChildren(...files.map(createJobRow));
  setStatus(`正在下载 0 / ${files.length}`, "loading", 0);
  render();

  const port = chrome.runtime.connect({ name: "feishu-export" });
  port.onMessage.addListener((message) => handleJobMessage(message, port));
  port.onDisconnect.addListener(() => {
    if (state.activeJob) {
      setStatus("下载连接已断开，已创建的任务会继续留在浏览器下载管理器", "error", 100);
      state.activeJob = null;
      render();
    }
  });

  port.postMessage({
    type: "START_EXPORT",
    origin: state.context.origin,
    folderName: `Feishu-Export-${timestamp()}`,
    files
  });
}

function createJobRow(file) {
  const row = document.createElement("div");
  row.className = "job-row";
  row.dataset.fileId = file.id;

  const copy = document.createElement("div");
  const name = document.createElement("div");
  name.className = "job-name";
  name.textContent = file.name;
  const message = document.createElement("div");
  message.className = "job-message";
  message.textContent = file.path || "等待开始";
  copy.append(name, message);

  const stateBadge = document.createElement("span");
  stateBadge.className = "job-state";
  stateBadge.textContent = "等待";

  row.append(copy, stateBadge);
  state.jobRows.set(file.id, row);
  return row;
}

function handleJobMessage(message, port) {
  if (message.type === "file-update") {
    const row = state.jobRows.get(message.fileId);
    if (row) {
      row.classList.remove("is-running", "is-done", "is-failed");
      row.classList.add(`is-${message.status}`);
      row.querySelector(".job-message").textContent = message.message || "";
      row.querySelector(".job-state").textContent = statusLabel(message.status);
    }
  }

  if (message.type === "job-progress") {
    state.activeJob.completed = message.completed;
    state.activeJob.failed = message.failed;
    $("#jobSummary").textContent = `${message.completed + message.failed} / ${message.total}`;
    setStatus(`正在下载 ${message.completed + message.failed} / ${message.total}`, "loading", message.percent);
  }

  if (message.type === "job-complete") {
    state.activeJob = null;
    $("#jobSummary").textContent = `${message.completed + message.failed} / ${message.total}`;
    setStatus(message.failed ? `完成 ${message.completed} 个，失败 ${message.failed} 个` : `已创建 ${message.completed} 个下载任务`, message.failed ? "error" : "ready", 100);
    port.disconnect();
    render();
  }

  if (message.type === "job-error") {
    state.activeJob = null;
    setStatus(message.error || "下载任务失败", "error", 100);
    port.disconnect();
    render();
  }
}

function statusLabel(status) {
  return {
    running: "进行中",
    done: "完成",
    failed: "失败"
  }[status] || "等待";
}

function setStatus(message, mode = "loading", percent = 0) {
  $("#statusText").textContent = message;
  $("#progressBar").style.width = `${Math.max(0, Math.min(100, percent))}%`;
  const card = document.querySelector(".status-card");
  card.classList.toggle("is-ready", mode === "ready");
  card.classList.toggle("is-error", mode === "error");
}

function showError(message) {
  setStatus(message, "error", 100);
  $("#tree").innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
  $("#exportButton").disabled = true;
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
      } else {
        resolve(response || {});
      }
    });
  });
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function loadPreviewData() {
  state.context = { origin: "https://example.feishu.cn", isFeishu: true, section: "预览", title: "本地预览" };
  $("#pageTitle").textContent = "预览 · 本地界面";
  state.files = [
    { id: "file:1", kind: "file", obj_token: "1", obj_type: 22, name: "项目复盘", path: "我的文件/团队资料", extension: "docx", typeLabel: "文档" },
    { id: "file:2", kind: "file", obj_token: "2", obj_type: 8, name: "客户线索", path: "共享文件夹/销售", extension: "xlsx", typeLabel: "多维表格" },
    { id: "file:3", kind: "file", obj_token: "3", obj_type: 30, name: "季度汇报", path: "知识库/经营分析", extension: "pptx", typeLabel: "幻灯片" }
  ];
  state.tree = [
    {
      id: "root:my",
      kind: "folder",
      name: "我的文件",
      path: "我的文件",
      children: [state.files[0]]
    },
    {
      id: "root:shared",
      kind: "folder",
      name: "共享文件夹",
      path: "共享文件夹",
      children: [state.files[1]]
    },
    {
      id: "root:wiki",
      kind: "folder",
      name: "知识库",
      path: "知识库",
      children: [state.files[2]]
    }
  ];
  state.filesById = new Map(state.files.map((file) => [file.id, file]));
  setStatus("本地预览模式", "ready", 100);
  render();
}
