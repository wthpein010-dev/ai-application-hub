const state = {
  mode: "point",
  pointRunning: false,
  recording: false,
  replaying: false,
  selectedStep: -1,
  steps: [],
  replayTimer: 0,
};

const nodes = {
  status: document.querySelector(".workbench-status"),
  statusTitle: document.querySelector("[data-status-title]"),
  statusDetail: document.querySelector("[data-status-detail]"),
  screen: document.querySelector("[data-screen]"),
  target: document.querySelector("[data-target]"),
  wave: document.querySelector("[data-wave]"),
  coordinate: document.querySelector("[data-coordinate]"),
  frequency: document.querySelector("[data-frequency]"),
  count: document.querySelector("[data-count-summary]"),
  restore: document.querySelector("[data-restore-summary]"),
  pointButton: document.querySelector('[data-action="point-start"]'),
  recordButton: document.querySelector('[data-action="record"]'),
  replayButton: document.querySelector('[data-action="replay"]'),
  stepList: document.querySelector("[data-step-list]"),
  sequenceSummary: document.querySelector("[data-sequence-summary]"),
};

function numericField(name, fallback) {
  const value = Number(document.querySelector(`[data-field="${name}"]`)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function setStatus(kind, title, detail) {
  nodes.status.dataset.status = kind;
  nodes.statusTitle.textContent = title;
  nodes.statusDetail.textContent = detail;
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-mode-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.modePanel !== mode;
  });
  setStatus("ready", mode === "point" ? "定点点击已就绪" : "录制回放已就绪", "网页演示不会发送真实点击");
}

function updatePointPreview() {
  const x = Math.max(0, numericField("x", 842));
  const y = Math.max(0, numericField("y", 516));
  const interval = Math.max(0.05, numericField("interval", 2));
  const count = Math.max(0, Math.trunc(numericField("count", 0)));
  const restore = document.querySelector('[data-field="restore"]').checked;
  const left = Math.min(96, Math.max(4, (x / 1920) * 100));
  const top = Math.min(92, Math.max(14, (y / 1080) * 100));

  for (const marker of [nodes.target, nodes.wave]) {
    marker.style.left = `${left}%`;
    marker.style.top = `${top}%`;
  }
  nodes.coordinate.textContent = `${Math.trunc(x)}, ${Math.trunc(y)}`;
  nodes.frequency.textContent = `${(1 / interval).toFixed(interval >= 1 ? 1 : 2)} 次/秒`;
  nodes.count.textContent = count === 0 ? "持续" : `${count} 次`;
  nodes.restore.textContent = restore ? "已开启" : "已关闭";
}

function togglePoint() {
  state.pointRunning = !state.pointRunning;
  nodes.screen.classList.toggle("is-running", state.pointRunning);
  nodes.pointButton.textContent = state.pointRunning ? "暂停点击 · F8" : "开始点击 · F8";
  setStatus(
    state.pointRunning ? "running" : "ready",
    state.pointRunning ? "定点点击运行中" : "定点点击已暂停",
    state.pointRunning
      ? `模拟目标 ${nodes.coordinate.textContent}，不发送系统点击`
      : "再次点击按钮或按 F8 继续",
  );
}

function toggleRecording() {
  state.recording = !state.recording;
  nodes.recordButton.classList.toggle("is-recording", state.recording);
  nodes.recordButton.textContent = state.recording ? "结束录制 · F6" : "开始录制 · F6";
  setStatus(
    state.recording ? "recording" : "ready",
    state.recording ? "正在录制动作" : "录制已结束",
    state.recording ? "网页演示中请用“添加动作”模拟一次有效点击" : `共 ${state.steps.length} 个动作`,
  );
}

function addStep() {
  const presets = [
    { x: 842, y: 516, delay: 0 },
    { x: 1090, y: 620, delay: 0.84 },
    { x: 670, y: 742, delay: 1.12 },
    { x: 1260, y: 418, delay: 0.65 },
  ];
  const preset = presets[state.steps.length % presets.length];
  state.steps.push({
    ...preset,
    button: state.steps.length % 3 === 1 ? "右键" : "左键",
    hold: 20,
    restore: true,
  });
  state.selectedStep = state.steps.length - 1;
  renderSteps();
  setStatus(state.recording ? "recording" : "ready", "动作已添加", `已添加第 ${state.steps.length} 个动作`);
}

