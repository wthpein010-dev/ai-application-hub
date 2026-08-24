const overlay = document.querySelector('[data-role="confirmation-overlay"]');
const candidateList = document.querySelector('[data-role="candidate-list"]');
const candidateCount = document.querySelector('[data-role="candidate-count"]');
const overlayStatus = document.querySelector('[data-role="overlay-status"]');
const activityLog = document.querySelector('[data-role="activity-log"]');

const sampleCandidates = [
  {
    id: "release-v2",
    title: "发布待确认悬浮助手 v2",
    state: "已结束 · 等待你的下一条指令",
    preview: "构建验证已经完成，可以继续同步到公开站点。",
  },
  {
    id: "showcase-site",
    title: "完善产品演示站",
    state: "回合中断 · 可从当前进度继续",
    preview: "页面结构与素材已经保存，等待确认后继续制作视频。",
  },
];

let candidates = [];

document.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  if (action === "reveal-idle") {
    setState(candidates.length ? "attention" : "idle");
    activityLog.textContent = "已展开悬浮栏；后台监控正常，没有真实消息被发送。";
  } else if (action === "collapse-overlay") {
    setState("retracted");
    activityLog.textContent = "已手动收进屏幕顶部；监控仍在后台运行。";
  } else if (action === "simulate-candidates") {
    candidates = sampleCandidates.map(candidate => ({ ...candidate }));
    renderCandidates();
    setState("attention");
    activityLog.textContent = "扫描发现 2 个待确认任务，悬浮栏已自动弹出。";
  } else if (action === "simulate-error") {
    candidates = [];
    renderCandidates();
    setState("error");
    activityLog.textContent = "已模拟扫描异常；所有确认入口均已安全停用。";
  } else if (action === "confirm-one") {
    confirmOne(button.dataset.candidateId);
  } else if (action === "confirm-all") {
    confirmAll();
  } else if (action === "reset-demo") {
    candidates = [];
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
  activityLog.textContent = `已向「${candidate.title}」发送确认继续。`;
  setState(candidates.length ? "attention" : "retracted");
}

function confirmAll() {
  if (!candidates.length || overlay.dataset.overlayState !== "attention") return;
  const confirmedCount = candidates.length;
  candidates = [];
  renderCandidates();
  setState("retracted");
  activityLog.textContent = `已向 ${confirmedCount} 个任务发送确认继续，悬浮栏已自动收回。`;
}

function setState(state) {
  overlay.dataset.overlayState = state;
  if (state === "attention") {
    overlayStatus.textContent = `发现 ${candidates.length} 个待确认任务`;
  } else if (state === "error") {
    overlayStatus.textContent = "扫描异常 · 正在自动重试";
  } else {
    overlayStatus.textContent = "监控中 · 暂无待确认";
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

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.dataset.action = "confirm-one";
    confirm.dataset.candidateId = candidate.id;
    confirm.setAttribute("aria-label", `确认继续：${candidate.title}`);
    confirm.textContent = "确认继续";
    item.append(copy, confirm);
    return item;
  }));
  candidateCount.textContent = String(candidates.length);
}

renderCandidates();
setState("retracted");
