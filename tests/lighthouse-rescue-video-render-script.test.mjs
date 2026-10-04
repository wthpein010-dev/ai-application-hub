import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const script = join(root, "scripts", "render-lighthouse-proposal-video.mjs");

function preview(input) {
  return spawnSync(process.execPath, [script, input, "--dry-run"], { cwd: root, encoding: "utf8", shell: false });
}

test("video preview preserves a literal input path and plans H264/AAC with honest audio metadata", () => {
  const capture = mkdtempSync(join(tmpdir(), "lighthouse-video-plan-"));
  try {
    const input = join(capture, "capture $(ignored); spaced.webm");
    writeFileSync(input, "dry-run fixture; no media process should open it");
    const result = preview(input);
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.encodeArgs[plan.encodeArgs.indexOf("-i") + 1], input);
    assert.equal(plan.encodeArgs[plan.encodeArgs.indexOf("-c:v") + 1], "libx264");
    assert.equal(plan.encodeArgs[plan.encodeArgs.indexOf("-c:a") + 1], "aac");
    assert.equal(plan.encodeArgs[plan.encodeArgs.indexOf("-pix_fmt") + 1], "yuv420p");
    assert.ok(Number(plan.encodeArgs[plan.encodeArgs.indexOf("-t") + 1]) <= 240);
    assert.match(plan.disclosure, /后期合成/);
    assert.ok(plan.encodeArgs.some(argument => argument.startsWith("comment=") && argument.includes("后期合成")));
    for (const asset of ["StormRain.ogg", "WindGust.ogg", "Thunder.ogg", "Splash.ogg"])
      assert.ok(plan.encodeArgs.some(argument => argument.endsWith(asset)), asset);
    assert.equal(plan.outputPath, join(root, "projects", "lighthouse-rescue", "video", "lighthouse-demo.mp4"));
    assert.equal(plan.posterPath, join(root, "projects", "lighthouse-rescue", "video", "poster.jpg"));
    assert.equal(plan.posterArgs[plan.posterArgs.indexOf("-frames:v") + 1], "1");
  } finally {
    rmSync(capture, { recursive: true, force: true });
  }
});

test("a recording directory resolves its single WebM and leaves external captions untouched", () => {
  const capture = mkdtempSync(join(tmpdir(), "lighthouse-video-directory-"));
  const subtitles = join(root, "projects", "lighthouse-rescue", "video", "lighthouse-demo.vtt");
  const before = readFileSync(subtitles, "utf8");
  try {
    const input = join(capture, "recording.webm");
    writeFileSync(input, "dry-run fixture");
    writeFileSync(join(capture, "result.png"), "ignored screenshot");
    const result = preview(capture);
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.inputPath, input);
    assert.equal(plan.encodeArgs[plan.encodeArgs.indexOf("-map") + 1], "0:v:0");
    assert.equal(plan.encodeArgs.some(argument => argument.includes("subtitles=")), false);
    assert.equal(readFileSync(subtitles, "utf8"), before);
  } finally {
    rmSync(capture, { recursive: true, force: true });
  }
});

test("an ambiguous recording directory requires an explicit WebM rather than selecting stale footage", () => {
  const capture = mkdtempSync(join(tmpdir(), "lighthouse-video-ambiguous-"));
  try {
    writeFileSync(join(capture, "first.webm"), "dry-run fixture");
    writeFileSync(join(capture, "second.webm"), "dry-run fixture");
    const result = preview(capture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /多个 WebM|multiple WebM/i);
  } finally {
    rmSync(capture, { recursive: true, force: true });
  }
});
