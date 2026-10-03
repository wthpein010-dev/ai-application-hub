import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright';
import { createLocalServer } from '../server.mjs';

const server = createLocalServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const downloads = await mkdtemp(join(tmpdir(), 'planmap-exports-'));
let browser;
try {
  browser = await (process.env.PLANMAP_BROWSER === 'webkit' ? webkit : chromium).launch();
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Any remote request fails the test; no paid model or external service is used.
  await page.route('**/*', route => {
    if (route.request().url().startsWith(origin + '/')) return route.continue();
    errors.push(`Unexpected remote request: ${route.request().url()}`);
    return route.abort();
  });
  await page.goto(origin);
  await page.locator('#documentTitle').fill('跨平台验收 PlanMap');
  await page.locator('#documentTitle').press('Tab');
  await page.waitForFunction(() => (localStorage.getItem('planmap.hub-demo.v2') || '').includes('跨平台验收 PlanMap'));
  await page.reload();
  assert.equal(await page.locator('#documentTitle').inputValue(), '跨平台验收 PlanMap');
  for (const format of ['markdown', 'png', 'pdf', 'xmind']) {
    await page.locator('#exportButton').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.locator(`[data-export="${format}"]`).click(),
    ]);
    const path = join(downloads, download.suggestedFilename());
    await download.saveAs(path);
    assert.equal(await download.failure(), null);
    const bytes = await readFile(path);
    assert.ok(bytes.length > 100, `${format} export should contain data`);
    if (format === 'markdown') assert.match(bytes.toString('utf8'), /跨平台验收 PlanMap/);
    if (format === 'png') assert.deepEqual([...bytes.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
    if (format === 'pdf') {
      const text = bytes.toString('latin1');
      assert.ok(text.startsWith('%PDF-')); assert.ok(text.endsWith('%%EOF\n'));
      const xref = Number(text.match(/startxref\n(\d+)\n%%EOF\n$/)?.[1]);
      assert.equal(text.slice(xref, xref + 4), 'xref');
    }
    if (format === 'xmind') {
      assert.deepEqual([...bytes.subarray(0, 4)], [80,75,3,4]);
      // Archive entries are stored (uncompressed); inspect actual exported content.
      assert.match(bytes.toString('utf8'), /跨平台验收 PlanMap/);
      for (const name of ['content.json', 'metadata.json', 'manifest.json']) assert.ok(bytes.includes(Buffer.from(name)));
    }
  }
  await page.locator('#settingsButton').click();
  await page.locator('[data-provider="openai"]').click();
  await page.locator('#modelKey').fill('ci-placeholder-not-a-secret');
  await page.locator('#modelKey').press('Tab');
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify(localStorage)), /ci-placeholder-not-a-secret/);
  await page.reload();
  await page.locator('#settingsButton').click();
  assert.equal(await page.locator('#modelKey').inputValue(), '');
  assert.deepEqual(errors, []);
  console.log('Verified browser persistence, ephemeral API keys, and Markdown/PNG/PDF/XMind downloads.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  await rm(downloads, {recursive: true, force: true});
}
