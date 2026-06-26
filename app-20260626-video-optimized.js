const STORAGE_KEY = "ai-competition-hub-v2-apps";
const PAGE_TEXT_STORAGE_KEY = "ai-competition-hub-v3-page-text";
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

const defaultPageText = {
  "brand.title": "AI 应用总览",
  "nav.overview": "总览",
  "nav.apps": "应用",
  "nav.platforms": "平台",
  "nav.maintain": "维护",
  "hero.title": "AI 应用总览",
  "hero.description": "汇总所有应用入口、说明、网页体验与跨平台下载内容。",
  "hero.primaryAction": "查看应用集合",
  "hero.secondaryAction": "查看平台入口",
  "metrics.total": "总数",
  "metrics.apps": "应用",
  "metrics.games": "小游戏",
  "metrics.totalNote": "全部收录项目",
  "metrics.appsNote": "工具与内容类",
  "metrics.gamesNote": "可体验游戏原型",
  "filter.title": "筛选应用",
  "filter.searchLabel": "搜索",
  "filter.categoryLabel": "分类",
  "filter.statusLabel": "类型",
  "filter.sortLabel": "排序",
  "apps.title": "应用项目集合",
  "games.title": "小游戏体验集合",
  "platforms.title": "跨平台体验",
  "platforms.description": "按网页、Windows、Mac 三种方式整理体验入口。网页和通用包可跨系统打开；桌面工具优先提供对应系统包。",
  "maintain.title": "维护控制台",
  "maintain.description": "输入 1 或点击更新，刷新统计、卡片和详情；也可以在右侧编辑主要文案。"
};

