export function formatBytes(value) {
  const bytes = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const precision = index === 0 ? 0 : 1;
  return `${Number((bytes / (1024 ** index)).toFixed(precision))} ${units[index]}`;
}

export function savingRatio(inputBytes, outputBytes) {
  const input = Number(inputBytes);
  const output = Number(outputBytes);
  if (!Number.isFinite(input) || input <= 0 || !Number.isFinite(output)) return 0;
  return Number((((input - output) / input) * 100).toFixed(1));
}

export function summarizeTasks(tasks = []) {
  const summary = tasks.reduce((result, task) => {
    const inputBytes = Math.max(0, Number(task.file?.size || 0));
    const outputBytes = task.status === "completed"
      ? Math.max(0, Number(task.result?.outputBytes || 0))
      : inputBytes;

    result.count += 1;
    result.inputBytes += inputBytes;
    result.outputBytes += outputBytes;
    if (task.status === "completed") result.completed += 1;
    if (task.status === "kept-original") result.keptOriginal += 1;
    if (task.status === "failed") result.failed += 1;
    return result;
  }, {
    count: 0,
    inputBytes: 0,
    outputBytes: 0,
    completed: 0,
    keptOriginal: 0,
    failed: 0,
  });

  return {
    ...summary,
    savings: savingRatio(summary.inputBytes, summary.outputBytes),
  };
}
