import { compareReports, analyzeLevel } from "../analysis/report.js";
import { normalizeSheepLevel } from "../model/normalize.js";

const cancelled = new Set();

function safePost(requestId, message) {
  if (!cancelled.has(requestId)) self.postMessage({ requestId, ...message });
}

self.addEventListener("message", (event) => {
  const message = event.data ?? {};
  if (message.type === "cancel") {
    cancelled.add(message.requestId);
    return;
  }
  if (message.type !== "analyze") return;

  const { requestId, level, baseline, options } = message;
  cancelled.delete(requestId);
  try {
    const sheepLevel = Array.isArray(baseline?.tiles)
      ? baseline
      : normalizeSheepLevel(baseline);
    const sheep = analyzeLevel(sheepLevel, options, (payload) => {
      safePost(requestId, { type: "progress", side: "sheep", payload });
    });
    const paws = analyzeLevel(level, options, (payload) => {
      safePost(requestId, { type: "progress", side: "paws", payload });
    });
    safePost(requestId, { type: "result", payload: compareReports(sheep, paws) });
  } catch (error) {
    safePost(requestId, {
      type: "error",
      payload: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    cancelled.delete(requestId);
  }
});
