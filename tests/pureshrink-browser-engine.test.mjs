import test from "node:test";
import assert from "node:assert/strict";

import { createPlan } from "../projects/pureshrink/core/policy.mjs";
import * as browserEngineModule from "../projects/pureshrink/engines/browser-engine.mjs";
import { createDesktopEngine } from "../projects/pureshrink/engines/desktop-engine.mjs";

const {
  createArchiveWorkerAdapter,
  createBrowserEngine,
  MAX_BROWSER_ARCHIVE_BYTES,
} = browserEngineModule;

function makeFile(name, type, bytes) {
  const data = Uint8Array.from(bytes);
  return {
    name,
    type,
    size: data.byteLength,
    arrayBuffer: async () => data.buffer.slice(0),
  };
}

function makeTask(file, mode = "lossless") {
  return {
    id: 1,
    file,
    plan: createPlan(file, mode),
  };
}

test("browser FFmpeg adapter releases transform and verification cores", async () => {
  assert.equal(typeof browserEngineModule.createLegacyFfmpegAdapter, "function");
  const instances = [];
  const encoder = new TextEncoder();
  const legacy = {
    createFFmpeg() {
      const files = new Map();
      const instance = {
        exits: 0,
        setLogger() {},
        setProgress() {},
        async load() {},
        async run(...args) {
          const hashIndexes = args.flatMap((value, index) => (
            value === "sha256" ? [index] : []
          ));
          if (hashIndexes.length) {
            for (const index of hashIndexes) {
              files.set(args[index + 1], encoder.encode("0,video,sha256=verified\n"));
            }
            return;
          }
          files.set(args.at(-1), Uint8Array.from([9, 8, 7]));
        },
        FS(operation, name, value) {
          if (operation === "writeFile") files.set(name, new Uint8Array(value));
          if (operation === "readFile") return files.get(name);
          if (operation === "unlink") files.delete(name);
          return undefined;
        },
        exit() {
          this.exits += 1;
        },
      };
      instances.push(instance);
      return instance;
    },
  };
  const adapter = browserEngineModule.createLegacyFfmpegAdapter(legacy, {
    corePath: "https://example.test/ffmpeg-core.js",
  });

  const result = await adapter.transform({
    inputName: "input.mp4",
    outputName: "output.mp4",
    inputBytes: Uint8Array.from([1, 2, 3]),
    args: ["-i", "input.mp4", "output.mp4"],
    onProgress() {},
    verifyLossless: true,
  });

  assert.deepEqual(Array.from(result.bytes), [9, 8, 7]);
  assert.equal(result.losslessMatch, true);
  assert.equal(instances.length, 2);
  assert.deepEqual(instances.map((instance) => instance.exits), [1, 1]);
});

test("browser FFmpeg adapter releases the transform core before creating verification", async () => {
  const events = [];
  const encoder = new TextEncoder();
  let nextId = 0;
  const adapter = browserEngineModule.createLegacyFfmpegAdapter({
    createFFmpeg() {
      const id = ++nextId;
      const files = new Map();
      events.push(`create:${id}`);
      return {
        setLogger() {},
        setProgress() {},
        async load() {},
        async run(...args) {
          const hashIndexes = args.flatMap((value, index) => (
            value === "sha256" ? [index] : []
          ));
          if (hashIndexes.length) {
            for (const index of hashIndexes) {
              files.set(args[index + 1], encoder.encode("0,video,sha256=verified\n"));
            }
          } else {
            files.set(args.at(-1), Uint8Array.from([9, 8, 7]));
          }
        },
        FS(operation, name, value) {
          if (operation === "writeFile") files.set(name, new Uint8Array(value));
          if (operation === "readFile") return files.get(name);
          if (operation === "unlink") {
            events.push(`unlink:${id}:${name}`);
            files.delete(name);
          }
          return undefined;
        },
        exit() {
          events.push(`exit:${id}`);
        },
      };
    },
  }, { corePath: "https://example.test/ffmpeg-core.js" });

  await adapter.transform({
    inputName: "input.mp4",
    outputName: "output.mp4",
    inputBytes: Uint8Array.from([1, 2, 3]),
    args: ["-i", "input.mp4", "output.mp4"],
    verifyLossless: true,
  });

  const transformExit = events.indexOf("exit:1");
  const verificationCreate = events.indexOf("create:2");
  assert.notEqual(transformExit, -1);
  assert.notEqual(verificationCreate, -1);
  assert.ok(
    events.indexOf("unlink:1:input.mp4") < transformExit
      && events.indexOf("unlink:1:output.mp4") < transformExit,
    `transform VFS should be empty before exit: ${events.join(", ")}`,
  );
  assert.ok(
    transformExit < verificationCreate,
    `transform exit should precede verification creation: ${events.join(", ")}`,
  );
});

