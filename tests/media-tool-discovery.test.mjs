import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const localFfmpeg = join(homedir(), "AppData", "Local", "kzip_sogou", "ffmpeg.exe");

test("media inspection finds the local ffmpeg fallback when PATH lacks ffmpeg", {
  skip: process.platform !== "win32" || !existsSync(localFfmpeg)
}, () => {
  const env = { ...process.env };
  delete env.FFMPEG_PATH;
  delete env.FFPROBE_PATH;
  env.PATH = "";
  env.Path = "";

  const fixture = join(root, "projects", "xiang-le-ge-xiang", "video", "xiang-le-ge-xiang-tutorial.mp4");
  const script = `
    import { inspectMedia } from "./tests/media-inspect.mjs";
    const media = inspectMedia(${JSON.stringify(fixture)});
    if (media.videoCodec !== "h264" || media.width <= 0 || media.height <= 0) {
      throw new Error(JSON.stringify(media));
    }
  `;

  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: root,
    encoding: "utf8",
    env
  });

  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
});

test("media inspection honors FFMPEG_PATH assigned after module import", () => {
  const missingFfmpeg = join(root, "tests", "__missing_ffmpeg_after_import__");
  const fixture = join(root, "projects", "xiang-le-ge-xiang", "video", "xiang-le-ge-xiang-tutorial.mp4");
  const script = `
    import { inspectMedia } from "./tests/media-inspect.mjs";
    const expected = ${JSON.stringify(missingFfmpeg)};
    process.env.FFMPEG_PATH = expected;
    try {
      inspectMedia(${JSON.stringify(fixture)});
      throw new Error("Late FFMPEG_PATH assignment was ignored");
    } catch (error) {
      if (error.path !== expected) throw error;
    }
  `;

  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
});
