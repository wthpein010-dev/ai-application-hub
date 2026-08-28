import AnalysisWorker from "./worker/analysis-worker.js?worker&inline";
import sheepRaw from "./data/sheep-900121.json";
import { downloadReportJson, downloadReportPng } from "./io/export-report.js";
import { importLevelFiles, loadBundledLevelFiles } from "./io/import-levels.js";
import "./styles.css";
import { renderComparison } from "./ui/report-view.js";
import { completionStatus } from "./ui/completion-state.js";
import { createImportCoordinator } from "./ui/import-coordinator.js";
import { createAppState } from "./ui/state.js";

const elements = {
  folderInput: document.querySelector("#folder-input"),
  fileInput: document.querySelector("#file-input"),
  importPanel: document.querySelector(".import-panel"),
  importSummary: document.querySelector("#import-summary"),
  importErrors: document.querySelector("#import-errors"),
  levelSelect: document.querySelector("#level-select"),
  seedInput: document.querySelector("#seed-input"),
  traySelect: document.querySelector("#tray-select"),
  policySelect: document.querySelector("#policy-select"),
  status: document.querySelector("#analysis-status"),
  statusDot: document.querySelector(".status-dot"),
  progressTrack: document.querySelector("#progress-track"),
  progressBar: document.querySelector("#progress-bar"),
  cancel: document.querySelector("#cancel-analysis"),
  exportPng: document.querySelector("#export-png"),
  exportJson: document.querySelector("#export-json"),
  report: document.querySelector("#report"),
};

const state = createAppState({
  levels: [],
  selectedLevel: null,
  comparison: null,
  worker: null,
  requestId: 0,
  processing: false,
});

const stageLabels = {
  structure: "结构图",
  "expected-v": "E[V]近似",
  river: "河道边界",
  "monte-carlo": "蒙特卡洛",
  metrics: "关键指标",
  diagnostics: "结构诊断",
};

function setStatus(message, tone = "idle") {
  elements.status.textContent = message;
  const colors = {
    idle: "#5b6576",
    working: "#7ca9ff",
    success: "#4de0bf",
    warning: "#f6b85e",
    error: "#ff6571",
  };
  const color = colors[tone] ?? colors.idle;
  elements.statusDot.style.background = color;
  elements.statusDot.style.boxShadow = `0 0 0 4px ${color}1a`;
  elements.status.closest(".status-row").dataset.tone = tone;
}

