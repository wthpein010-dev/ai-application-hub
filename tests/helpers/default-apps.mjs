import vm from "node:vm";

export function loadDefaultAppsFromRuntime(runtime) {
  const match =
    /const defaultApps = (\[[\s\S]*?\r?\n\]);(?=\r?\n\r?\nlet apps)/.exec(
      runtime,
    );
  if (!match) {
    throw new Error("defaultApps declaration should end before runtime state");
  }

  const source = `globalThis.defaultApps = ${match[1]};`.replace(
    /\bHUB_BRIEF\b/g,
    '""',
  );
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  return context.globalThis.defaultApps;
}
