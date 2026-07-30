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
            task.result = {
              ...result,
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
        } finally {
          currentController = null;
          notify();
        }
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
