import { analyzeComparisonLevels } from "../analysis/report.js";

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

  const { requestId, leftLevel, rightLevel, options } = message;
  cancelled.delete(requestId);
  try {
    if (!leftLevel?.tiles?.length || !rightLevel?.tiles?.length) {
      throw new Error("左右两侧都必须选择有效关卡。");
    }
    const comparison = analyzeComparisonLevels(leftLevel, rightLevel, options, ({ side, payload }) => {
      safePost(requestId, { type: "progress", side, payload });
    });
    safePost(requestId, { type: "result", payload: comparison });
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
