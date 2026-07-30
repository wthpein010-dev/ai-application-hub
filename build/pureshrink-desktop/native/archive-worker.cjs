"use strict";

const {
  readFileSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs");
const path = require("node:path");
const { parentPort, workerData } = require("node:worker_threads");
const { unzipSync, zipSync } = require("fflate");

try {
  const source = readFileSync(workerData.sourcePath);
  const sourceName = path.basename(workerData.sourcePath);
  const zipped = zipSync({ [sourceName]: new Uint8Array(source) }, { level: 9 });
  writeFileSync(workerData.outputPath, zipped);
  const restored = unzipSync(zipped)[sourceName];
  if (!restored || !Buffer.from(restored).equals(source)) {
    unlinkSync(workerData.outputPath);
    throw new Error("PureShrink ZIP byte verification failed");
  }
  parentPort.postMessage({ ok: true });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
}
