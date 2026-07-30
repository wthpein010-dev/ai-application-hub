/* global fflate, importScripts */

importScripts("../vendor/fflate.min.js");

function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function transferableBytes(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.byteOffset === 0 && view.byteLength === view.buffer.byteLength) {
    return view;
  }
  return view.slice();
}

self.addEventListener("message", (event) => {
  try {
    const message = event.data || {};
    if (message.operation === "zip") {
      const source = new Uint8Array(message.bytes);
      const zipped = fflate.zipSync(
        { [message.name]: source },
        { level: 9 },
      );
      const restored = fflate.unzipSync(zipped)[message.name];
      if (!restored || !bytesEqual(source, restored)) {
        throw new Error("PureShrink ZIP byte verification failed");
      }
      const result = transferableBytes(zipped);
      self.postMessage(
        {
          ok: true,
          bytes: result.buffer,
          verified: true,
        },
        [result.buffer],
      );
      return;
    }

    if (message.operation === "bundle") {
      const entries = message.entries.map((entry) => ({
        name: entry.name,
        bytes: new Uint8Array(entry.bytes),
      }));
      const files = Object.fromEntries(
        entries.map((entry) => [entry.name, entry.bytes]),
      );
      const zipped = fflate.zipSync(files, { level: 6 });
      const restored = fflate.unzipSync(zipped);
      const restoredNames = Object.keys(restored);
      const verified = restoredNames.length === entries.length
        && entries.every((entry) => (
          Object.prototype.hasOwnProperty.call(restored, entry.name)
          && bytesEqual(entry.bytes, restored[entry.name])
        ));
      if (!verified) {
        throw new Error("PureShrink ZIP bundle verification failed");
      }
      const result = transferableBytes(zipped);
      self.postMessage(
        {
          ok: true,
          bytes: result.buffer,
          verified: true,
        },
        [result.buffer],
      );
      return;
    }

    throw new Error("Unsupported PureShrink archive operation");
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
