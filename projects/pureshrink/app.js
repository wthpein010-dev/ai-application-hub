import { formatBytes, savingRatio, summarizeTasks } from "./core/metrics.mjs";
import { createQueue } from "./core/queue.mjs";
import { createBrowserEngine } from "./engines/browser-engine.mjs";
import { createDesktopEngine } from "./engines/desktop-engine.mjs";

const nodes = {
  picker: document.querySelector("#filePicker"),
  dropzone: document.querySelector("[data-pureshrink-dropzone]"),
  queue: document.querySelector("[data-pureshrink-queue]"),
  template: document.querySelector("#queueItemTemplate"),
  start: document.querySelector("[data-pureshrink-start]"),
  cancel: document.querySelector("[data-pureshrink-cancel]"),
  clear: document.querySelector("[data-pureshrink-clear]"),
  downloadAll: document.querySelector("[data-pureshrink-download-all]"),
  status: document.querySelector("[data-pureshrink-status]"),
  engine: document.querySelector("[data-pureshrink-engine]"),
  outputSettings: document.querySelector("[data-pureshrink-output-settings]"),
  outputDirectory: document.querySelector("[data-pureshrink-output-directory]"),
  chooseOutput: document.querySelector("[data-pureshrink-choose-output]"),
  count: document.querySelector("[data-pureshrink-count]"),
  input: document.querySelector("[data-pureshrink-input]"),
  output: document.querySelector("[data-pureshrink-output]"),
  savings: document.querySelector("[data-pureshrink-savings]"),
  completed: document.querySelector("[data-pureshrink-completed]"),
};

const desktopBridge = globalThis.pureShrinkDesktop;
const browserEngine = createBrowserEngine();
const engine = desktopBridge ? createDesktopEngine(desktopBridge) : browserEngine;
const queue = createQueue((task, report, signal) => engine.compress(task, report, signal));
let mode = "lossless";

const STATUS_COPY = {
  queued: "等待",
  running: "处理中",
  completed: "已完成",
  "kept-original": "保留原件",
  failed: "失败",
  cancelled: "已取消",
};

async function initializeDesktop() {
  if (!desktopBridge) return;
  const environment = await desktopBridge.getEnvironment();
  nodes.outputDirectory.textContent = environment.outputDirectory;
  nodes.outputDirectory.title = environment.outputDirectory;
  nodes.outputSettings.hidden = false;
  nodes.chooseOutput.addEventListener("click", async () => {
    const selected = await desktopBridge.chooseOutputDirectory();
    if (!selected) return;
    nodes.outputDirectory.textContent = selected;
    nodes.outputDirectory.title = selected;
    nodes.status.textContent = "桌面输出目录已更新";
  });
}

function modeForNewFiles() {
  return document.querySelector('input[name="mode"]:checked')?.value || mode;
}

function addFiles(files) {
  const list = Array.from(files || []).filter((file) => Number(file.size || 0) >= 0);
  if (!list.length) return;
  queue.add(list, modeForNewFiles());
  nodes.status.textContent = `已加入 ${list.length} 个文件`;
}

async function pickFiles() {
  if (desktopBridge?.pickFiles) {
    const files = await desktopBridge.pickFiles();
    addFiles(files);
    return;
  }
  nodes.picker.click();
}

function resultCopy(task) {
  if (task.status === "completed") {
    const ratio = savingRatio(task.file.size, task.result?.outputBytes || 0);
    return ratio > 0 ? `-${ratio}% · ${formatBytes(task.result.outputBytes)}` : formatBytes(task.result.outputBytes);
  }
  if (task.status === "kept-original") return "原件更优";
  if (task.status === "failed") return task.error || "处理失败";
  if (task.status === "cancelled") return "未生成";
  if (task.status === "running") return `${task.progress}%`;
  return "等待";
}

