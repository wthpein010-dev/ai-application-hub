const STORAGE_KEY = "ai-competition-hub-v2-apps";
const SELECTED_KEY = "ai-competition-hub-v2-selected";
const PROJECT_ROOT_URL = "./projects/";
const OLD_HUB_BRIEF = "把所有应用、体验入口、下载包和提交材料集中在一个本地页面中，方便审核和维护。";
const HUB_BRIEF = "通过 Codex 调用 HyperFrames，快速制作网页动态效果；支持编辑和调整网页描述，沉淀可定制化网页模板的小工具设计。";

const statusLabel = {
  navigation: "项目导航",
  content: "内容工具",
  plugin: "插件工具",
  assistant: "辅助工具",
  game: "小游戏",
  life: "生活工具",
  training: "训练工具",
  idea: "创意工具"
};

const defaultApps = [
  {
    id: "hub",
    name: "AI 应用方案整理器",
    category: "项目总览",
    status: "navigation",
    brief: HUB_BRIEF,
    problem: "项目材料分散在多个目录，临近提交时难以快速判断哪个项目最完整、入口在哪里、还缺什么。",
    aiUse: "AI 用于整理应用说明、维护建议、入口状态和提交材料清单。",
    folder: "./",
    entry: "./index.html",
    package: "./downloads/ai-application-hub.zip",
    tags: ["总览", "导航", "清单", "维护"],
    speed: 9,
    impact: 8,
    risk: 9,
    polish: 9
  },
  {
    id: "vita-mahjong",
    name: "羊了个羊：对对碰",
    category: "Unity H5 小游戏",
    status: "game",
    brief: "基于羊了个羊体验做的后续玩法变形，以拟人砖块、槽位、道具和城市羊群包装构成可直接游玩的 H5 原型。",
    problem: "需要一个外网可访问的最新 WebGL 包，方便团队、朋友或外部评审直接打开体验，不依赖局域网服务。",
    aiUse: "AI 参与关卡编辑器、关卡逻辑、道具流程、UI 调整、WebGL 打包和外网发布流程维护。",
    folder: "./projects/vita-mahjong/",
    entry: "./projects/vita-mahjong/index.html",
    package: "./downloads/vita-mahjong-webgl.zip",
    tags: ["Unity", "WebGL", "小游戏", "羊了个羊"],
    speed: 8,
    impact: 9,
    risk: 7,
    polish: 8
  },
  {
    id: "travel-generator",
    name: "朋友圈发图神器",
    category: "AI 内容生成",
    status: "content",
    brief: "输入旅行心情和目的地，生成拍照任务、九宫格结构、预算建议和可直接发布的朋友圈文案。",
    problem: "旅行后照片很多，但整理成可发布的内容费时，文案、配图和节奏经常不统一。",
    aiUse: "AI 理解场景与情绪，生成拍照任务、图片收集建议、预算提醒和多风格分享文案。",
    folder: "../朋友圈发图神器/",
    entry: "../朋友圈发图神器/01_作品体验入口/app/index.html",
    video: "../朋友圈发图神器/03_演示视频/演示视频.html",
    package: "../朋友圈发图神器/07_发布提交包/travel-generator-submission.zip",
    tags: ["旅行", "朋友圈", "文案", "九宫格"],
    speed: 9,
    impact: 9,
    risk: 8,
    polish: 9
  },
  {
    id: "feishu-downloader",
    name: "飞书文件批量下载插件",
    category: "浏览器插件",
    status: "plugin",
    brief: "面向飞书文档和文件资源整理场景，提供更清晰的批量下载和插件说明入口。",
    problem: "飞书资料分散在不同文档和文件里，手动逐个下载效率低，交付审核时也难以复查。",
    aiUse: "AI 参与需求拆解、交互文案、安装说明和审核材料梳理。",
    folder: "../飞书文件批量下载插件/",
    entry: "../飞书文件批量下载插件/index.html",
    package: "../飞书文件批量下载插件/feishu-batch-downloader-extension.zip",
    tags: ["飞书", "插件", "批量下载", "资料整理"],
    speed: 8,
    impact: 9,
    risk: 7,
    polish: 8
  },
  {
    id: "codex-reviewer",
    name: "Codex 对话评分工具",
    category: "效率工具",
    status: "assistant",
    brief: "读取 Codex 对话记录并进行整理、分析和导出，帮助复盘 AI 协作过程。",
    problem: "长对话里有大量决策、修改和验证记录，人工复盘成本高，也不容易发现质量波动。",
    aiUse: "AI 用于总结对话、抽取任务进展、检查风险点并形成复盘报告。",
    folder: "../Codex对话评分工具/",
    entry: "../Codex对话评分工具/index.html",
    package: "../Codex对话评分工具/Windows发布包/Codex对话评分工具.zip",
    tags: ["Codex", "复盘", "报告", "整理"],
    speed: 8,
    impact: 8,
    risk: 8,
    polish: 7
  },
  {
    id: "wanhuatong",
    name: "万花筒",
    category: "AI 表达转换",
    status: "life",
    brief: "把一段话转换成情绪表达、生活说明、情书暗语、多语言或古诗古文版本。",
    problem: "同一句话在不同关系、场景和语言里需要不同说法，临时组织表达既费时又容易说偏。",
    aiUse: "AI 用于识别表达意图、切换语气风格、生成多语言版本，并把复杂内容整理成可直接使用的文本。",
    folder: "../万花筒/",
    entry: "../万花筒/index.html",
    package: "./downloads/wanhuatong.zip",
    tags: ["表达转换", "多语言", "情书", "古诗古文"],
    speed: 9,
    impact: 8,
    risk: 8,
    polish: 8
  },
  {
    id: "interview-theater",
    name: "AI 面试陪练小剧场",
    category: "职业工具",
    status: "training",
    brief: "选择岗位后，AI 扮演面试官连续追问，并给出复盘建议。",
    problem: "普通面试题库缺少真实追问压力，练完也不知道回答哪里需要改。",
    aiUse: "AI 用于岗位画像、角色扮演追问、答案评估和复盘建议生成。",
    folder: "../AI面试陪练小剧场/",
    entry: "../AI面试陪练小剧场/index.html",
    package: "./downloads/interview-theater.zip",
    tags: ["面试", "追问", "复盘", "陪练"],
    speed: 7,
    impact: 8,
    risk: 7,
    polish: 7
  },
  {
    id: "idea-library",
    name: "备选应用工具创意库",
    category: "方案库",
    status: "idea",
    brief: "保存更多 AI 小工具方向，用于后续筛选、扩展和补充展示。",
    problem: "创意很多但容易丢失，缺少统一的价值、风险和实现范围判断。",
    aiUse: "AI 用于生成方向、归纳适用场景、评估 MVP 范围和整理说明。",
    folder: "../备选应用工具创意库/",
    entry: "../备选应用工具创意库/index.html",
    package: "./downloads/idea-library.zip",
    tags: ["创意库", "备选", "MVP", "筛选"],
    speed: 9,
    impact: 7,
    risk: 9,
    polish: 7
  }
];