test("browser FFmpeg adapter releases a core whose load fails", async () => {
  assert.equal(typeof browserEngineModule.createLegacyFfmpegAdapter, "function");
  let exits = 0;
  const adapter = browserEngineModule.createLegacyFfmpegAdapter({
    createFFmpeg() {
      return {
        setLogger() {},
        async load() {
          throw new Error("core load failed");
        },
        exit() {
          exits += 1;
        },
      };
    },
  }, { corePath: "https://example.test/ffmpeg-core.js" });

  await assert.rejects(
    adapter.transform({
      inputName: "input.mp4",
      outputName: "output.mp4",
      inputBytes: Uint8Array.from([1]),
      args: ["-i", "input.mp4", "output.mp4"],
      onProgress() {},
      verifyLossless: false,
    }),
    /core load failed/,
  );
  assert.equal(exits, 1);
});

test("browser FFmpeg adapter retries loading-time cancellation cleanup after load settles", async () => {
  const events = [];
  let releaseFirstLoad;
  let nextId = 0;
  const legacy = {
    createFFmpeg() {
      const id = ++nextId;
      const files = new Map();
      let loaded = id > 1;
      return {
        setLogger() {},
        setProgress() {},
        async load() {
          if (id === 1) {
            await new Promise((resolve) => { releaseFirstLoad = resolve; });
            loaded = true;
          }
        },
        async run(...args) {
          files.set(args.at(-1), Uint8Array.from([9, 8, 7]));
        },
        FS(operation, name, value) {
          if (operation === "writeFile") files.set(name, new Uint8Array(value));
          if (operation === "readFile") return files.get(name);
          if (operation === "unlink") files.delete(name);
          return undefined;
        },
        exit() {
          events.push(`exit:${id}:${loaded ? "loaded" : "loading"}`);
          if (!loaded) throw new Error("core is still loading");
        },
      };
    },
  };
  const adapter = browserEngineModule.createLegacyFfmpegAdapter(legacy, {
    corePath: "https://example.test/ffmpeg-core.js",
  });
  const controller = new AbortController();
  const cancelled = adapter.transform({
    inputName: "cancelled.mp4",
    outputName: "cancelled-output.mp4",
    inputBytes: Uint8Array.from([1, 2, 3]),
    args: ["-i", "cancelled.mp4", "cancelled-output.mp4"],
    signal: controller.signal,
    verifyLossless: false,
  });

  controller.abort();
  releaseFirstLoad();
  await assert.rejects(cancelled, { name: "AbortError" });

  const retried = await adapter.transform({
    inputName: "retry.mp4",
    outputName: "retry-output.mp4",
    inputBytes: Uint8Array.from([4, 5, 6]),
    args: ["-i", "retry.mp4", "retry-output.mp4"],
    verifyLossless: false,
  });

  assert.deepEqual(Array.from(retried.bytes), [9, 8, 7]);
  assert.deepEqual(events, [
    "exit:1:loading",
    "exit:1:loaded",
    "exit:2:loaded",
  ]);
});

