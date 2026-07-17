const state = {
  codex: 72,
  spark: 100,
  status: "live",
  collapsed: false,
  visible: true,
  dragging: false,
};

const nodes = {
  body: document.body,
  desktop: document.querySelector("#desktop"),
  window: document.querySelector("#quotaWindow"),
  titlebar: document.querySelector("#windowTitlebar"),
  codexRange: document.querySelector("#codexRange"),
  sparkRange: document.querySelector("#sparkRange"),
  codexOutput: document.querySelector("#codexOutput"),
  sparkOutput: document.querySelector("#sparkOutput"),
  codexValue: document.querySelector("#codexValue"),
  sparkValue: document.querySelector("#sparkValue"),
  collapsedValue: document.querySelector("#collapsedValue"),
  codexProgress: document.querySelector("#codexProgress"),
  sparkProgress: document.querySelector("#sparkProgress"),
  collapsedProgress: document.querySelector("#collapsedProgress"),
  connectionLabel: document.querySelector("#connectionLabel"),
  simulationStatus: document.querySelector("#simulationStatus"),
  resetText: document.querySelector("#resetText"),
  caption: document.querySelector("#videoCaption"),
};

const statusCopy = {
  live: ["刚刚更新", "数据已连接"],
  reconnecting: ["正在重连", "保留上次数据"],
  offline: ["未找到 Codex", "等待程序连接"],
};

function tone(value) {
  if (value < 10) return "var(--critical)";
  if (value <= 20) return "var(--warning)";
  return "var(--healthy)";
}

function render() {
  const codexTone = tone(state.codex);
  const sparkTone = tone(state.spark);
  nodes.codexRange.value = state.codex;
  nodes.sparkRange.value = state.spark;
  nodes.codexOutput.textContent = `${state.codex}%`;
  nodes.sparkOutput.textContent = `${state.spark}%`;
  nodes.codexOutput.style.color = codexTone;
  nodes.sparkOutput.style.color = sparkTone;
  nodes.codexValue.textContent = `${state.codex}%`;
  nodes.sparkValue.textContent = `${state.spark}%`;
  nodes.collapsedValue.textContent = `${state.codex}%`;
  nodes.collapsedValue.style.color = codexTone;
  nodes.codexProgress.style.width = `${state.codex}%`;
  nodes.sparkProgress.style.width = `${state.spark}%`;
  nodes.collapsedProgress.style.width = `${state.codex}%`;
  nodes.codexProgress.style.backgroundColor = codexTone;
  nodes.sparkProgress.style.backgroundColor = sparkTone;
  nodes.collapsedProgress.style.backgroundColor = codexTone;
  nodes.connectionLabel.textContent = statusCopy[state.status][0];
  nodes.simulationStatus.textContent = statusCopy[state.status][1];
  nodes.connectionLabel.style.color = state.status === "live" ? "var(--healthy)" : state.status === "reconnecting" ? "var(--warning)" : "var(--critical)";
  nodes.window.classList.toggle("collapsed", state.collapsed);
  nodes.window.classList.toggle("hidden", !state.visible);
  document.querySelectorAll("[data-status]").forEach(button => button.classList.toggle("active", button.dataset.status === state.status));
}

function setQuota(codex, spark = state.spark) {
  state.codex = Math.max(0, Math.min(100, Math.round(codex)));
  state.spark = Math.max(0, Math.min(100, Math.round(spark)));
  render();
}

function setStatus(status) {
  state.status = status;
  render();
}

function setCollapsed(collapsed) {
  state.collapsed = collapsed;
  render();
}

function setVisible(visible) {
  state.visible = visible;
  render();
}

function refresh() {
  setStatus("live");
  nodes.window.classList.remove("pulse");
  requestAnimationFrame(() => nodes.window.classList.add("pulse"));
}

nodes.codexRange.addEventListener("input", event => setQuota(Number(event.target.value)));
nodes.sparkRange.addEventListener("input", event => setQuota(state.codex, Number(event.target.value)));
document.querySelector("#consumeButton").addEventListener("click", () => setQuota(state.codex - 7, state.spark - 2));
document.querySelector("#refreshButton").addEventListener("click", refresh);
document.querySelector("#collapseButton").addEventListener("click", () => setCollapsed(true));
document.querySelector("#expandButton").addEventListener("click", () => setCollapsed(false));
document.querySelector("#hideButton").addEventListener("click", () => setVisible(false));
document.querySelector("#collapsedHideButton").addEventListener("click", () => setVisible(false));
document.querySelector("#trayButton").addEventListener("click", () => setVisible(true));
document.querySelectorAll("[data-status]").forEach(button => button.addEventListener("click", () => setStatus(button.dataset.status)));

let dragOffset = { x: 0, y: 0 };
nodes.titlebar.addEventListener("pointerdown", event => {
  if (event.target.closest("button")) return;
  const bounds = nodes.window.getBoundingClientRect();
  const desktopBounds = nodes.desktop.getBoundingClientRect();
  state.dragging = true;
  dragOffset = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  nodes.window.classList.add("drag-positioned", "dragging");
  nodes.window.style.right = "auto";
  nodes.window.style.left = `${bounds.left - desktopBounds.left}px`;
  nodes.titlebar.setPointerCapture(event.pointerId);
});

nodes.titlebar.addEventListener("pointermove", event => {
  if (!state.dragging) return;
  const desktopBounds = nodes.desktop.getBoundingClientRect();
  const width = nodes.window.offsetWidth;
  const height = nodes.window.offsetHeight;
  const x = Math.max(8, Math.min(desktopBounds.width - width - 8, event.clientX - desktopBounds.left - dragOffset.x));
  const y = Math.max(8, Math.min(desktopBounds.height - height - 8, event.clientY - desktopBounds.top - dragOffset.y));
  nodes.window.style.left = `${x}px`;
  nodes.window.style.top = `${y}px`;
});

nodes.titlebar.addEventListener("pointerup", event => {
  state.dragging = false;
  nodes.window.classList.remove("dragging");
  nodes.titlebar.releasePointerCapture(event.pointerId);
});

function caption(text) {
  nodes.caption.textContent = text;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runVideoTimeline() {
  nodes.body.classList.add("video-mode");
  setVisible(true);
  setCollapsed(false);
  setQuota(72, 100);
  setStatus("live");
  caption("实时查看 Codex 与 Spark 剩余额度");
  await wait(5000);

  caption("每 30 秒自动刷新，也可以随时手动刷新");
  refresh();
  await wait(5000);

  caption("额度变化会即时反映在进度条上");
  setQuota(42, 93);
  await wait(5000);

  caption("低于 20% 变为黄色，低于 10% 变为红色");
  setQuota(18, 80);
  await wait(4000);
  setQuota(8, 80);
  await wait(4000);

  caption("折叠为紧凑栏，减少桌面占用");
  setQuota(64, 100);
  setCollapsed(true);
  await wait(5000);

  caption("关闭窗口后仍驻留托盘");
  setVisible(false);
  await wait(4000);

  caption("点击托盘图标即可恢复，并继续显示最新额度");
  setVisible(true);
  await wait(2500);
  setCollapsed(false);
  refresh();
  await wait(3500);

  caption("Windows 与 macOS 工具包均可直接下载使用");
  await wait(4000);
}

window.codexQuotaDemo = { setQuota, setStatus, setCollapsed, setVisible, refresh, runVideoTimeline };

if (new URLSearchParams(location.search).get("autoplay") === "1") {
  runVideoTimeline();
}

render();
