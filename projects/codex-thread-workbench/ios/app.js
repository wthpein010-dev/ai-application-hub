const demoCard = document.querySelector(".demo-card");
const candidateList = document.querySelector('[data-role="candidate-list"]');
const candidateCount = document.querySelector('[data-role="candidate-count"]');
const demoStatus = document.querySelector('[data-role="demo-status"]');
const activityLog = document.querySelector('[data-role="activity-log"]');
const installState = document.querySelector('[data-role="install-state"]');

const samples = [
  { id: "package", title: "验证 Windows 下载包", state: "任务已结束 · 等待继续", preview: "下载包已构建，可以继续完成公开验收。" },
  { id: "video", title: "制作 v2 演示视频", state: "回合中断 · 进度已保存", preview: "脚本与画面已准备，确认后继续编码视频。" },
];
let candidates = [];

document.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "simulate-candidates") {
    candidates = samples.map(item => ({ ...item }));
    activityLog.textContent = "已模拟发现 2 个待确认任务。";
  } else if (button.dataset.action === "confirm-one") {
    const item = candidates.find(candidate => candidate.id === button.dataset.candidateId);
    candidates = candidates.filter(candidate => candidate.id !== button.dataset.candidateId);
    activityLog.textContent = `已模拟向「${item?.title || "任务"}」发送确认继续。`;
  } else if (button.dataset.action === "confirm-all") {
    const count = candidates.length;
    candidates = [];
    activityLog.textContent = `已模拟确认 ${count} 个任务；没有向真实 Codex 发送消息。`;
  } else if (button.dataset.action === "reset-demo") {
    candidates = [];
    activityLog.textContent = "演示已清空。";
  }
  render();
});

function render() {
  candidateList.replaceChildren(...candidates.map(candidate => {
    const card = document.createElement("article");
    card.className = "candidate";
    card.dataset.role = "candidate";
    const head = document.createElement("div");
    head.className = "candidate-head";
    const identity = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = candidate.title;
    const state = document.createElement("small");
    state.textContent = candidate.state;
    identity.append(title, state);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "confirm-one";
    button.dataset.candidateId = candidate.id;
    button.setAttribute("aria-label", `确认继续：${candidate.title}`);
    button.textContent = "确认继续";
    head.append(identity, button);
    const preview = document.createElement("p");
    preview.textContent = candidate.preview;
    card.append(head, preview);
    return card;
  }));
  demoCard.classList.toggle("has-candidates", candidates.length > 0);
  candidateCount.textContent = String(candidates.length);
  demoStatus.textContent = candidates.length ? `发现 ${candidates.length} 个待确认任务` : "演示待命 · 暂无候选";
}

function updateInstallGuidance() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (standalone) {
    installState.innerHTML = "<span>已安装</span><b>当前正从主屏幕全屏启动</b>";
  } else if (isiOS) {
    installState.innerHTML = "<span>Safari</span><b>点击分享，再选择“添加到主屏幕”</b>";
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}

updateInstallGuidance();
render();
