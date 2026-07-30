import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workerSource = readFileSync(
  join(root, "projects", "pureshrink", "workers", "archive-worker.js"),
  "utf8",
);

function runWorkerMessage(fflate, data) {
  let messageHandler;
  const posted = [];
  const self = {
    addEventListener(type, handler) {
      if (type === "message") messageHandler = handler;
    },
    postMessage(message) {
      posted.push(message);
    },
  };

  runInNewContext(workerSource, {
    ArrayBuffer,
    Error,
    Object,
    String,
    Uint8Array,
    fflate,
    importScripts() {},
    self,
  });
  assert.equal(typeof messageHandler, "function");
  messageHandler({ data });
  return posted;
}

test("archive worker rejects a batch ZIP whose extracted bytes do not match", () => {
  const posted = runWorkerMessage(
    {
      zipSync: () => Uint8Array.from([80, 75, 1]),
      unzipSync: () => ({
        "alpha.txt": Uint8Array.from([1, 9]),
        "beta.txt": Uint8Array.from([3, 4]),
      }),
    },
    {
      operation: "bundle",
      entries: [
        { name: "alpha.txt", bytes: Uint8Array.from([1, 2]).buffer },
        { name: "beta.txt", bytes: Uint8Array.from([3, 4]).buffer },
      ],
    },
  );

  assert.equal(posted.length, 1);
  assert.equal(posted[0].ok, false);
  assert.match(posted[0].error, /verification/i);
});