const pageTextTargets = [
  { key: "brand.title", label: "品牌标题", selector: ".brand strong", short: true },
  { key: "nav.overview", label: "导航：总览", selector: ".top-nav nav a:nth-child(1)", short: true },
  { key: "nav.apps", label: "导航：应用", selector: ".top-nav nav a:nth-child(2)", short: true },
  { key: "nav.platforms", label: "导航：平台", selector: ".top-nav nav a:nth-child(3)", short: true },
  { key: "nav.maintain", label: "导航：维护", selector: ".top-nav nav a:nth-child(4)", short: true },
  { key: "hero.title", label: "主页标题", selector: ".hero-copy h1" },
  { key: "hero.description", label: "主页描述", selector: ".hero-lead", multiline: true },
  { key: "hero.primaryAction", label: "主按钮", selector: ".hero-actions .primary-action", short: true },
  { key: "hero.secondaryAction", label: "平台按钮", selector: ".hero-actions .ghost-action[href=\"#platforms\"]", short: true },
  { key: "metrics.total", label: "统计：总数", selector: ".metric-strip .metric:nth-child(1) span", short: true },
  { key: "metrics.apps", label: "统计：应用", selector: ".metric-strip .metric:nth-child(2) span", short: true },
  { key: "metrics.games", label: "统计：小游戏", selector: ".metric-strip .metric:nth-child(3) span", short: true },
  { key: "metrics.totalNote", label: "统计说明：总数", selector: ".metric-strip .metric:nth-child(1) .metric-note", short: true },
  { key: "metrics.appsNote", label: "统计说明：应用", selector: ".metric-strip .metric:nth-child(2) .metric-note", short: true },
  { key: "metrics.gamesNote", label: "统计说明：小游戏", selector: ".metric-strip .metric:nth-child(3) .metric-note", short: true },
  { key: "filter.title", label: "筛选标题", selector: ".filter-panel h2" },
  { key: "filter.searchLabel", label: "搜索标签", selector: "label[for=\"searchInput\"]", short: true },
  { key: "filter.categoryLabel", label: "分类标签", selector: "label[for=\"categoryFilter\"]", short: true },
  { key: "filter.statusLabel", label: "类型标签", selector: "label[for=\"statusFilter\"]", short: true },
  { key: "filter.sortLabel", label: "排序标签", selector: "label[for=\"sortMode\"]", short: true },
  { key: "apps.title", label: "应用区标题", selector: ".app-list .section-heading h2" },
  { key: "games.title", label: "小游戏标题", selector: "#games .section-heading h2" },
  { key: "platforms.title", label: "平台标题", selector: "#platforms h2" },
  { key: "platforms.description", label: "平台描述", selector: "#platforms .section-head > p:last-child", multiline: true },
  { key: "maintain.title", label: "维护标题", selector: "#maintain h2" },
  { key: "maintain.description", label: "维护描述", selector: "#maintain .section-head > p:last-child", multiline: true }
];

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
    entry: "",
    package: "./downloads/ai-application-hub.zip",
    video: "./projects/AI应用方案整理器/视频资源/index.html",
    platforms: {
      windows: "./downloads/ai-application-hub.zip",
      mac: "./downloads/ai-application-hub.zip"
    },
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
    platforms: {
      web: "./projects/vita-mahjong/index.html",
      windows: "./downloads/vita-mahjong-webgl.zip",
      mac: "./downloads/vita-mahjong-webgl.zip"
    },
    tags: ["Unity", "WebGL", "小游戏", "羊了个羊"],
    speed: 8,
    impact: 9,
    risk: 7,
    polish: 8
  },
  {
    id: "fill-what",
    name: "填了个啥",
    category: "Unity 微信小游戏原型",
    status: "game",
    brief: "以成语填字和诗意来信为核心的竖屏小游戏，使用 Unity UGUI 搭建界面，支持调试面板、关卡快照和过关结算。",
    problem: "需要一个能直接在线体验、又能下载完整 Unity 工程继续改预制体和资源的小游戏样例，方便后续迁移到微信小游戏流程。",
    aiUse: "AI 参与玩法拆解、UGUI 预制体结构、750×1624 适配、关卡内容、WebGL 发布页和下载包整理。",
    folder: "./projects/fill-what/",
    entry: "./projects/fill-what/index.html",
    package: "./downloads/fill-what-unity-project.zip",
    video: "./projects/fill-what/视频资源/index.html",
    platforms: {
      web: { href: "./projects/fill-what/index.html", label: "演示" },
      windows: { href: "./downloads/fill-what-unity-project.zip", label: "下载工程" }
    },
    tags: ["Unity", "UGUI", "成语填字", "微信小游戏"],
    speed: 8,
    impact: 8,
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
    folder: "./projects/朋友圈发图神器/",
    entry: "./projects/朋友圈发图神器/01_作品体验入口/app/index.html",
    video: "./projects/朋友圈发图神器/03_演示视频/演示视频.html",
    package: "./downloads/travel-generator-universal.zip",
    platforms: {
      web: "./projects/朋友圈发图神器/01_作品体验入口/app/index.html",
      windows: "./downloads/travel-generator-universal.zip",
      mac: "./downloads/travel-generator-mac-source.zip"
    },
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
    folder: "./projects/飞书文件批量下载插件/",
    entry: "./projects/飞书文件批量下载插件/index.html",
    package: "./downloads/feishu-batch-downloader-extension.zip",
    video: "./projects/飞书文件批量下载插件/demo/index.html",
    platforms: {
      web: "./projects/飞书文件批量下载插件/index.html",
      windows: "./downloads/feishu-batch-downloader-extension.zip",
      mac: "./downloads/feishu-batch-downloader-extension.zip"
    },
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
    folder: "./projects/Codex对话评分工具/",
    entry: "./projects/Codex对话评分工具/index.html",
    package: "./downloads/codex-reviewer-windows.zip",
    platforms: {
      web: "./projects/Codex对话评分工具/index.html",
      windows: "./downloads/codex-reviewer-windows.zip",
      mac: "./downloads/codex-reviewer-mac-source.zip"
    },
    tags: ["Codex", "复盘", "报告", "整理"],
    speed: 8,
    impact: 8,
    risk: 8,
    polish: 7
  },
  {
    id: "wanhuatong",
    name: "传话筒",
    category: "AI 表达转换",
    status: "life",
    brief: "把一段话转换成情绪表达、生活说明、情书暗语、多语言或古诗古文版本。",
    problem: "同一句话在不同关系、场景和语言里需要不同说法，临时组织表达既费时又容易说偏。",
    aiUse: "AI 用于识别表达意图、切换语气风格、生成多语言版本，并把复杂内容整理成可直接使用的文本。",
    folder: "./projects/传话筒/",
    entry: "./projects/传话筒/index.html",
    package: "./downloads/wanhuatong.zip",
    platforms: {
      web: "./projects/传话筒/index.html",
      windows: "./downloads/wanhuatong.zip",
      mac: "./downloads/wanhuatong.zip"
    },
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
    folder: "./projects/AI面试陪练小剧场/",
    entry: "./projects/AI面试陪练小剧场/index.html",
    package: "./downloads/interview-theater.zip",
    platforms: {
      web: "./projects/AI面试陪练小剧场/index.html",
      windows: "./downloads/interview-theater.zip",
      mac: "./downloads/interview-theater.zip"
    },
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
    folder: "./projects/备选应用工具创意库/",
    entry: "./projects/备选应用工具创意库/index.html",
    package: "./downloads/idea-library.zip",
    platforms: {
      web: "./projects/备选应用工具创意库/index.html",
      windows: "./downloads/idea-library.zip",
      mac: "./downloads/idea-library.zip"
    },
    tags: ["创意库", "备选", "MVP", "筛选"],
    speed: 9,
    impact: 7,
    risk: 9,
    polish: 7
  }
];

