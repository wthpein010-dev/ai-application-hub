import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const demoWav = join(root, "projects", "loop-bgm-lab", "assets", "demo-reference.wav");
const expectedWavSha256 = "f6168016f3659617d48662cca4d8013eb6eac2b21f3b7e17f7d23108b4985d5f";
const mime = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wav", "audio/wav"]
]);

const server = createServer(async (request, response) => {
  try {
    const requestPath = normalize(decodeURIComponent((request.url || "/").split("?", 1)[0]).replace(/^\/+/, ""));
    let filePath = resolve(root, requestPath || "index.html");
    if (relative(root, filePath).startsWith("..")) throw new Error("Invalid path");
    if (!extname(filePath)) filePath = join(filePath, "index.html");
    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": mime.get(extname(filePath)) || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const browserExecutable = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  chromium.executablePath()
].find(candidate => candidate && existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
const origin = `http://127.0.0.1:${server.address().port}`;

function observeErrors(page) {
  const errors = [];
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", error => errors.push(`page: ${error.message}`));
  page.on("requestfailed", request => {
    const failure = request.failure()?.errorText || "failed";
    if (request.url().startsWith("blob:") && failure.includes("ERR_ABORTED")) return;
    errors.push(`request: ${request.url()} ${failure}`);
  });
  return errors;
}

async function installInterceptors(page, { clearOnce = false, failStorage = false } = {}) {
  await page.addInitScript(({ clearOnce, failStorage }) => {
    if (clearOnce && !sessionStorage.getItem("loop-bgm-smoke-ready")) {
      localStorage.clear();
      sessionStorage.setItem("loop-bgm-smoke-ready", "true");
    }
    window.__externalOpens = [];
    window.__copiedText = "";
    window.__createdObjectUrls = [];
    window.__revokedObjectUrls = [];
    const createObjectUrl = URL.createObjectURL.bind(URL);
    const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = value => {
      const url = createObjectUrl(value);
      window.__createdObjectUrls.push(url);
      return url;
    };
    URL.revokeObjectURL = url => {
      window.__revokedObjectUrls.push(String(url));
      return revokeObjectUrl(url);
    };
    window.open = (url, target, features) => {
      window.__externalOpens.push({ url: String(url), target, features: String(features || "") });
      return null;
    };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    document.execCommand = command => {
      if (command !== "copy") return false;
      window.__copiedText = document.activeElement?.value || String(window.getSelection() || "");
      return true;
    };
    if (failStorage) {
      const originalGet = Storage.prototype.getItem;
      Storage.prototype.getItem = function getItem(key) {
        if (key === "loop-bgm-lab-v1") return originalGet.call(this, key);
        return originalGet.call(this, key);
      };
      Storage.prototype.setItem = function setItem(key) {
        if (key === "loop-bgm-lab-v1") throw new DOMException("quota blocked", "QuotaExceededError");
        return undefined;
      };
    }
  }, { clearOnce, failStorage });
}

async function assertNoOverflow(page, label) {
  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth
  }));
  assert.ok(geometry.scrollWidth <= geometry.clientWidth, `${label} html overflow: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.bodyWidth <= geometry.clientWidth, `${label} body overflow: ${JSON.stringify(geometry)}`);
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = observeErrors(page);
  await installInterceptors(page, { clearOnce: true });
  const response = await page.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  await page.locator("body[data-ready='true']").waitFor();

  assert.equal(await page.title(), "循环乐工房");
  assert.equal(await page.locator("main > section").count(), 6);
  assert.equal(await page.locator(".batch-card").count(), 5);
  assert.deepEqual(await page.locator(".batch-card").evaluateAll(cards => cards.map(card => card.dataset.axis)), [
    "baseline", "melodyTimbre", "rhythm", "percussion", "loopStructure"
  ]);
  assert.deepEqual(await page.locator(".axis-label").allTextContents(), ["基线", "旋律音色", "律动", "打击乐", "循环结构"]);

  await page.locator("#reference-files").setInputFiles([demoWav, demoWav]);
  await page.waitForFunction(() => document.querySelector("#reference-progress")?.textContent.includes("2 个成功"), null, { timeout: 45_000 });
  const duplicateReferenceUrls = await page.evaluate(() => [...window.__createdObjectUrls]);
  assert.equal(duplicateReferenceUrls.length, 2);
  await page.locator("#reference-files").setInputFiles(demoWav);
  await page.waitForFunction(() => document.querySelector("#reference-progress")?.textContent.includes("完成：1 个成功"), null, { timeout: 45_000 });
  await page.waitForFunction(() => document.querySelectorAll("#reference-list [data-analysis-state='ready']").length === 1);
  assert.equal(await page.evaluate(urls => urls.every(url => window.__revokedObjectUrls.includes(url)), duplicateReferenceUrls), true);
  assert.match(await page.locator("#reference-list").textContent(), /demo-reference\.wav/);
  assert.match(await page.locator("#reference-list").textContent(), new RegExp(expectedWavSha256.slice(0, 12)));
  assert.match(await page.locator("#aggregate-summary").textContent(), /BPM/);

  const baselinePrompt = await page.locator(".batch-card[data-axis='baseline'] .prompt-text").textContent();
  const baselineExclusion = (await page.locator(".batch-card[data-axis='baseline'] .exclude-text").textContent()).replace(/^排除：/, "");
  await page.locator(".batch-card[data-axis='baseline'] .copy-prompt").click();
  assert.equal(await page.evaluate(() => window.__copiedText), `${baselinePrompt}\n\nExclude: ${baselineExclusion}`);
  assert.match(await page.locator("#app-live").textContent(), /已复制/);

  await page.locator(".batch-card[data-axis='baseline'] .open-suno").click();
  const sunoOpen = await page.evaluate(() => window.__externalOpens.at(-1));
  assert.deepEqual(sunoOpen, { url: "https://suno.com/create", target: "_blank", features: "noopener,noreferrer" });
  assert.equal(await page.locator(".batch-card[data-axis='baseline'] .batch-status").inputValue(), "planned");

  await page.locator(".batch-card[data-axis='baseline'] .batch-status").selectOption("submitted");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).batches[0].status === "submitted");
  await page.locator(".search-link[data-source='Pixabay Music']").click();
  const searchOpen = await page.evaluate(() => window.__externalOpens.at(-1));
  assert.match(searchOpen.url, /^https:\/\/pixabay\.com\/music\/search/);
  assert.match(searchOpen.features, /noopener/);
  assert.match(searchOpen.features, /noreferrer/);

  await page.locator("#candidate-file").setInputFiles(demoWav);
  await page.locator("#comparison-result[data-analysis-state='ready']").waitFor({ timeout: 45_000 });
  assert.equal(await page.locator("#comparison-components tbody tr").count(), 6);
  assert.match(await page.locator("#comparison-coverage").textContent(), /100/);
  assert.match(await page.locator("#similarity-class").textContent(), /过近风险/);
  assert.match(await page.locator("#comparison-legal-note").textContent(), /不是侵权判断或法律保证/);
  assert.match(await page.locator("#next-advice").textContent(), /只调整/);
  assert.equal(await page.locator("#reference-player").getAttribute("src").then(value => value.startsWith("blob:")), true);
  assert.equal(await page.locator("#candidate-player").getAttribute("src").then(value => value.startsWith("blob:")), true);
  await page.locator("#reference-player").evaluate(audio => audio.play());
  await page.locator("#candidate-player").evaluate(audio => audio.play());
  assert.equal(await page.locator("#reference-player").evaluate(audio => audio.paused), true);

  await page.locator("#license-source").selectOption("Freesound");
  await page.locator("#license-url").fill("https://freesound.org/s/12345/");
  await page.locator("#license-name").fill("CC0");
  await page.locator("#license-hash").fill(expectedWavSha256);
  await page.locator("#license-author").fill("Synthetic Fixture");
  await page.locator("#license-date").fill("2026-08-30");
  await page.locator("#license-form button[type='submit']").click();
  await page.locator("#license-list .license-entry").waitFor();
  assert.match(await page.locator("#license-list").textContent(), /CC0/);
  assert.match(await page.locator("#license-list").textContent(), /仍请核对来源页面/);

  const jsonDownloadPromise = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const jsonDownload = await jsonDownloadPromise;
  const exportedText = await readFile(await jsonDownload.path(), "utf8");
  const exported = JSON.parse(exportedText);
  assert.equal(exported.batches[0].status, "submitted");
  assert.equal(exported.references[0].hash, expectedWavSha256);
  assert.equal(exported.licenses[0].category, "cc0");
  assert.doesNotMatch(exportedText, /demo-reference\.wav|blob:|audioBytes|apiKey|cookie|token|[A-Z]:\\|\/Users\//i);

  const markdownDownloadPromise = page.waitForEvent("download");
  await page.locator("#export-markdown").click();
  const markdownDownload = await markdownDownloadPromise;
  const markdown = await readFile(await markdownDownload.path(), "utf8");
  assert.match(markdown, /# 循环乐工房项目交接/);
  assert.match(markdown, /CC0/);
  assert.doesNotMatch(markdown, /demo-reference\.wav|blob:|audioBytes|apiKey|cookie|token|[A-Z]:\\|\/Users\//i);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("body[data-ready='true']").waitFor();
  assert.equal(await page.locator(".batch-card[data-axis='baseline'] .batch-status").inputValue(), "submitted");
  assert.equal(await page.locator("#license-list .license-entry").count(), 1);
  assert.equal(await page.locator("#reference-list [data-analysis-state='ready']").count(), 1);
  assert.doesNotMatch(await page.locator("#reference-list").textContent(), /demo-reference\.wav/);

  await page.locator("#import-project").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...exported, batches: exported.batches.slice(0, 4) }))
  });
  await page.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("导入失败"));
  assert.equal(await page.locator(".batch-card[data-axis='baseline'] .batch-status").inputValue(), "submitted");
  assert.equal(await page.locator("#license-list .license-entry").count(), 1);

  const validImport = structuredClone(exported);
  validImport.batches[0].status = "planned";
  validImport.extensions = { transferredBy: "browser-smoke" };
  await page.locator("#import-project").setInputFiles({
    name: "valid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(validImport))
  });
  await page.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("已完整导入"));
  assert.equal(await page.locator(".batch-card[data-axis='baseline'] .batch-status").inputValue(), "planned");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).extensions.transferredBy), "browser-smoke");
  await assertNoOverflow(page, "1440x900");
  assert.deepEqual(errors, []);
  await page.close();

  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 360, height: 800 }
  ]) {
    const responsivePage = await browser.newPage({ viewport });
    const responsiveErrors = observeErrors(responsivePage);
    await installInterceptors(responsivePage);
    await responsivePage.emulateMedia({ reducedMotion: "reduce" });
    const responsiveResponse = await responsivePage.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
    assert.equal(responsiveResponse?.status(), 200);
    await responsivePage.locator("body[data-ready='true']").waitFor();
    assert.equal(await responsivePage.locator("main > section").count(), 6);
    await assertNoOverflow(responsivePage, `${viewport.width}x${viewport.height}`);
    const motion = await responsivePage.locator(".primary-button").first().evaluate(element => {
      const toSeconds = value => value.endsWith("ms") ? Number.parseFloat(value) / 1000 : Number.parseFloat(value);
      return {
        animationSeconds: toSeconds(getComputedStyle(element).animationDuration),
        transitionSeconds: toSeconds(getComputedStyle(element).transitionDuration)
      };
    });
    assert.ok(motion.animationSeconds <= 0.000001, JSON.stringify(motion));
    assert.ok(motion.transitionSeconds <= 0.000001, JSON.stringify(motion));
    assert.deepEqual(responsiveErrors, []);
    await responsivePage.close();
  }

  const storagePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const storageErrors = observeErrors(storagePage);
  await installInterceptors(storagePage, { failStorage: true });
  await storagePage.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
  await storagePage.locator("body[data-ready='true']").waitFor();
  await storagePage.locator(".batch-card[data-axis='baseline'] .batch-status").selectOption("submitted");
  assert.match(await storagePage.locator("#storage-warning").textContent(), /当前会话仍可继续.*导出 JSON/);
  assert.equal(await storagePage.locator(".batch-card[data-axis='baseline'] .batch-status").inputValue(), "submitted");
  assert.deepEqual(storageErrors, []);
  await storagePage.close();
} finally {
  await browser.close();
  server.close();
}

console.log("Verified Loop BGM Lab workflow, persistence, import/export, licensing, privacy, reduced motion, and 4 responsive viewports with zero browser errors.");
