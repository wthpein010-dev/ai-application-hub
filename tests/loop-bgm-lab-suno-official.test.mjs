import test from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_OFFICIAL_API_EVIDENCE,
  OFFICIAL_PLATFORM_ORIGIN,
  evaluateOfficialApiReadiness,
  authorizeOfficialApiAttempt,
} from "../projects/loop-bgm-lab/core/suno-official-adapter.mjs";
import {
  createApiRun,
  transitionApiRun,
  scheduleNextPoll,
} from "../projects/loop-bgm-lab/core/api-run-state.mjs";

test("current public evidence keeps official API execution disabled at zero of six", () => {
  const result = evaluateOfficialApiReadiness(CURRENT_OFFICIAL_API_EVIDENCE);
  assert.equal(result.ready, false);
  assert.equal(result.confirmedCount, 0);
  assert.equal(result.totalCount, 6);
  assert.equal(result.blockers.length, 6);
  assert.equal(result.verifiedAt, "2026-09-01");
  assert.deepEqual(result.sources, ["https://platform.suno.com/"]);
  assert.notEqual(result.sources, CURRENT_OFFICIAL_API_EVIDENCE.sources);
});

test("official readiness evidence requires a safe official source collection", () => {
  const missingSources = {
    checks: { ...CURRENT_OFFICIAL_API_EVIDENCE.checks },
    verifiedAt: "2026-09-01",
  };
  assert.throws(() => evaluateOfficialApiReadiness(missingSources), /sources/i);
  assert.throws(() => evaluateOfficialApiReadiness({
    ...CURRENT_OFFICIAL_API_EVIDENCE,
    sources: ["file:///private/evidence"],
  }), /sources/i);
});

test("only complete official zero-cost evidence authorizes a future attempt descriptor", () => {
  const evidence = Object.fromEntries(Object.keys(CURRENT_OFFICIAL_API_EVIDENCE.checks).map(key => [key, true]));
  const common = {
    evidence: { ...CURRENT_OFFICIAL_API_EVIDENCE, checks: evidence },
    origin: OFFICIAL_PLATFORM_ORIGIN,
    pricing: { kind: "free", currency: "USD", maximumAmount: 0 },
    contract: { source: "official-documentation", version: "verified-contract-v1" },
  };
  assert.deepEqual(authorizeOfficialApiAttempt(common), {
    allowed: true,
    origin: "https://platform.suno.com",
    contractVersion: "verified-contract-v1",
    maximumAmount: 0,
    currency: "USD",
    blockers: [],
  });
  assert.equal(authorizeOfficialApiAttempt({ ...common, origin: "https://example.com" }).allowed, false);
  assert.equal(authorizeOfficialApiAttempt({ ...common, pricing: { kind: "unknown" } }).allowed, false);
  assert.equal(authorizeOfficialApiAttempt({ ...common, pricing: { kind: "paid", currency: "USD", maximumAmount: 1 } }).allowed, false);
});

test("API runs follow the one-way async lifecycle without retaining secrets", () => {
  const queued = createApiRun({ id: "api-run-1", batchId: "batch-1", createdAt: "2026-09-01T00:00:00.000Z" });
  const generating = transitionApiRun(queued, "generating", { jobId: "public-job-1", updatedAt: "2026-09-01T00:00:01.000Z" });
  assert.equal(queued.status, "queued");
  assert.equal(generating.status, "generating");
  assert.throws(() => transitionApiRun(generating, "downloaded", {}), /Invalid API run status transition/);
  assert.throws(() => transitionApiRun(generating, "ready", { authorization: "Bearer secret" }), /forbidden/i);
});

test("API runs retain only safe public generation evidence", () => {
  const generating = transitionApiRun(
    createApiRun({ id: "api-run-3", batchId: "batch-3", createdAt: "2026-09-01T00:00:00.000Z" }),
    "generating",
    { updatedAt: "2026-09-01T00:00:01.000Z" },
  );
  const ready = transitionApiRun(generating, "ready", {
    generatedUrl: "https://platform.suno.com/jobs/1",
    updatedAt: "2026-09-01T00:00:02.000Z",
  });
  const downloading = transitionApiRun(ready, "downloading", { updatedAt: "2026-09-01T00:00:03.000Z" });
  const downloaded = transitionApiRun(downloading, "downloaded", {
    downloadSha256: "a".repeat(64),
    errorCode: "none",
    updatedAt: "2026-09-01T00:00:04.000Z",
  });
  assert.equal(ready.generatedUrl, "https://platform.suno.com/jobs/1");
  assert.equal(downloaded.downloadSha256, "a".repeat(64));
  assert.equal(downloaded.errorCode, "none");

  for (const patch of [
    { generatedUrl: "https://localhost/jobs/1" },
    { generatedUrl: "blob:https://platform.suno.com/jobs/1" },
    { generatedUrl: "file:///private/evidence" },
    { generatedUrl: "C:\\private\\evidence" },
    { authorization: "Bearer private" },
  ]) {
    assert.throws(() => transitionApiRun(generating, "ready", patch), /forbidden|local|path/i);
  }
});

test("API run URL evidence rejects normalized local and credential-bearing URLs", () => {
  const createInput = {
    id: "api-run-4",
    batchId: "batch-4",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  const queued = createApiRun({ ...createInput, jobId: "public-job-4" });
  assert.equal(queued.jobId, "public-job-4");
  const generating = transitionApiRun(queued, "generating", { updatedAt: "2026-09-01T00:00:01.000Z" });

  for (const generatedUrl of [
    "https://localhost./jobs/1",
    "https://platform.suno.com/jobs/1?access_token=private",
    "https://platform.suno.com/jobs/1?api-secret=private",
  ]) {
    assert.throws(() => createApiRun({ ...createInput, generatedUrl }), /public|local|forbidden|secret/i);
    assert.throws(() => transitionApiRun(generating, "ready", { generatedUrl }), /public|local|forbidden|secret/i);
  }
  assert.throws(() => createApiRun({ ...createInput, error: "access_token=private" }), /forbidden|secret/i);
});

test("poll scheduling is deterministic, bounded, and honors a valid retry-after", () => {
  const run = transitionApiRun(
    createApiRun({ id: "api-run-2", batchId: "batch-2", createdAt: "2026-09-01T00:00:00.000Z" }),
    "generating",
    { updatedAt: "2026-09-01T00:00:01.000Z" },
  );
  assert.deepEqual(scheduleNextPoll(run, { now: 1_000, retryAfterMs: 7_000 }), { attempts: 1, delayMs: 7_000, nextPollAt: 8_000 });
  assert.equal(scheduleNextPoll({ ...run, attempts: 20 }, { now: 1_000 }).delayMs, 30_000);
});
