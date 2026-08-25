import { projects as sourceProjects } from "./data.generated.js";
import { visualForProject } from "./visual-assets.js";

const THEME_STORAGE_KEY = "hub-atlas-preview-theme";
const SELECTED_STORAGE_KEY = "hub-atlas-preview-selected";
const ALLOWED_THEMES = ["clean", "mist", "coral", "night"];
const THEME_LABELS = {
  clean: "清透白",
  mist: "雾蓝",
  coral: "珊瑚",
  night: "深夜",
};
const APP_TYPES = [
  "插件工具",
  "辅助工具",
  "生活工具",
  "网页情报",
  "桌面工具",
  "内容工具",
];
const TYPE_OPTIONS = [
  { value: "all", label: "全部" },
  ...APP_TYPES.map((label) => ({ value: label, label })),
  { value: "game", label: "小游戏" },
  { value: "engineering", label: "工程体验" },
];
const PLATFORM_LABELS = {
  web: "网页",
  video: "视频",
  windows: "Windows",
  mac: "macOS",
  ios: "iOS",
};
const ACTION_ICONS = {
  web: "↗",
  video: "▶",
  windows: "⊞",
  mac: "⌘",
  ios: "◉",
};
const KIND_LABELS = {
  app: "应用工具",
  game: "小游戏",
  engineering: "工程体验",
};

const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(pointer: fine)");

const nodes = {
  body: document.body,
  heroStage: document.querySelector("#heroStage"),
  heroContent: document.querySelector("#heroContent"),
  heroVisual: document.querySelector("#heroVisual"),
  stagePosition: document.querySelector("[data-stage-position]"),
  stageProgress: document.querySelector("[data-stage-progress]"),
  prevButton: document.querySelector("[data-stage-prev]"),
  nextButton: document.querySelector("[data-stage-next]"),
  typeRail: document.querySelector("#typeRail"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  appGrid: document.querySelector("#appGrid"),
  gameGrid: document.querySelector("#gameGrid"),
  engineeringGrid: document.querySelector("#engineeringGrid"),
  resultCount: document.querySelector("[data-result-count]"),
  appCount: document.querySelector("[data-count-app]"),
  gameCount: document.querySelector("[data-count-game]"),
  engineeringCount: document.querySelector("[data-count-engineering]"),
  totalStat: document.querySelector("[data-stat-total]"),
  appStat: document.querySelector("[data-stat-apps]"),
  gameStat: document.querySelector("[data-stat-games]"),
  platformStat: document.querySelector("[data-stat-platforms]"),
  platformSummary: document.querySelector("[data-platform-summary]"),
  themeToggle: document.querySelector("#themeToggle"),
  themeMenu: document.querySelector("#themeMenu"),
  themeLabel: document.querySelector("[data-theme-label]"),
  linkInspector: document.querySelector("#linkInspector"),
  inspectorKind: document.querySelector("[data-inspector-kind]"),
  inspectorTitle: document.querySelector("[data-inspector-title]"),
  inspectorCopy: document.querySelector("[data-inspector-copy]"),
  inspectorUrl: document.querySelector("[data-inspector-url]"),
  inspectorOpen: document.querySelector("[data-inspector-open]"),
};

export function createState(projects) {
  const visibleProjects = projects.filter((project) => project.id !== "clickflow");
  const urlProject = new URL(window.location.href).searchParams.get("project");
  const storedProject = safeStorageGet(SELECTED_STORAGE_KEY);
  const selectedId = [urlProject, storedProject, visibleProjects[0]?.id].find((id) =>
    visibleProjects.some((project) => project.id === id),
  );

  return {
    projects,
    visibleProjects,
    selectedId,
    type: "all",
    query: "",
    sort: "default",
    theme: normalizeTheme(safeStorageGet(THEME_STORAGE_KEY)),
    hasCompletedIntro: false,
  };
}

const state = createState(sourceProjects);

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The preview remains fully usable when storage is unavailable.
  }
}

