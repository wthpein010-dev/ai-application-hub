import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  DEMO_REFERENCE_LICENSE,
  STORY_DURATION_MS,
  STORY_MILESTONES,
  validateRecordingMetadata,
} from "./loop-bgm-lab-video-contract.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const captureRoot = join(tmpdir(), "loop-bgm-lab-video-capture");
const rawPath = join(captureRoot, "loop-bgm-lab-demo.webm");
const metadataPath = join(captureRoot, "recording.json");
const demoWav = join(root, "projects", "loop-bgm-lab", "assets", "demo-reference.wav");
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wav", "audio/wav"],
  [".webp", "image/webp"],
]);

function resolveRequest(urlPath) {
  const pathname = decodeURIComponent(new URL(urlPath, "http://127.0.0.1").pathname);
  const normalized = normalize(pathname).replace(/^[/\\]+/, "");
  let target = resolve(root, normalized || "index.html");
  if (pathname.endsWith("/")) target = join(target, "index.html");
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

function createStaticServer(unmatchedRequests) {
  return createServer(async (request, response) => {
    const target = resolveRequest(request.url || "/");
    if (!target) {
      unmatchedRequests.push(`403 ${request.url}`);
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-length": body.length,
        "content-type": mimeTypes.get(extname(target).toLowerCase()) || "application/octet-stream",
      });
      if (request.method === "HEAD") response.end();
      else response.end(body);
    } catch {
      unmatchedRequests.push(`404 ${request.url}`);
      response.writeHead(404).end("Not found");
    }
  });
}

function startServer(server) {
  return new Promise((resolveStart) => {
    server.listen(0, "127.0.0.1", () => resolveStart(`http://127.0.0.1:${server.address().port}`));
  });
}

function stopServer(server) {
  return new Promise((resolveStop) => server.close(resolveStop));
}

