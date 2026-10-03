import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".wasm": "application/wasm", ".png": "image/png" };
const server = createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const target = resolve(root, "." + name);
  if (!target.startsWith(root + sep) || !existsSync(target) || statSync(target).isDirectory()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "Content-Type": mime[extname(target)] || "application/octet-stream",
    "Content-Length": statSync(target).size, "Cache-Control": "no-store" });
  createReadStream(target).pipe(response);
});
await new Promise(resolveServer => server.listen(0, "127.0.0.1", resolveServer));
const browser = await chromium.launch({ headless: true });

async function persistedPaths(page) {
  return page.evaluate(async () => {
    const dbInfo = (await indexedDB.databases()).find(info => info.name === "/idbfs");
    if (!dbInfo) return [];
    const db = await new Promise((resolveDb, rejectDb) => {
      const request = indexedDB.open("/idbfs");
      request.onsuccess = () => resolveDb(request.result);
      request.onerror = () => rejectDb(request.error);
    });
    const keys = await new Promise((resolveKeys, rejectKeys) => {
      const request = db.transaction("FILE_DATA", "readonly").objectStore("FILE_DATA").getAllKeys();
      request.onsuccess = () => resolveKeys(request.result.map(String));
      request.onerror = () => rejectKeys(request.error);
    });
    db.close();
    return keys;
  });
}

async function persistedCheckpoint(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolveDb, rejectDb) => {
      const request = indexedDB.open("/idbfs");
      request.onsuccess = () => resolveDb(request.result);
      request.onerror = () => rejectDb(request.error);
    });
    const record = await new Promise((resolveRecord, rejectRecord) => {
      const store = db.transaction("FILE_DATA", "readonly").objectStore("FILE_DATA");
      const request = store.getAll();
      request.onsuccess = () => resolveRecord(request.result.find(value =>
        value?.contents && new TextDecoder().decode(value.contents).includes('"RulesVersion"')));
      request.onerror = () => rejectRecord(request.error);
    });
    db.close();
    return record ? JSON.parse(new TextDecoder().decode(record.contents)) : null;
  });
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const url = `http://127.0.0.1:${server.address().port}/projects/lighthouse-rescue/index.html`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("#loading").waitFor({ state: "hidden", timeout: 90000 });
  await page.waitForTimeout(3500);
  const box = await page.locator("#lighthouse-canvas").boundingBox();
  const click = async (x, y) => page.mouse.click(box.x + box.width * x / 1080, box.y + box.height * y / 1920);
  await click(150, 1865); // Start an active round and write its complete checkpoint.
  await page.waitForTimeout(200);
  await click(200, 1458); // Join once, writing a journal record.
  let paths = [];
  for (let attempt = 0; attempt < 15; attempt++) {
    paths = await persistedPaths(page);
    if (paths.some(key => key.endsWith("lighthouse-rescue-checkpoint.json")) &&
        paths.some(key => key.endsWith("lighthouse-rescue-checkpoint.json.journal"))) break;
    await page.waitForTimeout(1000);
  }
  assert.ok(paths.some(key => key.endsWith("lighthouse-rescue-checkpoint.json")),
    `checkpoint must reach IndexedDB before reload: ${JSON.stringify(paths)}`);
  assert.ok(paths.some(key => key.endsWith("lighthouse-rescue-checkpoint.json.journal")),
    `journal must reach IndexedDB before reload: ${JSON.stringify(paths)}`);
  const before = await persistedCheckpoint(page);
  assert.ok(before?.RoundId, "the persisted checkpoint must contain the active round");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#loading").waitFor({ state: "hidden", timeout: 90000 });
  await page.waitForTimeout(3500);
  const resumedBox = await page.locator("#lighthouse-canvas").boundingBox();
  const resumedClick = async (x, y) => page.mouse.click(
    resumedBox.x + resumedBox.width * x / 1080,
    resumedBox.y + resumedBox.height * y / 1920);
  await resumedClick(350, 987); // Restore the previous round from the modal.
  await page.waitForTimeout(200);
  await resumedClick(360, 1865); // Pause writes a complete recovery checkpoint.
  let recovered = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    recovered = await persistedCheckpoint(page);
    if (recovered?.Phase === 8 && recovered?.JoinedCount === 1) break;
    await page.waitForTimeout(1000);
  }
  assert.equal(recovered?.RoundId, before.RoundId, "reload must resume the same round");
  assert.equal(recovered?.JoinedCount, 1, "journaled boarding must be restored");
  assert.equal(recovered?.Phase, 8, "the restored round must accept pause after reload");
  assert.deepEqual(errors, []);
  console.log("Lighthouse WebGL checkpoint and journal survived reload; boarding restored and round paused");
  await context.close();
} finally {
  await browser.close();
  await new Promise(resolveServer => server.close(resolveServer));
}