let apps = loadApps();
let pageText = loadPageText();

const state = {
  query: "",
  category: "all",
  status: "all",
  sort: "default",
  selectedId: localStorage.getItem(SELECTED_KEY) || "travel-generator",
  editing: false
};

const nodes = {
  statTotal: document.querySelector("#statTotal"),
  statApps: document.querySelector("#statApps"),
  statGames: document.querySelector("#statGames"),
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
  platformGrid: document.querySelector("#platformGrid"),
  command: document.querySelector("#commandInput"),
  log: document.querySelector("#responseLog"),
  commandRun: document.querySelector("#commandRun"),
  runUpdate: document.querySelector("#runUpdate"),
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
  editPackage: document.querySelector("#editPackage"),
  editVideo: document.querySelector("#editVideo"),
  pageTextFields: document.querySelector("#pageTextFields"),
};

bindEvents();
renderCategoryOptions();
render();
alignHashTarget();
finishListIntroAnimation();
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

  nodes.grid.addEventListener("click", handleAppCardClick);
  nodes.gameGrid?.addEventListener("click", handleAppCardClick);
  document.addEventListener("click", handleInlineEditClick);

  nodes.prevApp.addEventListener("click", () => switchApp(-1));
  nodes.nextApp.addEventListener("click", () => switchApp(1));

  nodes.command.addEventListener("keydown", event => {
    if (event.key === "Enter") runCommand();
  });

  nodes.commandRun.addEventListener("click", runCommand);
  nodes.runUpdate.addEventListener("click", runMaintenance);
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
  renderPageText();
  renderStats();
  renderSpotlight();
  renderDots(filtered);
  renderGrid(filtered);
  renderGameGrid(filtered);
  renderPlatformShowcase(filtered);
  renderEditForm();
}

function finishListIntroAnimation() {
  window.setTimeout(() => {
    document.body.classList.add("card-intro-complete");
  }, 900);
}

function alignHashTarget() {
  const id = window.location.hash.slice(1);
  if (!id) return;
  window.setTimeout(() => {
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ block: "start" });
  }, 0);
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

function getNavigationApps(filtered = getFilteredApps()) {
  return [
    ...filtered.filter(app => app.status !== "game"),
    ...filtered.filter(app => app.status === "game")
  ];
}

