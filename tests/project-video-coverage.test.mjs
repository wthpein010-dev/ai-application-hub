import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimePath = join(root, "app-20260706-restore-games.js");
const runtime = readFileSync(runtimePath, "utf8");

function loadDefaultApps() {
  return loadDefaultAppsFromRuntime(runtime);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("every published video entry provides its own lazy-loaded tutorial video", () => {
  const apps = loadDefaultApps();
  assert.equal(apps.length, 31, "the hub should keep its full project inventory");

  const appsWithoutVideo = apps.filter((app) => !app.video);
  assert.equal(
    appsWithoutVideo.length,
    0,
    `every published project should provide a tutorial video; missing: ${Array.from(
      appsWithoutVideo,
      (app) => app.id,
    ).join(", ")}`,
  );

  for (const app of apps.filter((app) => app.video)) {
    assert.notEqual(app.video, "./videos/placeholder.html", `${app.id} must not use the generic placeholder`);

    const videoPage = join(root, ...app.video.replace(/^\.\//, "").split("/"));
    assert.equal(existsSync(videoPage), true, `${app.id} video player should exist`);

    const html = readFileSync(videoPage, "utf8");
    assert.match(html, /id=["']loadVideo["']/, `${app.id} player should require an explicit load action`);
    const sourceMatch = html.match(/data-src=["']([^"']+\.mp4(?:\?[^"']*)?)["']/);
    assert.ok(sourceMatch, `${app.id} player should lazy-load an MP4`);

    const mediaPath = resolve(dirname(videoPage), sourceMatch[1].split(/[?#]/, 1)[0]);
    assert.equal(existsSync(mediaPath), true, `${app.id} tutorial MP4 should exist`);
    assert.equal(readFileSync(mediaPath).includes(Buffer.from("avc1")), true, `${app.id} tutorial should use broadly supported H.264 video`);
  }
});

test("engineering cards retain the demo action and expose a tutorial video when available", () => {
  const engineeringRenderer = runtime.slice(
    runtime.indexOf("function renderActions"),
    runtime.indexOf("function platformValue")
  );

  assert.match(engineeringRenderer, /mode === "engineering"/);
  assert.match(engineeringRenderer, /data-action="web"/);
  assert.match(engineeringRenderer, /data-action="video"/);
});

test("fill what stale saved cards migrate to the real tutorial video", () => {
  const fillWhatMigration = runtime.slice(
    runtime.indexOf('if (normalized.id === "fill-what")'),
    runtime.indexOf('if (normalized.id === "web-media-collector")')
  );

  assert.match(fillWhatMigration, /normalized\.video = "\.\/projects\/fill-what\/\\u89c6\\u9891\\u8d44\\u6e90\/index\.html"/);
});

test("every video page follows the shared Hub player contract", () => {
  assert.equal(existsSync(join(root, "assets", "hub-video-player.css")), true);
  assert.equal(existsSync(join(root, "assets", "hub-video-player.js")), true);

  for (const app of loadDefaultApps()) {
    const pagePath = join(root, ...app.video.replace(/^\.\//, "").split("/"));
    const html = readFileSync(pagePath, "utf8");
    const relativeRoot = relative(dirname(pagePath), root).replaceAll(sep, "/") || ".";

    assert.match(html, /data-hub-video-page/);
    assert.match(html, /class="hub-video-home"/);
    assert.match(
      html,
      new RegExp(`href="${escapeRegExp(`${relativeRoot}/index.html`)}(?:#[^"]*)?"`),
    );
    assert.match(html, /class="hub-video-stage"/);
    assert.match(html, /<video[^>]+preload="none"[^>]+data-src=/);
    assert.match(
      html,
      new RegExp(`href="${escapeRegExp(`${relativeRoot}/assets/hub-video-player.css`)}"`),
    );
    assert.match(
      html,
      new RegExp(`src="${escapeRegExp(`${relativeRoot}/assets/hub-video-player.js`)}"`),
    );
  }
});

test("brick motion video retains the latest remote walkthrough heading", () => {
  const pagePath = join(root, "projects", "brick-light-motion-lab", "video", "index.html");
  const html = readFileSync(pagePath, "utf8");
  const heading = String.fromCodePoint(20174, 21387, 26263, 21040, 28857, 20142);
  const entities = Array.from(heading, (character) => "&#" + character.codePointAt(0) + ";").join("");

  assert.match(html, new RegExp(entities));
  assert.equal((html.match(/data-time="/g) || []).length, 6);
});
