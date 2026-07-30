export function createDesktopEngine(bridge) {
  if (!bridge || typeof bridge.compress !== "function") {
    throw new TypeError("PureShrink desktop bridge is unavailable");
  }

  return {
    async compress(task, onProgress = () => {}, signal) {
      if (!task.file?.nativePath) {
        throw new Error("桌面文件缺少本地路径，请重新选择");
      }
      if (signal?.aborted) throw new DOMException("任务已取消", "AbortError");
      let cancellation;
      const cancelNative = () => {
        cancellation = Promise.resolve(bridge.cancel?.(task.id)).catch(() => false);
      };
      signal?.addEventListener("abort", cancelNative, { once: true });
      try {
        const result = await bridge.compress({
          id: task.id,
          sourcePath: task.file.nativePath,
          name: task.file.name,
          size: task.file.size,
          type: task.file.type || "",
          plan: task.plan,
        }, onProgress);
        if (signal?.aborted) {
          await cancellation;
          throw new DOMException("任务已取消", "AbortError");
        }
        onProgress(100);
        return result;
      } catch (error) {
        if (signal?.aborted || error?.name === "AbortError") {
          await cancellation;
          throw new DOMException("任务已取消", "AbortError");
        }
        throw error;
      } finally {
        signal?.removeEventListener("abort", cancelNative);
      }
    },
  };
}