function normalizeTheme(theme) {
  return ALLOWED_THEMES.includes(theme) ? theme : "clean";
}

function normalizedAppBadge(project) {
  return APP_TYPES.includes(project.badge) ? project.badge : "辅助工具";
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN");
}

function searchTextFor(project) {
  return normalizeSearchText([
    project.name,
    project.category,
    project.badge,
    project.brief,
    project.problem,
    project.aiUse,
    ...project.tags,
  ].join(" "));
}

export function filterProjects(projects, currentState) {
  const query = normalizeSearchText(currentState.query);
  return projects
    .filter((project) => {
      const matchesType = currentState.type === "all"
        || currentState.type === project.kind
        || (project.kind === "app" && normalizedAppBadge(project) === currentState.type);
      return matchesType && (!query || searchTextFor(project).includes(query));
    })
    .sort((left, right) => {
      if (currentState.sort === "name") {
        return left.name.localeCompare(right.name, "zh-CN");
      }
      if (currentState.sort === "category") {
        return left.category.localeCompare(right.category, "zh-CN")
          || left.name.localeCompare(right.name, "zh-CN");
      }
      return left.index - right.index;
    });
}

function navigationProjects() {
  const current = filterProjects(state.visibleProjects, state);
  return [
    ...current.filter((project) => project.kind === "app"),
    ...current.filter((project) => project.kind === "game"),
    ...current.filter((project) => project.kind === "engineering"),
  ];
}

function currentProject() {
  return state.visibleProjects.find((project) => project.id === state.selectedId)
    || state.visibleProjects[0];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function kindStyle(project) {
  if (project.kind === "game") {
    return "--kind-accent:var(--game);--kind-soft:var(--game-soft);";
  }
  if (project.kind === "engineering") {
    return "--kind-accent:var(--engineering);--kind-soft:var(--engineering-soft);";
  }
  return "--kind-accent:var(--accent);--kind-soft:var(--accent-soft);";
}

function projectVisualStyle(project) {
  return [
    `--visual-accent:${project.visual.accent}`,
    `--visual-surface:${project.visual.surface}`,
    `--visual-ink:${project.visual.ink}`,
  ].join(";");
}

function platformTypes(project) {
  return new Set(project.actions.map((action) => action.type));
}

function platformMarks(project, compact = false) {
  const available = platformTypes(project);
  const types = compact
    ? ["web", "windows", "mac"]
    : ["web", "video", "windows", "mac", "ios"];
  return types.map((type) => `
    <span class="platform-mark${available.has(type) ? " is-available" : ""}" data-platform="${type}">
      ${escapeHtml(PLATFORM_LABELS[type])}
    </span>
  `).join("");
}

function actionButtons(project, scope) {
  if (!project.actions.length) {
    return '<span class="no-actions">暂无公开入口</span>';
  }
  return project.actions.map((action, index) => `
    <button
      class="${scope === "hero" ? "hero-action" : "card-action"}"
      type="button"
      data-project-action="${escapeHtml(project.id)}"
      data-action-index="${index}"
      data-platform="${escapeHtml(action.type)}"
      aria-label="${escapeHtml(`${project.name} ${action.label}`)}"
    >
      <span aria-hidden="true">${escapeHtml(ACTION_ICONS[action.type] || "↗")}</span>
      <span>${escapeHtml(action.label)}</span>
    </button>
  `).join("");
}

function fallbackMarkup(project, context, hidden = false) {
  const label = context === "hero" ? "项目动态预览" : project.category;
  return `
    <div class="image-fallback${hidden ? "" : " is-visible"}"${hidden ? " hidden" : ""}>
      <div class="preview-grid" aria-hidden="true"></div>
      <span class="cover-mark">${escapeHtml(project.visual.mark)}</span>
      ${hidden ? "" : `<span class="cover-category">${escapeHtml(label)}</span>`}
    </div>
  `;
}

function visualMarkup(project, context) {
  const visual = visualForProject(project);
  const className = context === "hero" ? "hero-preview" : "card-cover";
  if (visual.kind === "image") {
    return `
      <div class="${className} has-image" style="${projectVisualStyle(project)}" data-project-visual="${escapeHtml(project.id)}">
        <img
          class="project-image"
          src="${escapeHtml(visual.src)}"
          alt="${escapeHtml(visual.alt)}"
          style="object-position:${escapeHtml(visual.position || "center")};object-fit:${escapeHtml(visual.fit || "cover")};"
          data-project-image
        />
        ${fallbackMarkup(project, context, true)}
        <span class="cover-category">${escapeHtml(project.category)}</span>
      </div>
    `;
  }
  return `
    <div class="${className}" style="${projectVisualStyle(project)}" data-project-visual="${escapeHtml(project.id)}">
      ${fallbackMarkup(project, context)}
    </div>
  `;
}

function hydrateVisualFallbacks(root = document) {
  root.querySelectorAll("img[data-project-image]").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
      const fallback = image.parentElement?.querySelector(".image-fallback");
      if (fallback) {
        fallback.hidden = false;
        fallback.classList.add("is-visible");
      }
      image.parentElement?.classList.add("has-image-error");
    }, { once: true });
  });
}

