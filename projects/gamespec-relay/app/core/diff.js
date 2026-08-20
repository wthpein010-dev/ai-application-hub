function comparable(value) {
  return JSON.stringify(value);
}

function diffById(beforeItems = [], afterItems = []) {
  const beforeById = new Map(beforeItems.map((item) => [item.id, item]));
  const afterById = new Map(afterItems.map((item) => [item.id, item]));
  const added = [];
  const removed = [];
  const modified = [];
  const unchanged = [];

  for (const item of afterItems) {
    const previous = beforeById.get(item.id);
    if (!previous) added.push(item);
    else if (comparable(previous) === comparable(item)) unchanged.push(item);
    else modified.push({ before: previous, after: item });
  }
  for (const item of beforeItems) {
    if (!afterById.has(item.id)) removed.push(item);
  }
  return { added, removed, modified, unchanged };
}

export function diffDeliveryPacks(before, after) {
  const decisions = diffById(before.decisions, after.decisions);
  const questions = diffById(before.questions, after.questions);
  const tasks = diffById(before.tasks, after.tasks);
  const tests = diffById(before.tests, after.tests);
  const changedTaskIds = new Set([
    ...tasks.added.map((item) => item.id),
    ...tasks.removed.map((item) => item.id),
    ...tasks.modified.flatMap((item) => [item.before.id, item.after.id]),
  ]);
  const affectedTests = after.tests.filter((testCase) =>
    testCase.taskIds.some((taskId) => changedTaskIds.has(taskId)),
  );
  const groups = [decisions, questions, tasks, tests];
  const summary = {
    added: groups.reduce((total, group) => total + group.added.length, 0),
    removed: groups.reduce((total, group) => total + group.removed.length, 0),
    modified: groups.reduce((total, group) => total + group.modified.length, 0),
  };
  summary.changed = summary.added + summary.removed + summary.modified;

  return { decisions, questions, tasks, tests, affectedTests, summary };
}