let apps = loadApps();

const state = {
  query: "",
  category: "all",
  status: "all",
  sort: "default",
  selectedId: localStorage.getItem(SELECTED_KEY) || "travel-generator",
  editing: false
};

const nodes = {
  statApps: document.querySelector("#statApps"),
  statMain: document.querySelector("#statMain"),
  statReady: document.querySelector("#statReady"),
  statScore: document.querySelector("#statScore"),
  spotlight: document.querySelector("#spotlightCard"),
  dots: document.querySelector("#showcaseDots"),
  prevApp: document.querySelector("#prevApp"),
  nextApp: document.querySelector("#nextApp"),
  search: document.querySelector("#searchInput"),
  category: document.querySelector("#categoryFilter"),
  status: document.querySelector("#statusFilter"),
  sort: document.querySelector("#sortMode"),
  grid: document.querySelector("#appGrid"),
  resultCount: document.querySelector("#resultCount"),
  gameGrid: document.querySelector("#gameGrid"),
  gameCount: document.querySelector("#gameCount"),
  compare: document.querySelector("#compareBars"),
  command: document.querySelector("#commandInput"),
  log: document.querySelector("#responseLog"),
  commandRun: document.querySelector("#commandRun"),
  runUpdate: document.querySelector("#runUpdate"),
  streamButton: document.querySelector("#streamButton"),
  exportButton: document.querySelector("#exportButton"),
  editPanel: document.querySelector("#editPanel"),
  editClose: document.querySelector("#editClose"),
  editSave: document.querySelector("#editSave"),
  editReset: document.querySelector("#editReset"),
  editAppSelect: document.querySelector("#editAppSelect"),
  editName: document.querySelector("#editName"),
  editCategory: document.querySelector("#editCategory"),
  editBrief: document.querySelector("#editBrief"),
  editStatus: document.querySelector("#editStatus"),
  editTags: document.querySelector("#editTags"),
  editProblem: document.querySelector("#editProblem"),
  editAiUse: document.querySelector("#editAiUse"),
  editFolder: document.querySelector("#editFolder"),
  editEntry: document.querySelector("#editEntry"),
};