export function renderHero(project) {
  if (!project) return;
  const navigation = navigationProjects();
  const position = Math.max(0, navigation.findIndex((item) => item.id === project.id));
  const intro = project.problem || project.brief;
  const detail = project.aiUse || project.brief;

  nodes.heroStage.dataset.kind = project.kind;
  nodes.heroStage.style.setProperty("--hero-accent", project.visual.accent);
  nodes.heroContent.innerHTML = `
    <div class="hero-label-row">
      <span class="hero-kind">${escapeHtml(KIND_LABELS[project.kind])}</span>
      <span>${escapeHtml(project.category)}</span>
    </div>
    <h2>${escapeHtml(project.name)}</h2>
    <p class="hero-brief">${escapeHtml(project.brief)}</p>
    <div class="hero-detail">
      <span>使用场景</span>
      <p>${escapeHtml(intro)}</p>
    </div>
    <div class="hero-detail hero-ai-detail">
      <span>AI 参与</span>
      <p>${escapeHtml(detail)}</p>
    </div>
    <div class="hero-platforms" aria-label="可用平台">${platformMarks(project)}</div>
    <div class="hero-actions">${actionButtons(project, "hero")}</div>
  `;
  nodes.heroVisual.innerHTML = `
    <div class="hero-preview-shell" style="${projectVisualStyle(project)}">
      <div class="preview-browser-bar" aria-hidden="true">
        <span></span><span></span><span></span>
        <i>${escapeHtml(project.name)}</i>
      </div>
      ${visualMarkup(project, "hero")}
      <div class="preview-side-label">
        <strong>${escapeHtml(project.visual.mark)}</strong>
        <span>${escapeHtml(project.tags.slice(0, 2).join(" · ") || project.category)}</span>
      </div>
    </div>
  `;
  nodes.stagePosition.textContent = `${String(position + 1).padStart(2, "0")} / ${String(navigation.length).padStart(2, "0")}`;
  nodes.stageProgress.style.width = `${((position + 1) / Math.max(1, navigation.length)) * 100}%`;
  hydrateVisualFallbacks(nodes.heroVisual);
  renderPlatformSummary(project);
}

