import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listenForFetch } from './helpers/fetch-safe-listener.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [
  process.env.CODEX_NODE_MODULES,
  join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),
].filter(Boolean) }));
const executablePath = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(path => path && existsSync(path));
const types = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.svg':'image/svg+xml'};
const server = createServer((req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!path.startsWith(resolve(root) + sep) || /clickflow/i.test(path)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, {'Content-Type': types[extname(path)] || 'application/octet-stream'}); res.end(readFileSync(path)); }
  catch { res.writeHead(404).end(); }
});
const base = process.env.HUB_DOWNLOAD_URL || await listenForFetch(server);
const browser = await chromium.launch({headless:true, executablePath});
const errors = [];
try {
  const context = await browser.newContext({reducedMotion:'reduce', viewport:{width:1440,height:1000}});
  await context.route(/clickflow/i, route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const url = `${base}/index.html?download-command-check=20261117`;
  const packages = '[data-hub-package]:visible';
  const ready = async target => { await target.waitForFunction(() => Boolean(window.hubDownloadVisibility)); };
  const command = async (value, enter = true) => {
    await page.locator('#commandInput').fill(value);
    if (enter) await page.locator('#commandInput').press('Enter');
    else await page.locator('#commandRun').click();
  };
  await page.goto(url, {waitUntil:'domcontentloaded'}); await ready(page);
  assert.equal(await page.locator(packages).count(), 0);
  await command('开启下载xxx'); assert.equal(await page.locator(packages).count(), 0);
  await command(' 开启下载 ');
  const card = page.locator('#appGrid article[data-app-id="codex-quota-bar"]');
  assert.equal(await card.locator('[data-hub-package]:visible').count(), 2);
  const noPackage = page.locator('#engineeringGrid article[data-app-id="announcement-center"]');
  assert.equal(await noPackage.locator('[data-hub-package]').count(), 0);
  await command('1'); assert.equal(await card.locator('[data-hub-package]:visible').count(), 2);
  await page.reload({waitUntil:'domcontentloaded'}); await ready(page);
  assert.equal(await card.locator('[data-hub-package]:visible').count(), 2);
  const other = await context.newPage(); await other.goto(url, {waitUntil:'domcontentloaded'}); await ready(other);
  assert.equal(await other.locator(packages).count(), 0);
  await other.close();

  // Route only this known non-ClickFlow link to a harmless test file; do not download application binaries.
  for (const action of ['download','mac']) {
    const link = card.locator(`[data-action="${action}"]`);
    const href = await link.getAttribute('href');
    assert.match(href, /codex-quota-bar/);
    await page.route(href, route => route.fulfill({status:200, headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="visibility-fixture.txt"'}, body:'visibility check only'}));
    const downloadPromise = page.waitForEvent('download');
    await link.click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'visibility-fixture.txt');
    await download.delete();
    assert.equal(await page.locator('.hub-admin-dialog').isVisible(), false);
    await page.unroute(href);
  }
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    await card.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const buttons = await card.locator('[data-hub-package]').evaluateAll(items => items.map(el => el.getBoundingClientRect().toJSON()));
    assert.ok(buttons.every(box => box.width > 0));
    assert.ok(buttons[0].right <= buttons[1].left + 1 || buttons[0].bottom <= buttons[1].top + 1);
    if (process.env.HUB_DOWNLOAD_SHOTS) {
      mkdirSync(process.env.HUB_DOWNLOAD_SHOTS, {recursive:true});
      await card.screenshot({path:join(process.env.HUB_DOWNLOAD_SHOTS, `download-card-${width}.png`)});
    }
  }
  await page.goto(`${base}/projects/announcement-center/index.html`, {waitUntil:'domcontentloaded'}); await ready(page);
  assert.ok(await page.locator(packages).count() > 0, 'same-tab detail page retains the switch');
  await page.goBack({waitUntil:'domcontentloaded'}); await ready(page);
  await command('关闭下载', false); assert.equal(await page.locator(packages).count(), 0);
  await page.goForward({waitUntil:'domcontentloaded'}); await ready(page);
  assert.equal(await page.locator(packages).count(), 0, 'history restoration keeps downloads closed');
  await page.goBack({waitUntil:'domcontentloaded'}); await ready(page);
  await page.reload({waitUntil:'domcontentloaded'}); await ready(page);
  assert.equal(await page.locator(packages).count(), 0);
  await page.goto(url + '#admin', {waitUntil:'domcontentloaded'});
  await page.locator('.hub-admin-dialog').waitFor();
  assert.match(await page.locator('.hub-admin-dialog [role="status"]').innerText(), /未配置/);
  await page.keyboard.press('Escape');
  await page.close();
  const fresh = await context.newPage(); await fresh.goto(url, {waitUntil:'domcontentloaded'}); await ready(fresh);
  assert.equal(await fresh.locator(packages).count(), 0);
  await fresh.close();
  assert.deepEqual(errors, []);
  console.log('Download command verified: default hidden, exact commands, Enter/button, refresh, independent tab, close, rerender, existing links, safe fixture downloads, same-tab detail page and mobile layout.');
} finally {
  await browser.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