function fileMark(task) {
  const extension = task.file.name.split(".").pop()?.toUpperCase() || "FILE";
  return extension.slice(0, 5);
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function useTaskResult(task) {
  if (task.result?.blob) {
    downloadBlob(task.result.blob, task.result.name);
    return;
  }
  if (task.result?.path && desktopBridge?.showItem) {
    await desktopBridge.showItem(task.result.path);
  }
}

function createTaskNode(task) {
  const fragment = nodes.template.content.cloneNode(true);
  const item = fragment.querySelector(".queue-item");
  item.dataset.status = task.status;
  item.querySelector("[data-file-mark]").textContent = fileMark(task);
  item.querySelector("[data-file-name]").textContent = task.file.name;
  item.querySelector("[data-file-status]").textContent = STATUS_COPY[task.status] || task.status;
  const strategy = task.plan.recommendedDesktop
    ? `${task.plan.strategy} · 建议桌面版处理`
    : task.plan.strategy;
  item.querySelector("[data-file-strategy]").textContent = task.result?.verification
    ? `${strategy} · ${task.result.verification}`
    : strategy;
  item.querySelector("[data-file-progress]").style.width = `${task.progress}%`;
  item.querySelector("[data-file-size]").textContent = formatBytes(task.file.size);
  item.querySelector("[data-file-result]").textContent = resultCopy(task);

  const action = item.querySelector("[data-file-action]");
  if (task.status === "completed" && (task.result?.blob || task.result?.path)) {
    action.hidden = false;
    action.textContent = task.result.path ? "显示" : "下载";
    action.addEventListener("click", () => useTaskResult(task));
  }
  return fragment;
}

function render(tasks) {
  nodes.queue.replaceChildren();
  if (!tasks.length) {
    const empty = document.createElement("li");
    empty.className = "queue-empty";
    empty.innerHTML = "<span aria-hidden=\"true\">00</span><div><strong>队列还是空的</strong><p>从上方加入资源，策略会按格式自动匹配。</p></div>";
    nodes.queue.append(empty);
  } else {
    for (const task of tasks) nodes.queue.append(createTaskNode(task));
  }

  const summary = summarizeTasks(tasks);
  const terminal = summary.completed + summary.keptOriginal + summary.failed
    + tasks.filter((task) => task.status === "cancelled").length;
  nodes.count.textContent = `${summary.count} 个文件`;
  nodes.input.textContent = formatBytes(summary.inputBytes);
  nodes.output.textContent = formatBytes(summary.outputBytes);
  nodes.savings.textContent = `${Math.max(0, summary.savings)}%`;
  nodes.completed.textContent = `${terminal} / ${summary.count}`;

  const hasQueued = tasks.some((task) => task.status === "queued");
  const hasRunning = tasks.some((task) => task.status === "running");
  const hasTerminal = tasks.some((task) => ["completed", "kept-original", "failed", "cancelled"].includes(task.status));
  const downloadable = tasks.filter((task) => task.status === "completed" && task.result?.blob);

  nodes.start.disabled = !hasQueued || hasRunning;
  nodes.cancel.disabled = !hasRunning;
  nodes.clear.disabled = !hasTerminal || hasRunning;
  nodes.downloadAll.disabled = !downloadable.length || hasRunning;
  nodes.status.textContent = hasRunning
    ? "正在本设备处理当前文件"
    : hasQueued
      ? `${tasks.filter((task) => task.status === "queued").length} 个文件等待压缩`
      : summary.count
        ? "本轮处理已结束"
        : "等待加入文件";
}

nodes.dropzone.addEventListener("click", pickFiles);
nodes.picker.addEventListener("change", async () => {
  const files = desktopBridge?.describeDroppedFiles
    ? await desktopBridge.describeDroppedFiles(nodes.picker.files)
    : nodes.picker.files;
  addFiles(files);
  nodes.picker.value = "";
});

for (const eventName of ["dragenter", "dragover"]) {
  nodes.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    nodes.dropzone.classList.add("is-dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  nodes.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    nodes.dropzone.classList.remove("is-dragging");
  });
}

nodes.dropzone.addEventListener("drop", async (event) => {
  const files = event.dataTransfer?.files;
  if (desktopBridge?.describeDroppedFiles) {
    addFiles(await desktopBridge.describeDroppedFiles(files));
    return;
  }
  addFiles(files);
});
document.querySelectorAll('input[name="mode"]').forEach((input) => {
  input.addEventListener("change", () => {
    mode = modeForNewFiles();
    nodes.status.textContent = mode === "lossless"
      ? "新任务将使用严格无损"
      : "新任务将使用高保真（非无损）";
  });
});

nodes.start.addEventListener("click", () => queue.start());
nodes.cancel.addEventListener("click", () => queue.cancelCurrent());
nodes.clear.addEventListener("click", () => queue.clearCompleted());
nodes.downloadAll.addEventListener("click", async () => {
  const results = queue.tasks
    .filter((task) => task.status === "completed" && task.result?.blob)
    .map((task) => task.result);
  if (!results.length) return;
  nodes.status.textContent = "正在整理批量下载包";
  const blob = await browserEngine.bundle(results);
  downloadBlob(blob, "PureShrink-results.zip");
  nodes.status.textContent = "批量下载包已生成";
});

window.addEventListener("beforeunload", (event) => {
  const hasMemoryResults = queue.tasks.some((task) => task.status === "completed" && task.result?.blob);
  if (!hasMemoryResults) return;
  event.preventDefault();
});

queue.subscribe(render);
nodes.engine.textContent = desktopBridge ? "桌面原生 FFmpeg 引擎" : "浏览器本地 WebAssembly 引擎";
initializeDesktop().catch(() => {
  nodes.status.textContent = "无法读取桌面环境信息，请重新启动应用";
});
