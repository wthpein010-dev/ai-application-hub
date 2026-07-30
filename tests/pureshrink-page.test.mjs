import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const project = (...parts) => join(root, "projects", "pureshrink", ...parts);

test("PureShrink page exposes the complete local-first workbench", () => {
  const htmlPath = project("index.html");
  assert.equal(existsSync(htmlPath), true);
  const html = readFileSync(htmlPath, "utf8");

  assert.match(html, /文件不离开设备，原件永不覆盖/);
  assert.match(html, /data-pureshrink-dropzone/);
  assert.match(html, /type="file"[\s\S]*multiple/);
  assert.match(html, /value="lossless"[\s\S]*checked/);
  assert.match(html, /高保真[\s\S]*非无损/);
  assert.match(html, /data-pureshrink-queue/);
  assert.match(html, /data-pureshrink-start/);
  assert.match(html, /data-pureshrink-cancel/);
  assert.match(html, /data-pureshrink-clear/);
  assert.match(html, /data-pureshrink-download-all/);
  assert.match(html, /data-pureshrink-output-settings/);
  assert.match(html, /data-pureshrink-choose-output/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self' blob: 'wasm-unsafe-eval'/);
  assert.match(html, /worker-src 'self' blob:/);
  assert.match(html, /返回主页/);
});

test("PureShrink public implementation has no upload endpoint or local-machine path", () => {
  const published = [
    readFileSync(project("index.html"), "utf8"),
    readFileSync(project("app.js"), "utf8"),
    readFileSync(project("engines", "browser-engine.mjs"), "utf8"),
  ].join("\n");

  assert.doesNotMatch(published, /C:\\Users|localhost|127\.0\.0\.1|file:\/\//);
  assert.doesNotMatch(published, /\bfetch\s*\([^)]*(upload|api\/files)/i);
  assert.match(published, /不上传|不离开设备/);
});

test("PureShrink self-hosts every pinned browser runtime", () => {
  const engine = readFileSync(project("engines", "browser-engine.mjs"), "utf8");
  const vendor = (...parts) => project("vendor", ...parts);

  assert.doesNotMatch(engine, /cdn\.jsdelivr|unpkg|cdnjs/);
  assert.match(engine, /mainName:\s*"main"/);
  assert.match(engine, /browserAssetUrl\(FFMPEG_CORE_URL\)/);
  for (const [name, minimumBytes] of [
    ["ffmpeg.min.js", 20_000],
    ["046d0074eee1d99a674a.js", 100_000],
    ["ffmpeg-core.js", 80_000],
    ["ffmpeg-core.worker.js", 50],
    ["ffmpeg-core.wasm", 24_000_000],
    ["fflate.min.js", 30_000],
    ["THIRD-PARTY-NOTICES.md", 500],
  ]) {
    assert.equal(existsSync(vendor(name)), true, `${name} should be vendored`);
    assert.ok(statSync(vendor(name)).size >= minimumBytes, `${name} is unexpectedly small`);
  }
});

test("PureShrink styles define responsive focus-visible and reduced-motion behavior", () => {
  const css = readFileSync(project("styles.css"), "utf8");
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(css, /min-width:\s*[89]\d{2}px/);
});

