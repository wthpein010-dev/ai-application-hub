import { createPlan } from "./policy.mjs";

const TERMINAL_STATES = new Set([
  "completed",
  "kept-original",
  "failed",
  "cancelled",
]);

function clampProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function safeErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "处理失败");
}

function abortError() {
  return new DOMException("任务已取消", "AbortError");
}

export function createBatchDownload(options = {}) {
  const {
    bundle,
    download,
    onRunningChange = () => {},
    onStatus = () => {},
  } = options;
  if (typeof bundle !== "function" || typeof download !== "function") {
    throw new TypeError("PureShrink batch download requires bundle and download functions");
  }

  let currentController = null;

  async function start(results) {
    const downloadable = Array.from(results || []);
    if (!downloadable.length || currentController) return false;

    const controller = new AbortController();
    currentController = controller;
    onRunningChange(true);
    onStatus("正在整理批量下载包");
    let finalStatus = "";

    try {
      const blob = await bundle(downloadable, controller.signal);
      if (controller.signal.aborted) throw abortError();
      await download(blob);
      finalStatus = "批量下载包已生成";
      return true;
    } catch (error) {
      const wasCancelled = controller.signal.aborted || error?.name === "AbortError";
      finalStatus = wasCancelled
        ? "批量下载已取消"
        : `批量下载失败：${safeErrorMessage(error)}`;
      return false;
    } finally {
      currentController = null;
      onRunningChange(false);
      onStatus(finalStatus);
    }
  }

  function cancel() {
    if (!currentController) return false;
    currentController.abort();
    return true;
  }

  return {
    start,
    cancel,
    get running() {
      return currentController !== null;
    },
  };
}

export function createQueue(executor) {
  if (typeof executor !== "function") {
    throw new TypeError("PureShrink queue requires an executor");
  }

  const tasks = [];
  const listeners = new Set();
  let nextId = 1;
  let running = false;
  let currentController = null;

  function notify() {
    for (const listener of listeners) listener(tasks);
  }

  function add(files, mode = "lossless") {
    const additions = Array.from(files || [], (file) => ({
      id: nextId++,
      file,
      plan: createPlan(file, mode),
      status: "queued",
      progress: 0,
      result: null,
      error: "",
    }));
    tasks.push(...additions);
    notify();
    return additions;
  }

  async function start() {
    if (running) return;
    running = true;
    notify();

    try {
      let pauseAfterCancellation = false;
      for (const task of tasks) {
        if (task.status !== "queued") continue;

        currentController = new AbortController();
        task.status = "running";
        task.progress = 0;
        task.error = "";
        notify();

        try {
          const result = await executor(
            task,
            (progress) => {
              task.progress = clampProgress(progress);
              notify();
            },
            currentController.signal,
          );

          task.result = result || null;
          task.progress = 100;
          const candidateBytes = Number(result?.outputBytes);
          if (
            task.plan.isLossless
            && Number.isFinite(candidateBytes)
            && candidateBytes >= Number(task.file.size || 0)
          ) {
            if (typeof result?.discard === "function") result.discard();
            const {
              blob: _blob,
              path: _path,
              discard: _discard,
              ...safeResult
            } = result || {};
            task.result = {
              ...safeResult,
              outputBytes: Number(task.file.size || 0),
              keptOriginal: true,
            };
            task.status = "kept-original";
          } else {
            task.status = "completed";
          }
        } catch (error) {
          const wasCancelled = currentController.signal.aborted
            || error?.name === "AbortError";
          task.status = wasCancelled ? "cancelled" : "failed";
          task.error = wasCancelled ? "已取消当前任务" : safeErrorMessage(error);
          pauseAfterCancellation = wasCancelled;
        } finally {
          currentController = null;
          notify();
        }
        if (pauseAfterCancellation) break;
      }
    } finally {
      running = false;
      notify();
    }
  }

  function cancelCurrent() {
    currentController?.abort();
  }

  function clearCompleted() {
    for (let index = tasks.length - 1; index >= 0; index -= 1) {
      if (!TERMINAL_STATES.has(tasks[index].status)) continue;
      tasks[index].result?.discard?.();
      tasks.splice(index, 1);
    }
    notify();
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("PureShrink queue listener must be a function");
    }
    listeners.add(listener);
    listener(tasks);
    return () => listeners.delete(listener);
  }

  return {
    tasks,
    add,
    start,
    cancelCurrent,
    clearCompleted,
    subscribe,
    get running() {
      return running;
    },
  };
}
