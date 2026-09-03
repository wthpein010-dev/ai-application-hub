export function completionStatus(comparison, levelId) {
  const simulation = comparison?.paws?.simulation;
  if (!simulation?.valid) {
    return { message: "结构分析完成，但 MC 无效", tone: "warning" };
  }
  if (simulation.incomplete) {
    return { message: "分析完成，玩法仿真不完整", tone: "warning" };
  }
  return {
    message: `${levelId} 分析完成 · ${comparison.options.seeds} seeds`,
    tone: "success",
  };
}