function cardMarkup(project) {
  const available = platformTypes(project);
  return `
    <article
      class="project-card"
      data-project-id="${escapeHtml(project.id)}"
      data-kind="${escapeHtml(project.kind)}"
      tabindex="0"
      aria-current="${project.id === state.selectedId ? "true" : "false"}"
      style="${kindStyle(project)}${projectVisualStyle(project)}"
    >
      <div class="card-visual" aria-hidden="true">
        ${visualMarkup(project, "card")}
      </div>
      <div class="card-body">
        <div class="card-meta">
          <span class="kind-badge">${escapeHtml(project.kind === "app" ? normalizedAppBadge(project) : KIND_LABELS[project.kind])}</span>
          <span>${escapeHtml(project.category)}</span>
        </div>
        <h4>${escapeHtml(project.name)}</h4>
        <p>${escapeHtml(project.brief)}</p>
        <div class="card-tags">
          ${project.tags.slice(0, 2).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
        </div>
        <div class="card-platforms" aria-label="平台状态">
          ${["web", "windows", "mac"].map((type) => `
            <span class="platform-mark${available.has(type) ? " is-available" : ""}" data-platform="${type}">
              ${escapeHtml(PLATFORM_LABELS[type])}
            </span>
          `).join("")}
        </div>
        <div class="card-actions">${actionButtons(project, "card")}</div>
      </div>
    </article>
  `;
}

function emptyMarkup(message) {
  return `<div class="empty-state"><strong>没有匹配项目</strong><span>${escapeHtml(message)}</span></div>`;
}

export function renderCatalog() {
  const filtered = filterProjects(state.visibleProjects, state);
  const applications = filtered.filter((project) => project.kind === "app");
  const games = filtered.filter((project) => project.kind === "game");
  const engineering = filtered.filter((project) => project.kind === "engineering");

  nodes.appGrid.innerHTML = applications.length
    ? applications.map(cardMarkup).join("")
    : emptyMarkup("换个关键词或选择其他分类。");
  nodes.gameGrid.innerHTML = games.length
    ? games.map(cardMarkup).join("")
    : emptyMarkup("当前筛选下没有小游戏。");
  nodes.engineeringGrid.innerHTML = engineering.length
    ? engineering.map(cardMarkup).join("")
    : emptyMarkup("当前筛选下没有工程体验。");
  nodes.appCount.textContent = `${applications.length} 个应用`;
  nodes.gameCount.textContent = `${games.length} 个小游戏`;
  nodes.engineeringCount.textContent = `${engineering.length} 个工程体验`;
  nodes.resultCount.textContent = `${filtered.length} 个匹配项目`;
  hydrateVisualFallbacks();
  updateSelectedCards();
}

function updateSelectedCards() {
  document.querySelectorAll(".project-card[data-project-id]").forEach((card) => {
    card.setAttribute(
      "aria-current",
      String(card.dataset.projectId === state.selectedId),
    );
  });
}

function updateUrl(id) {
  const url = new URL(window.location.href);
  url.searchParams.set("project", id);
  history.replaceState({ project: id }, "", url);
}

export function selectProject(id, options = {}) {
  const project = state.visibleProjects.find((item) => item.id === id);
  if (!project) return;
  state.selectedId = project.id;
  safeStorageSet(SELECTED_STORAGE_KEY, project.id);
  updateUrl(project.id);
  renderHero(project);
  updateSelectedCards();

  const card = document.querySelector(`.project-card[data-project-id="${CSS.escape(project.id)}"]`);
  if (options.focus && card) card.focus({ preventScroll: true });
  if (options.scroll && card) card.scrollIntoView({ behavior: motionPreference.matches ? "auto" : "smooth", block: "center" });
}

function selectRelative(direction) {
  const navigation = navigationProjects();
  if (!navigation.length) return;
  const currentIndex = navigation.findIndex((project) => project.id === state.selectedId);
  const nextIndex = (currentIndex + direction + navigation.length) % navigation.length;
  selectProject(navigation[nextIndex].id);
}

function resolveActionHref(href) {
  if (/^(?:https?:|mailto:)/iu.test(href)) return href;
  const rootRelative = href.startsWith("./") ? href.slice(2) : href.replace(/^\/+/, "");
  return new URL(`../../${rootRelative}`, import.meta.url).href;
}