function renderStats() {
  nodes.statTotal.textContent = apps.length;
  nodes.statApps.textContent = apps.filter(app => app.status !== "navigation" && app.status !== "game").length;
  nodes.statGames.textContent = apps.filter(app => app.status === "game").length;
}

function renderSpotlight() {
  const app = getSelectedApp();
  const introText = spotlightIntro(app);
  const richText = app.problem;
  nodes.spotlight.innerHTML = `
    <div class="summary-copy">
      <span class="summary-type">${escapeHtml(app.category)}</span>
      <strong>${escapeHtml(app.name)}</strong>
      <p class="summary-intro">${escapeHtml(introText)}</p>
      <p class="summary-richtext"><span>使用场景</span><em>${escapeHtml(richText)}</em></p>
    </div>
  `;
}

function spotlightIntro(app) {
  const aiText = app.aiUse
    .replace(/^AI\s*用于/, "AI 负责")
    .replace(/^AI\s*参与/, "AI 参与");
  return `${app.brief} ${aiText}`;
}

function renderDots(filtered = getFilteredApps()) {
  nodes.dots.innerHTML = getNavigationApps(filtered).map(app => `
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

  nodes.grid.innerHTML = applicationList.map((app, index) => renderAppCard(app, index)).join("");
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
        <span>${renderEditableText("app", "category", app.category, app.id)}</span>
      </div>
      <h3>${renderEditableText("app", "name", app.name, app.id)}</h3>
      <p>${renderEditableText("app", "brief", app.brief, app.id)}</p>
      <div class="tag-row">${app.tags.slice(0, 4).map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="card-bottom">
        ${renderActions(app, true)}
      </div>
    </article>
  `;
}

function handleAppCardClick(event) {
  if (event.target.closest("a, button, .inline-edit-button")) return;
  const card = event.target.closest("[data-app-id]");
  if (!card) return;
  selectApp(card.dataset.appId);
}

function updateSelectedCards() {
  document.querySelectorAll("[data-app-id]").forEach(card => {
    card.classList.toggle("selected", card.dataset.appId === state.selectedId);
  });
}

function renderSelectedApp() {
  renderSpotlight();
  renderDots();
  updateSelectedCards();
  renderEditForm();
}

function renderPlatformShowcase(filtered) {
  if (!nodes.platformGrid) return;
  const list = filtered.length ? filtered : apps;
  const platformGroups = [
    { key: "web", label: "网页体验", note: "浏览器直接打开，Windows 和 Mac 都可使用。" },
    { key: "windows", label: "Windows", note: "优先提供 exe、插件包或通用 zip。" },
    { key: "mac", label: "Mac", note: "优先提供 Mac 包；网页工具使用通用 zip 或源码包。" }
  ];

  nodes.platformGrid.innerHTML = platformGroups.map(group => {
    const available = list.filter(app => platformValue(app, group.key) || (group.key === "web" && app.entry));
    return `
      <article class="platform-card platform-${escapeHtml(group.key)}">
        <div class="platform-card-head">
          <span>${escapeHtml(group.label)}</span>
          <strong>${available.length}</strong>
        </div>
        <p>${escapeHtml(group.note)}</p>
        <div class="platform-apps">
          ${available.map(app => {
            const href = platformValue(app, group.key) || app.entry;
            const download = group.key === "web" ? "" : " download";
            return `<a href="${escapeHtml(projectHref(href))}"${download}>${escapeHtml(app.name)}</a>`;
          }).join("")}
        </div>
      </article>
    `;
  }).join("");
}

function renderActions(app, stopPropagation = false) {
  const stop = stopPropagation ? ` onclick="event.stopPropagation()"` : "";
  const web = platformValue(app, "web") || app.entry;
  const windows = platformValue(app, "windows") || app.package;
  const mac = platformValue(app, "mac");
  const webLink = web ? `<a class="primary-link" data-action="web" href="${escapeHtml(projectHref(web))}"${stop}>网页预览</a>` : "";
  const windowsLink = windows ? `<a class="download-link" data-action="download" href="${escapeHtml(projectHref(windows))}" download${stop}>Wins下载</a>` : "";
  const macLink = mac ? `<a class="mac-link" data-action="mac" href="${escapeHtml(projectHref(mac))}" download${stop}>Mac下载</a>` : "";
  const video = `<a data-action="video" href="${escapeHtml(projectHref(videoHref(app)))}"${stop}>介绍视频</a>`;
  return `
    <div class="card-actions">
      ${webLink}
      ${windowsLink}
      ${macLink}
      ${video}
    </div>
  `;
}

function platformValue(app, key) {
  const value = app.platforms?.[key];
  if (!value) return "";
  return typeof value === "string" ? value : value.href;
}

function platformLabel(app, key, fallback) {
  const value = app.platforms?.[key];
  if (!value || typeof value === "string") return fallback;
  return value.label || fallback;
}

function platformCount(app) {
  return ["web", "windows", "mac"].filter(key => platformValue(app, key)).length;
}

function renderEditForm() {
  const app = getSelectedApp();
  renderPageTextFields();
  markAppFieldLabels();
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
  if (nodes.editPackage) nodes.editPackage.value = app.package || "";
  if (nodes.editVideo) nodes.editVideo.value = app.video || "";
  highlightEditTarget();
}

function renderPageTextFields() {
  if (!nodes.pageTextFields) return;
  nodes.pageTextFields.innerHTML = pageTextTargets.map(target => {
    const value = pageText[target.key] ?? defaultPageText[target.key] ?? "";
    const isWide = target.multiline || !target.short || value.length > 24;
    const field = target.multiline || value.length > 72
      ? '<textarea data-page-text-input="' + escapeHtml(target.key) + '" rows="3">' + escapeHtml(value) + '</textarea>'
      : '<input data-page-text-input="' + escapeHtml(target.key) + '" type="text" value="' + escapeHtml(value) + '" />';
    return '<label class="' + (isWide ? 'wide' : '') + '" data-page-text-field="' + escapeHtml(target.key) + '"><span>' + escapeHtml(target.label) + '</span>' + field + '</label>';
  }).join("");
}

function markAppFieldLabels() {
  const fieldMap = { editName: "name", editCategory: "category", editBrief: "brief", editStatus: "status", editTags: "tags", editProblem: "problem", editAiUse: "aiUse", editFolder: "folder", editEntry: "entry", editPackage: "package", editVideo: "video" };
  Object.entries(fieldMap).forEach(([id, field]) => {
    document.querySelector("#" + id)?.closest("label")?.setAttribute("data-app-field", field);
  });
  nodes.editAppSelect?.closest("label")?.setAttribute("data-app-field", "select");
}

function highlightEditTarget() {
  document.querySelectorAll(".editing-focus").forEach(element => element.classList.remove("editing-focus"));
  if (!state.editTarget) return;
  const selector = state.editTarget.kind === "page" ? '[data-page-text-field="' + cssEscape(state.editTarget.key) + '"]' : '[data-app-field="' + cssEscape(state.editTarget.field) + '"]';
  const field = document.querySelector(selector);
  if (!field) return;
  field.classList.add("editing-focus");
  requestAnimationFrame(() => {
    field.scrollIntoView({ block: "center", behavior: "smooth" });
    field.querySelector("input, textarea, select")?.focus();
  });
}

function selectApp(id) {
  if (!apps.some(app => app.id === id)) return;
  state.selectedId = id;
  localStorage.setItem(SELECTED_KEY, id);
  renderSelectedApp();
}

function ensureSelectedApp(filtered) {
  if (filtered.some(app => app.id === state.selectedId)) return;
  state.selectedId = (getNavigationApps(filtered)[0] || apps[0]).id;
}

function getSelectedApp() {
  return apps.find(app => app.id === state.selectedId) || apps[0];
}

function switchApp(direction) {
  const navigationApps = getNavigationApps();
  if (!navigationApps.length) return;
  const fallbackIndex = direction > 0 ? -1 : 0;
  const currentIndex = navigationApps.findIndex(app => app.id === state.selectedId);
  const nextIndex = ((currentIndex === -1 ? fallbackIndex : currentIndex) + direction + navigationApps.length) % navigationApps.length;
  selectApp(navigationApps[nextIndex].id);
}

function getAdvice(app) {
  if (app.status === "navigation") return "作为总览入口使用，重点保证网页、Windows、Mac 入口清晰可打开。";
  if (app.status === "plugin") return "作为插件工具展示时，优先说明安装方式、使用场景和跨平台可用方式。";
  if (app.status === "game") return "作为小游戏展示时，优先保留清晰玩法、即时反馈和可打开的网页体验入口。";
  if (app.status === "training") return "作为训练工具展示时，优先说明角色流程、追问机制和复盘输出。";
  if (platformCount(app) < 2) return "建议至少保留网页体验和一个可下载平台包，让使用者能直接打开。";
  return "平台入口较清晰，继续确认网页、Windows、Mac 和视频链接都能直接打开。";
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
  log(`维护完成：已刷新 ${apps.length} 个应用，类型 ${new Set(apps.map(app => app.status)).size} 类，网页体验 ${apps.filter(app => platformValue(app, "web") || app.entry).length} 个。`);
}

function toggleEditMode() {
  setEditMode(!state.editing);
}

function setEditMode(active) {
  state.editing = active;
  document.body.classList.toggle("editing", state.editing);
  nodes.editPanel.setAttribute("aria-hidden", String(!state.editing));
  nodes.exportButton.textContent = state.editing ? "退出编辑" : "编辑";
  renderEditForm();
}

function closeEditMode() {
  setEditMode(false);
  state.editTarget = null;
}

function selectEditTarget(kind, key, appId, appField) {
  if (kind === "app" && appId) selectApp(appId);
  state.editTarget = kind === "page" ? { kind, key } : { kind, appId: appId || state.selectedId, field: appField };
  setEditMode(true);
}

function saveEditForm() {
  pageText = { ...pageText, ...Object.fromEntries(Array.from(document.querySelectorAll("[data-page-text-input]")).map(input => [input.dataset.pageTextInput, input.value.trim()])) };
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
      entry: nodes.editEntry.value.trim() || app.entry,
      package: nodes.editPackage?.value.trim() || app.package,
      video: nodes.editVideo?.value.trim() || app.video
    };
  });
  localStorage.setItem(PAGE_TEXT_STORAGE_KEY, JSON.stringify(pageText));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
  renderCategoryOptions();
  render();
  log("已保存到当前浏览器本地存储。");
}

