import AnalysisWorker from "./worker/analysis-worker.js?worker&inline";
import sheepGameMapRaw from "./data/sheep-game-map.json";
import sheep900121Raw from "./data/sheep-900121.json";
import referenceSamples from "./data/reference-sample.json";
import { selectReferenceSample } from "./ui/reference-selection.js";
import { downloadReportJson, downloadReportPng } from "./io/export-report.js";
import { importLevelFiles, loadBundledLevelFiles } from "./io/import-levels.js";
import { normalizeSheepLevel, normalizeSheepLibrary } from "./model/normalize.js";
import "./styles.css";
import { completionStatus } from "./ui/completion-state.js";
import { createImportCoordinator } from "./ui/import-coordinator.js";
import { renderComparison, resetComparisonView } from "./ui/report-view.js";
import {
  applyImportedLevelsToSide,
  createComparisonSelection,
  selectLevelOnSide,
} from "./ui/side-selection.js";
import { createAppState } from "./ui/state.js";

const sides = ["left", "right"];
const sideNames = { left: "左侧", right: "右侧" };
const sideElements = Object.fromEntries(sides.map((side) => [side, {
  folderInput: document.querySelector(`#${side}-folder-input`),
  fileInput: document.querySelector(`#${side}-file-input`),
  importPanel: document.querySelector(`.import-panel[data-side="${side}"]`),
  importSummary: document.querySelector(`#${side}-import-summary`),
  importErrors: document.querySelector(`#${side}-import-errors`),
  levelSelect: document.querySelector(`#${side}-level-select`),
}]));