function setProgress(value, visible) {
  elements.progressTrack.hidden = !visible;
  elements.progressBar.style.width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

function optionsFromControls() {
  const seeds = Math.min(2000, Math.max(20, Math.trunc(Number(elements.seedInput.value)) || 300));
  elements.seedInput.value = String(seeds);
  return {
    seeds,
    traySlots: Number(elements.traySelect.value),
    policy: elements.policySelect.value,
    riverRestarts: 20,
  };
}

function terminateActiveWorker() {
  const current = state.get();
  if (!current.worker) return;
  current.worker.postMessage({ type: "cancel", requestId: current.requestId });
  current.worker.terminate();
}

function updateButtons() {
  const current = state.get();
  const hasReport = Boolean(current.comparison);
  elements.exportPng.disabled = !hasReport;
  elements.exportJson.disabled = !hasReport;
  elements.cancel.hidden = !current.processing;
}

function cancelAnalysis(message = "分析已取消，保留上一份有效报告。") {
  const current = state.get();
  if (!current.processing) return;
  terminateActiveWorker();
  state.set({
    worker: null,
    processing: false,
    requestId: current.requestId + 1,
  });
  setProgress(0, false);
  setStatus(message, "idle");
  updateButtons();
}

const importCoordinator = createImportCoordinator(() => cancelAnalysis());

function startAnalysis() {
  const current = state.get();
  if (!current.selectedLevel) return;
  terminateActiveWorker();
  const requestId = current.requestId + 1;
  const worker = new AnalysisWorker();
  state.set({ worker, requestId, processing: true });
  updateButtons();
  setProgress(0, true);
  setStatus(`准备分析 ${current.selectedLevel.id}…`, "working");

  worker.addEventListener("message", (event) => {
    const latest = state.get();
    const message = event.data ?? {};
    if (message.requestId !== latest.requestId || requestId !== latest.requestId) return;
    if (message.type === "progress") {
      const sideOffset = message.side === "sheep" ? 0 : 0.5;
      const progress = sideOffset + (message.payload.progress * 0.5);
      setProgress(progress, true);
      setStatus(`${message.side === "sheep" ? "羊 900121" : current.selectedLevel.id} · ${stageLabels[message.payload.stage] ?? message.payload.stage}`, "working");
      return;
    }
    if (message.type === "result") {
      worker.terminate();
      state.set({ comparison: message.payload, worker: null, processing: false });
      renderComparison(elements.report, message.payload);
      setProgress(1, false);
      const completion = completionStatus(message.payload, current.selectedLevel.id);
      setStatus(completion.message, completion.tone);
      updateButtons();
      return;
    }
    if (message.type === "error") {
      worker.terminate();
      state.set({ worker: null, processing: false });
      setProgress(0, false);
      setStatus(`分析失败：${message.payload.message}`, "error");
      updateButtons();
    }
  });

  worker.addEventListener("error", (event) => {
    if (requestId !== state.get().requestId) return;
    worker.terminate();
    state.set({ worker: null, processing: false });
    setProgress(0, false);
    setStatus(`分析 Worker 异常：${event.message || "未知错误"}`, "error");
    updateButtons();
  });

  worker.postMessage({
    type: "analyze",
    requestId,
    level: current.selectedLevel,
    baseline: sheepRaw,
    options: optionsFromControls(),
  });
}

function renderImportDetails(result) {
  elements.importSummary.textContent = `已导入 ${result.importedCount} 个关卡 · 忽略 ${result.ignoredCount} 个文件 · ${result.warningCount} 项警告`;
  const items = [
    ...result.ignored.map((entry) => `${entry.path}：${entry.reason}`),
    ...result.errors.map((entry) => `${entry.path}：${entry.message}`),
  ];
  elements.importErrors.hidden = items.length === 0;
  elements.importErrors.querySelector("summary").textContent = `查看被跳过的文件（${items.length}）`;
  elements.importErrors.querySelector("ul").replaceChildren(...items.map((item) => {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    return listItem;
  }));
}

function populateLevelOptions(levels) {
  elements.levelSelect.replaceChildren(...levels.map((level, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${level.id} · ${level.tiles.length} 砖 · ${new Set(level.tiles.map((tile) => tile.layer)).size} 层`;
    return option;
  }));
}

function applyImportedLevels(result) {
  renderImportDetails(result);
  if (result.levels.length === 0) {
    cancelAnalysis("未发现有效正式关卡。");
    state.set({ levels: [], selectedLevel: null });
    const emptyOption = document.createElement("option");
    emptyOption.textContent = "没有有效关卡";
    elements.levelSelect.replaceChildren(emptyOption);
    elements.levelSelect.disabled = true;
    setStatus(`未发现有效关卡；${result.errors.length} 个文件解析失败。`, "error");
    return;
  }

  populateLevelOptions(result.levels);
  const selectedIndex = result.levels.indexOf(result.selectedLevel);
  elements.levelSelect.value = String(selectedIndex);
  elements.levelSelect.disabled = false;
  state.set({ levels: result.levels, selectedLevel: result.selectedLevel });
  setStatus(`导入完成，自动选择 ${result.selectedLevel.id}。`, "success");
  startAnalysis();
}

function handleFiles(files) {
  return importCoordinator.start(async () => {
    setStatus("正在读取关卡 JSON…", "working");
    return importLevelFiles(files);
  }, applyImportedLevels);
}

async function loadDefaultBundledLevels() {
  try {
    const bundled = await loadBundledLevelFiles(globalThis.vCurveDesktop);
    if (!bundled.available || bundled.files.length === 0) return;
    const current = state.get();
    if (current.levels.length > 0 || current.processing) return;
    setStatus(`正在加载内置 ${bundled.folderName ?? "Editorlevel"}…`, "working");
    await handleFiles(bundled.files);
  } catch (error) {
    if (state.get().levels.length === 0) {
      setStatus(`内置关卡加载失败，可手动选择文件夹：${error.message}`, "warning");
    }
  }
}

elements.folderInput.addEventListener("change", () => {
  if (elements.folderInput.files?.length) handleFiles(elements.folderInput.files);
});
elements.fileInput.addEventListener("change", () => {
  if (elements.fileInput.files?.length) handleFiles(elements.fileInput.files);
});

elements.levelSelect.addEventListener("change", () => {
  const selectedLevel = state.get().levels[Number(elements.levelSelect.value)];
  state.set({ selectedLevel });
  startAnalysis();
});

for (const control of [elements.seedInput, elements.traySelect, elements.policySelect]) {
  control.addEventListener("change", () => {
    if (state.get().selectedLevel) startAnalysis();
  });
}

elements.importPanel.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.importPanel.classList.add("drop-active");
});
elements.importPanel.addEventListener("dragleave", () => elements.importPanel.classList.remove("drop-active"));
elements.importPanel.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.importPanel.classList.remove("drop-active");
  if (event.dataTransfer?.files?.length) handleFiles(event.dataTransfer.files);
});

elements.cancel.addEventListener("click", () => cancelAnalysis());
elements.exportJson.addEventListener("click", () => {
  const comparison = state.get().comparison;
  if (!comparison) return;
  try {
    downloadReportJson(comparison);
    setStatus("分析 JSON 已导出。", "success");
  } catch (error) {
    setStatus(`JSON 导出失败：${error.message}`, "error");
  }
});
elements.exportPng.addEventListener("click", async () => {
  const comparison = state.get().comparison;
  if (!comparison) return;
  elements.exportPng.disabled = true;
  setStatus("正在生成 2× PNG…", "working");
  try {
    await downloadReportPng(elements.report, comparison);
    setStatus("报告 PNG 已导出。", "success");
  } catch (error) {
    setStatus(`PNG 导出失败：${error.message}`, "error");
  } finally {
    elements.exportPng.disabled = false;
  }
});

updateButtons();
loadDefaultBundledLevels();