bindEvents();
renderCategoryOptions();
render();
log("页面已加载。输入 1 或点击更新，可刷新当前应用清单。");

function bindEvents() {
  nodes.search.addEventListener("input", event => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });

  nodes.category.addEventListener("change", event => {
    state.category = event.target.value;
    render();
  });

  nodes.status.addEventListener("change", event => {
    state.status = event.target.value;
    render();
  });

  nodes.sort.addEventListener("change", event => {
    state.sort = event.target.value;
    render();
  });

  nodes.dots.addEventListener("click", event => {
    const dot = event.target.closest("[data-dot-id]");
    if (!dot) return;
    selectApp(dot.dataset.dotId);
  });

  nodes.grid.addEventListener("click", event => {
    if (event.target.closest("a, button")) return;
    const card = event.target.closest("[data-app-id]");
    if (!card) return;
    selectApp(card.dataset.appId);
  });

  nodes.prevApp.addEventListener("click", () => switchApp(-1));
  nodes.nextApp.addEventListener("click", () => switchApp(1));

  nodes.command.addEventListener("keydown", event => {
    if (event.key === "Enter") runCommand();
  });

  nodes.commandRun.addEventListener("click", runCommand);
  nodes.runUpdate.addEventListener("click", runMaintenance);
  nodes.streamButton.addEventListener("click", streamMaintenance);
  nodes.exportButton.addEventListener("click", toggleEditMode);
  nodes.editClose.addEventListener("click", closeEditMode);
  nodes.editSave.addEventListener("click", saveEditForm);
  nodes.editReset.addEventListener("click", resetEdits);

  nodes.editAppSelect.addEventListener("change", event => {
    selectApp(event.target.value);
    renderEditForm();
  });
}

function render() {
  const filtered = getFilteredApps();
  ensureSelectedApp(filtered);
  renderStats();
  renderSpotlight();
  renderDots();
  renderGrid(filtered);
  renderGameGrid(filtered);
  renderCompare(filtered);
  renderEditForm();
}

