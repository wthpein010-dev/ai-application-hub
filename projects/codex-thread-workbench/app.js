const overlay = document.querySelector('[data-role="confirmation-overlay"]');
const candidateList = document.querySelector('[data-role="candidate-list"]');
const candidateCount = document.querySelector('[data-role="candidate-count"]');
const overlayStatus = document.querySelector('[data-role="overlay-status"]');
const activityLog = document.querySelector('[data-role="activity-log"]');
const autoConfirmToggle = document.querySelector('[data-role="auto-confirm-toggle"]');

const sampleCandidates = [
  {
    id: "release-v2",
    title: "发布待确认悬浮助手 v2.3.9",
    state: "已结束 · 等待你的下一条指令",
    preview: "构建验证已经完成，是否继续同步到公开站点？",
  },
  {
    id: "showcase-site",
    title: "完善产品演示站",
    state: "等待你的决定",
    preview: "页面结构已经完成，需要我继续制作演示视频吗？",
  },
];

let candidates = [];
let autoConfirmEnabled = false;
let autoConfirmTimer;
let revealTimer;
let retractTimer;

overlay.addEventListener("pointerenter", event => {
  if (event.pointerType === "touch") return;
  clearTimeout(retractTimer);
  if (overlay.dataset.overlayState === "retracted") {
    revealTimer = setTimeout(() => setState(candidates.length ? "attention" : "idle"), 350);
  }
});
overlay.addEventListener("pointerleave", () => {
  clearTimeout(revealTimer);
  if (candidates.length || overlay.dataset.overlayState === "error") return;
  retractTimer = setTimeout(() => {
    if (!overlay.matches(":hover") && !overlay.matches(":focus-within") && !candidates.length && overlay.dataset.overlayState === "idle") {
      setState("retracted");
    }
  }, 760);
});

document.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  if (action === "reveal-idle") {
    setState(candidates.length ? "attention" : "idle");
    activityLog.textContent = "已展开悬浮栏；后台监控正常，没有真实消息被发送。";
  } else if (action === "collapse-overlay") {
    setState("retracted");
    activityLog.textContent = "演示已收进屏幕左侧；监控仍在后台运行。";
  } else if (action === "simulate-candidates") {
    candidates = sampleCandidates.map(candidate => ({ ...candidate }));
    renderCandidates();
    setState("attention");
    if (autoConfirmEnabled) {
      activityLog.textContent = "扫描发现 2 个待确认任务；自动确认已开启，正在执行。";
      clearTimeout(autoConfirmTimer);
      autoConfirmTimer = setTimeout(() => confirmAll(true), 520);
    } else {
      activityLog.textContent = "扫描发现 2 个待确认任务，悬浮栏已自动弹出。";
    }
  } else if (action === "simulate-error") {
    candidates = [];
    renderCandidates();
    setState("error");
    activityLog.textContent = "已模拟扫描异常；所有确认入口均已安全停用。";
  } else if (action === "simulate-close") {
    candidates = [];
    renderCandidates();
    setState("retracted");
    activityLog.textContent = "关闭请求已拦截；悬浮栏继续运行，Windows 恢复任务仍会每分钟检查恢复。";
  } else if (action === "confirm-one") {
    confirmOne(button.dataset.candidateId);
  } else if (action === "view-one") {
    viewOne(button.dataset.candidateId);
  } else if (action === "ignore-one") {
    const candidate = candidates.find(item => item.id === button.dataset.candidateId);
    if (!candidate) return;
    candidates = candidates.filter(item => item.id !== candidate.id);
    renderCandidates();
    setState(candidates.length ? "attention" : "retracted");
    activityLog.textContent = `演示：已忽略「${candidate.title}」。`;
  } else if (action === "confirm-all") {
    confirmAll();
  } else if (action === "toggle-auto-confirm") {
    autoConfirmEnabled = !autoConfirmEnabled;
    updateAutoConfirmToggle();
    activityLog.textContent = autoConfirmEnabled
      ? "自动确认已开启；新候选会在安全重核验后直接执行。"
      : "自动确认已关闭；新候选将等待你查看或确认。";
  } else if (action === "reset-demo") {
    clearTimeout(autoConfirmTimer);
    candidates = [];
    autoConfirmEnabled = false;
    updateAutoConfirmToggle();
    renderCandidates();
    setState("retracted");
    activityLog.textContent = "演示已重置，悬浮栏当前处于收纳状态。";
  }
});