test("browser engine returns a downloadable pixel-lossless PNG candidate", async () => {
  const engine = createBrowserEngine({
    loadFFmpeg: async () => ({
      transform: async ({ outputName, onProgress, args }) => {
        assert.deepEqual(args, [
          "-i", "input-1.png",
          "-map_metadata", "-1",
          "-compression_level", "9",
          "hero-pureshrink.png",
        ]);
        onProgress(61);
        return {
          name: outputName,
          bytes: Uint8Array.from([9, 8, 7]),
        };
      },
    }),
    verifyPng: async () => true,
  });
  const progress = [];
  const file = makeFile("hero.png", "image/png", [1, 2, 3, 4, 5]);

  const result = await engine.compress(makeTask(file), (value) => progress.push(value));

  assert.equal(result.name, "hero-pureshrink.png");
  assert.equal(result.outputBytes, 3);
  assert.equal(result.blob.size, 3);
  assert.equal(result.verification, "逐像素 RGBA 一致");
  assert.deepEqual(progress, [61, 100]);
});

test("browser engine rejects a PNG candidate that changes decoded pixels", async () => {
  const engine = createBrowserEngine({
    loadFFmpeg: async () => ({
      transform: async ({ outputName }) => ({
        name: outputName,
        bytes: Uint8Array.from([9]),
      }),
    }),
    verifyPng: async () => false,
  });
  const file = makeFile("hero.png", "image/png", [1, 2]);

  await assert.rejects(
    engine.compress(makeTask(file), () => {}),
    /像素验证未通过/,
  );
});

test("browser engine uses a byte-lossless ZIP fallback for generic files", async () => {
  const engine = createBrowserEngine({
    loadArchive: async () => ({
      zip: async (name, bytes) => ({
        name: `${name}.zip`,
        bytes: Uint8Array.from([80, 75, bytes[0]]),
      }),
      unzip: async () => Uint8Array.from([42, 42, 42, 42, 42]),
    }),
  });
  const file = makeFile("brief.txt", "text/plain", [42, 42, 42, 42, 42]);

  const result = await engine.compress(makeTask(file), () => {});

  assert.equal(result.name, "brief-pureshrink.zip");
  assert.equal(result.outputBytes, 3);
  assert.equal(result.verification, "ZIP 解压后字节与原件一致");
});

test("browser engine rejects a ZIP candidate that cannot restore the source bytes", async () => {
  const engine = createBrowserEngine({
    loadArchive: async () => ({
      zip: async (name) => ({
        name: `${name}.zip`,
        bytes: Uint8Array.from([80, 75, 3]),
      }),
      unzip: async () => Uint8Array.from([7, 8, 9]),
    }),
  });
  const file = makeFile("brief.txt", "text/plain", [42, 42, 42]);

  await assert.rejects(
    engine.compress(makeTask(file), () => {}),
    /ZIP/,
  );
});

