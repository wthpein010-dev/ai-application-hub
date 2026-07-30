import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyFile,
  createPlan,
} from "../projects/pureshrink/core/policy.mjs";
import {
  formatBytes,
  savingRatio,
  summarizeTasks,
} from "../projects/pureshrink/core/metrics.mjs";
import { createQueue } from "../projects/pureshrink/core/queue.mjs";

test("compression policy classifies supported media and generic files", () => {
  const cases = [
    [{ name: "cover.PNG", type: "", size: 1 }, "image"],
    [{ name: "loop.gif", type: "image/gif", size: 1 }, "gif"],
    [{ name: "clip.mov", type: "video/quicktime", size: 1 }, "video"],
    [{ name: "voice.flac", type: "audio/flac", size: 1 }, "audio"],
    [{ name: "brief.pdf", type: "application/pdf", size: 1 }, "archive"],
  ];

  for (const [file, expected] of cases) {
    assert.equal(classifyFile(file), expected);
  }
});

test("strict PNG policy promises pixel-lossless output", () => {
  assert.deepEqual(
    createPlan({ name: "hero.png", type: "image/png", size: 1024 }, "lossless"),
    {
      kind: "image",
      mode: "lossless",
      outputExtension: "png",
      strategy: "像素无损 PNG 重编码",
      isLossless: true,
      recommendedDesktop: false,
    },
  );
});

test("strict generic-file policy uses byte-lossless ZIP fallback", () => {
  assert.deepEqual(
    createPlan({ name: "brief.pdf", type: "application/pdf", size: 4096 }, "lossless"),
    {
      kind: "archive",
      mode: "lossless",
      outputExtension: "zip",
      strategy: "字节级无损 ZIP 归档",
      isLossless: true,
      recommendedDesktop: false,
    },
  );
});

test("high-fidelity video policy is visibly non-lossless and recommends desktop for large files", () => {
  assert.deepEqual(
    createPlan({ name: "clip.mov", type: "video/quicktime", size: 700_000_000 }, "fidelity"),
    {
      kind: "video",
      mode: "fidelity",
      outputExtension: "mp4",
      strategy: "高保真 H.264 / AAC 重编码",
      isLossless: false,
      recommendedDesktop: true,
    },
  );
});

test("metrics format sizes and report negative savings without hiding them", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5 MB");
  assert.equal(savingRatio(0, 0), 0);
  assert.equal(savingRatio(100, 25), 75);
  assert.equal(savingRatio(100, 120), -20);
});

test("task summaries count retained originals and only use completed output bytes", () => {
  assert.deepEqual(
    summarizeTasks([
      { file: { size: 100 }, status: "completed", result: { outputBytes: 40 } },
      { file: { size: 50 }, status: "kept-original", result: { outputBytes: 50 } },
      { file: { size: 25 }, status: "failed", result: null },
    ]),
    {
      count: 3,
      inputBytes: 175,
      outputBytes: 115,
      completed: 1,
      keptOriginal: 1,
      failed: 1,
      savings: 34.3,
    },
  );
});

test("queue executes tasks sequentially and reports progress", async () => {
  const order = [];
  const queue = createQueue(async (task, report) => {
    order.push(`start:${task.id}`);
    report(50);
    await Promise.resolve();
    order.push(`end:${task.id}`);
    return {
      name: `${task.file.name}.out`,
      outputBytes: task.file.size - 1,
      verification: "verified",
    };
  });

  queue.add([
    { name: "a.png", type: "image/png", size: 10 },
    { name: "b.png", type: "image/png", size: 20 },
  ], "lossless");
  await queue.start();

  assert.deepEqual(order, ["start:1", "end:1", "start:2", "end:2"]);
  assert.deepEqual(queue.tasks.map((task) => task.status), ["completed", "completed"]);
  assert.deepEqual(queue.tasks.map((task) => task.progress), [100, 100]);
});

test("strict queue retains the original when the candidate is not smaller", async () => {
  const queue = createQueue(async (task) => ({
    name: `${task.file.name}.out`,
    outputBytes: task.file.size,
    verification: "verified",
  }));

  queue.add([{ name: "tiny.png", type: "image/png", size: 10 }], "lossless");
  await queue.start();

  assert.equal(queue.tasks[0].status, "kept-original");
  assert.equal(queue.tasks[0].result.outputBytes, 10);
});

test("queue records a failure and continues with the next task", async () => {
  const queue = createQueue(async (task) => {
    if (task.id === 1) throw new Error("decoder unavailable");
    return { name: "ok.png", outputBytes: 5, verification: "verified" };
  });

  queue.add([
    { name: "bad.png", type: "image/png", size: 10 },
    { name: "ok.png", type: "image/png", size: 10 },
  ], "lossless");
  await queue.start();

  assert.deepEqual(queue.tasks.map((task) => task.status), ["failed", "completed"]);
  assert.equal(queue.tasks[0].error, "decoder unavailable");
});