function resetEdits() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PAGE_TEXT_STORAGE_KEY);
  apps = defaultApps.map(cloneApp);
  pageText = normalizePageText();
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
      `- 平台：${platformCount(app)}/3`,
      platformValue(app, "web") ? `- 网页：${platformValue(app, "web")}` : "",
      platformValue(app, "windows") ? `- Windows：${platformValue(app, "windows")}` : "",
      platformValue(app, "mac") ? `- Mac：${platformValue(app, "mac")}` : "",
      app.video ? `- 视频：${app.video}` : ""
    ].filter(Boolean).join("\n"))
  ].join("\n\n");

  navigator.clipboard?.writeText(markdown).then(() => {
    log("已复制 Markdown 清单到剪贴板。");
  }).catch(() => {
    log(markdown);
  });
}

function renderPageText() {
  pageTextTargets.forEach(target => {
    const element = document.querySelector(target.selector);
    if (!element) return;
    const value = pageText[target.key] ?? defaultPageText[target.key] ?? "";
    element.innerHTML = renderEditableText("page", target.key, value);
  });
}

function renderEditableText(kind, key, value, appId = "") {
  const label = kind === "page" ? "修改页面文案" : "修改应用文案";
  const dataKey = kind === "page" ? key : appId + "." + key;
  const appData = kind === "app" ? ' data-app-id="' + escapeHtml(appId) + '" data-app-field="' + escapeHtml(key) + '"' : "";
  return '<span class="editable-text" data-edit-key="' + escapeHtml(dataKey) + '"><span class="editable-value">' + escapeHtml(value ?? "") + '</span><span class="inline-edit-button" role="button" tabindex="0" aria-label="' + label + '" title="' + label + '" data-edit-kind="' + escapeHtml(kind) + '" data-edit-key="' + escapeHtml(key) + '"' + appData + '>✎</span></span>';
}

