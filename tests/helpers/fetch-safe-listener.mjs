const FETCH_BLOCKED_DYNAMIC_PORTS = new Set([
  1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000,
  6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

export async function listenForFetch(server, { maxAttempts = 64 } = {}) {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError("maxAttempts must be a positive integer");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, "127.0.0.1");
    });

    const { port } = server.address();
    if (!FETCH_BLOCKED_DYNAMIC_PORTS.has(port)) return `http://127.0.0.1:${port}`;
    await closeServer(server);
  }

  throw new Error(`could not acquire a fetch-safe port after ${maxAttempts} attempts`);
}
