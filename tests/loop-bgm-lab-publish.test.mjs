import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const videoRoot = join(root, "projects", "loop-bgm-lab", "video");

function timestampToMilliseconds(timestamp) {
  const match = timestamp.match(/(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})/);
  assert.ok(match, `invalid VTT timestamp: ${timestamp}`);
  return (
    Number(match[1] || 0) * 3_600_000
    + Number(match[2]) * 60_000
    + Number(match[3]) * 1_000
    + Number(match[4])
  );
}

function parseCues(contents) {
  assert.match(contents, /^WEBVTT(?:\r?\n|$)/);
  return contents
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .filter((block) => block.includes("-->"))
    .map((block) => {
      const lines = block.split("\n");
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      const [start, end] = lines[timingIndex].split("-->").map((part) => part.trim());
      return {
        end: timestampToMilliseconds(end),
        start: timestampToMilliseconds(start),
        text: lines.slice(timingIndex + 1).filter(Boolean),
      };
    });
}

function topLevelMp4Boxes(path) {
  const bytes = readFileSync(path);
  const boxes = [];
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      assert.ok(offset + 16 <= bytes.length, `truncated extended MP4 box at ${offset}`);
      size = Number(bytes.readBigUInt64BE(offset + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = bytes.length - offset;
    }
    assert.ok(size >= headerSize && offset + size <= bytes.length, `invalid ${type} MP4 box`);
    boxes.push(type);
    offset += size;
  }
  assert.equal(offset, bytes.length, "MP4 boxes should consume the complete file");
  return boxes;
}

function ffprobeJson(path) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=index,codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_frames",
    "-of", "json",
    path,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || `unable to inspect ${path}`);
  return JSON.parse(result.stdout);
}

function loadMediaRegistry() {
  const source = readFileSync(join(root, "hub-project-media.js"), "utf8");
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  return context.globalThis.HUB_PROJECT_MEDIA;
}

function inspectImageVariance(path) {
  const result = spawnSync("ffmpeg", [
    "-v", "error", "-i", path,
    "-vf", "scale=64:40:flags=area,format=rgb24",
    "-f", "rawvideo", "-",
  ], { encoding: null });
  assert.equal(result.status, 0, result.stderr?.toString() || "unable to decode showcase");
  const pixels = result.stdout;
  assert.equal(pixels.length, 64 * 40 * 3, "decoded showcase dimensions");

  const colors = new Set();
  let minimum = 255;
  let maximum = 0;
  for (let index = 0; index < pixels.length; index += 3) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    colors.add(`${red},${green},${blue}`);
    minimum = Math.min(minimum, red, green, blue);
    maximum = Math.max(maximum, red, green, blue);
  }
  assert.ok(colors.size > 96, `showcase should retain real UI detail, got ${colors.size} colors`);
  assert.ok(maximum - minimum > 48, "showcase should contain visible tonal variance");
}

test("循环乐工房 is appended once as the final assistant app with only demo and video actions", () => {
  const apps = loadDefaultAppsFromRuntime(runtime);
  const matches = apps.filter((app) => app.id === "loop-bgm-lab");
  const assistantApps = apps.filter((app) => app.status === "assistant");

  assert.equal(matches.length, 1, "the catalog must contain exactly one loop-bgm-lab record");
  const project = matches[0];
  assert.equal(assistantApps.at(-1).id, "loop-bgm-lab");
  assert.equal(project.name, "循环乐工房");
  assert.equal(project.status, "assistant");
  assert.equal(project.entry, "./projects/loop-bgm-lab/index.html");
  assert.equal(project.video, "./projects/loop-bgm-lab/video/index.html");
  assert.equal(project.package, "");
  assert.deepEqual(JSON.parse(JSON.stringify(project.platforms)), {
    web: { href: "./projects/loop-bgm-lab/index.html", label: "演示" },
    windows: "",
    mac: "",
  });
  assert.equal(new Set(apps.map((app) => app.id)).size, apps.length, "catalog ids must stay collision-free");
});

test("循环乐工房 maps an authentic 1440×900 Hub showcase without local paths", () => {
  const media = loadMediaRegistry();
  const project = loadDefaultAppsFromRuntime(runtime).find((app) => app.id === "loop-bgm-lab");
  const showcase = media[project.id];
  const html = readFileSync(join(root, "projects", "loop-bgm-lab", "index.html"), "utf8");

  assert.equal(
    JSON.stringify(Object.keys(media)),
    JSON.stringify(loadDefaultAppsFromRuntime(runtime).map((app) => app.id)),
    "media registry order should follow the published catalog",
  );
  assert.equal(showcase.src, "./assets/hub-showcase/loop-bgm-lab.webp?v=20260827-hub-visual-polish");
  assert.match(showcase.alt, /循环乐工房/);
  assert.ok(showcase.feature.length >= 4);
  assert.equal(showcase.visualKind, "product");
  assert.match(html, /class="hub-home-link" href="\.\.\/\.\.\/index\.html#apps"/);

  const assetPath = join(root, "assets", "hub-showcase", "loop-bgm-lab.webp");
  assert.equal(existsSync(assetPath), true);
  assert.ok(statSync(assetPath).size > 30_000, "showcase should be a substantive compressed screenshot");
  const dimensions = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", assetPath], { encoding: "utf8" });
  assert.equal(dimensions.status, 0, dimensions.stderr);
  assert.equal(dimensions.stdout.trim(), "1440,900");
  inspectImageVariance(assetPath);
});

