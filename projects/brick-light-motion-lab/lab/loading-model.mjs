const STAGE_WEIGHTS = Object.freeze({ module: 22, cards: 25 });
const BASE_PROGRESS = 8;
const RESOURCE_WEIGHT = 45;

export function createLoadingState(resources = []) {
  return calculate({
    resources: new Set(resources.filter(Boolean)),
    settledResources: new Set(),
    failedResources: new Set(),
    completedStages: new Set(),
    progress: BASE_PROGRESS,
    complete: false,
  });
}

export function markLoadingStage(state, stage) {
  const completedStages = new Set(state.completedStages);
  if (Object.hasOwn(STAGE_WEIGHTS, stage)) completedStages.add(stage);
  return calculate({ ...state, completedStages });
}

export function settleLoadingResource(state, url, ok) {
  if (!state.resources.has(url)) return state;
  const settledResources = new Set(state.settledResources).add(url);
  const failedResources = new Set(state.failedResources);
  if (!ok) failedResources.add(url);
  return calculate({ ...state, settledResources, failedResources });
}

export function completeLoading(state) {
  const stagesReady = Object.keys(STAGE_WEIGHTS).every((stage) => state.completedStages.has(stage));
  const resourcesReady = state.settledResources.size === state.resources.size;
  return calculate({ ...state, complete: stagesReady && resourcesReady });
}

function calculate(state) {
  const stageProgress = Object.entries(STAGE_WEIGHTS).reduce(
    (sum, [stage, weight]) => sum + (state.completedStages.has(stage) ? weight : 0),
    0,
  );
  const resourceProgress = state.resources.size === 0
    ? 0
    : RESOURCE_WEIGHT * state.settledResources.size / state.resources.size;
  const measured = BASE_PROGRESS + stageProgress + resourceProgress;
  return {
    ...state,
    progress: state.complete ? 100 : Math.min(99, Math.max(state.progress ?? 0, Math.round(measured))),
  };
}
