export function completionStatus(comparison, leftId, rightId) {
  const simulations = [comparison?.left?.simulation, comparison?.right?.simulation];
  if (simulations.some((simulation) => !simulation?.valid)) {
    return { message: "结构分析完成，但 MC 无效", tone: "warning" };
  }
  if (simulations.some((simulation) => simulation.incomplete)) {
    return { message: "分析完成，玩法仿真不完整", tone: "warning" };
  }
  return {
    message: `${leftId} vs ${rightId} 分析完成 · ${comparison.options.seeds} seeds`,
    tone: "success",
  };
}
