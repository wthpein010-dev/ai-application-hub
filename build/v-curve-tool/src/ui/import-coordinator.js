export function createImportCoordinator(cancelActiveAnalysis) {
  let requestId = 0;
  return {
    invalidate() { requestId += 1; },
    async start(load, commit) {
      const currentRequestId = ++requestId;
      cancelActiveAnalysis();
      const result = await load();
      if (currentRequestId !== requestId) return false;
      cancelActiveAnalysis();
      commit(result);
      return true;
    },
  };
}
