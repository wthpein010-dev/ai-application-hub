import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const demoWav = join(root, "projects", "loop-bgm-lab", "assets", "demo-reference.wav");
const expectedWavSha256 = "f6168016f3659617d48662cca4d8013eb6eac2b21f3b7e17f7d23108b4985d5f";
const demoWavBytes = await readFile(demoWav);
const demoFile = { name: "demo-reference.wav", mimeType: "audio/wav", buffer: demoWavBytes };
const differentWav = Buffer.from(demoWavBytes);
differentWav.writeUInt32LE(37_800, 24);
differentWav.writeUInt32LE(75_600, 28);
const expectedDifferentSha256 = createHash("sha256").update(differentWav).digest("hex");
const differentFile = { name: "different-reference.wav", mimeType: "audio/wav", buffer: differentWav };
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
    if ((request.url || "").split("?", 1)[0] === "/__response-monitor-redirect") {
      response.writeHead(302, { location: "/projects/loop-bgm-lab/index.html" }).end();
      return;
    }
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
  const observation = { errors: [], blobAborts: [], revokedUrls: new Set() };
  page.on("console", message => {
    if (message.type() === "error") observation.errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", error => observation.errors.push(`page: ${error.message}`));
  page.on("requestfailed", request => {
    const failure = request.failure()?.errorText || "failed";
    if (request.url().startsWith("blob:") && failure.includes("ERR_ABORTED")) {
      observation.blobAborts.push({ url: request.url(), failure });
      return;
    }
    observation.errors.push(`request: ${request.url()} ${failure}`);
  });
  page.on("response", response => {
    if (response.status() < 200 || response.status() >= 300) observation.errors.push(`response: ${response.url()} ${response.status()}`);
  });
  return observation;
}

async function installInterceptors(page, observation, { clearOnce = false, failStorage = false } = {}) {
  await page.exposeFunction("__reportRevokedObjectUrl", url => observation.revokedUrls.add(String(url)));
  await page.addInitScript(({ clearOnce, failStorage }) => {
    if (clearOnce && !sessionStorage.getItem("loop-bgm-smoke-ready")) {
      localStorage.clear();
      sessionStorage.setItem("loop-bgm-smoke-ready", "true");
    }
    window.__externalOpens = [];
    window.__copiedText = "";
    window.__createdObjectUrls = [];
    window.__revokedObjectUrls = [];
    window.__pendingRevocationReports = [];
    window.__decodeStarted = 0;
    window.__decodeCompleted = 0;
    window.__delayNextDecode = false;
    window.__returnOversizedDecodedBuffer = false;
    window.__sampleExtractions = 0;
    const createObjectUrl = URL.createObjectURL.bind(URL);
    const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = value => {
      const url = createObjectUrl(value);
      window.__createdObjectUrls.push(url);
      return url;
    };
    URL.revokeObjectURL = url => {
      window.__revokedObjectUrls.push(String(url));
      window.__pendingRevocationReports.push(window.__reportRevokedObjectUrl(String(url)));
      return revokeObjectUrl(url);
    };
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      const originalDecode = AudioContextClass.prototype.decodeAudioData;
      AudioContextClass.prototype.decodeAudioData = function decodeAudioData(arrayBuffer, ...callbacks) {
        window.__decodeStarted += 1;
        if (window.__returnOversizedDecodedBuffer) {
          window.__returnOversizedDecodedBuffer = false;
          return Promise.resolve({
            duration: 340.14,
            length: 15_000_001,
            numberOfChannels: 2,
            sampleRate: 44_100,
            getChannelData() {
              window.__sampleExtractions += 1;
              throw new Error("sample extraction must not happen for oversized decoded metadata");
            }
          }).finally(() => { window.__decodeCompleted += 1; });
        }
        const decode = () => originalDecode.call(this, arrayBuffer, ...callbacks);
        if (!window.__delayNextDecode) {
          return Promise.resolve(decode()).finally(() => { window.__decodeCompleted += 1; });
        }
        window.__delayNextDecode = false;
        return new Promise((resolveDecode, rejectDecode) => {
          window.setTimeout(() => Promise.resolve(decode()).then(resolveDecode, rejectDecode), 300);
        }).finally(() => { window.__decodeCompleted += 1; });
      };
    }
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

async function assertNoObservedErrors(page, observation) {
  await page.evaluate(() => Promise.all(window.__pendingRevocationReports || []));
  const unexpectedBlobAborts = observation.blobAborts
    .filter(item => !observation.revokedUrls.has(item.url))
    .map(item => `request: ${item.url} ${item.failure}`);
  assert.deepEqual([...observation.errors, ...unexpectedBlobAborts], []);
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

async function assertPickerKeyboardFocus(page, precedingSelector, inputId) {
  await page.locator(precedingSelector).focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), inputId);
  const focusStyle = await page.locator(`label[for='${inputId}']`).evaluate(label => {
    const style = getComputedStyle(label);
    return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
  });
  assert.notEqual(focusStyle.outlineStyle, "none", `${inputId} picker label has no focus outline`);
  assert.ok(focusStyle.outlineWidth >= 2, `${inputId} picker label outline is too thin: ${JSON.stringify(focusStyle)}`);
}

async function addLicense(page, { suffix, license = "CC0", hash = expectedWavSha256 }) {
  await page.locator("#license-source").selectOption("Freesound");
  await page.locator("#license-url").fill(`https://freesound.org/s/${suffix}/`);
  await page.locator("#license-name").fill(license);
  await page.locator("#license-hash").fill(hash);
  await page.locator("#license-author").fill(`Synthetic Fixture ${suffix}`);
  await page.locator("#license-date").fill("2026-08-30");
  await page.locator("#license-form button[type='submit']").click();
}

try {
  const responseProbePage = await browser.newPage();
  const responseProbeErrors = observeErrors(responseProbePage);
  await responseProbePage.goto(`${origin}/__response-monitor-redirect`, { waitUntil: "networkidle" });
  assert.ok(
    responseProbeErrors.errors.some(error => error === `response: ${origin}/__response-monitor-redirect 302`),
    "the browser error collector must flag controlled 3xx responses"
  );
  await responseProbePage.close();

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = observeErrors(page);
  await installInterceptors(page, errors, { clearOnce: true });
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

  await assertPickerKeyboardFocus(page, "#suno-create-link", "reference-files");
  await assertPickerKeyboardFocus(page, ".batch-card:last-child .open-suno", "candidate-file");
  await assertPickerKeyboardFocus(page, "#export-markdown", "import-project");

  await page.locator("#reference-files").setInputFiles([demoWav, demoWav]);
  await page.waitForFunction(() => document.querySelector("#reference-progress")?.textContent.includes("2 个成功"), null, { timeout: 45_000 });
  const duplicateReferenceUrls = await page.evaluate(() => [...window.__createdObjectUrls]);
  assert.ok(duplicateReferenceUrls.length >= 2);

  const raceStart = await page.evaluate(() => ({ started: window.__decodeStarted, completed: window.__decodeCompleted }));
  await page.evaluate(() => { window.__delayNextDecode = true; });
  await page.locator("#reference-files").setInputFiles(demoWav);
  await page.waitForFunction(started => window.__decodeStarted > started, raceStart.started);
  await page.locator("#reference-files").setInputFiles(differentFile);
  await page.waitForFunction(completed => window.__decodeCompleted >= completed + 2, raceStart.completed, { timeout: 45_000 });
  await page.waitForFunction(hash => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).references[0]?.hash === hash, expectedDifferentSha256);
  await page.waitForFunction(() => document.querySelectorAll("#reference-list [data-analysis-state='ready']").length === 1);
  assert.equal(await page.evaluate(urls => urls.every(url => window.__revokedObjectUrls.includes(url)), duplicateReferenceUrls), true);
  assert.match(await page.locator("#reference-list").textContent(), /different-reference\.wav/);
  assert.match(await page.locator("#reference-list").textContent(), new RegExp(expectedDifferentSha256.slice(0, 12)));
  assert.match(await page.locator("#aggregate-summary").textContent(), /BPM/);

  const aggregatedState = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")));
  assert.ok(Math.abs(aggregatedState.references[0].analysis.tempo.bpm - 112) >= 8, "different fixture must have a deliberately different detected tempo");
  assert.notEqual(aggregatedState.references[0].analysis.key.name, "D minor", "different fixture must have a deliberately different detected key");
  assert.equal(aggregatedState.styleSpec.tempo.target, Math.round(aggregatedState.references[0].analysis.tempo.bpm));
  assert.equal(aggregatedState.styleSpec.key, aggregatedState.references[0].analysis.key.name);
  assert.equal(Number(await page.locator("#style-tempo").inputValue()), aggregatedState.styleSpec.tempo.target);
  assert.equal(await page.locator("#style-key").inputValue(), aggregatedState.styleSpec.key);
  const aggregatedPrompt = await page.locator(".batch-card[data-axis='baseline'] .prompt-text").textContent();
  assert.match(aggregatedPrompt, new RegExp(`${aggregatedState.styleSpec.key}.*around ${aggregatedState.styleSpec.tempo.target} BPM`));
  assert.doesNotMatch(aggregatedPrompt, /D minor.*around 112 BPM/);

  await page.locator("#reference-files").setInputFiles([differentFile, demoFile]);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).references.length === 2, null, { timeout: 45_000 });
  const beforeAutomaticDeletion = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")));
  const selectedTempoIndex = beforeAutomaticDeletion.references.findIndex(reference => (
    Math.round(reference.analysis.tempo.bpm) === beforeAutomaticDeletion.styleSpec.tempo.target
  ));
  assert.notEqual(selectedTempoIndex, -1);
  const removedAutomaticHash = beforeAutomaticDeletion.references[selectedTempoIndex].hash;
  const expectedAutomaticReference = beforeAutomaticDeletion.references.find(reference => reference.hash !== removedAutomaticHash);
  const automaticPromptsBefore = await page.locator(".batch-card .prompt-text").allTextContents();
  await page.locator("#reference-list .analysis-item")
    .filter({ hasText: removedAutomaticHash.slice(0, 12) })
    .locator("button")
    .click();
  await page.waitForFunction(({ hash, target }) => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return stored.references.length === 1
      && stored.references[0].hash === hash
      && stored.styleSpec.tempo.target === target;
  }, { hash: expectedAutomaticReference.hash, target: Math.round(expectedAutomaticReference.analysis.tempo.bpm) });
  const afterAutomaticDeletion = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")));
  assert.equal(afterAutomaticDeletion.styleSpec.key, expectedAutomaticReference.analysis.key.name);
  assert.equal(await page.locator("#style-key").inputValue(), expectedAutomaticReference.analysis.key.name);
  assert.equal(Number(await page.locator("#style-tempo").inputValue()), Math.round(expectedAutomaticReference.analysis.tempo.bpm));
  const automaticPromptsAfter = await page.locator(".batch-card .prompt-text").allTextContents();
  assert.equal(automaticPromptsAfter.length, 5);
  assert.ok(automaticPromptsAfter.every(prompt => prompt.includes(`${expectedAutomaticReference.analysis.key.name}, around ${Math.round(expectedAutomaticReference.analysis.tempo.bpm)} BPM`)));
  assert.notDeepEqual(automaticPromptsAfter, automaticPromptsBefore, "deleting the aggregate-defining reference must rebuild all prompts");

  await page.locator("#reference-list .analysis-item").first().locator("button").click();
  await page.waitForFunction(() => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return stored.references.length === 0
      && stored.styleSpec.key === "D minor"
      && stored.styleSpec.tempo.target === 112;
  });
  assert.equal(await page.locator("#style-key").inputValue(), "D minor");
  assert.equal(await page.locator("#style-tempo").inputValue(), "112");
  const emptyReferencePrompts = await page.locator(".batch-card .prompt-text").allTextContents();
  assert.equal(emptyReferencePrompts.length, 5);
  assert.ok(emptyReferencePrompts.every(prompt => prompt.includes("D minor, around 112 BPM")));

  const automaticKey = await page.locator("#style-key").inputValue();
  await page.locator("#style-key").fill(automaticKey);
  await page.locator("#style-tempo").fill("120");
  await page.locator("#style-form button[type='submit']").click();
  await page.waitForFunction(() => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return stored.styleSpec.tempo.target === 120
      && stored.extensions.styleOverrides?.tempo === true
      && stored.extensions.styleOverrides?.key === false;
  });
  await page.locator("#reference-files").setInputFiles([demoFile, differentFile]);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).references.length === 2, null, { timeout: 45_000 });
  await page.locator("#reference-list .analysis-item")
    .filter({ hasText: expectedWavSha256.slice(0, 12) })
    .locator("button")
    .click();
  await page.waitForFunction(hash => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return stored.references.length === 1 && stored.references[0].hash === hash;
  }, expectedDifferentSha256);
  const afterOverrideDeletion = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")));
  assert.equal(afterOverrideDeletion.styleSpec.tempo.target, 120, "explicit tempo override must survive deletion recomputation");
  assert.equal(afterOverrideDeletion.styleSpec.key, afterOverrideDeletion.references[0].analysis.key.name, "non-overridden key must still recompute");
  assert.deepEqual(afterOverrideDeletion.extensions.styleOverrides, { key: false, tempo: true });
  const overridePrompts = await page.locator(".batch-card .prompt-text").allTextContents();
  assert.equal(overridePrompts.length, 5);
  assert.ok(overridePrompts.every(prompt => prompt.includes(`${afterOverrideDeletion.styleSpec.key}, around 120 BPM`)));

  const liveAudioUrls = await page.evaluate(() => {
    const active = new Set([document.querySelector("#reference-player")?.src, document.querySelector("#candidate-player")?.src].filter(url => url?.startsWith("blob:")));
    return window.__createdObjectUrls.filter(url => !window.__revokedObjectUrls.includes(url) && !active.has(url));
  });
  assert.deepEqual(liveAudioUrls, [], "all displaced or temporary audio object URLs must be revoked");

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

  const candidateRaceStart = await page.evaluate(() => ({ started: window.__decodeStarted, completed: window.__decodeCompleted }));
  await page.evaluate(() => { window.__delayNextDecode = true; });
  await page.locator("#candidate-file").setInputFiles(demoWav);
  await page.waitForFunction(started => window.__decodeStarted > started, candidateRaceStart.started);
  await page.locator("#candidate-file").setInputFiles(differentFile);
  await page.waitForFunction(completed => window.__decodeCompleted >= completed + 2, candidateRaceStart.completed, { timeout: 45_000 });
  await page.waitForFunction(hash => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).candidates[0]?.hash === hash, expectedDifferentSha256);
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

  const validCandidateHash = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).candidates[0].hash);
  await page.evaluate(() => { window.__returnOversizedDecodedBuffer = true; });
  await page.locator("#candidate-file").setInputFiles(demoWav);
  await page.waitForFunction(() => document.querySelector("#app-error")?.textContent.includes("采样总量"), null, { timeout: 45_000 });
  assert.equal(await page.evaluate(() => window.__sampleExtractions), 0, "oversized decoded metadata must be rejected before getChannelData");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).candidates[0].hash), validCandidateHash);

  await addLicense(page, { suffix: "12345" });
  await page.locator("#license-list .license-entry").waitFor();
  assert.match(await page.locator("#license-list").textContent(), /CC0/);
  assert.match(await page.locator("#license-list").textContent(), /仍请核对来源页面/);
  await addLicense(page, { suffix: "12346", hash: expectedDifferentSha256 });
  const firstTwoLicenseIds = await page.locator("#license-list .license-entry").evaluateAll(items => items.map(item => item.dataset.licenseId));
  assert.equal(new Set(firstTwoLicenseIds).size, 2);
  await page.locator("#license-list .license-entry").first().locator("button").click();
  assert.equal(await page.locator("#license-list .license-entry").count(), 1);
  await addLicense(page, { suffix: "12347" });
  const replacementLicenseIds = await page.locator("#license-list .license-entry").evaluateAll(items => items.map(item => item.dataset.licenseId));
  assert.equal(new Set(replacementLicenseIds).size, 2);
  assert.notEqual(replacementLicenseIds[0], replacementLicenseIds[1]);
  await page.locator("#license-list .license-entry").first().locator("button").click();
  assert.equal(await page.locator("#license-list .license-entry").count(), 1, "one removal must remove exactly one license record");
  assert.equal(await page.locator("#license-list .license-entry").first().getAttribute("data-license-id"), replacementLicenseIds[1]);

  const jsonDownloadPromise = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const jsonDownload = await jsonDownloadPromise;
  const exportedText = await readFile(await jsonDownload.path(), "utf8");
  const exported = JSON.parse(exportedText);
  assert.equal(exported.batches[0].status, "submitted");
  assert.equal(exported.references[0].hash, expectedDifferentSha256);
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

  const storedBeforeMaliciousImport = await page.evaluate(() => localStorage.getItem("loop-bgm-lab-v1"));
  const maliciousImport = structuredClone(exported);
  maliciousImport.extensions = {
    privateFileName: "C:\\Users\\Alice\\private-reference.wav",
    nested: { playbackUrl: "blob:http://127.0.0.1/private-audio" }
  };
  await page.locator("#import-project").setInputFiles({
    name: "malicious.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(maliciousImport))
  });
  await page.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("导入失败"));
  assert.equal(await page.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), storedBeforeMaliciousImport, "rejected import must be atomic before persistence");
  assert.equal(await page.locator(".batch-card[data-axis='baseline'] .batch-status").inputValue(), "submitted");

  const postRejectJsonPromise = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const postRejectJson = await readFile(await (await postRejectJsonPromise).path(), "utf8");
  assert.doesNotMatch(postRejectJson, /private-reference\.wav|blob:http|C:\\Users\\Alice/i);
  const postRejectMarkdownPromise = page.waitForEvent("download");
  await page.locator("#export-markdown").click();
  const postRejectMarkdown = await readFile(await (await postRejectMarkdownPromise).path(), "utf8");
  assert.doesNotMatch(postRejectMarkdown, /private-reference\.wav|blob:http|C:\\Users\\Alice/i);

  const validImport = structuredClone(exported);
  validImport.batches[0].status = "planned";
  validImport.extensions = { transferredBy: "browser-smoke" };
  validImport.candidates[0].displayName = "欢乐版本 A";
  validImport.currentBestCandidate = { displayName: "欢乐版本 A", hash: expectedDifferentSha256 };
  await page.locator("#import-project").setInputFiles({
    name: "valid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(validImport))
  });
  await page.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("已完整导入"));
  assert.equal(await page.locator(".batch-card[data-axis='baseline'] .batch-status").inputValue(), "planned");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).extensions.transferredBy), "browser-smoke");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).currentBestCandidate.displayName), "欢乐版本 A");
  const labelledJsonPromise = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const labelledJson = await readFile(await (await labelledJsonPromise).path(), "utf8");
  assert.match(labelledJson, /欢乐版本 A/);
  const labelledMarkdownPromise = page.waitForEvent("download");
  await page.locator("#export-markdown").click();
  const labelledMarkdown = await readFile(await (await labelledMarkdownPromise).path(), "utf8");
  assert.match(labelledMarkdown, /欢乐版本 A/);
  await assertNoOverflow(page, "1440x900");
  await assertNoObservedErrors(page, errors);
  await page.close();

  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 360, height: 800 }
  ]) {
    const responsivePage = await browser.newPage({ viewport });
    const responsiveErrors = observeErrors(responsivePage);
    await installInterceptors(responsivePage, responsiveErrors);
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
    await assertNoObservedErrors(responsivePage, responsiveErrors);
    await responsivePage.close();
  }

  const storagePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const storageErrors = observeErrors(storagePage);
  await installInterceptors(storagePage, storageErrors, { failStorage: true });
  await storagePage.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
  await storagePage.locator("body[data-ready='true']").waitFor();
  await storagePage.locator(".batch-card[data-axis='baseline'] .batch-status").selectOption("submitted");
  assert.match(await storagePage.locator("#storage-warning").textContent(), /当前会话仍可继续.*导出 JSON/);
  assert.equal(await storagePage.locator(".batch-card[data-axis='baseline'] .batch-status").inputValue(), "submitted");
  await assertNoObservedErrors(storagePage, storageErrors);
  await storagePage.close();
} finally {
  await browser.close();
  server.close();
}

console.log("Verified Loop BGM Lab workflow, persistence, import/export, licensing, privacy, reduced motion, and 4 responsive viewports with zero browser errors.");