export function openLinkInspector(action, project) {
  const resolvedHref = resolveActionHref(action.href);
  nodes.inspectorKind.textContent = action.label;
  nodes.inspectorTitle.textContent = project.name;
  nodes.inspectorCopy.textContent = action.type === "windows" || action.type === "mac"
    ? "预览模式不会自动开始下载。确认入口后可手动打开。"
    : "这是当前项目使用的真实入口，预览模式先展示地址。";
  nodes.inspectorUrl.textContent = action.href;
  nodes.inspectorOpen.href = resolvedHref;
  nodes.inspectorOpen.textContent = action.type === "windows" || action.type === "mac"
    ? "打开下载入口"
    : "打开网页";
  nodes.linkInspector.showModal();
}

function openMaintenanceInspector() {
  nodes.inspectorKind.textContent = "维护预览";
  nodes.inspectorTitle.textContent = "内容维护入口";
  nodes.inspectorCopy.textContent = "正式改版会复用现有文案编辑、本地保存、导入和导出能力；本次独立预览不写入生产数据。";
  nodes.inspectorUrl.textContent = "生产主页保持不变";
  nodes.inspectorOpen.hidden = true;
  nodes.linkInspector.showModal();
}

function closeInspector() {
  if (nodes.linkInspector.open) nodes.linkInspector.close();
  nodes.inspectorOpen.hidden = false;
}

function renderPlatformSummary(project) {
  const actionsByType = new Map(project.actions.map((action) => [action.type, action]));
  nodes.platformSummary.innerHTML = ["web", "video", "windows", "mac", "ios"].map((type) => {
    const action = actionsByType.get(type);
    if (!action) {
      return `<span class="platform-tile is-unavailable"><strong>${escapeHtml(PLATFORM_LABELS[type])}</strong><em>暂未提供</em></span>`;
    }
    return `
      <button type="button" class="platform-tile is-available" data-project-action="${escapeHtml(project.id)}" data-action-index="${project.actions.indexOf(action)}" data-platform="${type}">
        <span aria-hidden="true">${escapeHtml(ACTION_ICONS[type])}</span>
        <strong>${escapeHtml(PLATFORM_LABELS[type])}</strong>
        <em>${escapeHtml(action.label)}</em>
      </button>
    `;
  }).join("");
}

function renderStats() {
  const allProjects = state.projects;
  nodes.totalStat.textContent = String(allProjects.length);
  nodes.appStat.textContent = String(allProjects.filter((project) => project.kind === "app").length);
  nodes.gameStat.textContent = String(allProjects.filter((project) => project.kind === "game").length);
  nodes.platformStat.textContent = String(allProjects.filter((project) => {
    const types = platformTypes(project);
    return types.has("windows") || types.has("mac") || types.has("ios");
  }).length);
}

function renderTypeChips() {
  nodes.typeRail.innerHTML = TYPE_OPTIONS.map((option) => `
    <button
      type="button"
      class="type-chip${option.value === state.type ? " is-active" : ""}"
      data-type="${escapeHtml(option.value)}"
      aria-pressed="${String(option.value === state.type)}"
    >${escapeHtml(option.label)}</button>
  `).join("");
}

function syncTypeChips() {
  nodes.typeRail.querySelectorAll("[data-type]").forEach((chip) => {
    const selected = chip.dataset.type === state.type;
    chip.classList.toggle("is-active", selected);
    chip.setAttribute("aria-pressed", String(selected));
  });
}

function renderAfterFilter() {
  renderCatalog();
  const filtered = navigationProjects();
  if (!filtered.some((project) => project.id === state.selectedId) && filtered[0]) {
    selectProject(filtered[0].id);
  } else {
    renderHero(currentProject());
  }
}

function setThemeMenu(open) {
  nodes.themeMenu.hidden = !open;
  nodes.themeToggle.setAttribute("aria-expanded", String(open));
}

export function setTheme(theme) {
  const normalized = normalizeTheme(theme);
  state.theme = normalized;
  document.documentElement.dataset.theme = normalized;
  nodes.themeLabel.textContent = THEME_LABELS[normalized];
  nodes.themeMenu.querySelectorAll("[data-theme]").forEach((option) => {
    option.setAttribute("aria-checked", String(option.dataset.theme === normalized));
  });
  try {
    localStorage.setItem(THEME_STORAGE_KEY, normalized);
  } catch {
    // Theme stays active for the current session when storage is unavailable.
  }
}