function handleInlineEditClick(event) {
  const button = event.target.closest(".inline-edit-button");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  selectEditTarget(button.dataset.editKind, button.dataset.editKey, button.dataset.appId, button.dataset.appField);
}

function loadPageText() {
  try {
    const stored = JSON.parse(localStorage.getItem(PAGE_TEXT_STORAGE_KEY) || "null");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) return normalizePageText(stored);
  } catch {
    localStorage.removeItem(PAGE_TEXT_STORAGE_KEY);
  }
  return normalizePageText();
}

function normalizePageText(stored = {}) {
  return { ...defaultPageText, ...Object.fromEntries(Object.entries(stored).filter(([key, value]) => key in defaultPageText && typeof value === "string")) };
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
  if (normalized.id === "hub") {
    normalized.entry = "";
    normalized.video = "./projects/AI应用方案整理器/视频资源/index.html";
    normalized.platforms = {
      ...normalized.platforms,
      web: "",
      windows: "./downloads/ai-application-hub.zip",
      mac: "./downloads/ai-application-hub.zip"
    };
  }
  if (normalized.id === "vita-mahjong") {
    normalized.entry = "./projects/vita-mahjong/index.html";
    normalized.package = "./downloads/vita-mahjong-webgl.zip";
    normalized.platforms = {
      ...normalized.platforms,
      web: "./projects/vita-mahjong/index.html",
      windows: "./downloads/vita-mahjong-webgl.zip",
      mac: "./downloads/vita-mahjong-webgl.zip"
    };
    normalized.status = "game";
  }
  if (normalized.id === "fill-what") {
    normalized.entry = "./projects/fill-what/index.html";
    normalized.package = "./downloads/fill-what-unity-project.zip";
    normalized.video = "./projects/fill-what/视频资源/index.html";
    normalized.platforms = {
      ...normalized.platforms,
      web: { href: "./projects/fill-what/index.html", label: "演示" },
      windows: { href: "./downloads/fill-what-unity-project.zip", label: "下载工程" },
      mac: ""
    };
    normalized.status = "game";
  }
  if (normalized.id === "feishu-downloader") {
    normalized.video = "./projects/飞书文件批量下载插件/demo/index.html";
  }
  if (normalized.id === "wanhuatong") {
    normalized.name = "传话筒";
  }
  const currentPlatforms = normalized.platforms || {};
  normalized.platforms = {
    ...currentPlatforms,
    web: currentPlatforms.web || normalized.entry || "",
    windows: currentPlatforms.windows || normalized.package || "",
    mac: currentPlatforms.mac || ""
  };
  if (normalized.video && normalized.video.includes("演示视频占位")) {
    delete normalized.video;
  }
  return normalized;
}

function cloneApp(app) {
  return {
    ...app,
    tags: [...app.tags],
    platforms: { ...(app.platforms || {}) }
  };
}

function projectHref(value) {
  if (!value) return "#";
  if (/^(https?:|file:|#)/i.test(value)) return value;
  if (value.startsWith("../")) return PROJECT_ROOT_URL + encodeURI(value.slice(3));
  return value;
}

function videoHref(app) {
  return app.video || "./videos/placeholder.html";
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
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
