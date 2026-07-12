import {
  advancedSections,
  checkCompleteness,
  createDefaultDraft,
  defaultMemory,
  generateMarkdown,
  quickQuestions,
  sanitizeFileName
} from "./core.mjs";

const STORAGE_KEY = "minigame-project-tool-draft-v1";
const nodes = {
  quickFields: document.querySelector("#quickFields"),
  advancedSections: document.querySelector("#advancedSections"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  progressHint: document.querySelector("#progressHint"),
  issueSummary: document.querySelector("#issueSummary"),
  issueList: document.querySelector("#issueList"),
  markdownPreview: document.querySelector("#markdownPreview"),
  storageStatus: document.querySelector("#storageStatus"),
  memoryDialog: document.querySelector("#memoryDialog"),
  memoryContent: document.querySelector("#memoryContent"),
  toast: document.querySelector("#toast")
};

let draft = loadDraft();
let allExpanded = false;
let toastTimer = 0;

renderAll();
bindActions();

function renderAll() {
  renderQuickFields();
  renderAdvancedSections();
  updateDerivedState();
  nodes.memoryContent.textContent = defaultMemory;
}

function renderQuickFields() {
  nodes.quickFields.innerHTML = quickQuestions.map(question => renderField(question, true)).join("");
}

function renderAdvancedSections() {
  nodes.advancedSections.innerHTML = advancedSections.map((item, index) => {
    const visible = item.questions.filter(question => !question.visibleForStyle || question.visibleForStyle === draft.art_style);
    const answered = visible.filter(question => value(question.id)).length;
    return `
      <details class="question-section" data-section="${escapeHtml(item.id)}"${allExpanded || index === 0 ? " open" : ""}>
        <summary><strong>${escapeHtml(item.title)}</strong><span>${answered} / ${visible.length} 已填写</span></summary>
        <div class="field-grid">${visible.map(question => renderField(question, false)).join("")}</div>
      </details>`;
  }).join("");
}

function renderField(question, required) {
  const control = question.options.length
    ? `<select id="field-${question.id}" data-field="${question.id}">
        <option value="">请选择</option>
        ${question.options.map(option => `<option value="${escapeHtml(option)}"${value(question.id) === option ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>`
    : question.multiline
      ? `<textarea id="field-${question.id}" data-field="${question.id}" placeholder="${escapeHtml(question.help)}">${escapeHtml(value(question.id))}</textarea>`
      : `<input id="field-${question.id}" data-field="${question.id}" value="${escapeHtml(value(question.id))}" placeholder="${escapeHtml(question.help)}" />`;
  return `
    <div class="field-card${question.multiline ? " span-2" : ""}" data-field-card="${question.id}">
      <label for="field-${question.id}">${escapeHtml(question.label)}${required ? "<span>必填</span>" : ""}</label>
      <small>${escapeHtml(question.help)}</small>
      ${control}
    </div>`;
}

function bindActions() {
  document.addEventListener("input", handleFieldChange);
  document.addEventListener("change", handleFieldChange);
  document.querySelector("#checkIssues").addEventListener("click", () => {
    updateDerivedState();
    showToast("已重新检查需求完整度");
  });
  document.querySelector("#toggleAdvanced").addEventListener("click", event => {
    allExpanded = !allExpanded;
    document.querySelectorAll(".question-section").forEach(item => { item.open = allExpanded; });
    event.currentTarget.textContent = allExpanded ? "全部收起" : "全部展开";
  });
  document.querySelector("#fillExample").addEventListener("click", fillExample);
  document.querySelector("#viewMemory").addEventListener("click", openMemory);
  document.querySelector("#closeMemory").addEventListener("click", () => nodes.memoryDialog.close());
  nodes.memoryDialog.addEventListener("click", event => {
    if (event.target === nodes.memoryDialog) nodes.memoryDialog.close();
  });
  document.querySelector("#downloadMarkdown").addEventListener("click", downloadMarkdown);
  document.querySelector("#copyMarkdown").addEventListener("click", copyMarkdown);
  nodes.issueList.addEventListener("click", event => {
    const button = event.target.closest("[data-target-field]");
    if (button) focusField(button.dataset.targetField);
  });
  document.querySelectorAll(".step-nav a").forEach(link => link.addEventListener("click", () => {
    document.querySelectorAll(".step-nav a").forEach(item => item.classList.toggle("active", item === link));
  }));
}

function handleFieldChange(event) {
  const control = event.target.closest("[data-field]");
  if (!control) return;
  const previousStyle = draft.art_style;
  draft[control.dataset.field] = control.value;
  saveDraft();
  if (control.dataset.field === "art_style" && previousStyle !== draft.art_style) renderAdvancedSections();
  updateDerivedState();
}

function updateDerivedState() {
  updateProgress();
  renderIssues();
  nodes.markdownPreview.textContent = generateMarkdown(draft);
}

function updateProgress() {
  const complete = quickQuestions.filter(question => value(question.id)).length;
  const total = quickQuestions.length;
  nodes.progressText.textContent = `${complete} / ${total}`;
  nodes.progressBar.style.width = `${Math.round(complete / total * 100)}%`;
  nodes.progressHint.textContent = complete === total
    ? "核心信息已齐，可以继续补充细节或直接下载。"
    : `还差 ${total - complete} 个核心问题即可生成第一版需求。`;
}

function renderIssues() {
  const issues = checkCompleteness(draft);
  const critical = issues.filter(issue => issue.level === "critical").length;
  document.querySelectorAll("[data-field-card]").forEach(card => {
    card.classList.toggle("has-issue", issues.some(issue => issue.level === "critical" && issue.fieldId === card.dataset.fieldCard));
  });
  nodes.issueSummary.classList.toggle("ready", critical === 0);
  nodes.issueSummary.textContent = critical === 0
    ? `核心信息已齐。另有 ${issues.length} 项实施前确认或优化建议，可继续补充。`
    : `发现 ${critical} 个关键缺失和 ${issues.length - critical} 个确认或建议项。先补齐关键问题，可显著减少开发返工。`;
  nodes.issueList.innerHTML = issues.length
    ? issues.map(issue => `
      <button class="issue-button" type="button" data-target-field="${escapeHtml(issue.fieldId)}">
        <span class="issue-level level-${escapeHtml(issue.level)}">${levelText(issue.level)}</span>
        <span>${escapeHtml(issue.message)}</span>
        <span aria-hidden="true">定位 →</span>
      </button>`).join("")
    : `<div class="issue-summary ready">当前没有已知缺失项。</div>`;
}

function focusField(fieldId) {
  const control = document.querySelector(`[data-field="${cssEscape(fieldId)}"]`);
  if (!control) return;
  const details = control.closest("details");
  if (details) details.open = true;
  control.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => control.focus(), 280);
}

function fillExample() {
  draft = {
    ...createDefaultDraft(),
    project_name: "星球收纳师",
    game_type: "休闲益智",
    core_gameplay: "拖动太空物资完成分类，连续正确收纳可扩展舱室并获得连击奖励。",
    art_style: "科幻",
    first_version_scope: "完成一局 3 分钟的收纳循环、结算和重新开始流程。",
    player_goal: "在舱室装满前完成目标物资分类。",
    win_condition: "完成本局全部订单。",
    fail_condition: "错误物资占满临时槽位。",
    session_length: "1–3分钟",
    target_player: "喜欢轻松整理和短局体验的微信用户",
    control_mode: "单指拖动",
    desired_emotion: "轻松、专注、有连续整理的爽感",
    theme: "太空货运站",
    color_direction: "深蓝背景、青色交互、橙色奖励",
    sci_fi_tone: "霓虹未来",
    pages: "启动页、首页、关卡页、结算页、设置页",
    hud: "订单进度、临时槽位、连击、暂停",
    safe_area: "自动安全区",
    ui_motion: "适中",
    wechat_features: "本地存档、分享、排行榜预留",
    sdk_solution: "Unity 微信小游戏转换插件，版本实施前确认",
    privacy: "首版不申请敏感权限",
    monetization: "无",
    content_scale: "1 个主题、12 个物资、3 个教学关卡",
    music: "1 首低强度循环背景音乐",
    sound: "拾取、正确、错误、连击、结算",
    asset_source: "色块原型",
    target_devices: "中低端微信设备",
    target_fps: "60 FPS",
    offline_behavior: "断网不影响核心玩法，排行榜显示稍后重试",
    acceptance: "三关可完整游玩，无阻断错误，适配常见全面屏",
    excluded_scope: "首版不做广告、支付和联网账户系统",
    test_devices: "至少一台低端 Android、一台主流 Android 和一台 iPhone"
  };
  saveDraft();
  renderAll();
  showToast("已填充“星球收纳师”演示案例");
}

function openMemory() {
  if (typeof nodes.memoryDialog.showModal === "function") nodes.memoryDialog.showModal();
  else nodes.memoryDialog.setAttribute("open", "");
}

function downloadMarkdown() {
  try {
    const markdown = generateMarkdown(draft);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${sanitizeFileName(draft.project_name)}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    showToast("Markdown 已下载，可直接拖入 Codex 任务");
  } catch {
    showToast("下载失败，预览内容仍可复制");
  }
}

async function copyMarkdown() {
  const markdown = generateMarkdown(draft);
  try {
    await navigator.clipboard.writeText(markdown);
    showToast("Markdown 已复制到剪贴板");
  } catch {
    nodes.markdownPreview.focus();
    showToast("浏览器未允许复制，请在预览区手动选择");
  }
}

function loadDraft() {
  const defaults = createDefaultDraft();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return saved && saved.version === 1 && saved.values ? { ...defaults, ...saved.values } : defaults;
  } catch {
    window.setTimeout(() => setStorageWarning(), 0);
    return defaults;
  }
}

function saveDraft() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, values: draft }));
    nodes.storageStatus.textContent = "草稿已自动保存到当前浏览器。";
  } catch {
    setStorageWarning();
  }
}

function setStorageWarning() {
  if (nodes.storageStatus) nodes.storageStatus.textContent = "浏览器阻止了本地保存，本次仍可继续生成。";
}

function showToast(message) {
  nodes.toast.textContent = message;
  nodes.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => nodes.toast.classList.remove("show"), 2400);
}

function levelText(level) {
  return level === "critical" ? "关键缺失" : level === "confirmation" ? "实施前确认" : "优化建议";
}

function value(id) {
  return String(draft[id] ?? "").trim();
}

function escapeHtml(input) {
  return String(input ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
