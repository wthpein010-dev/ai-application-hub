import test from "node:test";
import assert from "node:assert/strict";

import { createPlan } from "../projects/pureshrink/core/policy.mjs";
import { createBrowserEngine } from "../projects/pureshrink/engines/browser-engine.mjs";
import { createDesktopEngine } from "../projects/pureshrink/engines/desktop-engine.mjs";

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