async function launchBrowser() {
  const attempts = [
    ["Playwright Chromium", () => chromium.launch({ headless: true })],
    ["system Chrome", () => chromium.launch({ headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" })],
    ["system Chrome (x86)", () => chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" })],
    ["system Edge", () => chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" })],
  ];
  const failures = [];
  for (const [label, launch] of attempts) {
    if (label !== "Playwright Chromium") {
      const executable = label === "system Chrome"
        ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        : label === "system Chrome (x86)"
          ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
          : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
      if (!existsSync(executable)) continue;
    }
    try {
      return { browser: await launch(), label };
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No headless Chromium browser is available.\n${failures.join("\n")}`);
}

async function waitUntil(startedAt, targetMs) {
  const remaining = targetMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolveWait) => setTimeout(resolveWait, remaining));
}

async function reachMilestone(startedAt, milestone, timings) {
  await waitUntil(startedAt, milestone.scheduledMs);
  const actualMs = Date.now() - startedAt;
  if (actualMs < milestone.scheduledMs - 25 || actualMs > milestone.deadlineMs) {
    throw new Error(
      `Story milestone ${milestone.id} started at ${actualMs} ms; expected ${milestone.scheduledMs}-${milestone.deadlineMs} ms`,
    );
  }
  timings.push({
    ...milestone,
    actualMs,
    driftMs: actualMs - milestone.scheduledMs,
  });
}

async function scrollTo(page, selector, offset = 74) {
  await page.locator(selector).evaluate((node, topOffset) => {
    window.scrollTo({ behavior: "instant", top: node.getBoundingClientRect().top + window.scrollY - topOffset });
  }, offset);
}

await rm(captureRoot, { recursive: true, force: true });
await mkdir(captureRoot, { recursive: true });
const unmatchedRequests = [];
const server = createStaticServer(unmatchedRequests);
const origin = await startServer(server);
const launched = await launchBrowser();
const context = await launched.browser.newContext({
  acceptDownloads: true,
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
  recordVideo: { dir: captureRoot, size: { width: 1280, height: 720 } },
  viewport: { width: 1280, height: 720 },
});
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
const recordingStartedAt = Date.now();
const page = await context.newPage();
const recording = page.video();
const errors = { console: [], non2xx: [], page: [], request: [] };
const localBlobAborts = [];
const revokedObjectUrls = new Set();
const milestoneTimings = [];
let cleanupObserved = false;
let contextClosed = false;
let browserClosed = false;
let serverStopped = false;
let externalOpens = [];
let metadata;

await page.exposeBinding("__recordRevokedObjectUrl", (_source, url) => {
  revokedObjectUrls.add(String(url));
});

page.on("console", (message) => {
  if (message.type() === "error") errors.console.push(message.text());
});
page.on("pageerror", (error) => errors.page.push(error.message));
page.on("requestfailed", (request) => {
  const failure = request.failure()?.errorText || "failed";
  if (request.url().startsWith("blob:") && failure.includes("ERR_ABORTED")) {
    localBlobAborts.push({ failure, url: request.url() });
    return;
  }
  errors.request.push(`${request.url()} ${failure}`);
});
page.on("response", (response) => {
  if (response.status() < 200 || response.status() >= 300) errors.non2xx.push(`${response.status()} ${response.url()}`);
});

try {
  await page.addInitScript(() => {
    localStorage.clear();
    window.__tutorialExternalOpens = [];
    window.__tutorialRevokeReports = [];
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      const normalized = String(url);
      window.__tutorialRevokeReports.push(Promise.resolve(window.__recordRevokedObjectUrl(normalized)));
      return revokeObjectURL(url);
    };
    window.open = (url, target, features) => {
      window.__tutorialExternalOpens.push({ url: String(url), target, features });
      return { close() {}, closed: false, opener: null };
    };
  });
  const response = await page.goto(`${origin}/projects/loop-bgm-lab/index.html`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  await page.locator("body[data-ready='true']").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ behavior: "instant", top: 0 }));

  const startedAt = Date.now();
  const storyStartOffsetMs = startedAt - recordingStartedAt;
  await reachMilestone(startedAt, STORY_MILESTONES[0], milestoneTimings);
  await page.locator("#load-demo-reference").click();
  await page.waitForFunction(() => document.querySelectorAll("#reference-list [data-analysis-state='ready']").length === 1, null, { timeout: 45_000 });

  await reachMilestone(startedAt, STORY_MILESTONES[1], milestoneTimings);
  await scrollTo(page, "#style-portrait");
  await page.locator("#style-key").fill("D minor");
  await page.locator("#style-tempo").fill("112");
  await page.locator("#style-form button[type='submit']").click();
  await page.waitForFunction(() => {
    const stored = JSON.parse(localStorage.getItem("loop-bgm-lab-v1"));
    return stored.styleSpec.key === "D minor"
      && stored.styleSpec.tempo.target === 112
      && stored.batches.length === 5;
  });
  assert.equal(await page.locator("#style-key").inputValue(), "D minor");
  assert.equal(await page.locator("#style-tempo").inputValue(), "112");
  assert.equal(await page.locator(".batch-card").count(), 5);

  await reachMilestone(startedAt, STORY_MILESTONES[2], milestoneTimings);
  await scrollTo(page, "#daily-queue");
  await page.locator(".batch-card[data-axis='baseline'] .copy-prompt").click();
  await page.locator(".batch-card[data-axis='baseline'] .open-suno").click();
  externalOpens = await page.evaluate(() => window.__tutorialExternalOpens);
  assert.deepEqual(externalOpens.map((entry) => entry.url), ["https://suno.com/create"]);
  assert.equal(await page.locator(".batch-card[data-axis='baseline'] .batch-status").inputValue(), "planned");

  await reachMilestone(startedAt, STORY_MILESTONES[3], milestoneTimings);
  await scrollTo(page, "#candidate-comparison");
  await page.locator("#candidate-file").setInputFiles(demoWav);
  await page.locator("#comparison-result[data-analysis-state='ready']").waitFor({ timeout: 45_000 });
  assert.equal(await page.locator("#comparison-components tbody tr").count(), 6);

  await reachMilestone(startedAt, STORY_MILESTONES[4], milestoneTimings);
  await scrollTo(page, "#comparison-result", 112);
  assert.notEqual((await page.locator("#similarity-class").textContent()).trim(), "等待候选");

  await reachMilestone(startedAt, STORY_MILESTONES[5], milestoneTimings);
  await scrollTo(page, "#license-ledger");
  await page.locator("#license-source").selectOption(DEMO_REFERENCE_LICENSE.source);
  await page.locator("#license-url").fill(DEMO_REFERENCE_LICENSE.sourceUrl);
  await page.locator("#license-name").fill(DEMO_REFERENCE_LICENSE.license);
  await page.locator("#license-hash").fill(DEMO_REFERENCE_LICENSE.sha256);
  await page.locator("#license-author").fill(DEMO_REFERENCE_LICENSE.source);
  await page.locator("#license-date").fill("2026-08-30");
  await page.locator("#license-form button[type='submit']").click();
  await page.locator("#license-list .license-entry").waitFor();
  assert.match(await page.locator("#license-list .license-entry").textContent(), /CC0-1\.0/);
  assert.match(await page.locator("#license-list .license-entry").textContent(), new RegExp(DEMO_REFERENCE_LICENSE.sha256));
  await scrollTo(page, "#license-list", 120);

  await reachMilestone(startedAt, STORY_MILESTONES[6], milestoneTimings);
  await scrollTo(page, "#portable-handoff");
  const jsonDownload = page.waitForEvent("download");
  await page.locator("#export-json").click();
  await jsonDownload;

  await reachMilestone(startedAt, STORY_MILESTONES[7], milestoneTimings);
  const markdownDownload = page.waitForEvent("download");
  await page.locator("#export-markdown").click();
  await markdownDownload;
  await waitUntil(startedAt, STORY_DURATION_MS);
  const actualDurationMs = Date.now() - startedAt;
  metadata = {
    schemaVersion: 1,
    targetDurationMs: STORY_DURATION_MS,
    actualDurationMs,
    finishDriftMs: actualDurationMs - STORY_DURATION_MS,
    storyStartOffsetMs,
    storyEndOffsetMs: storyStartOffsetMs + actualDurationMs,
    externalOpenCount: externalOpens.length,
    cleanupObserved: false,
    milestones: milestoneTimings,
  };

  cleanupObserved = await page.evaluate(async () => {
    window.dispatchEvent(new Event("beforeunload"));
    await Promise.all(window.__tutorialRevokeReports);
    return true;
  });
  await page.waitForTimeout(250);
  metadata.cleanupObserved = cleanupObserved;

  await context.close();
  contextClosed = true;
  const capturedPath = await recording.path();
  await launched.browser.close();
  browserClosed = true;
  await stopServer(server);
  serverStopped = true;

  const unmatchedBlobAborts = localBlobAborts.filter(({ url }) => !revokedObjectUrls.has(url));
  assert.deepEqual(errors, { console: [], non2xx: [], page: [], request: [] });
  assert.deepEqual(unmatchedRequests, []);
  assert.deepEqual(unmatchedBlobAborts, []);
  validateRecordingMetadata(metadata);

  await copyFile(capturedPath, rawPath);
  await writeFile(metadataPath, `${JSON.stringify({
    ...metadata,
    revokedObjectUrlCount: revokedObjectUrls.size,
    reconciledBlobAbortCount: localBlobAborts.length,
  }, null, 2)}\n`, "utf8");

  process.stdout.write([
    `Raw recording: ${rawPath}`,
    `Browser: ${launched.label}`,
    `Console errors: ${errors.console.length}`,
    `Page errors: ${errors.page.length}`,
    `Non-2xx responses: ${errors.non2xx.length}`,
    `Failed requests: ${errors.request.length}`,
    `Revoked object URLs reported: ${revokedObjectUrls.size}`,
    `Reconciled local blob aborts: ${localBlobAborts.length}`,
    `Unmatched local blob aborts: ${unmatchedBlobAborts.length}`,
    `Unmatched requests: ${unmatchedRequests.length}`,
    `External opens intercepted: ${externalOpens.length}`,
    `Story target: ${STORY_DURATION_MS} ms`,
    `Story actual: ${metadata.actualDurationMs} ms`,
    `Story finish drift: ${metadata.finishDriftMs} ms`,
    `Story start offset: ${metadata.storyStartOffsetMs} ms`,
    `Milestones within windows: ${metadata.milestones.length}/${STORY_MILESTONES.length}`,
    `Cleanup observed before teardown: ${cleanupObserved}`,
  ].join("\n") + "\n");
} finally {
  if (!contextClosed) await context.close().catch(() => undefined);
  if (!browserClosed) await launched.browser.close().catch(() => undefined);
  if (!serverStopped) await stopServer(server).catch(() => undefined);
}