function renderSteps() {
  if (!state.steps.length) {
    nodes.stepList.innerHTML = '<tr class="empty-row"><td colspan="6">点击“添加动作”，体验动作时间线</td></tr>';
  } else {
    nodes.stepList.innerHTML = state.steps.map((step, index) => `
      <tr data-step="${index}" class="${index === state.selectedStep ? "is-selected" : ""}">
        <td>${String(index + 1).padStart(2, "0")}</td>
        <td>${step.button}</td>
        <td>${step.x}, ${step.y}</td>
        <td>${step.delay.toFixed(2)} 秒</td>
        <td>${step.hold} ms</td>
        <td>${step.restore ? "开启" : "关闭"}</td>
      </tr>
    `).join("");
  }
  const duration = state.steps.reduce((total, step) => total + step.delay + step.hold / 1000, 0);
  nodes.sequenceSummary.textContent = `${state.steps.length} 个动作 · 总时长 ${duration.toFixed(2)} 秒`;
  nodes.stepList.querySelectorAll("[data-step]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedStep = Number(row.dataset.step);
      renderSteps();
    });
  });
}

function deleteSelected() {
  if (state.selectedStep < 0 || state.selectedStep >= state.steps.length) return;
  state.steps.splice(state.selectedStep, 1);
  state.selectedStep = Math.min(state.selectedStep, state.steps.length - 1);
  renderSteps();
  setStatus("ready", "动作已删除", `剩余 ${state.steps.length} 个动作`);
}

function clearSteps() {
  state.steps = [];
  state.selectedStep = -1;
  stopReplay();
  renderSteps();
  setStatus("ready", "动作已清空", "可重新录制或添加动作");
}

function stopReplay() {
  window.clearInterval(state.replayTimer);
  state.replayTimer = 0;
  state.replaying = false;
  nodes.replayButton.textContent = "开始回放 · F7";
  nodes.stepList.querySelectorAll("[data-step]").forEach((row) => row.classList.remove("is-playing"));
}

function toggleReplay() {
  if (state.replaying) {
    stopReplay();
    setStatus("ready", "序列回放已暂停", "再次点击或按 F7 继续");
    return;
  }
  if (!state.steps.length) {
    setStatus("ready", "还没有动作", "请先录制或添加动作");
    return;
  }
  state.replaying = true;
  nodes.replayButton.textContent = "暂停回放 · F7";
  let current = -1;
  const advance = () => {
    const rows = [...nodes.stepList.querySelectorAll("[data-step]")];
    rows.forEach((row) => row.classList.remove("is-playing"));
    current = (current + 1) % rows.length;
    rows[current]?.classList.add("is-playing");
    setStatus("running", "序列回放中", `正在模拟第 ${current + 1} 个动作`);
  };
  advance();
  state.replayTimer = window.setInterval(advance, 850);
}

export function downloadSequence() {
  if (!state.steps.length) {
    setStatus("ready", "当前没有可保存的动作", "请先添加动作");
    return;
  }
  const payload = JSON.stringify({ version: "1.0.0", steps: state.steps }, null, 2);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  link.download = "clickflow-sequence.json";
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus("ready", "序列示例已保存", `${state.steps.length} 个动作`);
}

function stopAll() {
  state.pointRunning = false;
  state.recording = false;
  nodes.screen.classList.remove("is-running");
  nodes.pointButton.textContent = "开始点击 · F8";
  nodes.recordButton.classList.remove("is-recording");
  nodes.recordButton.textContent = "开始录制 · F6";
  stopReplay();
  setStatus("ready", "全部任务已停止", "可安全调整设置后重新开始");
}

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});
document.querySelectorAll('[data-field="x"], [data-field="y"], [data-field="interval"], [data-field="count"], [data-field="restore"]').forEach((field) => {
  field.addEventListener("input", updatePointPreview);
  field.addEventListener("change", updatePointPreview);
});

document.querySelector('[data-action="point-start"]').addEventListener("click", togglePoint);
document.querySelector('[data-action="record"]').addEventListener("click", toggleRecording);
document.querySelector('[data-action="add-step"]').addEventListener("click", addStep);
document.querySelector('[data-action="delete-step"]').addEventListener("click", deleteSelected);
document.querySelector('[data-action="clear-steps"]').addEventListener("click", clearSteps);
document.querySelector('[data-action="save-sequence"]').addEventListener("click", downloadSequence);
document.querySelector('[data-action="replay"]').addEventListener("click", toggleReplay);
document.querySelector('[data-action="stop-all"]').addEventListener("click", stopAll);

document.addEventListener("keydown", (event) => {
  if (event.key === "F6") toggleRecording();
  if (event.key === "F7") toggleReplay();
  if (event.key === "F8") togglePoint();
  if (event.key === "F9") stopAll();
});

updatePointPreview();
renderSteps();
