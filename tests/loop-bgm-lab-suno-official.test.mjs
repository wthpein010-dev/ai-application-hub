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

test("poll scheduling is deterministic, bounded, and honors a valid retry-after", () => {
  const run = transitionApiRun(
    createApiRun({ id: "api-run-2", batchId: "batch-2", createdAt: "2026-09-01T00:00:00.000Z" }),
    "generating",
    { updatedAt: "2026-09-01T00:00:01.000Z" },
  );
  assert.deepEqual(scheduleNextPoll(run, { now: 1_000, retryAfterMs: 7_000 }), { attempts: 1, delayMs: 7_000, nextPollAt: 8_000 });
  assert.equal(scheduleNextPoll({ ...run, attempts: 20 }, { now: 1_000 }).delayMs, 30_000);
});