function renderCategoryOptions() {
  const categories = [...new Set(apps.map(app => app.category))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  nodes.category.innerHTML = [
    `<option value="all">全部分类</option>`,
    ...categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
  ].join("");
  nodes.category.value = state.category;
}

function getFilteredApps() {
  const query = state.query;
  return apps
    .filter(app => {
      const haystack = [app.name, app.category, app.brief, app.problem, app.aiUse, ...app.tags].join(" ").toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesCategory = state.category === "all" || app.category === state.category;
      const matchesStatus = state.status === "all" || app.status === state.status;
      return matchesQuery && matchesCategory && matchesStatus;
    })
    .sort((a, b) => {
      if (state.sort === "type") return statusLabel[a.status].localeCompare(statusLabel[b.status], "zh-CN") || a.name.localeCompare(b.name, "zh-CN");
      if (state.sort === "category") return a.category.localeCompare(b.category, "zh-CN") || a.name.localeCompare(b.name, "zh-CN");
      if (state.sort === "name") return a.name.localeCompare(b.name, "zh-CN");
      return defaultApps.findIndex(item => item.id === a.id) - defaultApps.findIndex(item => item.id === b.id);
    });
}

function renderStats() {
  const readyCount = apps.filter(app => app.entry).length;
  const packageCount = apps.filter(app => app.package).length;
  nodes.statApps.textContent = apps.length;
  nodes.statMain.textContent = apps.filter(app => app.status !== "navigation").length;
  nodes.statReady.textContent = readyCount;
  nodes.statScore.textContent = packageCount;
}

function renderSpotlight() {
  const app = getSelectedApp();
  const previewTags = app.tags.slice(0, 3).map(tag => `<span>${escapeHtml(tag)}</span>`).join("");
  const statusText = statusLabel[app.status] || "应用工具";
  const entryText = app.entry ? "可体验" : "待补充";
  nodes.spotlight.innerHTML = `
    <div class="summary-copy">
      <span class="summary-type">${escapeHtml(app.category)}</span>
      <strong>${escapeHtml(app.name)}</strong>
      <p>${escapeHtml(app.brief)}</p>
      <div class="summary-insights">
        <span><small>类型</small><b>${escapeHtml(statusText)}</b></span>
        <span><small>材料</small><b>${materialCount(app)}/3</b></span>
        <span><small>入口</small><b>${escapeHtml(entryText)}</b></span>
      </div>
      <p class="summary-problem"><span>使用场景</span>${escapeHtml(app.problem)}</p>
      <div class="tag-row">${app.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      ${renderActions(app, true)}
    </div>
    <div class="app-preview" aria-hidden="true">
      <div class="preview-chrome">
        <i></i><i></i><i></i>
        <span>${escapeHtml(statusText)}</span>
      </div>
      <div class="preview-screen">
        <div class="preview-kicker">${escapeHtml(app.category)}</div>
        <div class="preview-title">${escapeHtml(app.name)}</div>
        <div class="preview-lines">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="preview-tags">${previewTags}</div>
      </div>
    </div>
  `;
}

function renderDots() {
  nodes.dots.innerHTML = apps.map((app, index) => `
    <button class="showcase-dot ${app.id === state.selectedId ? "active" : ""}" type="button" data-dot-id="${escapeHtml(app.id)}" aria-label="${escapeHtml(app.name)}"></button>
  `).join("");
}

function renderGrid(filtered) {
  const applicationList = filtered.filter(app => app.status !== "game");
  nodes.resultCount.textContent = `${applicationList.length} 个应用`;
  if (!applicationList.length) {
    nodes.grid.innerHTML = `<article class="app-card"><h3>没有匹配结果</h3><p>换个关键词或重置筛选条件再试。</p></article>`;
    return;
  }

  nodes.grid.innerHTML = applicationList.map(renderAppCard).join("");
}

function renderGameGrid(filtered) {
  if (!nodes.gameGrid) return;
  const gameList = filtered.filter(app => app.status === "game");
  if (nodes.gameCount) {
    nodes.gameCount.textContent = `${gameList.length} 个小游戏`;
  }
  if (!gameList.length) {
    nodes.gameGrid.innerHTML = `<article class="app-card"><h3>没有匹配结果</h3><p>换个关键词或重置筛选条件再试。</p></article>`;
    return;
  }

  nodes.gameGrid.innerHTML = gameList.map((app, index) => renderAppCard(app, index, " game-experience-card")).join("");
}

function renderAppCard(app, index = 0, extraClass = "") {
  return `
    <article class="app-card${extraClass} ${app.id === state.selectedId ? "selected" : ""}" data-app-id="${escapeHtml(app.id)}" style="--card-order:${index}">
      <div class="card-topline">
        <span class="status-badge status-${escapeHtml(app.status)}">${escapeHtml(statusLabel[app.status])}</span>
        <span>${escapeHtml(app.category)}</span>
      </div>
      <h3>${escapeHtml(app.name)}</h3>
      <p>${escapeHtml(app.brief)}</p>
      <div class="tag-row">${app.tags.slice(0, 4).map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="card-bottom">
        ${renderActions(app, true)}
      </div>
    </article>
  `;
}

function renderCompare(filtered) {
  const list = (filtered.length ? filtered : apps).slice(0, 9);
  nodes.compare.innerHTML = list.map(app => `
    <div class="bar-item">
      <div>
        <strong>${escapeHtml(app.name)}</strong>
        <span>${escapeHtml(app.category)} / ${escapeHtml(statusLabel[app.status])}</span>
      </div>
      <b>${materialCount(app)}/3</b>
    </div>
  `).join("");
}

function renderActions(app, stopPropagation = false) {
  const stop = stopPropagation ? ` onclick="event.stopPropagation()"` : "";
  const download = app.package ? `<a class="download-link" data-action="download" href="${escapeHtml(projectHref(app.package))}" download${stop}>下载</a>` : "";
  const demo = app.entry ? `<a class="primary-link" data-action="demo" href="${escapeHtml(projectHref(app.entry))}"${stop}>演示</a>` : "";
  const video = app.video ? `<a data-action="video" href="${escapeHtml(projectHref(app.video))}"${stop}>视频</a>` : "";
  return `
    <div class="card-actions">
      ${download}
      ${demo}
      ${video}
    </div>
  `;
}

function materialCount(app) {
  return [app.package, app.entry, app.video].filter(Boolean).length;
}

function materialSummary(app) {
  return `材料 ${materialCount(app)}/3`;
}

function renderEditForm() {
  const app = getSelectedApp();
  nodes.editAppSelect.innerHTML = apps.map(item => (
    `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`
  )).join("");
  nodes.editAppSelect.value = app.id;
  nodes.editName.value = app.name;
  nodes.editCategory.value = app.category;
  nodes.editBrief.value = app.brief;
  nodes.editStatus.value = app.status;
  nodes.editTags.value = app.tags.join(", ");
  nodes.editProblem.value = app.problem;
  nodes.editAiUse.value = app.aiUse;
  nodes.editFolder.value = app.folder;
  nodes.editEntry.value = app.entry;
}

function selectApp(id) {
  if (!apps.some(app => app.id === id)) return;
  state.selectedId = id;
  localStorage.setItem(SELECTED_KEY, id);
  render();
}

function ensureSelectedApp(filtered) {
  if (apps.some(app => app.id === state.selectedId)) return;
  state.selectedId = (filtered[0] || apps[0]).id;
}

function getSelectedApp() {
  return apps.find(app => app.id === state.selectedId) || apps[0];
}

function switchApp(direction) {
  const currentIndex = Math.max(0, apps.findIndex(app => app.id === state.selectedId));
  const nextIndex = (currentIndex + direction + apps.length) % apps.length;
  selectApp(apps[nextIndex].id);
}

function getAdvice(app) {
  if (app.status === "navigation") return "作为总览入口使用，重点保证所有链接可打开、文案清晰、下载和演示入口一致。";
  if (app.status === "plugin") return "作为插件工具展示时，优先说明安装方式、使用场景和下载包内容。";
  if (app.status === "game") return "作为小游戏展示时，优先保留清晰玩法、即时反馈和可打开的演示入口。";
  if (app.status === "training") return "作为训练工具展示时，优先说明角色流程、追问机制和复盘输出。";
  if (materialCount(app) < 2) return "建议补齐下载包或演示入口，让审核者能直接体验和获取材料。";
  return "入口材料较完整，继续保持说明清晰，并确认下载、演示和视频链接都能直接打开。";
}

function runCommand() {
  if (nodes.command.value.trim() === "1") {
    nodes.command.value = "";
    runMaintenance();
  } else {
    log("未知命令。当前维护命令是 1。");
  }
}

function runMaintenance() {
  renderCategoryOptions();
  render();
  log(`维护完成：已刷新 ${apps.length} 个应用，类型 ${new Set(apps.map(app => app.status)).size} 类，演示入口 ${apps.filter(app => app.entry).length} 个。`);
}

async function streamMaintenance() {
  const lines = [
    "正在读取应用集合...",
    "正在检查演示入口和提交材料入口...",
    "正在刷新类型筛选与材料入口状态...",
    "正在重绘当前应用详情...",
    "维护预览完成。"
  ];
  for (const line of lines) {
    log(line);
    await wait(180);
  }
}

function toggleEditMode() {
  state.editing = !state.editing;
  document.body.classList.toggle("editing", state.editing);
  nodes.editPanel.setAttribute("aria-hidden", String(!state.editing));
  nodes.exportButton.textContent = state.editing ? "退出编辑" : "编辑";
  renderEditForm();
}

function closeEditMode() {
  state.editing = false;
  document.body.classList.remove("editing");
  nodes.editPanel.setAttribute("aria-hidden", "true");
  nodes.exportButton.textContent = "编辑";
}

function saveEditForm() {
  apps = apps.map(app => {
    if (app.id !== state.selectedId) return app;
    return {
      ...app,
      name: nodes.editName.value.trim() || app.name,
      category: nodes.editCategory.value.trim() || app.category,
      brief: nodes.editBrief.value.trim() || app.brief,
      status: nodes.editStatus.value,
      tags: nodes.editTags.value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean),
      problem: nodes.editProblem.value.trim() || app.problem,
      aiUse: nodes.editAiUse.value.trim() || app.aiUse,
      folder: nodes.editFolder.value.trim() || app.folder,
      entry: nodes.editEntry.value.trim() || app.entry
    };
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
  renderCategoryOptions();
  render();
  log("已保存到当前浏览器本地存储。");
}

function resetEdits() {
  localStorage.removeItem(STORAGE_KEY);
  apps = defaultApps.map(cloneApp);
  renderCategoryOptions();
  render();
  log("已恢复默认应用数据。");
}

function exportList() {
  const markdown = [
    "# AI 应用项目清单",
    "",
    ...apps.map(app => [
      `## ${app.name}`,
      `- 类型：${statusLabel[app.status]}`,
      `- 分类：${app.category}`,
      `- 简介：${app.brief}`,
      `- 材料：${materialSummary(app)}`,
      app.package ? `- 下载：${app.package}` : "",
      app.entry ? `- 演示：${app.entry}` : "",
      app.video ? `- 视频：${app.video}` : ""
    ].filter(Boolean).join("\n"))
  ].join("\n\n");

  navigator.clipboard?.writeText(markdown).then(() => {
    log("已复制 Markdown 清单到剪贴板。");
  }).catch(() => {
    log(markdown);
  });
}

function loadApps() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(stored) && stored.length) {
      const storedById = new Map(stored.map(app => [app.id, app]));
      return defaultApps.map(app => normalizeApp(storedById.get(app.id) || app));
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return defaultApps.map(cloneApp);
}

function normalizeApp(app) {
  const base = cloneApp(defaultApps.find(item => item.id === app.id) || defaultApps[0]);
  const normalized = {
    ...base,
    ...app,
    tags: Array.isArray(app.tags) ? app.tags : []
  };
  if (!statusLabel[normalized.status]) {
    normalized.status = base.status;
  }
  if (normalized.id === "hub" && normalized.brief === OLD_HUB_BRIEF) {
    normalized.brief = HUB_BRIEF;
  }
  if (normalized.id === "vita-mahjong") {
    normalized.entry = "./projects/vita-mahjong/index.html";
    normalized.package = "./downloads/vita-mahjong-webgl.zip";
    normalized.status = "game";
  }
  if (normalized.video && normalized.video.includes("演示视频占位")) {
    delete normalized.video;
  }
  return normalized;
}

function cloneApp(app) {
  return {
    ...app,
    tags: [...app.tags]
  };
}

function projectHref(value) {
  if (!value) return "#";
  if (/^(https?:|file:|#)/i.test(value)) return value;
  if (value.startsWith("../")) return PROJECT_ROOT_URL + encodeURI(value.slice(3));
  return value;
}

function log(message) {
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  nodes.log.textContent += `[${time}] ${message}\n`;
  nodes.log.scrollTop = nodes.log.scrollHeight;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