const elements = {
  modelSelect: document.querySelector("#model-select"),
  loadReferenceSample: document.querySelector("#load-reference-sample"),
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

const builtInSheepLibrary = normalizeSheepLibrary(sheepGameMapRaw, "sheep-game-map.json");
const sheep900121Fallback = {
  ...normalizeSheepLevel(sheep900121Raw),
  name: "羊 900121（备用）",
};
const defaultLeftLevels = [...builtInSheepLibrary.levels, sheep900121Fallback];
const samplePair = {left:referenceSamples.sheep900121, right:referenceSamples.pawsLevel0020};
const state = createAppState({
  selection: selectReferenceSample(createComparisonSelection(defaultLeftLevels), samplePair),
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

function levelLabel(level) {
  return level.referenceSnapshot || level.source === "sheep" ? level.name : level.id;
}

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
    model: elements.modelSelect.value,
    seeds,
    traySlots: Number(elements.traySelect.value),
    policy: elements.policySelect.value,
    riverRestarts: 20,
  };
}

function sameAnalysisOptions(left, right) {
  return Boolean(left && right
    && left.model === right.model
    && left.seeds === right.seeds
    && left.traySlots === right.traySlots
    && left.policy === right.policy
    && left.riverRestarts === right.riverRestarts);
}

function terminateActiveWorker() {
  const current = state.get();
  if (!current.worker) return;
  current.worker.postMessage({ type: "cancel", requestId: current.requestId });
  current.worker.terminate();
}

function updateButtons() {
  const current = state.get();
  const hasSelection = Boolean(
    current.selection.left.selectedLevel && current.selection.right.selectedLevel,
  );
  const canExport = Boolean(current.comparison && hasSelection && !current.processing);
  elements.exportPng.disabled = !canExport;
  elements.exportJson.disabled = !canExport;
  elements.cancel.hidden = !current.processing;
}

function cancelAnalysis(message = "分析已取消，调整参数或切换关卡可重新分析。") {
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

function startAnalysis(options = optionsFromControls()) {
  const current = state.get();
  const leftLevel = current.selection.left.selectedLevel;
  const rightLevel = current.selection.right.selectedLevel;
  if (!leftLevel || !rightLevel) {
    setStatus("左侧基准已就绪，请导入右侧关卡。", "idle");
    return;
  }

  terminateActiveWorker();
  const requestId = current.requestId + 1;
  const worker = new AnalysisWorker();
  state.set({ worker, requestId, processing: true, comparison: null });
  resetComparisonView(elements.report, leftLevel, rightLevel);
  updateButtons();
  setProgress(0, true);
  setStatus(`准备分析 ${leftLevel.id} vs ${rightLevel.id}…`, "working");

  worker.addEventListener("message", (event) => {
    const latest = state.get();
    const message = event.data ?? {};
    if (message.requestId !== latest.requestId || requestId !== latest.requestId) return;
    if (message.type === "progress") {
      const sideOffset = message.side === "left" ? 0 : 0.5;
      const progress = sideOffset + (message.payload.progress * 0.5);
      const progressLevel = message.side === "left" ? leftLevel : rightLevel;
      setProgress(progress, true);
      setStatus(`${levelLabel(progressLevel)} · ${stageLabels[message.payload.stage] ?? message.payload.stage}`, "working");
      return;
    }
    if (message.type === "result") {
      worker.terminate();
      state.set({ comparison: message.payload, worker: null, processing: false });
      renderComparison(elements.report, message.payload);
      setProgress(1, false);
      const completion = completionStatus(message.payload, leftLevel.id, rightLevel.id);
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
    leftLevel,
    rightLevel,
    options,
  });
}

function renderImportDetails(side, result) {
  const currentElements = sideElements[side];
  currentElements.importSummary.textContent = `已导入 ${result.importedCount} 个关卡 · 忽略 ${result.ignoredCount} 个文件 · ${result.warningCount} 项警告`;
  const items = [
    ...result.ignored.map((entry) => `${entry.path}：${entry.reason}`),
    ...result.errors.map((entry) => `${entry.path}：${entry.message}`),
  ];
  currentElements.importErrors.hidden = items.length === 0;
  currentElements.importErrors.querySelector("summary").textContent = `查看被跳过的文件（${items.length}）`;
  currentElements.importErrors.querySelector("ul").replaceChildren(...items.map((item) => {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    return listItem;
  }));
}

function populateLevelOptions(side, levels, selectedLevel) {
  const select = sideElements[side].levelSelect;
  select.replaceChildren(...levels.map((level, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${levelLabel(level)} · ${level.tiles.length} 砖 · ${new Set(level.tiles.map((tile) => tile.layer)).size} 层`;
    return option;
  }));
  const selectedIndex = levels.indexOf(selectedLevel);
  if (selectedIndex >= 0) select.value = String(selectedIndex);
  select.disabled = levels.length === 0;
}

function applyImportedLevels(side, result) {
  renderImportDetails(side, result);
  const selection = applyImportedLevelsToSide(state.get().selection, side, result);
  state.set({ selection });
  const currentSide = selection[side];
  populateLevelOptions(side, currentSide.levels, currentSide.selectedLevel);

  if (result.levels.length === 0) {
    if (side === "left") {
      setStatus(`左侧未发现有效关卡，保留内置羊关卡库；${result.errors.length} 个文件解析失败。`, "warning");
    } else {
      setStatus(`右侧未发现有效关卡；${result.errors.length} 个文件解析失败。`, "error");
    }
  } else {
    setStatus(`${sideNames[side]}导入完成，自动选择 ${currentSide.selectedLevel.id}。`, "success");
  }
  if (!selection.left.selectedLevel || !selection.right.selectedLevel) {
    state.set({ comparison: null });
    resetComparisonView(
      elements.report,
      selection.left.selectedLevel,
      selection.right.selectedLevel,
    );
    updateButtons();
    return;
  }
  startAnalysis();
}

const importCoordinators = Object.fromEntries(sides.map((side) => [
  side,
  createImportCoordinator(() => cancelAnalysis()),
]));

function handleFiles(side, files) {
  return importCoordinators[side].start(async () => {
    setStatus(`正在读取${sideNames[side]}关卡 JSON…`, "working");
    return importLevelFiles(files);
  }, (result) => applyImportedLevels(side, result));
}

let rightInputUsed = false;

async function loadDefaultBundledLevels() {
  try {
    const bundled = await loadBundledLevelFiles(globalThis.vCurveDesktop);
    if (!bundled.available || bundled.files.length === 0 || rightInputUsed) return;
    const result = await importLevelFiles(bundled.files);
    if (rightInputUsed) return;
    const selection = state.get().selection;
    const right = {...selection.right, levels:[...selection.right.levels, ...result.levels]};
    state.set({selection:{...selection,right}});
    populateLevelOptions("right", right.levels, right.selectedLevel);
    renderImportDetails("right", result);
    sideElements.right.importSummary.textContent = `内置 ${result.importedCount} 个工程关卡 + 原图示例 · 选择关卡切换右图`;
  } catch (error) {
    if (state.get().selection.right.levels.length === 0) {
      setStatus(`内置关卡加载失败，可在右侧手动选择文件夹：${error.message}`, "warning");
    }
  }
}

for (const side of sides) {
  const currentElements = sideElements[side];
  currentElements.folderInput.addEventListener("change", () => {
    if (!currentElements.folderInput.files?.length) return;
    if (side === "right") rightInputUsed = true;
    handleFiles(side, currentElements.folderInput.files);
  });
  currentElements.fileInput.addEventListener("change", () => {
    if (!currentElements.fileInput.files?.length) return;
    if (side === "right") rightInputUsed = true;
    handleFiles(side, currentElements.fileInput.files);
  });
  currentElements.levelSelect.addEventListener("change", () => {
    const selection = selectLevelOnSide(
      state.get().selection,
      side,
      Number(currentElements.levelSelect.value),
    );
    state.set({ selection });
    startAnalysis();
  });
  currentElements.importPanel.addEventListener("dragover", (event) => {
    event.preventDefault();
    currentElements.importPanel.classList.add("drop-active");
  });
  currentElements.importPanel.addEventListener("dragleave", () => {
    currentElements.importPanel.classList.remove("drop-active");
  });
  currentElements.importPanel.addEventListener("drop", (event) => {
    event.preventDefault();
    currentElements.importPanel.classList.remove("drop-active");
    if (!event.dataTransfer?.files?.length) return;
    if (side === "right") rightInputUsed = true;
    handleFiles(side, event.dataTransfer.files);
  });
}

for (const control of [elements.modelSelect, elements.seedInput, elements.traySelect, elements.policySelect]) {
  control.addEventListener("change", () => {
    const options = optionsFromControls();
    const current = state.get();
    if (!current.processing && sameAnalysisOptions(current.comparison?.options, options)) return;
    startAnalysis(options);
  });
}

elements.loadReferenceSample.addEventListener("click", () => {
  for (const side of sides) importCoordinators[side].invalidate();
  const selection = selectReferenceSample(state.get().selection, samplePair);
  state.set({selection});
  for (const side of sides) populateLevelOptions(side, selection[side].levels, selection[side].selectedLevel);
  elements.modelSelect.value = "reference";
  elements.seedInput.value = "300";
  elements.traySelect.value = "1";
  elements.policySelect.value = "greedy";
  startAnalysis();
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
  const requestId = state.get().requestId;
  elements.exportPng.disabled = true;
  setStatus("正在生成 2× PNG…", "working");
  try {
    await downloadReportPng(elements.report, comparison);
    if (state.get().requestId === requestId && state.get().comparison === comparison) {
      setStatus("报告 PNG 已导出。", "success");
    }
  } catch (error) {
    if (state.get().requestId === requestId && state.get().comparison === comparison) {
      setStatus(`PNG 导出失败：${error.message}`, "error");
    }
  } finally {
    updateButtons();
  }
});

sideElements.left.importSummary.textContent = "内置羊关卡库 · 36 个版本 + 900121 备用 + 原图示例";
sideElements.right.importSummary.textContent = "已选原图示例（17 种） · 可独立导入当前工程关卡";
for (const side of sides) populateLevelOptions(side, state.get().selection[side].levels, state.get().selection[side].selectedLevel);
updateButtons();
startAnalysis();
loadDefaultBundledLevels();