function confirmOne(id) {
  const candidate = candidates.find(item => item.id === id);
  if (!candidate) return;

  candidates = candidates.filter(item => item.id !== id);
  renderCandidates();
  activityLog.textContent = `演示：已向「${candidate.title}」发送确认继续，未操作真实任务。`;
  setState(candidates.length ? "attention" : "retracted");
}

function viewOne(id) {
  const candidate = candidates.find(item => item.id === id);
  if (!candidate) return;
  activityLog.textContent = `演示：查看「${candidate.title}」的 Codex 原任务；候选保持不变。`;
}

function confirmAll(automatic = false) {
  if (!candidates.length || overlay.dataset.overlayState !== "attention") return;
  const confirmedCount = candidates.length;
  candidates = [];
  renderCandidates();
  setState("retracted");
  activityLog.textContent = automatic
    ? `演示：自动确认已向 ${confirmedCount} 个模拟任务发送继续消息，悬浮栏已收回。`
    : `演示：已向 ${confirmedCount} 个任务发送确认继续，未操作真实任务。`;
}

function updateAutoConfirmToggle() {
  autoConfirmToggle.setAttribute("aria-pressed", String(autoConfirmEnabled));
  autoConfirmToggle.classList.toggle("is-active", autoConfirmEnabled);
  autoConfirmToggle.textContent = `自动确认 ${autoConfirmEnabled ? "开" : "关"}`;
}

function setState(state) {
  clearTimeout(revealTimer);
  clearTimeout(retractTimer);
  overlay.dataset.overlayState = state;
  if (state === "attention") {
    overlayStatus.textContent = "等待回复";
  } else if (state === "error") {
    overlayStatus.textContent = "扫描异常";
  } else {
    overlayStatus.textContent = "监控中";
  }
}

function renderCandidates() {
  candidateList.replaceChildren(...candidates.map(candidate => {
    const item = document.createElement("article");
    item.className = "candidate";
    item.dataset.role = "candidate";

    const copy = document.createElement("div");
    copy.className = "candidate-copy";
    const title = document.createElement("strong");
    title.textContent = candidate.title;
    const state = document.createElement("small");
    state.textContent = candidate.state;
    const preview = document.createElement("p");
    preview.textContent = candidate.preview;
    copy.append(title, state, preview);

    const actions = document.createElement("div");
    actions.className = "candidate-actions";

    const view = document.createElement("button");
    view.type = "button";
    view.className = "candidate-view";
    view.dataset.action = "view-one";
    view.dataset.candidateId = candidate.id;
    view.setAttribute("aria-label", `查看原任务：${candidate.title}`);
    view.textContent = "查看";

    const ignore = document.createElement("button");
    ignore.type = "button";
    ignore.className = "candidate-ignore";
    ignore.dataset.action = "ignore-one";
    ignore.dataset.candidateId = candidate.id;
    ignore.setAttribute("aria-label", `忽略：${candidate.title}`);
    ignore.textContent = "忽略";

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.dataset.action = "confirm-one";
    confirm.dataset.candidateId = candidate.id;
    confirm.setAttribute("aria-label", `确认继续：${candidate.title}`);
    confirm.textContent = "确认继续";
    actions.append(view, ignore, confirm);
    item.append(copy, actions);
    return item;
  }));
  candidateCount.textContent = String(candidates.length);
}

renderCandidates();
updateAutoConfirmToggle();
setState("retracted");
