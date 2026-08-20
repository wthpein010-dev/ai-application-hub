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
