import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { resolve, join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { listenForFetch } from "./helpers/fetch-safe-listener.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [
  process.env.CODEX_NODE_MODULES,
  join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"),
].filter(Boolean) }));
const executablePath = [process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(path => path && existsSync(path));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const path = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!path.startsWith(resolve(root) + sep) || /clickflow/i.test(path)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream" }); res.end(readFileSync(path)); }
  catch { res.writeHead(404).end(); }
});
const base = process.env.HUB_LAYOUT_URL || await listenForFetch(server);
const browser = await chromium.launch({ headless: true, executablePath });
const errors = [];
let checks = 0;
try {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route(/clickflow/i, route => { errors.push("Unexpected ClickFlow request"); return route.abort(); });
  await page.goto(`${base}/index.html?project=simuai`, { waitUntil: "networkidle" });
  assert.equal(await page.locator('#engineeringGrid article[data-app-id="holiday-gifts"]').count(), 1);
  assert.equal(await page.locator('#gameGrid article[data-app-id="holiday-gifts"]').count(), 0);
  assert.equal(await page.locator("#engineering h2").innerText(), "项目辅助");
  const ids = await page.evaluate(() => visibleApps().map(app => app.id).filter(id => id !== "clickflow"));
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const id of ids) {
      await page.evaluate(id => selectApp(id), id);
      const bounds = await page.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return { image: box(".showcase-visual"), text: box("#spotlightCard"), rail: box(".showcase-controls"),
          prev: box("#prevApp"), next: box("#nextApp"), pageWidth: document.documentElement.scrollWidth,
          fit: getComputedStyle(document.querySelector("#showcaseImage")).objectFit,
          background: getComputedStyle(document.querySelector("#spotlightCard")).backgroundColor };
      });
      assert.ok(bounds.image.bottom <= bounds.text.top + 1, `${width}/${id}: image overlaps copy`);
      assert.ok(bounds.text.bottom <= bounds.rail.top + 1, `${width}/${id}: copy overlaps controls`);
      assert.ok(bounds.prev.top >= bounds.rail.top && bounds.next.top >= bounds.rail.top, `${width}/${id}: controls outside rail`);
      assert.ok(bounds.pageWidth <= width, `${width}/${id}: horizontal overflow`);
      assert.equal(bounds.fit, "contain");
      assert.ok(!bounds.background.startsWith("rgba"), `${width}/${id}: transparent copy panel`);
      checks++;
    }
    await page.evaluate(() => selectApp("simuai"));
    await page.locator("#showcaseImage").evaluate(async image => { if (!image.complete) await new Promise(resolve => image.addEventListener("load", resolve, { once: true })); });
    for (const theme of ["clean", "mist", "coral", "night"]) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      if (process.env.HUB_LAYOUT_SHOTS) {
        mkdirSync(process.env.HUB_LAYOUT_SHOTS, { recursive: true });
        await page.locator("#showcaseMedia").screenshot({ path: join(process.env.HUB_LAYOUT_SHOTS, `showcase-${width}-${theme}.png`) });
      }
    }
  }
  await page.locator("#nextApp").click();
  const nextName = await page.locator("#spotlightCard strong").innerText();
  assert.notEqual(nextName, "万象实验室");
  await page.locator("#prevApp").click();
  assert.equal(await page.locator("#spotlightCard strong").innerText(), "万象实验室");
  assert.deepEqual(errors, []);
  console.log(`Showcase layout verified: ${checks} project/viewport combinations, 4 themes, navigation and category checks passed.`);
} finally {
  await browser.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