test("browser archive work is cancellable while the worker is active", async () => {
  let worker;
  class FakeWorker {
    constructor() {
      this.listeners = new Map();
      this.terminated = false;
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    removeEventListener(type) {
      this.listeners.delete(type);
    }

    postMessage() {}

    terminate() {
      this.terminated = true;
    }
  }

  const adapter = createArchiveWorkerAdapter({
    workerFactory: () => {
      worker = new FakeWorker();
      return worker;
    },
  });
  const controller = new AbortController();
  const pending = adapter.zip(
    "brief.txt",
    Uint8Array.from([1, 2, 3]),
    { signal: controller.signal },
  );

  controller.abort();

  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(worker.terminated, true);
});

test("browser engine rejects oversized generic files before reading them", async () => {
  let wasRead = false;
  const file = {
    name: "archive.tar",
    type: "application/x-tar",
    size: MAX_BROWSER_ARCHIVE_BYTES,
    arrayBuffer: async () => {
      wasRead = true;
      return new ArrayBuffer(0);
    },
  };
  const engine = createBrowserEngine();

  await assert.rejects(
    engine.compress(makeTask(file), () => {}),
    /64 MB/,
  );
  assert.equal(wasRead, false);
});

test("browser engine keeps duplicate batch names collision-safe", async () => {
  let bundledEntries;
  const engine = createBrowserEngine({
    loadArchive: async () => ({
      bundle: async (entries) => {
        bundledEntries = entries;
        return Uint8Array.from([80, 75]);
      },
    }),
  });

  const resultBlob = (name, value) => ({
    name,
    blob: new Blob([Uint8Array.from([value])]),
  });
  await engine.bundle([
    resultBlob("photo.png", 1),
    resultBlob("photo.png", 2),
    resultBlob("photo-2.png", 3),
    resultBlob("photo.png", 4),
  ]);

  assert.deepEqual(
    bundledEntries.map((entry) => entry.name),
    ["photo.png", "photo-2.png", "photo-2-2.png", "photo-3.png"],
  );
});

test("browser engine forwards cancellation to active batch archive work", async () => {
  let receivedSignal;
  let archiveStarted;
  const started = new Promise((resolve) => {
    archiveStarted = resolve;
  });
  const engine = createBrowserEngine({
    loadArchive: async () => ({
      bundle: async (_entries, { signal } = {}) => new Promise((_resolve, reject) => {
        receivedSignal = signal;
        archiveStarted();
        if (!signal) {
          reject(new Error("batch archive signal was not forwarded"));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(new DOMException("任务已取消", "AbortError"));
        }, { once: true });
      }),
    }),
  });
  const controller = new AbortController();
  const pending = engine.bundle([
    {
      name: "photo.png",
      blob: new Blob([Uint8Array.from([1])]),
    },
  ], controller.signal);

  await started;
  controller.abort();

  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(receivedSignal, controller.signal);
});

test("browser engine refuses files at or above its two-gigabyte safety boundary", async () => {
  const file = {
    name: "feature.mp4",
    type: "video/mp4",
    size: 2_000_000_000,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
  const engine = createBrowserEngine();

  await assert.rejects(
    engine.compress(makeTask(file), () => {}),
    /桌面版/,
  );
});

test("desktop engine validates its bridge and forwards result behavior", async () => {
  assert.throws(() => createDesktopEngine(null), /bridge is unavailable/);

  const engine = createDesktopEngine({
    compress: async (request) => ({
      name: request.name.replace(".mp4", "-pureshrink.mp4"),
      outputBytes: 8,
      path: "D:/PureShrink Output/clip-pureshrink.mp4",
      verification: "码流复制完成",
    }),
  });
  const file = {
    name: "clip.mp4",
    type: "video/mp4",
    size: 10,
    nativePath: "D:/Media/clip.mp4",
  };

  const result = await engine.compress(makeTask(file), () => {});

  assert.equal(result.outputBytes, 8);
  assert.match(result.path, /PureShrink Output/);
});

test("desktop engine forwards cancellation while native compression is still running", async () => {
  let finishCompression;
  const calls = [];
  const bridge = {
    compress: () => new Promise((resolve) => {
      finishCompression = resolve;
    }),
    cancel: async (taskId) => {
      calls.push(taskId);
      finishCompression?.({
        name: "ignored.mp4",
        outputBytes: 1,
      });
      return true;
    },
  };
  const engine = createDesktopEngine(bridge);
  const controller = new AbortController();
  const file = {
    name: "clip.mp4",
    type: "video/mp4",
    size: 10,
    nativePath: "D:/Media/clip.mp4",
  };

  const pending = engine.compress(makeTask(file), () => {}, controller.signal);
  controller.abort();

  await assert.rejects(pending, { name: "AbortError" });
  assert.deepEqual(calls, [1]);
});
