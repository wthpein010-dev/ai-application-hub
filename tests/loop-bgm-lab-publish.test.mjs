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
