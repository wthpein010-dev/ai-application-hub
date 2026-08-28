export function createImportCoordinator(cancelActiveAnalysis) {
  let requestId = 0;
  return {
    async start(load, commit) {
      const currentRequestId = ++requestId;
      cancelActiveAnalysis();
      const result = await load();
      if (currentRequestId !== requestId) return false;
      commit(result);
      return true;
    },
  };
}
