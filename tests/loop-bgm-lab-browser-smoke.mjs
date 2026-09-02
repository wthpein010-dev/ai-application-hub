import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { compareCandidate, recommendNextVariant } from "../projects/loop-bgm-lab/core/candidate-score.mjs";
import {
  recordCreateRun,
  updateRunOutputs,
  validateProject,
} from "../projects/loop-bgm-lab/core/project-state.mjs";
import {
  CURRENT_OFFICIAL_API_EVIDENCE,
  evaluateOfficialApiReadiness,
} from "../projects/loop-bgm-lab/core/suno-official-adapter.mjs";

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
const invalidCandidateFile = { name: "broken-candidate.txt", mimeType: "text/plain", buffer: Buffer.from("not audio") };
const excessCandidateFiles = Array.from({ length: 9 }, (_, index) => ({
  name: `excess-candidate-${index + 1}.wav`,
  mimeType: "audio/wav",
  buffer: Buffer.from("not a wav")
}));
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

async function installInterceptors(page, observation, {
  clearOnce = false,
  failStorage = false,
  failNextProjectStorageWrite = false
} = {}) {
  await page.exposeFunction("__reportRevokedObjectUrl", url => observation.revokedUrls.add(String(url)));
  await page.addInitScript(({ clearOnce, failStorage, failNextProjectStorageWrite }) => {
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
    window.__delayNextDecodeMs = 300;
    window.__returnOversizedDecodedBuffer = false;
    window.__sampleExtractions = 0;
    window.__fileTextReads = 0;
    const originalFileText = File.prototype.text;
    File.prototype.text = function countedFileText(...args) {
      window.__fileTextReads += 1;
      return originalFileText.apply(this, args);
    };
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
          window.setTimeout(() => Promise.resolve(decode()).then(resolveDecode, rejectDecode), window.__delayNextDecodeMs);
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
    window.__failNextProjectStorageWrite = failNextProjectStorageWrite;
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key) {
      if (key === "loop-bgm-lab-v1" && (failStorage || window.__failNextProjectStorageWrite)) {
        window.__failNextProjectStorageWrite = false;
        throw new DOMException("quota blocked", "QuotaExceededError");
      }
      return originalSet.call(this, ...arguments);
    };
  }, { clearOnce, failStorage, failNextProjectStorageWrite });
}