test("循环乐工房 publishes an exact silent fast-start H.264 tutorial", () => {
  const mediaPath = join(videoRoot, "loop-bgm-lab-demo.mp4");
  assert.equal(existsSync(mediaPath), true, "the tutorial MP4 should exist");

  const probe = ffprobeJson(mediaPath);
  const videos = probe.streams.filter((stream) => stream.codec_type === "video");
  const audios = probe.streams.filter((stream) => stream.codec_type === "audio");
  assert.equal(videos.length, 1, "the tutorial should have one video stream");
  assert.equal(audios.length, 0, "the public tutorial must have absolutely no audio stream");
  assert.deepEqual(
    {
      codec: videos[0].codec_name,
      frameRate: videos[0].avg_frame_rate,
      height: videos[0].height,
      pixelFormat: videos[0].pix_fmt,
      width: videos[0].width,
    },
    { codec: "h264", frameRate: "30/1", height: 720, pixelFormat: "yuv420p", width: 1280 },
  );
  assert.equal(videos[0].r_frame_rate, "30/1");
  assert.equal(probe.format.duration, "72.000000", "the published tutorial must bind exactly to the 72-second story contract");
  assert.equal(videos[0].nb_frames, "2160", "72 seconds at 30 fps must contain exactly 2160 frames");

  const boxes = topLevelMp4Boxes(mediaPath);
  assert.ok(boxes.includes("ftyp") && boxes.includes("moov") && boxes.includes("mdat"));
  assert.ok(boxes.indexOf("moov") < boxes.indexOf("mdat"), `faststart box order: ${boxes.join(",")}`);

  const decode = spawnSync("ffmpeg", ["-v", "error", "-i", mediaPath, "-f", "null", "-"], { encoding: "utf8" });
  assert.equal(decode.status, 0, decode.stderr || "tutorial should decode cleanly");
  assert.equal(decode.stderr.trim(), "");
});

test("循环乐工房 captions and poster fit the complete public tutorial story", () => {
  const posterPath = join(videoRoot, "poster.jpg");
  assert.equal(existsSync(posterPath), true, "the tutorial poster should exist");
  const poster = readFileSync(posterPath);
  assert.deepEqual(Array.from(poster.subarray(0, 3)), [0xff, 0xd8, 0xff]);
  const dimensions = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", posterPath,
  ], { encoding: "utf8" });
  assert.equal(dimensions.status, 0, dimensions.stderr);
  assert.equal(dimensions.stdout.trim(), "1280,720");

  const captions = readFileSync(join(videoRoot, "loop-bgm-lab-demo.vtt"), "utf8");
  const cues = parseCues(captions);
  assert.ok(cues.length >= 8, `expected a complete tutorial story, got ${cues.length} cues`);
  for (const cue of cues) {
    assert.equal(cue.text.length, 1, `cue at ${cue.start} must have one text line`);
    assert.match(cue.text[0], /[\u3400-\u9fff]/, `cue at ${cue.start} must be Chinese`);
    assert.ok(cue.end > cue.start, `cue at ${cue.start} must have positive duration`);
  }
  for (let index = 1; index < cues.length; index += 1) {
    assert.ok(cues[index].start >= cues[index - 1].end, `cue ${index + 1} overlaps cue ${index}`);
  }
  assert.ok(cues.at(-1).end <= 72_000, "captions should end within the exact 72-second media contract");

  const story = `${captions}\n${readFileSync(join(videoRoot, "tutorial-script.md"), "utf8")}`;
  for (const phrase of [
    "留在本机", "原创合成", "D minor", "112 BPM", "五个单变量", "人工复制", "六项特征",
    "风险分类", "CC0", "授权台账", "JSON", "Markdown",
  ]) {
    assert.match(story, new RegExp(phrase), `tutorial story should cover ${phrase}`);
  }
  assert.doesNotMatch(story, /[A-Z]:\\|Users[\\/]|登录 Suno|自动生成/);
});

test("循环乐工房 video page follows the shared lazy player contract", () => {
  const page = readFileSync(join(videoRoot, "index.html"), "utf8");
  assert.match(page, /<body data-hub-video-page>/);
  assert.match(page, /class="hub-video-home" href="\.\.\/\.\.\/\.\.\/index\.html#apps"/);
  assert.match(page, /href="\.\.\/\.\.\/\.\.\/assets\/hub-video-player\.css"/);
  assert.match(page, /src="\.\.\/\.\.\/\.\.\/assets\/hub-video-player\.js"/);
  assert.match(page, /<video[^>]+controls[^>]+playsinline[^>]+preload="none"[^>]+data-src="\.\/loop-bgm-lab-demo\.mp4"/);
  assert.doesNotMatch(page, /<video[^>]+\ssrc=/);
  assert.match(page, /<track[^>]+kind="captions"[^>]+src="\.\/loop-bgm-lab-demo\.vtt"[^>]+default/);
  assert.ok((page.match(/class="hub-video-chapter"/g) || []).length >= 6);
});
