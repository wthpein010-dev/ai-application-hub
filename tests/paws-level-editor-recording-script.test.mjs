import test from "node:test";
import assert from "node:assert/strict";

test("recording resource cleanup attempts every close even when one rejects", async () => {
  const { closeRecordingResources } = await import(
    "../scripts/paws-recording-support.mjs"
  );
  const calls = [];
  const resources = {
    context: {
      async close() {
        calls.push("context");
        throw new Error("context close failed");
      },
    },
    browser: {
      async close() {
        calls.push("browser");
      },
    },
    server: {
      async close() {
        calls.push("server");
      },
    },
  };

  await assert.rejects(() => closeRecordingResources(resources), AggregateError);
  assert.deepEqual(calls.sort(), ["browser", "context", "server"]);
});

test("recording lifecycle closes the server when browser launch fails", async () => {
  const { withRecordingResources } = await import(
    "../scripts/paws-recording-support.mjs"
  );
  let serverClosed = false;
  let contextCreated = false;

  await assert.rejects(
    () =>
      withRecordingResources({
        startServer: async () => ({
          async close() {
            serverClosed = true;
          },
        }),
        launchBrowser: async () => {
          throw new Error("all browser fallbacks failed");
        },
        createContext: async () => {
          contextCreated = true;
        },
        run: async () => {},
      }),
    /all browser fallbacks failed/,
  );

  assert.equal(serverClosed, true);
  assert.equal(contextCreated, false);
});

test("recording lifecycle closes browser and server when context creation fails", async () => {
  const { withRecordingResources } = await import(
    "../scripts/paws-recording-support.mjs"
  );
  const calls = [];

  await assert.rejects(
    () =>
      withRecordingResources({
        startServer: async () => ({
          async close() {
            calls.push("server");
          },
        }),
        launchBrowser: async () => ({
          browser: {
            async close() {
              calls.push("browser");
            },
          },
        }),
        createContext: async () => {
          throw new Error("context creation failed");
        },
        run: async () => {},
      }),
    /context creation failed/,
  );

  assert.deepEqual(calls.sort(), ["browser", "server"]);
});