async function assertNoObservedErrors(page, observation) {
  await page.evaluate(() => Promise.all(window.__pendingRevocationReports || []));
  const activeBlobUrls = new Set(await page.evaluate(() => [
    document.querySelector("#reference-player")?.src,
    document.querySelector("#candidate-player")?.src
  ].filter(url => url?.startsWith("blob:"))));
  const unexpectedBlobAborts = observation.blobAborts
    .filter(item => !observation.revokedUrls.has(item.url) && !activeBlobUrls.has(item.url))
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

const expectedOfficialReadiness = evaluateOfficialApiReadiness(CURRENT_OFFICIAL_API_EVIDENCE);
const expectedOfficialStatus = "0/6 项已证实，官方 API 自动生成未启用";
const expectedDownloadNotice = "Suno 公告称消费者下载限制将于 2026-09-03 生效；这不是 API 下载契约，使用前请复核官方页面。";
const forbiddenApiState = /platform\.suno\.com|officialApiEvidence|apiRun|credentials|authorization|apiSecret|apiKey|cookie|token|blob:|[A-Z]:\\|\/Users\//i;

function assertNoOfficialApiState(value, label) {
  assert.doesNotMatch(String(value), forbiddenApiState, `${label} must not retain official API readiness, credentials, or local paths`);
}

async function assertOfficialReadinessCard(page, { singleColumn }) {
  assert.equal(await page.locator("#suno-api-status").count(), 1, "#suno-api-status must exist");
  assert.equal(await page.locator("#suno-api-status").textContent(), expectedOfficialStatus);
  assert.deepEqual(
    await page.locator("#suno-api-checklist li").allTextContents(),
    expectedOfficialReadiness.blockers.map(blocker => `未证实：${blocker}`),
  );
  assert.equal(await page.locator("#suno-api-action").isDisabled(), true);
  assert.equal(await page.locator("#suno-platform-link").getAttribute("href"), "https://platform.suno.com/");
  assert.equal(await page.locator("#daily-queue #suno-api-readiness").count(), 1);
  assert.equal(await page.locator("#suno-api-readiness").isVisible(), true);
  assert.equal(await page.locator("#suno-api-status").isVisible(), true);
  assert.equal(await page.locator("#suno-api-readiness .api-download-notice").textContent(), expectedDownloadNotice);
  assert.equal(await page.locator("main > section").count(), 6);
  const layout = await page.locator("#suno-api-readiness").evaluate(card => ({
    display: getComputedStyle(card).display,
    tracks: getComputedStyle(card).gridTemplateColumns.split(" ").filter(Boolean).length,
  }));
  assert.notEqual(layout.display, "none");
  assert.equal(layout.tracks === 1, singleColumn, `unexpected readiness grid at this viewport: ${JSON.stringify(layout)}`);
}

async function addLicense(page, {
  suffix,
  license = "CC0 1.0",
  licenseIdentifier = "CC0-1.0",
  licenseUrl = "https://creativecommons.org/publicdomain/zero/1.0/",
  hash = expectedWavSha256,
  rightsChainStatus = "independently-verified",
  source = "Freesound",
} = {}) {
  const sourceUrl = `https://freesound.org/s/${suffix}/`;
  await page.locator("#license-source").selectOption(source);
  await page.locator("#license-url").fill(sourceUrl);
  await page.locator("#license-name").fill(license);
  await page.locator("#license-identifier").fill(licenseIdentifier);
  await page.locator("#license-license-url").fill(licenseUrl);
  await page.locator("#license-evidence-url").fill(sourceUrl);
  await page.locator("#license-evidence-date").fill("2026-08-30");
  await page.locator("#license-delivery-status").selectOption("original");
  await page.locator("#license-rights-chain-status").selectOption(rightsChainStatus);
  await page.locator("#license-scope-note").fill("Covers the exact analyzed audio bytes.");
  await page.locator("#license-hash").fill(hash);
  await page.locator("#license-author").fill(`Synthetic Fixture ${suffix}`);
  await page.locator("#license-date").fill("2026-08-30");
  await page.locator("#license-form button[type='submit']").click();
}

function licensePackageEntry({
  id = "license-package-a",
  hash = "a".repeat(64),
  author = "Package Fixture",
  rightsChainStatus = "source-declaration-only",
} = {}) {
  return {
    id,
    source: "OpenGameArt",
    sourceUrl: "https://opengameart.org/content/package-fixture",
    license: "CC0 1.0",
    licenseIdentifier: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    evidenceUrl: "https://opengameart.org/content/package-fixture",
    evidenceCheckedAt: "2026-09-01",
    deliveryStatus: "original",
    scopeNote: "Exact analyzed bytes only.",
    rightsChainStatus,
    fileSha256: hash,
    attributionText: "Package Fixture — CC0 1.0",
    author,
    downloadedAt: "2026-09-01",
  };
}

function licensePackageDocument(entries = [licensePackageEntry()]) {
  return JSON.stringify({
    format: "loop-bgm-license-package",
    version: 1,
    createdAt: "2026-09-02",
    entries,
  });
}

function externalManifestDocument({ hash = "d".repeat(64) } = {}) {
  return JSON.stringify({
    schemaVersion: 3,
    verifiedDate: "2026-09-01",
    collection: {
      workCount: 1,
      fileCount: 1,
      originalAttachmentCount: 1,
      auditionPreviewCount: 0,
    },
    analysis: { schemaVersion: 3 },
    licenseReferences: { "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/" },
    licenseReview: {
      scope: "Exact analyzed bytes only.",
      rightsChainAssurance: "source-declaration-only",
    },
    privacyReview: {
      userReferenceAudioIncluded: false,
      absoluteLocalPathsIncluded: false,
      cookiesTokensOrCredentialsIncluded: false,
    },
    works: [{
      workId: "manifest-fixture",
      title: "Manifest Fixture",
      author: "Manifest Author",
      sourcePage: "https://opengameart.org/content/manifest-fixture",
      assetLicense: {
        identifier: "CC0-1.0",
        evidenceUrl: "https://opengameart.org/content/manifest-fixture",
        verifiedDate: "2026-09-01",
        scopeNote: "Exact source attachment.",
      },
      files: [{
        sha256: hash,
        deliveryStatus: "original-attachment",
      }],
    }],
  });
}

function versionTwoLegacyFixture(project) {
  const migrated = structuredClone(project);
  migrated.version = 2;
  migrated.licenses = [];
  migrated.candidates = migrated.candidates.map(candidate => {
    const { candidateSource: _candidateSource, ...legacyCandidate } = candidate;
    return legacyCandidate;
  });
  return migrated;
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

  assert.deepEqual(await page.locator("#candidate-source-kind option").evaluateAll(options => options.map(option => option.value)), [
    "suno", "external", "local-original"
  ]);
  assert.equal(await page.locator("#candidate-source-kind").inputValue(), "suno");

  assert.equal(await page.title(), "循环乐工房");
  await assertOfficialReadinessCard(page, { singleColumn: false });
  assertNoOfficialApiState(await page.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), "initial localStorage");
  assert.equal(await page.locator("main > section").count(), 6);
  assert.equal(await page.locator(".batch-card").count(), 5);
  assert.deepEqual(await page.locator(".batch-card").evaluateAll(cards => cards.map(card => card.dataset.axis)), [
    "baseline", "melodyTimbre", "rhythm", "percussion", "loopStructure"
  ]);
  assert.deepEqual(await page.locator(".axis-label").allTextContents(), ["基线", "旋律音色", "律动", "打击乐", "循环结构"]);

  await assertPickerKeyboardFocus(page, ".rights-card a[href='https://suno.com/terms']", "reference-files");
  await page.locator(".batch-card:last-child .record-create-run").focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "candidate-source-kind");
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
  assert.deepEqual(afterOverrideDeletion.extensions.styleOverrides, { bars: false, key: false, tempo: true });
  assert.equal(Object.hasOwn(afterOverrideDeletion.references[0], "displayName"), false, "a local private filename must not become a durable displayName");
  const referenceNameEditor = page.locator("#reference-list .reference-display-name");
  assert.match(await referenceNameEditor.evaluate(input => input.labels?.[0]?.textContent || ""), /导出显示名/);
  await referenceNameEditor.fill("参考节奏 A");
  await referenceNameEditor.press("Tab");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).references[0]?.displayName === "参考节奏 A");
  assert.match(await page.locator("#app-live").textContent(), /显示名已保存/);
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
  await page.waitForFunction(() => document.querySelector("#app-error")?.textContent.includes("登记本次 Create"));
  assert.deepEqual(await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return { status: stored.batches[0].status, runCount: stored.runs.length };
  }), { status: "planned", runCount: 0 }, "the status dropdown must not create a run");

  await page.locator(".batch-card[data-axis='baseline'] .record-create-run").click();
  await page.waitForFunction(() => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return stored.version === 3
      && stored.runs?.length === 1
      && stored.batches[0].currentRunId === stored.runs[0].id
      && stored.runs[0].outputs.length === 0
      && stored.runs[0].generationConditions.styleSpec.tempo.target === 120;
  }, null, { timeout: 5_000 });
  const firstRecordedRun = await page.evaluate(() => structuredClone(JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).runs[0]));
  const firstRunPanel = page.locator(`.create-run-panel[data-run-id='${firstRecordedRun.id}']`);
  assert.equal(await firstRunPanel.locator(".create-output-card").count(), 2);
  await firstRunPanel.locator(".create-output-url").first().fill("https://suno.com/song/browser-smoke-link-only");
  await firstRunPanel.locator(".create-output-url").first().press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("create-output-score")), true, "saving a run URL must preserve forward keyboard focus");
  await page.waitForFunction(firstRunId => {
    const run = JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).runs.find(item => item.id === firstRunId);
    return run?.outputs[0]?.generatedUrl === "https://suno.com/song/browser-smoke-link-only";
  }, firstRecordedRun.id);
  await page.locator("#style-tempo").fill("126");
  await page.locator("#style-form button[type='submit']").click();
  await page.waitForFunction(firstRunId => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return stored.styleSpec.tempo.target === 126
      && stored.batches[0].prompt.includes("around 126 BPM")
      && stored.batches[0].status === "planned"
      && stored.batches[0].currentRunId === null
      && stored.batches[0].currentCandidateId === null
      && stored.batches[0].candidateHash === null
      && stored.batches[0].generationConditions === null
      && stored.batches[0].generatedUrl === null
      && stored.runs.length === 1
      && stored.runs[0].id === firstRunId
      && stored.runs[0].outputs[0].generatedUrl === "https://suno.com/song/browser-smoke-link-only"
      && stored.runs[0].generationConditions.styleSpec.tempo.target === 120;
  }, firstRecordedRun.id);
  await page.locator(".search-link[data-source='Pixabay Music']").click();
  const searchOpen = await page.evaluate(() => window.__externalOpens.at(-1));
  assert.match(searchOpen.url, /^https:\/\/pixabay\.com\/music\/search/);
  assert.match(searchOpen.features, /noopener/);
  assert.match(searchOpen.features, /noreferrer/);

  await page.locator(".batch-card[data-axis='baseline'] .record-create-run").click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).runs.length === 2);
  const secondRecordedRun = await page.evaluate(() => structuredClone(JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).runs[1]));
  assert.notEqual(secondRecordedRun.id, firstRecordedRun.id);
  assert.equal(secondRecordedRun.generationConditions.styleSpec.tempo.target, 126);
  const secondRunPanel = page.locator(`.create-run-panel[data-run-id='${secondRecordedRun.id}']`);
  await secondRunPanel.locator(".create-output-url").nth(0).fill("https://suno.com/song/browser-smoke-a");
  await secondRunPanel.locator(".create-output-url").nth(0).press("Tab");
  await page.waitForFunction(runId => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).runs.find(run => run.id === runId)?.outputs.length === 1, secondRecordedRun.id);
  await secondRunPanel.locator(".create-output-url").nth(1).fill("https://suno.com/song/browser-smoke-b");
  await secondRunPanel.locator(".create-output-url").nth(1).press("Tab");
  await page.waitForFunction(runId => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).runs.find(run => run.id === runId)?.outputs.length === 2, secondRecordedRun.id);

  await page.locator("#candidate-batch").selectOption("batch-1");
  assert.equal(await page.locator("#candidate-file").isDisabled(), true, "candidate input must stay disabled until a run is explicitly selected");
  await page.locator("#candidate-run").selectOption(secondRecordedRun.id);
  assert.equal(await page.locator("#candidate-file").isDisabled(), true, "Suno input must stay disabled until an existing output is selected");
  await page.locator("#candidate-output").selectOption("0");
  assert.equal(await page.locator("#candidate-file").isDisabled(), false);
  await page.locator("#candidate-batch").focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "candidate-run");
  await page.locator("#candidate-file").setInputFiles(differentFile);
  await page.waitForFunction(runId => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return stored.candidates.length === 1
      && stored.candidates[0].candidateSource?.kind === "suno"
      && stored.candidates[0].candidateSource?.runId === runId
      && stored.candidates[0].candidateSource?.outputIndex === 0
      && stored.experiments[0].outputIndex === 0
      && stored.experiments[0].generatedUrl === "https://suno.com/song/browser-smoke-a";
  }, secondRecordedRun.id, { timeout: 45_000 });
  await page.locator("#candidate-output").selectOption("1");
  await assertPickerKeyboardFocus(page, "#candidate-output", "candidate-file");
  await page.locator("#candidate-file").setInputFiles(demoFile);
  await page.waitForFunction(runId => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return stored.candidates.length === 2
      && stored.experiments.length === 2
      && stored.runs.length === 2
      && stored.experiments.every(experiment => experiment.runId === runId)
      && stored.experiments[0].outputIndex === 0
      && stored.experiments[1].outputIndex === 1
      && stored.candidates[1].candidateSource?.outputIndex === 1;
  }, secondRecordedRun.id, { timeout: 45_000 });
  await page.locator("#comparison-result[data-analysis-state='ready']").waitFor({ timeout: 45_000 });
  assert.equal(await page.locator("#comparison-components tbody tr").count(), 6);
  assert.equal(await page.locator("#comparison-coverage").textContent(), "80%");
  assert.match(await page.locator("#similarity-class").textContent(), /人工复核/);
  assert.match(await page.locator("#comparison-legal-note").textContent(), /不是侵权判断或法律保证/);
  assert.match(await page.locator("#next-advice").textContent(), /只调整/);
  assert.equal(await page.locator("#candidate-history .candidate-history-item").count(), 2);
  const importedCandidates = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return {
      first: structuredClone(stored.candidates[0]),
      second: structuredClone(stored.candidates[1]),
      experimentCount: stored.experiments.length,
      currentBestCandidate: stored.currentBestCandidate
    };
  });
  const firstCandidate = importedCandidates.first;
  const secondCandidateId = importedCandidates.second.id;
  assert.equal(importedCandidates.experimentCount, 2);
  assert.equal(importedCandidates.currentBestCandidate, null, "analysis must not silently promote a candidate to best");
  assert.deepEqual([firstCandidate.hash, importedCandidates.second.hash], [expectedDifferentSha256, expectedWavSha256]);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).experiments[0].generationConditions), secondRecordedRun.generationConditions);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).experiments[0].runId), secondRecordedRun.id);
  assert.equal(await page.evaluate(() => Object.hasOwn(JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).candidates[0], "displayName")), false);

  const firstHistory = page.locator(`.candidate-history-item[data-candidate-id='${firstCandidate.id}']`);
  assert.match(await firstHistory.locator(".candidate-source-badge").textContent(), /Suno/);
  assert.equal(await firstHistory.locator(".candidate-publication-badge").getAttribute("data-status"), "blocked");
  assert.match(await firstHistory.locator(".candidate-blocker-badge").allTextContents().then(values => values.join(" ")), /missing-license-evidence/);
  const candidateNameEditor = firstHistory.locator(".candidate-display-name");
  assert.match(await candidateNameEditor.evaluate(input => input.labels?.[0]?.textContent || ""), /导出显示名/);
  await candidateNameEditor.fill("欢乐版本 A");
  await candidateNameEditor.press("Tab");
  await page.waitForFunction(candidateId => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).candidates.find(item => item.id === candidateId)?.displayName === "欢乐版本 A", firstCandidate.id);
  assert.doesNotMatch(await page.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), /different-reference\.wav/);
  assert.equal(await firstHistory.locator(".candidate-generated-url").evaluate(input => input.readOnly), true);
  assert.equal(await firstHistory.locator(".candidate-output-binding").isDisabled(), true);
  assert.equal(await firstHistory.locator(".candidate-output-binding").inputValue(), "0");
  await firstHistory.locator(".candidate-subjective-score").selectOption("4");
  await firstHistory.locator(".candidate-review-note").fill("旋律动机和编曲层次仍与参考过近，拒绝本轮。");
  await firstHistory.locator(".candidate-review-note").press("Tab");
  await firstHistory.locator(".candidate-disposition").selectOption("rejected");
  await firstHistory.locator(".candidate-best").check();
  await page.waitForFunction(candidateId => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    const candidate = stored.candidates.find(item => item.id === candidateId);
    const batch = stored.batches.find(item => item.id === candidate.batchId);
    const experiment = stored.experiments.find(item => item.candidateId === candidateId);
    const run = stored.runs.find(item => item.id === experiment.runId);
    return stored.currentBestCandidate?.candidateId === candidateId
      && batch.currentCandidateId !== candidateId
      && experiment.generatedUrl === "https://suno.com/song/browser-smoke-a"
      && experiment.subjectiveScore === 4
      && experiment.disposition === "rejected"
      && experiment.reviewNote.includes("拒绝本轮")
      && run.outputs[0].disposition === "rejected";
  }, firstCandidate.id);

  const secondHistory = page.locator(`.candidate-history-item[data-candidate-id='${secondCandidateId}']`);
  assert.equal(await secondHistory.locator(".candidate-output-binding").isDisabled(), true);
  assert.equal(await secondHistory.locator(".candidate-output-binding").inputValue(), "1");
  await secondHistory.locator(".candidate-subjective-score").selectOption("5");
  await secondHistory.locator(".candidate-review-note").fill("循环衔接更自然，保留本轮。");
  await secondHistory.locator(".candidate-review-note").press("Tab");
  await secondHistory.locator(".candidate-disposition").selectOption("accepted");
  await page.waitForFunction(candidateId => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    const experiment = stored.experiments.find(item => item.candidateId === candidateId);
    const batch = stored.batches[0];
    return experiment?.outputIndex === 1
      && experiment.generatedUrl === "https://suno.com/song/browser-smoke-b"
      && experiment.subjectiveScore === 5
      && experiment.disposition === "accepted"
      && batch.currentCandidateId === candidateId
      && batch.generatedUrl === experiment.generatedUrl
      && batch.disposition === experiment.disposition;
  }, secondCandidateId);

  const firstPlaybackUrl = await page.locator("#candidate-player").getAttribute("src");
  await page.locator("#candidate-file").setInputFiles([invalidCandidateFile, differentFile]);
  await page.waitForFunction(({ hash, runId }) => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return stored.candidates.length === 3
      && stored.experiments.length === 3
      && stored.runs.length === 2
      && stored.candidates.at(-1).hash === hash
      && stored.experiments.at(-1).runId === runId
      && stored.experiments.at(-1).outputIndex === 1
      && stored.candidates.at(-1).candidateSource?.outputIndex === 1;
  }, { hash: expectedDifferentSha256, runId: secondRecordedRun.id }, { timeout: 45_000 });
  assert.match(await page.locator("#candidate-progress").textContent(), /1 个成功，1 个失败.*broken-candidate\.txt/);
  const candidateHistory = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return {
      candidateCount: stored.candidates.length,
      experimentCount: stored.experiments.length,
      lastBatchId: stored.candidates.at(-1).batchId,
      bestId: stored.currentBestCandidate?.candidateId,
      currentCandidateId: stored.batches[0].currentCandidateId
    };
  });
  const thirdCandidateId = candidateHistory.currentCandidateId;
  assert.deepEqual(candidateHistory, {
    candidateCount: 3,
    experimentCount: 3,
    lastBatchId: "batch-1",
    bestId: firstCandidate.id,
    currentCandidateId: thirdCandidateId
  });
  assert.equal(await page.locator("#candidate-history .candidate-history-item").count(), 3);
  assert.equal(await page.evaluate(url => window.__revokedObjectUrls.includes(url), firstPlaybackUrl), true, "only the displaced playback URL should be revoked");
  const thirdHistory = page.locator(`.candidate-history-item[data-candidate-id='${thirdCandidateId}']`);
  assert.equal(await thirdHistory.locator(".candidate-hash").evaluate(input => input.readOnly), true);
  assert.equal(await thirdHistory.locator(".candidate-hash").inputValue(), expectedDifferentSha256);
  assert.deepEqual(await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return {
      hashes: stored.candidates.map(candidate => candidate.hash),
      currentCandidateId: stored.batches[0].currentCandidateId,
      bestCandidateId: stored.currentBestCandidate.candidateId,
      experimentRunIds: stored.experiments.map(experiment => experiment.runId),
      experimentOutputIndexes: stored.experiments.map(experiment => experiment.outputIndex),
      runIds: stored.runs.map(run => run.id),
    };
  }), {
    hashes: [expectedDifferentSha256, expectedWavSha256, expectedDifferentSha256],
    currentCandidateId: thirdCandidateId,
    bestCandidateId: firstCandidate.id,
    experimentRunIds: [secondRecordedRun.id, secondRecordedRun.id, secondRecordedRun.id],
    experimentOutputIndexes: [0, 1, 1],
    runIds: [firstRecordedRun.id, secondRecordedRun.id],
  });
  assert.doesNotMatch(await page.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), /broken-candidate\.txt|different-reference\.wav|demo-reference\.wav/);
  assert.equal(await page.locator("#reference-player").getAttribute("src").then(value => value.startsWith("blob:")), true);
  assert.equal(await page.locator("#candidate-player").getAttribute("src").then(value => value.startsWith("blob:")), true);
  await page.locator("#reference-player").evaluate(audio => audio.play());
  await page.locator("#candidate-player").evaluate(audio => audio.play());
  assert.equal(await page.locator("#reference-player").evaluate(audio => audio.paused), true);

  const decodeCountBeforeExcess = await page.evaluate(() => window.__decodeStarted);
  await page.locator("#candidate-file").setInputFiles(excessCandidateFiles);
  await page.waitForFunction(() => document.querySelector("#app-error")?.textContent.includes("一次最多选择 8 个候选文件"));
  assert.equal(await page.evaluate(() => window.__decodeStarted), decodeCountBeforeExcess, "more than eight files must fail before decode");

  const validCandidateSnapshot = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return { count: stored.candidates.length, hash: stored.candidates.at(-1).hash };
  });
  await page.evaluate(() => { window.__returnOversizedDecodedBuffer = true; });
  await page.locator("#candidate-file").setInputFiles(demoWav);
  await page.waitForFunction(() => document.querySelector("#app-error")?.textContent.includes("采样总量"), null, { timeout: 45_000 });
  assert.equal(await page.evaluate(() => window.__sampleExtractions), 0, "oversized decoded metadata must be rejected before getChannelData");
  assert.deepEqual(await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return { count: stored.candidates.length, hash: stored.candidates.at(-1).hash };
  }), validCandidateSnapshot);

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

  const stateBeforeDeepReject = await page.evaluate(() => localStorage.getItem("loop-bgm-lab-v1"));
  const activeCandidateUrl = await page.locator("#candidate-player").getAttribute("src");
  const deepMalformedImport = JSON.parse(stateBeforeDeepReject);
  deepMalformedImport.candidates.at(-1).comparison.components = {};
  await page.locator("#import-project").setInputFiles({
    name: "deep-malformed.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(deepMalformedImport))
  });
  await page.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("导入失败"));
  assert.equal(await page.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), stateBeforeDeepReject, "deep schema rejection must preserve persisted state");
  assert.equal(await page.locator("#candidate-player").getAttribute("src"), activeCandidateUrl, "staged rejection must preserve active playback");
  assert.equal(await page.evaluate(url => window.__revokedObjectUrls.includes(url), activeCandidateUrl), false, "staged rejection must not revoke live playback");
  assert.equal(await page.locator("#candidate-history .candidate-history-item").count(), 3);

  await page.locator("#remove-candidate").click();
  assert.equal(await page.locator("#candidate-player").getAttribute("src"), null);
  assert.equal(await page.locator("#remove-candidate").isHidden(), true);
  assert.deepEqual(await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return { candidates: stored.candidates.length, experiments: stored.experiments.length };
  }), { candidates: 3, experiments: 3 }, "clearing temporary playback must retain review history");

  const jsonDownloadPromise = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const jsonDownload = await jsonDownloadPromise;
  const exportedText = await readFile(await jsonDownload.path(), "utf8");
  const exported = JSON.parse(exportedText);
  assert.equal(exported.version, 3);
  assert.equal(exported.batches[0].status, "downloaded");
  assert.equal(exported.references[0].hash, expectedDifferentSha256);
  assert.equal(exported.licenses[0].category, "cc0");
  assert.equal(exported.candidates.length, 3);
  assert.equal(exported.experiments.length, 3);
  assert.equal(exported.batches[0].generatedUrl, "https://suno.com/song/browser-smoke-b");
  assert.equal(exported.experiments[0].generatedUrl, "https://suno.com/song/browser-smoke-a");
  assert.equal(exported.experiments[1].generatedUrl, "https://suno.com/song/browser-smoke-b");
  assert.equal(exported.experiments[2].outputIndex, 1);
  assert.equal(exported.runs.length, 2);
  assert.equal(exported.runs[0].id, firstRecordedRun.id);
  assert.equal(exported.runs[0].outputs[0].generatedUrl, "https://suno.com/song/browser-smoke-link-only");
  assert.equal(exported.runs[1].outputs.length, 2);
  assert.equal(exported.experiments[0].generationConditions.batchId, "batch-1");
  assert.equal(exported.experiments[0].generationConditions.changedAxis, "baseline");
  assert.equal(exported.experiments[0].generationConditions.prompt, secondRecordedRun.generationConditions.prompt);
  assert.deepEqual(exported.batches[0].generationConditions, exported.runs[1].generationConditions);
  assert.equal(exported.batches[0].currentCandidateId, thirdCandidateId);
  assert.deepEqual(exported.experiments[0].referenceBasis, exported.candidates[0].referenceBasis);
  assert.match(exportedText, /参考节奏 A/);
  assert.match(exportedText, /欢乐版本 A/);
  assert.doesNotMatch(exportedText, /demo-reference\.wav|different-reference\.wav|blob:|audioBytes|apiKey|cookie|token|[A-Z]:\\|\/Users\//i);
  assertNoOfficialApiState(exportedText, "JSON export");

  const markdownDownloadPromise = page.waitForEvent("download");
  await page.locator("#export-markdown").click();
  const markdownDownload = await markdownDownloadPromise;
  const markdown = await readFile(await markdownDownload.path(), "utf8");
  assert.match(markdown, /# 循环乐工房项目交接/);
  assert.match(markdown, /CC0/);
  assert.match(markdown, /https:\/\/suno\.com\/song\/browser-smoke-a/);
  assert.match(markdown, /https:\/\/suno\.com\/song\/browser-smoke-b/);
  assert.match(markdown, /实验历史/);
  assert.match(markdown, /生成运行快照/);
  assert.match(markdown, new RegExp(firstRecordedRun.id));
  assert.match(markdown, /拒绝本轮/);
  assert.match(markdown, /"generationConditions"/);
  assert.doesNotMatch(markdown, /demo-reference\.wav|blob:|audioBytes|apiKey|cookie|token|[A-Z]:\\|\/Users\//i);
  assertNoOfficialApiState(markdown, "Markdown export");
  assertNoOfficialApiState(await page.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), "localStorage after export");

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("body[data-ready='true']").waitFor();
  await assertOfficialReadinessCard(page, { singleColumn: false });
  assert.equal(await page.locator(".batch-card[data-axis='baseline'] .batch-status").inputValue(), "downloaded");
  assert.equal(await page.locator("#license-list .license-entry").count(), 1);
  assert.equal(await page.locator("#reference-list [data-analysis-state='ready']").count(), 1);
  assert.equal(await page.locator("#candidate-history .candidate-history-item").count(), 3);
  assert.doesNotMatch(await page.locator("#reference-list").textContent(), /demo-reference\.wav/);
  assert.match(await page.locator("#reference-list").textContent(), /参考节奏 A/);

  await page.locator("#import-project").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...exported, batches: exported.batches.slice(0, 4) }))
  });
  await page.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("导入失败"));
  assert.equal(await page.locator(".batch-card[data-axis='baseline'] .batch-status").inputValue(), "downloaded");
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
  assert.equal(await page.locator(".batch-card[data-axis='baseline'] .batch-status").inputValue(), "downloaded");

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
  validImport.currentBestCandidate = {
    candidateId: validImport.candidates[0].id,
    displayName: "欢乐版本 A",
    hash: expectedDifferentSha256
  };
  const lowEvidenceCandidate = validImport.candidates.at(-1);
  const lowEvidenceExperiment = validImport.experiments.find(item => item.candidateId === lowEvidenceCandidate.id);
  lowEvidenceCandidate.referenceBasis.tempo.confidence = 0.29;
  lowEvidenceCandidate.referenceBasis.key.confidence = 0.09;
  lowEvidenceCandidate.analysis.tempo.confidence = 0.29;
  lowEvidenceCandidate.analysis.key.confidence = 0.09;
  lowEvidenceCandidate.comparison = compareCandidate(lowEvidenceCandidate.referenceBasis, lowEvidenceCandidate.analysis);
  lowEvidenceCandidate.similarityClass = "insufficient";
  lowEvidenceCandidate.advice = recommendNextVariant(lowEvidenceCandidate.comparison);
  lowEvidenceExperiment.referenceBasis = structuredClone(lowEvidenceCandidate.referenceBasis);
  lowEvidenceExperiment.comparison = structuredClone(lowEvidenceCandidate.comparison);
  lowEvidenceExperiment.advice = structuredClone(lowEvidenceCandidate.advice);
  validImport.nextRoundSuggestion = structuredClone(lowEvidenceCandidate.advice);
  await page.locator("#import-project").setInputFiles({
    name: "valid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(validImport))
  });
  await page.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("已完整导入"));
  assert.equal(await page.locator(".batch-card[data-axis='baseline'] .batch-status").inputValue(), "planned");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).extensions.transferredBy), "browser-smoke");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).currentBestCandidate.displayName), "欢乐版本 A");
  assert.equal(await page.locator("#similarity-class").textContent(), "证据不足");
  assert.equal(await page.locator("#next-advice").textContent(), "有效特征覆盖率低于 70%，证据不足；请补充可用分析数据后再判断。");
  assert.doesNotMatch(await page.locator("#next-advice").textContent(), /loopStructure|melodyTimbre|rhythm|percussion|差异最明显/);
  assert.equal(await page.locator("#comparison-coverage").textContent(), "—");
  assert.equal(await page.locator("#comparison-similarity").textContent(), "—");
  assert.equal(await page.locator("#comparison-components tbody tr").count(), 0);
  const labelledJsonPromise = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const labelledJson = await readFile(await (await labelledJsonPromise).path(), "utf8");
  assert.match(labelledJson, /欢乐版本 A/);
  const labelledMarkdownPromise = page.waitForEvent("download");
  await page.locator("#export-markdown").click();
  const labelledMarkdown = await readFile(await (await labelledMarkdownPromise).path(), "utf8");
  assert.match(labelledMarkdown, /欢乐版本 A/);

  const markdownHandoffContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, acceptDownloads: true });
  const markdownHandoffPage = await markdownHandoffContext.newPage();
  const markdownHandoffErrors = observeErrors(markdownHandoffPage);
  await installInterceptors(markdownHandoffPage, markdownHandoffErrors, { clearOnce: true });
  await markdownHandoffPage.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
  await markdownHandoffPage.locator("body[data-ready='true']").waitFor();
  await markdownHandoffPage.locator("#import-project").setInputFiles({
    name: "loop-bgm-lab-handoff.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(labelledMarkdown)
  });
  await markdownHandoffPage.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("Markdown"));
  assert.match(await markdownHandoffPage.locator("#candidate-history").textContent(), /欢乐版本 A/);
  assert.equal(await markdownHandoffPage.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).version), 3);
  await assertNoObservedErrors(markdownHandoffPage, markdownHandoffErrors);
  await markdownHandoffContext.close();

  // Regression: startup must not replace the only readable future/invalid payload
  // before an explicit JSON or Markdown import has validated and rendered.
  const quarantinedStorageContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const quarantinedStoragePage = await quarantinedStorageContext.newPage();
  const quarantinedStorageErrors = observeErrors(quarantinedStoragePage);
  await quarantinedStoragePage.addInitScript(() => {
    localStorage.setItem("loop-bgm-lab-v1", JSON.stringify({ version: 99, preserved: "future-state" }));
  });
  await installInterceptors(quarantinedStoragePage, quarantinedStorageErrors);
  await quarantinedStoragePage.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
  await quarantinedStoragePage.locator("body[data-ready='true']").waitFor();
  const protectedPayload = JSON.stringify({ version: 99, preserved: "future-state" });
  await quarantinedStoragePage.locator("#style-key").fill("D major");
  await quarantinedStoragePage.locator("#style-form").press("Enter");
  assert.equal(
    await quarantinedStoragePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")),
    protectedPayload,
    "ordinary edits must not overwrite a readable but invalid/future stored payload"
  );
  assert.match(await quarantinedStoragePage.locator("#storage-warning").textContent(), /本地存储中的项目状态无效/);
  assert.doesNotMatch(await quarantinedStoragePage.locator("#storage-warning").textContent(), /不可用/);

  const corruptedMarkdown = labelledMarkdown.replace(/sha256=[a-f0-9]{64}/, `sha256=${"0".repeat(64)}`);
  assert.notEqual(corruptedMarkdown, labelledMarkdown, "test fixture must corrupt the Task 1 Markdown checksum");
  await quarantinedStoragePage.locator("#import-project").setInputFiles({
    name: "corrupted-loop-bgm-lab-handoff.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(corruptedMarkdown)
  });
  await quarantinedStoragePage.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("导入失败"));
  assert.equal(
    await quarantinedStoragePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")),
    protectedPayload,
    "a failed Markdown import must leave protected stored bytes untouched"
  );

  await quarantinedStoragePage.locator("#import-project").setInputFiles({
    name: "valid-loop-bgm-lab-handoff.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(labelledMarkdown)
  });
  await quarantinedStoragePage.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("已完整导入 Markdown"));
  assert.equal(await quarantinedStoragePage.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).version), 3);
  assert.equal(await quarantinedStoragePage.locator("#storage-warning").isHidden(), true);
  await assertNoObservedErrors(quarantinedStoragePage, quarantinedStorageErrors);
  await quarantinedStorageContext.close();

  // Regression: an existing empty string is invalid stored state, not a missing key.
  const emptyStorageContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const emptyStoragePage = await emptyStorageContext.newPage();
  const emptyStorageErrors = observeErrors(emptyStoragePage);
  await emptyStoragePage.addInitScript(() => {
    localStorage.setItem("loop-bgm-lab-v1", "");
  });
  await installInterceptors(emptyStoragePage, emptyStorageErrors);
  await emptyStoragePage.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
  await emptyStoragePage.locator("body[data-ready='true']").waitFor();
  assert.equal(
    await emptyStoragePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")),
    "",
    "startup must quarantine an existing empty string byte-for-byte"
  );
  assert.match(await emptyStoragePage.locator("#storage-warning").textContent(), /本地存储中的项目状态无效/);
  await emptyStoragePage.locator("#style-key").fill("E minor");
  await emptyStoragePage.locator("#style-form").press("Enter");
  assert.equal(
    await emptyStoragePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")),
    "",
    "ordinary edits must preserve a quarantined empty string"
  );
  await emptyStoragePage.locator("#import-project").setInputFiles({
    name: "corrupted-empty-storage-handoff.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(corruptedMarkdown)
  });
  await emptyStoragePage.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("导入失败"));
  assert.equal(
    await emptyStoragePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")),
    "",
    "a failed import must preserve a quarantined empty string"
  );
  await emptyStoragePage.locator("#import-project").setInputFiles({
    name: "valid-empty-storage-handoff.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(labelledMarkdown)
  });
  await emptyStoragePage.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("已完整导入 Markdown"));
  assert.equal(await emptyStoragePage.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).version), 3);
  assert.equal(await emptyStoragePage.locator("#storage-warning").isHidden(), true);
  await assertNoObservedErrors(emptyStoragePage, emptyStorageErrors);
  await emptyStorageContext.close();

  // Regression: a failed explicit-import write must retain quarantine after storage recovers.
  const failedQuarantinedImportContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const failedQuarantinedImportPage = await failedQuarantinedImportContext.newPage();
  const failedQuarantinedImportErrors = observeErrors(failedQuarantinedImportPage);
  await failedQuarantinedImportPage.addInitScript(() => {
    localStorage.setItem("loop-bgm-lab-v1", JSON.stringify({ version: 99, preserved: "future-state" }));
  });
  await installInterceptors(failedQuarantinedImportPage, failedQuarantinedImportErrors, { failNextProjectStorageWrite: true });
  await failedQuarantinedImportPage.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
  await failedQuarantinedImportPage.locator("body[data-ready='true']").waitFor();
  const failedCommitProtectedPayload = JSON.stringify({ version: 99, preserved: "future-state" });
  await failedQuarantinedImportPage.locator("#import-project").setInputFiles({
    name: "write-fails-loop-bgm-lab-handoff.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(labelledMarkdown)
  });
  await failedQuarantinedImportPage.waitForFunction(() => document.querySelector("#import-status")?.textContent !== "尚未导入项目。");
  assert.equal(
    await failedQuarantinedImportPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")),
    failedCommitProtectedPayload,
    "a failed explicit-import write must retain the original quarantined bytes"
  );
  await failedQuarantinedImportPage.locator("#style-key").fill("A major");
  await failedQuarantinedImportPage.locator("#style-form").press("Enter");
  assert.equal(
    await failedQuarantinedImportPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")),
    failedCommitProtectedPayload,
    "after writes recover, an ordinary edit must still respect the failed import quarantine"
  );
  assert.match(await failedQuarantinedImportPage.locator("#import-status").textContent(), /导入失败/);
  await assertNoObservedErrors(failedQuarantinedImportPage, failedQuarantinedImportErrors);
  await failedQuarantinedImportContext.close();

  // Regression: staged validation must not pause or reset live playback when persistence rejects the import.
  const failedPlaybackImportContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, acceptDownloads: true });
  const failedPlaybackImportPage = await failedPlaybackImportContext.newPage();
  const failedPlaybackImportErrors = observeErrors(failedPlaybackImportPage);
  await installInterceptors(failedPlaybackImportPage, failedPlaybackImportErrors, { clearOnce: true });
  await failedPlaybackImportPage.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
  await failedPlaybackImportPage.locator("body[data-ready='true']").waitFor();
  await failedPlaybackImportPage.locator("#load-demo-reference").click();
  await failedPlaybackImportPage.waitForFunction(() => {
    const audio = document.querySelector("#reference-player");
    return audio?.src.startsWith("blob:") && audio.readyState >= HTMLMediaElement.HAVE_METADATA;
  }, null, { timeout: 45_000 });
  const playbackBeforeFailedImport = await failedPlaybackImportPage.evaluate(async () => {
    const audio = document.querySelector("#reference-player");
    audio.muted = true;
    audio.loop = true;
    audio.playbackRate = 0.25;
    audio.currentTime = Math.min(0.2, audio.duration / 4);
    await audio.play();
    await new Promise(resolve => setTimeout(resolve, 80));
    return {
      src: audio.src,
      currentTime: audio.currentTime,
      paused: audio.paused,
      stored: localStorage.getItem("loop-bgm-lab-v1"),
      styleKey: document.querySelector("#style-key").value,
      referenceCount: document.querySelectorAll("#reference-list [data-analysis-state='ready']").length,
      revokedUrls: [...window.__revokedObjectUrls]
    };
  });
  assert.equal(playbackBeforeFailedImport.paused, false, "the regression fixture must begin with active playback");
  assert.ok(playbackBeforeFailedImport.currentTime > 0, "the regression fixture must begin beyond time zero");
  await failedPlaybackImportPage.evaluate(() => { window.__failNextProjectStorageWrite = true; });
  await failedPlaybackImportPage.locator("#import-project").setInputFiles({
    name: "write-fails-during-playback.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(labelledMarkdown)
  });
  await failedPlaybackImportPage.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("导入失败"));
  const playbackAfterFailedImport = await failedPlaybackImportPage.evaluate(() => {
    const audio = document.querySelector("#reference-player");
    return {
      src: audio.src,
      currentTime: audio.currentTime,
      paused: audio.paused,
      stored: localStorage.getItem("loop-bgm-lab-v1"),
      styleKey: document.querySelector("#style-key").value,
      referenceCount: document.querySelectorAll("#reference-list [data-analysis-state='ready']").length,
      revokedUrls: [...window.__revokedObjectUrls]
    };
  });
  assert.equal(playbackAfterFailedImport.src, playbackBeforeFailedImport.src, "failed import must preserve the active audio source");
  assert.equal(playbackAfterFailedImport.paused, false, "failed import must preserve the playing state");
  assert.ok(
    playbackAfterFailedImport.currentTime >= playbackBeforeFailedImport.currentTime - 0.02,
    "failed import must not reset the playback position"
  );
  assert.ok(
    playbackAfterFailedImport.currentTime - playbackBeforeFailedImport.currentTime < 0.5,
    "playback position may advance naturally but must not jump during failed import"
  );
  assert.deepEqual(playbackAfterFailedImport.revokedUrls, playbackBeforeFailedImport.revokedUrls, "failed import must not revoke object URLs");
  assert.equal(playbackAfterFailedImport.stored, playbackBeforeFailedImport.stored, "failed import must preserve local storage");
  assert.equal(playbackAfterFailedImport.styleKey, playbackBeforeFailedImport.styleKey, "failed import must restore the active project fields");
  assert.equal(playbackAfterFailedImport.referenceCount, playbackBeforeFailedImport.referenceCount, "failed import must restore the active project references");
  const failedPlaybackJsonPromise = failedPlaybackImportPage.waitForEvent("download");
  await failedPlaybackImportPage.locator("#export-json").click();
  const failedPlaybackJson = await readFile(await (await failedPlaybackJsonPromise).path(), "utf8");
  assert.equal(failedPlaybackJson, playbackBeforeFailedImport.stored, "failed import must leave the complete in-memory project unchanged");
  await assertNoObservedErrors(failedPlaybackImportPage, failedPlaybackImportErrors);
  await failedPlaybackImportContext.close();

  await assertNoOverflow(page, "1440x900");
  await assertNoObservedErrors(page, errors);
  await page.close();

  const externalContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const externalPage = await externalContext.newPage();
  const externalErrors = observeErrors(externalPage);
  await installInterceptors(externalPage, externalErrors);
  await externalPage.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
  await externalPage.locator("body[data-ready='true']").waitFor();
  await externalPage.locator("#load-demo-reference").click();
  await externalPage.waitForFunction(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).references.length === 1, null, { timeout: 45_000 });
  await externalPage.locator("#candidate-source-kind").selectOption("external");
  assert.equal(await externalPage.locator("#candidate-run").isDisabled(), true);
  assert.equal(await externalPage.locator("#candidate-output").isDisabled(), true);
  assert.equal(await externalPage.locator("#candidate-file").isDisabled(), false);
  assert.match(await externalPage.locator("#candidate-source-help").textContent(), /无需.*Suno.*恰好一条.*SHA-256/);

  const beforeMissingLicense = await externalPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1"));
  await externalPage.locator("#candidate-file").setInputFiles(demoFile);
  await externalPage.waitForFunction(() => document.querySelector("#candidate-progress")?.textContent.includes("0 个成功，1 个失败"), null, { timeout: 45_000 });
  assert.equal(await externalPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), beforeMissingLicense, "zero matching licenses must not persist a candidate");
  assert.match(await externalPage.locator("#candidate-progress").textContent(), /没有.*许可证|0 条|恰好一条/);

  await addLicense(externalPage, { suffix: "external-exact" });
  const beforeExternalImport = await externalPage.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return { batches: structuredClone(stored.batches), runs: structuredClone(stored.runs) };
  });
  await externalPage.locator("#candidate-file").setInputFiles(demoFile);
  await externalPage.waitForFunction(hash => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    const candidate = stored.candidates[0];
    const experiment = stored.experiments[0];
    return stored.candidates.length === 1
      && candidate.hash === hash
      && candidate.candidateSource?.kind === "external"
      && candidate.candidateSource?.fileSha256 === hash
      && candidate.candidateSource?.licenseId === stored.licenses[0].id
      && experiment.runId === null
      && experiment.outputIndex === null
      && experiment.generatedUrl === null
      && experiment.generationConditions === null;
  }, expectedWavSha256, { timeout: 45_000 });
  assert.deepEqual(await externalPage.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return { batches: stored.batches, runs: stored.runs };
  }), beforeExternalImport, "external candidate analysis must not mutate Suno batches or runs");
  const externalHistory = externalPage.locator("#candidate-history .candidate-history-item").first();
  assert.match(await externalHistory.locator(".candidate-source-badge").textContent(), /外部音乐/);
  assert.match(await externalHistory.locator(".candidate-license-badge").textContent(), /CC0-1\.0/);
  assert.match(await externalHistory.locator(".candidate-license-badge").textContent(), /cc0.*original.*证据已记录.*2026-08-30/);
  assert.equal(await externalHistory.locator(".candidate-publication-badge").getAttribute("data-status"), "review");
  const beforeReferencedLicenseRemoval = await externalPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1"));
  await externalPage.locator("#license-list .license-entry").first().locator("button").click();
  await externalPage.locator("#app-error:not([hidden])").waitFor({ timeout: 1_000 });
  assert.match(await externalPage.locator("#app-error").textContent(), /候选引用|不能移除/);
  assert.equal(await externalPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), beforeReferencedLicenseRemoval, "a referenced license removal must preserve persisted state");
  assert.equal(await externalPage.locator("#license-list .license-entry").count(), 1);
  await externalHistory.locator(".candidate-best").check();
  assert.equal(await externalHistory.locator(".candidate-publication-badge").getAttribute("data-status"), "review", "research favorite must not change publication state");
  await externalHistory.locator(".candidate-disposition").selectOption("accepted");
  await externalPage.waitForFunction(() => document.querySelector(".candidate-publication-badge")?.dataset.status === "ready");
  assert.match(await externalHistory.locator(".candidate-publication-badge").textContent(), /记录门禁通过.*非法律清白/);
  assert.match(await externalPage.locator("#candidate-history").textContent(), /研究最佳.*不代表可发布/);

  await addLicense(externalPage, { suffix: "ambiguous-a", hash: expectedDifferentSha256 });
  await addLicense(externalPage, { suffix: "ambiguous-b", hash: expectedDifferentSha256 });
  const beforeAmbiguousLicense = await externalPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1"));
  await externalPage.locator("#candidate-file").setInputFiles(differentFile);
  await externalPage.waitForFunction(() => document.querySelector("#candidate-progress")?.textContent.includes("0 个成功，1 个失败"), null, { timeout: 45_000 });
  assert.equal(await externalPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), beforeAmbiguousLicense, "multiple matching licenses must not persist a candidate");
  assert.match(await externalPage.locator("#candidate-progress").textContent(), /多条|多个|恰好一条/);

  await externalPage.locator("#candidate-source-kind").selectOption("local-original");
  assert.equal(await externalPage.locator("#candidate-run").isDisabled(), true);
  assert.equal(await externalPage.locator("#candidate-output").isDisabled(), true);
  assert.equal(await externalPage.locator("#candidate-file").isDisabled(), false);
  assert.match(await externalPage.locator("#candidate-source-help").textContent(), /user-declared-original|本人原创/);
  await assertNoObservedErrors(externalPage, externalErrors);
  await externalContext.close();

  const packageContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, acceptDownloads: true });
  const packagePage = await packageContext.newPage();
  const packageErrors = observeErrors(packagePage);
  const packageHttpRequests = [];
  let observePackageNetwork = false;
  packagePage.on("request", request => {
    if (observePackageNetwork && /^https?:/i.test(request.url())) packageHttpRequests.push(request.url());
  });
  await installInterceptors(packagePage, packageErrors);
  await packagePage.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
  await packagePage.locator("body[data-ready='true']").waitFor();
  observePackageNetwork = true;
  assert.equal(await packagePage.locator("#license-package-file").getAttribute("accept"), ".json,application/json");
  assert.equal(await packagePage.locator("#license-package-apply").isDisabled(), true);

  const emptyPackageDownloadPromise = packagePage.waitForEvent("download");
  await packagePage.locator("#license-package-export").click();
  const emptyPackageText = await readFile(await (await emptyPackageDownloadPromise).path(), "utf8");
  const emptyPackageExport = JSON.parse(emptyPackageText);
  assert.equal(emptyPackageExport.format, "loop-bgm-license-package");
  assert.equal(emptyPackageExport.version, 1);
  assert.match(emptyPackageExport.createdAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(emptyPackageExport.entries, []);
  assert.doesNotMatch(emptyPackageText, /originalFile|downloadUrl|finalUrl|\.wav|\.mp3|[A-Z]:\\|\/Users\//i);

  const initialPackageStorage = await packagePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1"));
  const initialTextReads = await packagePage.evaluate(() => window.__fileTextReads);
  await packagePage.locator("#license-package-file").setInputFiles({
    name: "licenses.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("PK fake archive"),
  });
  await packagePage.waitForFunction(() => document.querySelector("#license-package-status")?.textContent.includes("ZIP"));
  assert.equal(await packagePage.evaluate(() => window.__fileTextReads), initialTextReads, "ZIP must be rejected before File.text()");
  assert.equal(await packagePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), initialPackageStorage);

  await packagePage.locator("#license-package-file").setInputFiles({
    name: "too-large.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(1_048_577, 0x20),
  });
  await packagePage.waitForFunction(() => /1 MiB|1048576|过大/.test(document.querySelector("#license-package-status")?.textContent || ""));
  assert.equal(await packagePage.evaluate(() => window.__fileTextReads), initialTextReads, "oversized JSON must be rejected before File.text()");
  assert.equal(await packagePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), initialPackageStorage);

  await packagePage.locator("#license-package-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await packagePage.waitForFunction(() => document.querySelector("#license-package-status")?.textContent.includes("JSON"));
  assert.equal(await packagePage.evaluate(() => window.__fileTextReads), initialTextReads + 1);
  assert.equal(await packagePage.locator("#license-package-apply").isDisabled(), true);
  assert.equal(await packagePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), initialPackageStorage);

  assert.deepEqual(packageHttpRequests, [], "invalid preflight and empty export must make zero HTTP requests");
  observePackageNetwork = false;
  await packagePage.locator("#load-demo-reference").click();
  await packagePage.waitForFunction(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).references.length === 1, null, { timeout: 45_000 });
  await packagePage.locator(".batch-card[data-axis='baseline'] .record-create-run").click();
  const packageRunId = await packagePage.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).batches[0].currentRunId);
  const packageRunPanel = packagePage.locator(`.create-run-panel[data-run-id='${packageRunId}']`);
  await packageRunPanel.locator(".create-output-url").first().fill("https://suno.com/song/package-playback");
  await packageRunPanel.locator(".create-output-url").first().press("Tab");
  await packagePage.waitForFunction(runId => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).runs.find(run => run.id === runId)?.outputs.length === 1, packageRunId);
  await packagePage.locator("#candidate-run").selectOption(packageRunId);
  await packagePage.locator("#candidate-output").selectOption("0");
  await packagePage.locator("#candidate-file").setInputFiles(demoFile);
  await packagePage.waitForFunction(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).candidates.length === 1, null, { timeout: 45_000 });
  await packagePage.waitForFunction(() => [...document.querySelectorAll("audio")].every(audio => Number.isFinite(audio.duration) && audio.duration > 3));
  await packagePage.evaluate(() => {
    const reference = document.querySelector("#reference-player");
    const candidate = document.querySelector("#candidate-player");
    reference.pause();
    candidate.pause();
    reference.currentTime = 1.25;
    candidate.currentTime = 2.5;
  });

  await packagePage.evaluate(() => {
    window.__delayNextDecode = true;
    window.__delayNextDecodeMs = 2_000;
  });
  const decodeStartedBeforePackageApply = await packagePage.evaluate(() => window.__decodeStarted);
  await packagePage.locator("#candidate-file").setInputFiles(differentFile);
  await packagePage.waitForFunction(started => window.__decodeStarted > started, decodeStartedBeforePackageApply);
  packageHttpRequests.length = 0;
  observePackageNetwork = true;
  const packagePreflightSnapshot = await packagePage.evaluate(() => ({
    storage: localStorage.getItem("loop-bgm-lab-v1"),
    createdUrls: [...window.__createdObjectUrls],
    revokedUrls: [...window.__revokedObjectUrls],
    players: [...document.querySelectorAll("audio")].map(audio => ({ src: audio.getAttribute("src"), currentTime: audio.currentTime, paused: audio.paused })),
  }));
  const validPackageText = licensePackageDocument();
  await packagePage.locator("#license-package-file").setInputFiles({
    name: "licenses.json",
    mimeType: "application/json",
    buffer: Buffer.from(validPackageText),
  });
  await packagePage.waitForFunction(() => document.querySelector("#license-package-preview")?.dataset.state === "ready");
  assert.deepEqual(await packagePage.evaluate(() => ({
    storage: localStorage.getItem("loop-bgm-lab-v1"),
    createdUrls: [...window.__createdObjectUrls],
    revokedUrls: [...window.__revokedObjectUrls],
    players: [...document.querySelectorAll("audio")].map(audio => ({ src: audio.getAttribute("src"), currentTime: audio.currentTime, paused: audio.paused })),
  })), packagePreflightSnapshot, "preflight must not mutate project storage, object URLs, or playback");
  assert.equal(await packagePage.locator("#license-package-additions").textContent(), "1");
  assert.equal(await packagePage.locator("#license-package-skips").textContent(), "0");
  assert.equal(await packagePage.locator("#license-package-conflicts").textContent(), "0");
  assert.equal(await packagePage.locator("#license-package-blockers").textContent(), "1");
  assert.match(await packagePage.locator("#license-package-details").textContent(), /license-package-a.*rights-chain-review-required/);
  assert.match(await packagePage.locator("#license-package-status").textContent(), /研究证据.*不等于.*发布.*清白/);
  assert.equal(await packagePage.locator("#license-package-apply").isDisabled(), false);

  await packagePage.locator("#license-package-apply").click();
  await packagePage.waitForFunction(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).licenses.length === 1);
  await packagePage.waitForFunction(started => window.__decodeCompleted >= started + 1, decodeStartedBeforePackageApply);
  assert.equal(await packagePage.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).candidates.length), 1, "successful apply must cancel in-flight candidate analysis");
  const packagePlaybackAfterApply = await packagePage.evaluate(() => [...document.querySelectorAll("audio")].map(audio => ({
    src: audio.getAttribute("src"), currentTime: audio.currentTime, paused: audio.paused,
  })));
  assert.deepEqual(packagePlaybackAfterApply.map(item => [item.src, item.paused]), packagePreflightSnapshot.players.map(item => [item.src, item.paused]));
  assert.ok(packagePlaybackAfterApply.every((item, index) => Math.abs(item.currentTime - packagePreflightSnapshot.players[index].currentTime) < 0.05));

  const appliedPackageDownloadPromise = packagePage.waitForEvent("download");
  await packagePage.locator("#license-package-export").click();
  const appliedPackageText = await readFile(await (await appliedPackageDownloadPromise).path(), "utf8");
  const appliedPackage = JSON.parse(appliedPackageText);
  assert.deepEqual(appliedPackage.entries.map(entry => entry.id), ["license-package-a"]);
  assert.match(appliedPackage.createdAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.doesNotMatch(appliedPackageText, /originalFile|downloadUrl|finalUrl|\.wav|\.mp3|[A-Z]:\\|\/Users\//i);

  await packagePage.locator("#license-package-file").setInputFiles({ name: "same.json", mimeType: "application/json", buffer: Buffer.from(validPackageText) });
  await packagePage.waitForFunction(() => document.querySelector("#license-package-preview")?.dataset.state === "ready");
  assert.equal(await packagePage.locator("#license-package-additions").textContent(), "0");
  assert.equal(await packagePage.locator("#license-package-skips").textContent(), "1");
  assert.equal(await packagePage.locator("#license-package-conflicts").textContent(), "0");

  const storageBeforeConflict = await packagePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1"));
  await packagePage.locator("#license-package-file").setInputFiles({
    name: "conflict.json",
    mimeType: "application/json",
    buffer: Buffer.from(licensePackageDocument([licensePackageEntry({ author: "Conflicting Author" })])),
  });
  await packagePage.waitForFunction(() => document.querySelector("#license-package-preview")?.dataset.state === "conflict");
  assert.equal(await packagePage.locator("#license-package-conflicts").textContent(), "1");
  assert.equal(await packagePage.locator("#license-package-apply").isDisabled(), true);
  assert.match(await packagePage.locator("#license-package-details").textContent(), /conflict|冲突/i);
  assert.equal(await packagePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), storageBeforeConflict);

  const referenceId = await packagePage.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).references[0].id);
  await packagePage.locator("#license-package-file").setInputFiles({
    name: "global-id-conflict.json",
    mimeType: "application/json",
    buffer: Buffer.from(licensePackageDocument([licensePackageEntry({ id: referenceId, hash: "c".repeat(64), rightsChainStatus: "independently-verified" })])),
  });
  await packagePage.waitForFunction(() => document.querySelector("#license-package-preview")?.dataset.state === "conflict");
  assert.equal(await packagePage.locator("#license-package-conflicts").textContent(), "1");
  assert.equal(await packagePage.locator("#license-package-apply").isDisabled(), true, "full-project dry-run must catch global ID collision");
  assert.match(await packagePage.locator("#license-package-details").textContent(), /ID|id|unique|冲突/);
  assert.equal(await packagePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), storageBeforeConflict);

  await packagePage.locator("#license-package-file").setInputFiles({
    name: "external-manifest-v3.json",
    mimeType: "application/json",
    buffer: Buffer.from(externalManifestDocument()),
  });
  await packagePage.waitForFunction(() => document.querySelector("#license-package-preview")?.dataset.state === "ready");
  assert.equal(await packagePage.locator("#license-package-additions").textContent(), "1");
  assert.match(await packagePage.locator("#license-package-status").textContent(), /schemaVersion 3.*预检/);
  assert.match(await packagePage.locator("#license-package-details").textContent(), new RegExp(`license-${"d".repeat(64)}`));
  assert.equal(await packagePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), storageBeforeConflict, "manifest preflight must not persist adapted entries");

  const stalePackageText = licensePackageDocument([licensePackageEntry({ id: "license-stale", hash: "e".repeat(64), rightsChainStatus: "independently-verified" })]);
  await packagePage.locator("#license-package-file").setInputFiles({ name: "stale.json", mimeType: "application/json", buffer: Buffer.from(stalePackageText) });
  await packagePage.waitForFunction(() => document.querySelector("#license-package-preview")?.dataset.state === "ready");
  assert.equal(await packagePage.locator("#license-package-apply").isDisabled(), false);
  await addLicense(packagePage, { suffix: "stale-change", hash: "f".repeat(64) });
  assert.equal(await packagePage.locator("#license-package-apply").isDisabled(), true);
  assert.match(await packagePage.locator("#license-package-status").textContent(), /预检已失效|重新预检/);
  assert.equal(await packagePage.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).licenses.some(entry => entry.id === "license-stale")), false);
  assert.deepEqual(packageHttpRequests, [], "license package preview/apply/export must make zero HTTP requests");
  await assertNoObservedErrors(packagePage, packageErrors);
  await packageContext.close();

  const packageStorageFailureContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const packageStorageFailurePage = await packageStorageFailureContext.newPage();
  const packageStorageFailureErrors = observeErrors(packageStorageFailurePage);
  await installInterceptors(packageStorageFailurePage, packageStorageFailureErrors);
  await packageStorageFailurePage.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
  await packageStorageFailurePage.locator("body[data-ready='true']").waitFor();
  await packageStorageFailurePage.locator("#license-package-file").setInputFiles({ name: "storage-failure.json", mimeType: "application/json", buffer: Buffer.from(validPackageText) });
  await packageStorageFailurePage.waitForFunction(() => document.querySelector("#license-package-preview")?.dataset.state === "ready");
  const beforePackageStorageFailure = await packageStorageFailurePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1"));
  await packageStorageFailurePage.evaluate(() => { window.__failNextProjectStorageWrite = true; });
  await packageStorageFailurePage.locator("#license-package-apply").click();
  await packageStorageFailurePage.waitForFunction(() => /存储|保存|写入/.test(document.querySelector("#license-package-status")?.textContent || ""));
  assert.equal(await packageStorageFailurePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), beforePackageStorageFailure);
  assert.equal(await packageStorageFailurePage.locator("#license-list .license-entry").count(), 0);
  assert.equal(await packageStorageFailurePage.locator("#license-package-apply").isDisabled(), false, "failed persistence keeps a retryable unchanged plan");
  await assertNoObservedErrors(packageStorageFailurePage, packageStorageFailureErrors);
  await packageStorageFailureContext.close();

  const raceContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const racePage = await raceContext.newPage();
  const raceErrors = observeErrors(racePage);
  await installInterceptors(racePage, raceErrors, { clearOnce: true });
  await racePage.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
  await racePage.locator("body[data-ready='true']").waitFor();
  await racePage.locator("#load-demo-reference").click();
  await racePage.waitForFunction(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).references.length === 1, null, { timeout: 45_000 });
  await racePage.locator(".batch-card[data-axis='baseline'] .record-create-run").click();
  const raceRunId = await racePage.evaluate(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).batches[0].currentRunId);
  const raceRunPanel = racePage.locator(`.create-run-panel[data-run-id='${raceRunId}']`);
  await raceRunPanel.locator(".create-output-url").first().fill("https://suno.com/song/race-output");
  await raceRunPanel.locator(".create-output-url").first().press("Tab");
  await racePage.waitForFunction(runId => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).runs.find(run => run.id === runId)?.outputs.length === 1, raceRunId);
  await racePage.locator("#candidate-run").selectOption(raceRunId);
  await racePage.locator("#candidate-output").selectOption("0");
  const candidateRaceStart = await racePage.evaluate(() => ({ started: window.__decodeStarted, completed: window.__decodeCompleted }));
  await racePage.evaluate(() => { window.__delayNextDecode = true; });
  await racePage.locator("#candidate-file").setInputFiles(demoWav);
  await racePage.waitForFunction(started => window.__decodeStarted > started, candidateRaceStart.started);
  await racePage.locator("#candidate-source-kind").selectOption("external");
  await racePage.locator("#candidate-source-kind").selectOption("suno");
  await racePage.locator("#candidate-run").selectOption(raceRunId);
  await racePage.locator("#candidate-output").selectOption("0");
  await racePage.locator("#candidate-file").setInputFiles(differentFile);
  await racePage.waitForFunction(completed => window.__decodeCompleted >= completed + 2, candidateRaceStart.completed, { timeout: 45_000 });
  await racePage.waitForFunction(({ hash, runId }) => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return stored.candidates.length === 1
      && stored.candidates[0].hash === hash
      && stored.runs.length === 1
      && stored.experiments[0].runId === runId
      && stored.experiments[0].outputIndex === 0
      && stored.candidates[0].candidateSource?.outputIndex === 0;
  }, { hash: expectedDifferentSha256, runId: raceRunId });
  assert.doesNotMatch(await racePage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), /demo-reference\.wav|different-reference\.wav/);
  await assertNoObservedErrors(racePage, raceErrors);
  await raceContext.close();

  const originalBatchOne = structuredClone(exported.batches.find(batch => batch.id === "batch-1"));
  let legacyFixtureV3 = recordCreateRun({ ...exported, licenses: [] }, "batch-1");
  const emptySameBatchRunId = legacyFixtureV3.runs.at(-1).id;
  legacyFixtureV3 = validateProject({
    ...legacyFixtureV3,
    batches: legacyFixtureV3.batches.map(batch => batch.id === "batch-1" ? originalBatchOne : batch),
  });
  const originalBatchTwo = structuredClone(legacyFixtureV3.batches.find(batch => batch.id === "batch-2"));
  legacyFixtureV3 = recordCreateRun(legacyFixtureV3, "batch-2");
  const crossBatchRunId = legacyFixtureV3.runs.at(-1).id;
  legacyFixtureV3 = updateRunOutputs(legacyFixtureV3, crossBatchRunId, [{
    generatedUrl: "https://suno.com/song/legacy-cross-batch",
    subjectiveScore: 4,
    reviewNote: "cross-batch fixture",
    disposition: "accepted",
  }]);
  legacyFixtureV3 = validateProject({
    ...legacyFixtureV3,
    batches: legacyFixtureV3.batches.map(batch => batch.id === "batch-2" ? originalBatchTwo : batch),
  });
  const legacyVersionTwo = versionTwoLegacyFixture(legacyFixtureV3);
  const legacyVersionTwoJson = JSON.stringify(legacyVersionTwo);
  const [legacySunoCandidate, legacyExternalCandidate, legacyLocalCandidate] = legacyFixtureV3.candidates;
  const legacyRunCount = legacyFixtureV3.runs.length;
  const legacyBestCandidateId = legacyFixtureV3.currentBestCandidate?.candidateId ?? null;

  const legacyContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const legacyPage = await legacyContext.newPage();
  const legacyErrors = observeErrors(legacyPage);
  await installInterceptors(legacyPage, legacyErrors, { clearOnce: true });
  const legacyHttpRequests = [];
  let observeLegacyNetwork = false;
  legacyPage.on("request", request => {
    if (observeLegacyNetwork && /^https?:/i.test(request.url())) legacyHttpRequests.push(request.url());
  });
  await legacyPage.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
  await legacyPage.locator("body[data-ready='true']").waitFor();
  await legacyPage.locator("#import-project").setInputFiles({
    name: "legacy-v2.json",
    mimeType: "application/json",
    buffer: Buffer.from(legacyVersionTwoJson),
  });
  await legacyPage.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("已完整导入"));
  assert.deepEqual(await legacyPage.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return {
      version: stored.version,
      sources: stored.candidates.map(candidate => candidate.candidateSource.kind),
    };
  }), { version: 3, sources: ["legacy-unknown", "legacy-unknown", "legacy-unknown"] });
  assert.equal(await legacyPage.locator(".legacy-source-confirm").count(), 3);
  assert.equal(await legacyPage.locator(".legacy-source-status").count(), 3);
  assert.deepEqual(await legacyPage.locator(".legacy-source-status").allTextContents(), [
    "旧记录·待确认", "旧记录·待确认", "旧记录·待确认",
  ]);

  await legacyPage.locator("#candidate-batch").selectOption("batch-2");
  await legacyPage.locator("#candidate-run").selectOption(crossBatchRunId);
  await legacyPage.locator("#candidate-output").selectOption("0");
  await legacyPage.locator("#candidate-file").setInputFiles(demoFile);
  await legacyPage.waitForFunction(() => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).candidates.length === 4, null, { timeout: 45_000 });
  await legacyPage.waitForFunction(() => Number.isFinite(document.querySelector("#candidate-player")?.duration));
  await legacyPage.evaluate(() => {
    const candidate = document.querySelector("#candidate-player");
    candidate.pause();
    candidate.currentTime = 1.5;
  });
  assert.equal(await legacyPage.locator(".candidate-history-item").count(), 4);
  assert.equal(await legacyPage.locator(".legacy-source-confirm").count(), 3, "new confirmed candidates must never receive legacy controls");

  const legacyPlaybackSnapshot = await legacyPage.evaluate(() => ({
    createdUrls: [...window.__createdObjectUrls],
    revokedUrls: [...window.__revokedObjectUrls],
    player: {
      src: document.querySelector("#candidate-player")?.getAttribute("src"),
      currentTime: document.querySelector("#candidate-player")?.currentTime,
      paused: document.querySelector("#candidate-player")?.paused,
    },
  }));
  const sunoCard = legacyPage.locator(`.candidate-history-item[data-candidate-id='${legacySunoCandidate.id}']`);
  const sunoConfirm = sunoCard.locator(".legacy-source-confirm");
  const beforeKeyboardOpen = await legacyPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1"));
  await sunoConfirm.focus();
  await legacyPage.keyboard.press("Enter");
  await legacyPage.locator("#legacy-source-dialog").waitFor({ state: "visible" });
  assert.equal(await legacyPage.evaluate(() => document.activeElement?.id), "legacy-source-kind");
  assert.equal(await legacyPage.locator("#legacy-source-kind").inputValue(), "");
  assert.equal(await legacyPage.locator("#legacy-source-run").inputValue(), "");
  assert.equal(await legacyPage.locator("#legacy-source-output").inputValue(), "");
  assert.equal(await legacyPage.locator("#legacy-source-candidate-id").textContent(), legacySunoCandidate.id);
  assert.equal(await legacyPage.locator("#legacy-source-batch-id").textContent(), legacySunoCandidate.batchId);
  assert.equal(await legacyPage.locator("#legacy-source-hash").textContent(), legacySunoCandidate.hash);
  const migratedHistoricalRunId = await legacyPage.evaluate(candidateId => {
    const candidate = JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).candidates.find(item => item.id === candidateId);
    return candidate.candidateSource.legacyRunId;
  }, legacySunoCandidate.id);
  assert.match(await legacyPage.locator("#legacy-source-context").textContent(), new RegExp(`历史上下文.*${migratedHistoricalRunId}.*不代表已确认`));
  assert.equal(await legacyPage.locator("#legacy-source-suno-fields").isHidden(), true);
  assert.equal(await legacyPage.locator("#legacy-source-suno-fields").evaluate(fieldset => fieldset.disabled), true);
  assert.equal(await legacyPage.locator("#legacy-source-license-fields").isHidden(), true);
  assert.equal(await legacyPage.locator("#legacy-source-license-fields").evaluate(fieldset => fieldset.disabled), true);
  assert.equal(await legacyPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), beforeKeyboardOpen);
  await legacyPage.keyboard.press("Escape");
  await legacyPage.locator("#legacy-source-dialog").waitFor({ state: "hidden" });
  assert.equal(await legacyPage.evaluate(() => document.activeElement?.classList.contains("legacy-source-confirm")), true);
  assert.equal(await legacyPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), beforeKeyboardOpen);

  await sunoConfirm.click();
  await legacyPage.locator("#legacy-source-dialog").waitFor({ state: "visible" });
  await legacyPage.locator("#legacy-source-cancel").click();
  await legacyPage.locator("#legacy-source-dialog").waitFor({ state: "hidden" });
  assert.equal(await legacyPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), beforeKeyboardOpen, "cancel must not mutate the project");

  await sunoConfirm.click();
  await legacyPage.locator("#legacy-source-kind").selectOption("suno");
  assert.equal(await legacyPage.locator("#legacy-source-suno-fields").isVisible(), true);
  assert.equal(await legacyPage.locator("#legacy-source-suno-fields").evaluate(fieldset => fieldset.disabled), false);
  assert.equal(await legacyPage.locator("#legacy-source-license-fields").isHidden(), true);
  assert.equal(await legacyPage.locator("#legacy-source-license-fields").evaluate(fieldset => fieldset.disabled), true);
  assert.equal(await legacyPage.locator("#legacy-source-run").inputValue(), "", "historical context must not preselect a run");
  const sameBatchRunIds = legacyFixtureV3.runs
    .filter(run => run.generationConditions.batchId === legacySunoCandidate.batchId)
    .map(run => run.id);
  assert.deepEqual(
    await legacyPage.locator("#legacy-source-run option").evaluateAll(options => options.slice(1).map(option => option.value)),
    sameBatchRunIds,
  );
  assert.equal(await legacyPage.locator(`#legacy-source-run option[value='${crossBatchRunId}']`).count(), 0, "cross-batch runs must not be offered");
  assert.equal(await legacyPage.locator("#legacy-source-submit").isDisabled(), true);
  await legacyPage.locator("#legacy-source-run").selectOption(emptySameBatchRunId);
  assert.equal(await legacyPage.locator("#legacy-source-output").isDisabled(), true, "a run without outputs must remain fail-closed");
  assert.equal(await legacyPage.locator("#legacy-source-submit").isDisabled(), true);
  await legacyPage.locator("#legacy-source-run").selectOption(migratedHistoricalRunId);
  assert.equal(await legacyPage.locator("#legacy-source-output").isDisabled(), false);
  assert.equal(await legacyPage.locator("#legacy-source-output").inputValue(), "", "an existing output must never be auto-selected");
  assert.equal(await legacyPage.locator("#legacy-source-submit").isDisabled(), true);
  await legacyPage.locator("#legacy-source-output").selectOption("0");
  assert.equal(await legacyPage.locator("#legacy-source-submit").isDisabled(), false);
  observeLegacyNetwork = true;
  await legacyPage.locator("#legacy-source-submit").click();
  await legacyPage.locator("#legacy-source-dialog").waitFor({ state: "hidden" });
  const sunoConfirmed = await legacyPage.evaluate(candidateId => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    const candidate = stored.candidates.find(item => item.id === candidateId);
    const experiment = stored.experiments.find(item => item.candidateId === candidateId);
    return {
      candidateSource: candidate.candidateSource,
      experiment: {
        runId: experiment.runId,
        outputIndex: experiment.outputIndex,
        generatedUrl: experiment.generatedUrl,
      },
      runCount: stored.runs.length,
      bestCandidateId: stored.currentBestCandidate?.candidateId ?? null,
    };
  }, legacySunoCandidate.id);
  assert.deepEqual(sunoConfirmed.candidateSource, { kind: "suno", runId: migratedHistoricalRunId, outputIndex: 0 });
  assert.equal(sunoConfirmed.experiment.runId, migratedHistoricalRunId);
  assert.equal(sunoConfirmed.experiment.outputIndex, 0);
  assert.match(sunoConfirmed.experiment.generatedUrl, /^https:\/\/suno\.com\//);
  assert.equal(sunoConfirmed.runCount, legacyRunCount);
  assert.equal(sunoConfirmed.bestCandidateId, legacyBestCandidateId);
  assert.equal(await sunoCard.locator(".legacy-source-confirm").count(), 0);
  assert.doesNotMatch(await sunoCard.textContent(), /source-unconfirmed|旧记录·待确认/);

  const externalCard = legacyPage.locator(`.candidate-history-item[data-candidate-id='${legacyExternalCandidate.id}']`);
  await externalCard.locator(".legacy-source-confirm").click();
  await legacyPage.locator("#legacy-source-kind").selectOption("external");
  assert.equal(await legacyPage.locator("#legacy-source-license-fields").isVisible(), true);
  assert.equal(await legacyPage.locator("#legacy-source-license").isDisabled(), true);
  assert.equal(await legacyPage.locator("#legacy-source-submit").isDisabled(), true);
  assert.match(await legacyPage.locator("#legacy-source-error").textContent(), /没有.*同 SHA-256.*许可证/);
  await legacyPage.locator("#legacy-source-cancel").click();

  await addLicense(legacyPage, { suffix: "legacy-external", hash: legacyExternalCandidate.hash });
  const firstExternalLicenseId = await legacyPage.evaluate(hash => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).licenses.find(entry => entry.fileSha256 === hash)?.id, legacyExternalCandidate.hash);
  await externalCard.locator(".legacy-source-confirm").click();
  await legacyPage.locator("#legacy-source-kind").selectOption("external");
  assert.equal(await legacyPage.locator("#legacy-source-license").inputValue(), "", "a unique license must not be auto-selected");
  assert.deepEqual(await legacyPage.locator("#legacy-source-license option").evaluateAll(options => options.slice(1).map(option => option.value)), [firstExternalLicenseId]);
  await legacyPage.locator("#legacy-source-license").selectOption(firstExternalLicenseId);
  assert.equal(await legacyPage.locator("#legacy-source-submit").isDisabled(), false);
  await legacyPage.evaluate(licenseId => {
    document.querySelector(`.license-entry[data-license-id='${licenseId}'] button`)?.click();
  }, firstExternalLicenseId);
  await legacyPage.waitForFunction(licenseId => !JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).licenses.some(entry => entry.id === licenseId), firstExternalLicenseId);
  const staleLicenseBaseline = await legacyPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1"));
  await legacyPage.locator("#legacy-source-submit").click();
  assert.equal(await legacyPage.locator("#legacy-source-dialog").isVisible(), true, "stale confirmation failure must keep the dialog open");
  assert.match(await legacyPage.locator("#legacy-source-error").textContent(), /不存在|existing license|许可证/);
  assert.equal(await legacyPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), staleLicenseBaseline, "stale license failure must be atomic");
  assert.equal(await legacyPage.evaluate(candidateId => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).candidates.find(item => item.id === candidateId).candidateSource.kind, legacyExternalCandidate.id), "legacy-unknown");
  await legacyPage.locator("#legacy-source-cancel").click();

  await addLicense(legacyPage, { suffix: "legacy-external-replacement", hash: legacyExternalCandidate.hash });
  const externalLicenseId = await legacyPage.evaluate(hash => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).licenses.find(entry => entry.fileSha256 === hash)?.id, legacyExternalCandidate.hash);
  await legacyPage.locator(`.candidate-history-item[data-candidate-id='${legacyExternalCandidate.id}'] .legacy-source-confirm`).click();
  await legacyPage.locator("#legacy-source-kind").selectOption("external");
  await legacyPage.locator("#legacy-source-license").selectOption(externalLicenseId);
  await legacyPage.locator("#legacy-source-submit").click();
  await legacyPage.locator("#legacy-source-dialog").waitFor({ state: "hidden" });
  const externalConfirmed = await legacyPage.evaluate(candidateId => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    const candidate = stored.candidates.find(item => item.id === candidateId);
    const experiment = stored.experiments.find(item => item.candidateId === candidateId);
    return { candidateSource: candidate.candidateSource, experiment, runCount: stored.runs.length };
  }, legacyExternalCandidate.id);
  assert.deepEqual(externalConfirmed.candidateSource, {
    kind: "external",
    licenseId: externalLicenseId,
    fileSha256: legacyExternalCandidate.hash,
  });
  assert.equal(externalConfirmed.experiment.runId, null);
  assert.equal(externalConfirmed.experiment.outputIndex, null);
  assert.equal(externalConfirmed.experiment.generatedUrl, null);
  assert.equal(externalConfirmed.experiment.generationConditions, null);
  assert.equal(externalConfirmed.runCount, legacyRunCount);

  await addLicense(legacyPage, {
    suffix: "legacy-local-wrong-rights",
    hash: legacyLocalCandidate.hash,
    rightsChainStatus: "independently-verified",
  });
  await addLicense(legacyPage, {
    suffix: "legacy-local-original",
    hash: legacyLocalCandidate.hash,
    rightsChainStatus: "user-declared-original",
    source: "循环乐工房内置原创合成素材",
  });
  const localOriginalLicenseId = await legacyPage.evaluate(hash => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).licenses.find(entry => (
    entry.fileSha256 === hash && entry.rightsChainStatus === "user-declared-original"
  ))?.id, legacyLocalCandidate.hash);
  await legacyPage.locator(`.candidate-history-item[data-candidate-id='${legacyLocalCandidate.id}'] .legacy-source-confirm`).click();
  await legacyPage.locator("#legacy-source-kind").selectOption("local-original");
  assert.equal(await legacyPage.locator("#legacy-source-license").inputValue(), "", "a unique rights-compatible local license must not be auto-selected");
  assert.deepEqual(await legacyPage.locator("#legacy-source-license option").evaluateAll(options => options.slice(1).map(option => option.value)), [localOriginalLicenseId]);
  await legacyPage.locator("#legacy-source-license").selectOption(localOriginalLicenseId);
  const beforeStorageFailure = await legacyPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1"));
  await legacyPage.evaluate(() => { window.__failNextProjectStorageWrite = true; });
  await legacyPage.locator("#legacy-source-submit").click();
  assert.equal(await legacyPage.locator("#legacy-source-dialog").isVisible(), true, "storage failure must keep the dialog open");
  assert.match(await legacyPage.locator("#legacy-source-error").textContent(), /存储|保存|写入/);
  assert.equal(await legacyPage.evaluate(() => localStorage.getItem("loop-bgm-lab-v1")), beforeStorageFailure, "storage failure must not replace the persisted project");
  assert.equal(await legacyPage.evaluate(candidateId => JSON.parse(localStorage.getItem("loop-bgm-lab-v1")).candidates.find(item => item.id === candidateId).candidateSource.kind, legacyLocalCandidate.id), "legacy-unknown");
  await legacyPage.locator("#legacy-source-submit").click();
  await legacyPage.locator("#legacy-source-dialog").waitFor({ state: "hidden" });
  const localConfirmed = await legacyPage.evaluate(({ candidateId, batchId }) => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    const candidate = stored.candidates.find(item => item.id === candidateId);
    const experiment = stored.experiments.find(item => item.candidateId === candidateId);
    const batch = stored.batches.find(item => item.id === batchId);
    return {
      candidateSource: candidate.candidateSource,
      experiment: {
        runId: experiment.runId,
        outputIndex: experiment.outputIndex,
        generatedUrl: experiment.generatedUrl,
        generationConditions: experiment.generationConditions,
      },
      batch: {
        status: batch.status,
        currentRunId: batch.currentRunId,
        currentCandidateId: batch.currentCandidateId,
        generatedUrl: batch.generatedUrl,
      },
      runCount: stored.runs.length,
      bestCandidateId: stored.currentBestCandidate?.candidateId ?? null,
    };
  }, { candidateId: legacyLocalCandidate.id, batchId: legacyLocalCandidate.batchId });
  assert.deepEqual(localConfirmed.candidateSource, {
    kind: "local-original",
    licenseId: localOriginalLicenseId,
    fileSha256: legacyLocalCandidate.hash,
  });
  assert.deepEqual(localConfirmed.experiment, {
    runId: null,
    outputIndex: null,
    generatedUrl: null,
    generationConditions: null,
  });
  assert.deepEqual(localConfirmed.batch, {
    status: "planned",
    currentRunId: null,
    currentCandidateId: null,
    generatedUrl: null,
  });
  assert.equal(localConfirmed.runCount, legacyRunCount);
  assert.equal(localConfirmed.bestCandidateId, legacyBestCandidateId);
  assert.equal(await legacyPage.locator(".legacy-source-confirm").count(), 0);
  assert.equal(await legacyPage.locator(".legacy-source-status").count(), 0);
  const legacyPlaybackAfter = await legacyPage.evaluate(() => ({
    createdUrls: [...window.__createdObjectUrls],
    revokedUrls: [...window.__revokedObjectUrls],
    player: {
      src: document.querySelector("#candidate-player")?.getAttribute("src"),
      currentTime: document.querySelector("#candidate-player")?.currentTime,
      paused: document.querySelector("#candidate-player")?.paused,
    },
  }));
  assert.deepEqual(legacyPlaybackAfter.createdUrls, legacyPlaybackSnapshot.createdUrls);
  assert.deepEqual(legacyPlaybackAfter.revokedUrls, legacyPlaybackSnapshot.revokedUrls);
  assert.equal(legacyPlaybackAfter.player.src, legacyPlaybackSnapshot.player.src);
  assert.equal(legacyPlaybackAfter.player.paused, legacyPlaybackSnapshot.player.paused);
  assert.ok(Math.abs(legacyPlaybackAfter.player.currentTime - legacyPlaybackSnapshot.player.currentTime) < 0.05);
  assert.deepEqual(legacyHttpRequests, [], "legacy confirmation workflow must make zero HTTP requests");
  await assertNoObservedErrors(legacyPage, legacyErrors);
  await legacyContext.close();

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
    await assertOfficialReadinessCard(responsivePage, { singleColumn: viewport.width <= 760 });
    assert.equal(await responsivePage.locator("main > section").count(), 6);
    assert.equal(await responsivePage.locator("label[for='license-package-file']").isVisible(), true);
    assert.equal(await responsivePage.locator("#license-package-export").isVisible(), true);
    await responsivePage.locator("#import-project").setInputFiles({
      name: "legacy-responsive-v2.json",
      mimeType: "application/json",
      buffer: Buffer.from(legacyVersionTwoJson),
    });
    await responsivePage.waitForFunction(() => document.querySelector("#import-status")?.textContent.includes("已完整导入"));
    await responsivePage.locator(".legacy-source-confirm").first().click();
    await responsivePage.locator("#legacy-source-dialog").waitFor({ state: "visible" });
    const dialogGeometry = await responsivePage.locator("#legacy-source-dialog").evaluate(dialog => ({
      left: dialog.getBoundingClientRect().left,
      right: dialog.getBoundingClientRect().right,
      top: dialog.getBoundingClientRect().top,
      bottom: dialog.getBoundingClientRect().bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
    assert.ok(dialogGeometry.left >= 0 && dialogGeometry.right <= dialogGeometry.viewportWidth, JSON.stringify(dialogGeometry));
    assert.ok(dialogGeometry.top >= 0 && dialogGeometry.bottom <= dialogGeometry.viewportHeight, JSON.stringify(dialogGeometry));
    await assertNoOverflow(responsivePage, `${viewport.width}x${viewport.height}`);
    await responsivePage.keyboard.press("Escape");
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
  await storagePage.locator(".batch-card[data-axis='baseline'] .record-create-run").click();
  assert.match(await storagePage.locator("#storage-warning").textContent(), /当前会话仍可继续.*导出 JSON/);
  assert.equal(await storagePage.locator(".batch-card[data-axis='baseline'] .batch-status").inputValue(), "submitted");
  await assertNoObservedErrors(storagePage, storageErrors);
  await storagePage.close();
} finally {
  await browser.close();
  server.close();
}

console.log("Verified Loop BGM Lab workflow, persistence, import/export, licensing, privacy, reduced motion, and 4 responsive viewports with zero browser errors.");
