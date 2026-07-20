export async function closeRecordingResources({ context, browser, server } = {}) {
  const resources = [
    ["context", context],
    ["browser", browser],
    ["server", server],
  ].filter(([, resource]) => typeof resource?.close === "function");
  const errors = [];
  for (const [label, resource] of resources) {
    try {
      await resource.close();
    } catch (error) {
      errors.push(new Error(`${label} cleanup failed`, { cause: error }));
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, "Recording resource cleanup failed");
  }
}

export async function withRecordingResources({
  startServer,
  launchBrowser,
  createContext,
  run,
}) {
  let server;
  let browser;
  let context;
  let launch;
  let result;
  let operationError;
  let cleanupError;
  try {
    try {
      server = await startServer();
      launch = await launchBrowser();
      browser = launch?.browser ?? launch;
      context = await createContext(browser, server, launch);
      result = await run({ server, browser, context, launch });
    } catch (error) {
      operationError = error;
    }
  } finally {
    try {
      await closeRecordingResources({ context, browser, server });
    } catch (error) {
      cleanupError = error;
    }
  }

  if (operationError && cleanupError) {
    throw new AggregateError(
      [operationError, cleanupError],
      `${operationError.message}; recording cleanup also failed`,
      { cause: operationError },
    );
  }
  if (operationError) {
    throw operationError;
  }
  if (cleanupError) {
    throw cleanupError;
  }
  return result;
}
