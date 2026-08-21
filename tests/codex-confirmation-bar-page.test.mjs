import test from "node:test";
import assert from "node:assert/strict";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = join(root, "projects", "codex-confirmation-bar");
const pagePath = join(projectRoot, "index.html");
const stylesPath = join(projectRoot, "styles.css");
const appPath = join(projectRoot, "app.js");

function contentType(path) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
  }[extname(path).toLowerCase()] || "application/octet-stream";
}

function createStaticServer() {
  return createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const target = resolve(root, "." + normalize(pathname));
    if ((!target.startsWith(root + sep) && target !== root) || !existsSync(target) || !statSync(target).isFile()) {
      response.writeHead(404).end();
      return;
    }
    const stats = statSync(target);
    response.writeHead(200, {
      "Content-Length": stats.size,
      "Content-Type": contentType(target),
      "Cache-Control": "no-store",
    });
    createReadStream(target).pipe(response);
  });
}

function startServer(server) {
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => resolveServer(`http://127.0.0.1:${server.address().port}`));
  });
}

function stopServer(server) {
  return new Promise((resolveServer) => server.close(resolveServer));
}

async function launchBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    chromium.executablePath(),
  ].filter(Boolean);
  for (const executablePath of candidates) {
    if (!existsSync(executablePath)) continue;
    try {
      return await chromium.launch({ executablePath, headless: true });
    } catch {
      // Try the next installed Chromium build.
    }
  }
  throw new Error("A Chromium-compatible browser is required for the confirmation bar demo test.");
}

test("confirmation bar demo ships a safe, explicit simulation surface", (context) => {
  if (![pagePath, stylesPath, appPath].every(existsSync)) {
    assert.fail("canonical demo HTML, CSS, and JS should exist");
  }

  const html = readFileSync(pagePath, "utf8");
  const source = readFileSync(appPath, "utf8");
  assert.match(html, /本页仅为安全交互模拟/);
  assert.match(html, /确认，继续开始做，完成前不要停。/);
  assert.match(html, /class="hub-home-link"/);
  assert.match(html, /href="\.\.\/\.\.\/assets\/subpage-shell\.css"/);
  for (const action of ["scan", "fail-next", "reset", "confirm", "confirm-all", "retry"]) {
    assert.match(`${html}\n${source}`, new RegExp(`data-action=["']${action}["']`), action);
  }
  assert.doesNotMatch(source, /\blocalStorage\b|\bfetch\s*\(|\bWebSocket\b|app-server/i);
});

test("demo supports drag, single confirm, failure retry, confirm all, and responsive layouts", async (context) => {
  if (![pagePath, stylesPath, appPath].every(existsSync)) {
    context.skip("canonical demo is not implemented yet");
    return;
  }

  const server = createStaticServer();
  const baseUrl = await startServer(server);
  const browser = await launchBrowser();
  const artifacts = join(tmpdir(), "codex-confirmation-bar-test-artifacts");
  mkdirSync(artifacts, { recursive: true });

  try {
    for (const viewport of [
      { width: 1440, height: 900, name: "desktop" },
      { width: 390, height: 844, name: "mobile" },
    ]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
      page.on("requestfailed", (request) => errors.push(`request: ${request.url()}`));

      await page.goto(`${baseUrl}/projects/codex-confirmation-bar/index.html`, { waitUntil: "networkidle" });
      assert.equal(await page.locator('[data-role="confirmation-bar"]').isHidden(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);

      await page.locator('[data-action="scan"]').click();
      const bar = page.locator('[data-role="confirmation-bar"]');
      await bar.waitFor({ state: "visible" });
      assert.equal(await page.locator('[data-role="candidate"]').count(), 3);
      assert.match(await page.locator('[data-role="count"]').textContent(), /3/);

      if (viewport.name === "desktop") {
        const before = await bar.boundingBox();
        const handle = page.locator('[data-role="drag-handle"]');
        const handleBox = await handle.boundingBox();
        assert.ok(before && handleBox);
        await page.mouse.move(handleBox.x + 32, handleBox.y + 18);
        await page.mouse.down();
        await page.mouse.move(handleBox.x + 152, handleBox.y + 98, { steps: 5 });
        await page.mouse.up();
        const after = await bar.boundingBox();
        assert.ok(after);
        assert.ok(after.x > before.x + 80, `drag x: ${before.x} -> ${after.x}`);
        assert.ok(after.y > before.y + 50, `drag y: ${before.y} -> ${after.y}`);
        assert.ok(after.x >= 0 && after.y >= 0 && after.x + after.width <= viewport.width && after.y + after.height <= viewport.height);

        await page.locator('[data-role="candidate"]').first().locator('[data-action="confirm"]').click();
        assert.equal(await page.locator('[data-role="candidate"]').count(), 2);
        assert.match(await page.locator('[data-role="status"]').textContent(), /已模拟发送：确认，继续开始做，完成前不要停。/);

        await page.locator('[data-action="fail-next"]').click();
        await page.locator('[data-role="candidate"]').first().locator('[data-action="confirm"]').click();
        assert.equal(await page.locator('[data-role="candidate"]').count(), 2);
        assert.equal(await page.locator('[data-role="candidate"][data-state="error"]').count(), 1);
        await page.locator('[data-role="candidate"][data-state="error"] [data-action="retry"]').click();
        assert.equal(await page.locator('[data-role="candidate"]').count(), 1);

        await page.locator('[data-action="confirm-all"]').click();
        assert.equal(await page.locator('[data-role="candidate"]').count(), 0);
        assert.equal(await bar.isHidden(), true);
        assert.match(await page.locator('[data-role="status"]').textContent(), /全部候选已模拟确认/);
      }

      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: join(artifacts, `${viewport.name}.png`), fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
    await stopServer(server);
  }
});