function handleProjectAction(target) {
  const project = state.visibleProjects.find((item) => item.id === target.dataset.projectAction);
  const action = project?.actions[Number(target.dataset.actionIndex)];
  if (project && action) openLinkInspector(action, project);
}

function bindEvents() {
  nodes.prevButton.addEventListener("click", () => selectRelative(-1));
  nodes.nextButton.addEventListener("click", () => selectRelative(1));

  nodes.typeRail.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-type]");
    if (!chip) return;
    state.type = chip.dataset.type;
    syncTypeChips();
    renderAfterFilter();
  });

  nodes.searchInput.addEventListener("input", () => {
    state.query = nodes.searchInput.value;
    renderAfterFilter();
  });

  nodes.sortSelect.addEventListener("change", () => {
    state.sort = nodes.sortSelect.value;
    renderAfterFilter();
  });

  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-project-action]");
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      handleProjectAction(action);
      return;
    }
    const card = event.target.closest(".project-card[data-project-id]");
    if (card) selectProject(card.dataset.projectId);
  });

  document.addEventListener("keydown", (event) => {
    const card = event.target.closest?.(".project-card[data-project-id]");
    if (card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectProject(card.dataset.projectId, { focus: true });
      return;
    }
    if (event.target.matches?.("input, select, textarea, button, a")) return;
    if (event.key === "ArrowLeft") selectRelative(-1);
    if (event.key === "ArrowRight") selectRelative(1);
  });

  nodes.themeToggle.addEventListener("click", () => {
    setThemeMenu(nodes.themeToggle.getAttribute("aria-expanded") !== "true");
  });
  nodes.themeMenu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-theme]");
    if (!option) return;
    setTheme(option.dataset.theme);
    setThemeMenu(false);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".theme-control")) setThemeMenu(false);
  });

  document.querySelectorAll("[data-search-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      nodes.searchInput.focus({ preventScroll: false });
      nodes.searchInput.scrollIntoView({ behavior: motionPreference.matches ? "auto" : "smooth", block: "center" });
    });
  });
  document.querySelectorAll("[data-edit-preview]").forEach((button) => {
    button.addEventListener("click", openMaintenanceInspector);
  });
  document.querySelectorAll("[data-inspector-close]").forEach((button) => {
    button.addEventListener("click", closeInspector);
  });
  nodes.linkInspector.addEventListener("click", (event) => {
    if (event.target === nodes.linkInspector) closeInspector();
  });

  if (finePointer.matches && !motionPreference.matches) {
    nodes.heroStage.addEventListener("pointermove", (event) => {
      const bounds = nodes.heroStage.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 10;
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 10;
      nodes.heroStage.style.setProperty("--dot-x", `${x}px`);
      nodes.heroStage.style.setProperty("--dot-y", `${y}px`);
      nodes.heroVisual.style.setProperty("--preview-shift-x", `${x * 0.5}px`);
      nodes.heroVisual.style.setProperty("--preview-shift-y", `${y * 0.5}px`);
    });
    nodes.heroStage.addEventListener("pointerleave", () => {
      nodes.heroStage.style.removeProperty("--dot-x");
      nodes.heroStage.style.removeProperty("--dot-y");
      nodes.heroVisual.style.removeProperty("--preview-shift-x");
      nodes.heroVisual.style.removeProperty("--preview-shift-y");
    });
  }
}

export function initAtlas() {
  nodes.body.classList.add("is-intro");
  renderStats();
  renderTypeChips();
  renderCatalog();
  setTheme(state.theme);
  selectProject(state.selectedId);
  bindEvents();

  window.setTimeout(() => {
    nodes.body.classList.remove("is-intro");
    state.hasCompletedIntro = true;
  }, motionPreference.matches ? 0 : 760);
}

initAtlas();
