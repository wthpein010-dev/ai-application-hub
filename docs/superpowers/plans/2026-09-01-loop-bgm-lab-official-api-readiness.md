# Loop BGM Lab Official API Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed Suno official-API readiness gate and secret-free async run contract without enabling any network request, guessed endpoint, key input, or paid action.

**Architecture:** Two pure ES modules own evidence evaluation, zero-cost authorization, and immutable API-run transitions. The existing static page renders their current 0/6 readiness result inside the batch area while retaining the manual Suno Create flow; the CSP remains self-only and no API secret enters the DOM or persisted project state.

**Tech Stack:** HTML, CSS, browser JavaScript modules, Node test runner, Playwright, existing stable project-state and portable-safety modules.

**Spec:** `docs/superpowers/specs/2026-09-01-loop-bgm-lab-official-api-readiness-design.md`

## Global Constraints

- The current official API evidence date is exactly `2026-09-01`, with exactly six required evidence keys and `0/6` confirmed.
- Production code must not call Suno through `fetch`, XHR, WebSocket, EventSource, a hidden Studio endpoint, or a browser session.
- CSP stays exactly restrictive for connections: `connect-src 'self'`; do not add any remote origin in this plan.
- The page must not request, display, persist, export, log, or place in a URL an API key, Token, Cookie, Authorization value, password, recovery key, or user audio bytes.
- `authorizeOfficialApiAttempt` may allow only exact origin `https://platform.suno.com`, six confirmed evidence values, an official contract version, and a declared maximum cost of exactly zero with kind `free`.
- Unknown price, non-zero price, missing evidence, missing official contract, or any other origin must fail closed without constructing or sending a request.
- The existing copy/open manual adapter remains usable; opening Suno Create never changes a batch to `submitted`.
- The readiness card lives inside the existing batch section so `main > section` remains exactly six.
- The consumer download-limit notice must say it takes effect on `2026-09-03`, link `https://help.suno.com/en/articles/13614785`, and state that it is not an API download contract.
- API run state is not added to `loop-bgm-lab-v1`, `localStorage`, JSON, or Markdown in this plan.
- Every production behavior is implemented by red-green-refactor: the covering test must fail for the expected missing behavior before production code is changed.

---

### Task 1: Fail-closed policy adapter and secret-free run state

**Files:**
- Create: `projects/loop-bgm-lab/core/suno-official-adapter.mjs`
- Create: `projects/loop-bgm-lab/core/api-run-state.mjs`
- Create: `tests/loop-bgm-lab-suno-official.test.mjs`

**Interfaces:**
- Produces: `OFFICIAL_PLATFORM_ORIGIN`, `OFFICIAL_API_EVIDENCE_KEYS`, `CURRENT_OFFICIAL_API_EVIDENCE`, `evaluateOfficialApiReadiness(evidence)`, and `authorizeOfficialApiAttempt(input)`.
- Produces: `API_RUN_STATUSES`, `createApiRun(input)`, `transitionApiRun(run, nextStatus, patch)`, and `scheduleNextPoll(run, options)`.
- Evidence keys in order: `publicDocsReadable`, `authenticationDocumented`, `apiPricingDocumented`, `consumerCreditsInteroperable`, `generationContractDocumented`, `corsAndRateLimitsDocumented`.
- Allowed run statuses: `queued`, `generating`, `ready`, `downloading`, `downloaded`, `failed`, `cancelled`.

- [ ] **Step 1: Write the failing policy and state tests**

Create `tests/loop-bgm-lab-suno-official.test.mjs` with literal expectations. The production mutations caught are: changing default evidence to ready, accepting an unknown/paid cost, accepting a nonofficial origin, allowing an illegal status jump, mutating the caller's run, leaking a forbidden field, or producing an unbounded poll delay.

```js
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
```

- [ ] **Step 2: Run the new test and verify red**

Run:

```powershell
node --test tests/loop-bgm-lab-suno-official.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `suno-official-adapter.mjs`; the test file itself must parse.

- [ ] **Step 3: Implement the minimal pure modules**

In `suno-official-adapter.mjs`, freeze the current evidence, validate exact keys/types, create Chinese blocker labels, and return detached values. `authorizeOfficialApiAttempt` calls `evaluateOfficialApiReadiness` and appends blockers for every failed gate. It returns metadata only and contains no request method, path, headers, body, secret, or transport call.

```js
export const OFFICIAL_PLATFORM_ORIGIN = "https://platform.suno.com";
export const OFFICIAL_API_EVIDENCE_KEYS = Object.freeze([
  "publicDocsReadable",
  "authenticationDocumented",
  "apiPricingDocumented",
  "consumerCreditsInteroperable",
  "generationContractDocumented",
  "corsAndRateLimitsDocumented",
]);
```

In `api-run-state.mjs`, use an explicit field allowlist and transition table. Base poll delay is 2,000 ms, doubles per attempt, and caps at 30,000 ms. Accept `retryAfterMs` only when it is finite and between 0 and 30,000 inclusive. Reject dangerous key names after lowercasing and removing punctuation, plus absolute paths and `blob:`, `file:`, or local-host URLs.

- [ ] **Step 4: Run Task 1 tests and verify green**

Run:

```powershell
node --test tests/loop-bgm-lab-suno-official.test.mjs tests/loop-bgm-lab-core.test.mjs tests/loop-bgm-lab-project-state-hardening.test.mjs
```

Expected: all tests pass with zero failures and no warnings.

- [ ] **Step 5: Commit Task 1**

```powershell
git add projects/loop-bgm-lab/core/suno-official-adapter.mjs projects/loop-bgm-lab/core/api-run-state.mjs tests/loop-bgm-lab-suno-official.test.mjs
git commit -m "feat: add fail-closed Suno API readiness core"
```

### Task 2: Lock the existing portable secret rejection at real boundaries

**Files:**
- Modify: `tests/loop-bgm-lab-project-state-hardening.test.mjs`

**Interfaces:**
- Consumes: every value entering project validation, JSON import, Markdown export, or persisted state.
- Produces: regression evidence that the existing portable-safety verdict rejects normalized `authorization`, `proxyAuthorization`, `apiSecret`, `clientSecret`, `sessionSecret`, and credential-bearing header containers anywhere in nested objects or arrays.

**Baseline correction (2026-09-01):** read-only probes against plan base `a41c074` proved that all listed unsafe shapes already fail through `validateProject`, `exportProjectJson`, and `exportProjectMarkdown`, while the safe public metadata remains accepted. The behavior came from the earlier normalized classifier in `portable-safety.mjs`; therefore this task adds a characterization/regression test and must not manufacture a production change.

- [ ] **Step 1: Add a real-boundary regression test**

Append one table-driven test that deep-clones `createDailyPlan()` and places each literal secret shape below `extensions.futureApi`, including an array layer. For every fixture, assert that `validateProject`, `exportProjectJson`, and `exportProjectMarkdown` reject it; retain safe public metadata that still passes all three boundaries.

```js
for (const futureApi of [
  { authorization: "Bearer should-not-persist" },
  { "Proxy-Authorization": "Basic should-not-persist" },
  { api_secret: "should-not-persist" },
  { clientSecret: "should-not-persist" },
  { sessionSecret: "should-not-persist" },
  { headers: { Authorization: "Bearer nested-secret" } },
]) {
  const unsafe = { ...createDailyPlan(), extensions: { futureApi: { nested: [futureApi] } } };
  assert.throws(() => validateProject(unsafe), /secret|forbidden/i);
  assert.throws(() => exportProjectJson(unsafe), /secret|forbidden/i);
  assert.throws(() => exportProjectMarkdown(unsafe), /secret|forbidden/i);
}

const safe = {
  ...createDailyPlan(),
  extensions: {
    futureApi: {
      authenticationDocumented: false,
      officialEvidenceUrl: "https://platform.suno.com/",
      sourceHeadersVerifiedAt: "2026-09-01",
      contractVersion: "public-v1",
    },
  },
};
assert.doesNotThrow(() => validateProject(safe));
assert.doesNotThrow(() => exportProjectJson(safe));
assert.doesNotThrow(() => exportProjectMarkdown(safe));
```

The regression catches removing `authorization` or `secret` from the current normalized dangerous-key classifier while leaving the older `apiKey|cookie|token` checks intact.

- [ ] **Step 2: Run the focused test and verify the established behavior**

Run:

```powershell
node --test tests/loop-bgm-lab-project-state-hardening.test.mjs
```

Expected: all tests pass. Record this as characterization evidence, not a RED phase, because there is no missing production behavior.

- [ ] **Step 3: Confirm no production change was manufactured**

Run `git diff --exit-code -- projects/loop-bgm-lab/core/portable-safety.mjs`. Expected: exit 0. If the new test unexpectedly fails, stop and report the contradiction instead of broadening the classifier or adding blanket `auth`/`header` rejection.

- [ ] **Step 4: Run Task 2 tests and verify green**

Run:

```powershell
node --test tests/loop-bgm-lab-project-state-hardening.test.mjs tests/loop-bgm-lab-core.test.mjs tests/loop-bgm-lab-candidate.test.mjs
```

Expected: all tests pass; the safe public evidence fixture remains accepted.

- [ ] **Step 5: Commit Task 2**

```powershell
git add tests/loop-bgm-lab-project-state-hardening.test.mjs
git commit -m "test: lock future API secret rejection"
```

### Task 3: Render the disabled readiness card and dated download notice

**Files:**
- Modify: `projects/loop-bgm-lab/index.html`
- Modify: `projects/loop-bgm-lab/app.js`
- Modify: `projects/loop-bgm-lab/styles.css`
- Modify: `tests/loop-bgm-lab-page.test.mjs`
- Modify: `tests/loop-bgm-lab-browser-smoke.mjs`

**Interfaces:**
- Consumes: `CURRENT_OFFICIAL_API_EVIDENCE` and `evaluateOfficialApiReadiness` from Task 1.
- Produces DOM selectors: `#suno-api-readiness`, `#suno-api-status`, `#suno-api-checklist`, `#suno-api-action`, and `#suno-platform-link`.
- Does not consume `api-run-state.mjs` yet because no official transport exists.

- [ ] **Step 1: Add failing page and browser behavior tests**

In `loop-bgm-lab-page.test.mjs`, add a contract test that parses the checked-in page and coordinator and verifies the five selectors, exact platform URL, effective date `2026-09-03`, official FAQ URL, unchanged `connect-src 'self'`, and absence of password/API-key inputs or Suno request calls.

In `loop-bgm-lab-browser-smoke.mjs`, after the existing page-ready wait, assert:

```js
assert.equal(await page.locator("#suno-api-status").textContent(), "0/6 项已证实，官方 API 自动生成未启用");
assert.equal(await page.locator("#suno-api-checklist li").count(), 6);
assert.equal(await page.locator("#suno-api-action").isDisabled(), true);
assert.equal(await page.locator("#suno-platform-link").getAttribute("href"), "https://platform.suno.com/");
assert.equal(await page.locator("main > section").count(), 6);
```

After JSON and Markdown export, assert neither output contains `officialApiEvidence`, `apiRun`, `authorization`, `apiSecret`, `platform.suno.com/docs`, or any existing secret/path patterns.

The production mutations caught are enabling the action, persisting readiness data, deleting a blocker, changing the platform origin, adding a seventh main section, or adding a remote connection source.

- [ ] **Step 2: Run page and browser tests and verify red**

Run:

```powershell
node --test tests/loop-bgm-lab-page.test.mjs
node tests/loop-bgm-lab-browser-smoke.mjs
```

Expected: page test fails because the readiness selectors do not exist; browser smoke fails on `#suno-api-status`.

- [ ] **Step 3: Add the minimal semantic markup and rendering**

Insert this card inside the existing batch section after the plan summary:

```html
<aside id="suno-api-readiness" class="api-readiness-card" aria-labelledby="suno-api-title">
  <div>
    <p class="eyebrow">官方 API 准备度</p>
    <h3 id="suno-api-title">自动生成安全门禁</h3>
    <p id="suno-api-status" role="status"></p>
  </div>
  <ul id="suno-api-checklist" class="api-readiness-list"></ul>
  <div class="button-row">
    <button id="suno-api-action" type="button" disabled>官方 API 尚不可用</button>
    <a id="suno-platform-link" href="https://platform.suno.com/" target="_blank" rel="noopener noreferrer">查看 Suno Platform</a>
  </div>
</aside>
```

Import the Task 1 policy module in `app.js`, evaluate `CURRENT_OFFICIAL_API_EVIDENCE` once, render the exact status, and create six `<li>` elements with `textContent`. Do not attach a click listener to the disabled button and do not add any network primitive.

Add a dated paragraph linking `https://help.suno.com/en/articles/13614785`: “Suno 公告称消费者下载限制将于 2026-09-03 生效；这不是 API 下载契约，使用前请复核官方页面。”

Style the card with the existing palette, visible disabled state, keyboard-visible link focus, a responsive grid that collapses below 760 px, and no new animation.

- [ ] **Step 4: Run Task 3 tests and verify green**

Run:

```powershell
node --test tests/loop-bgm-lab-page.test.mjs tests/loop-bgm-lab-browser-policy.test.mjs tests/loop-bgm-lab-core.test.mjs tests/loop-bgm-lab-project-state-hardening.test.mjs tests/loop-bgm-lab-suno-official.test.mjs
node tests/loop-bgm-lab-browser-smoke.mjs
```

Expected: all Node tests pass; browser smoke reports zero browser errors and all four viewports without overflow.

- [ ] **Step 5: Run repository gates**

Run:

```powershell
$loopBgmTests = Get-ChildItem -LiteralPath tests -Filter 'loop-bgm-lab-*.test.mjs' | ForEach-Object FullName
node --test $loopBgmTests
npm run audit:hub
git diff --check
```

Expected: zero test failures, Hub audit zero findings, and `git diff --check` exits 0.

- [ ] **Step 6: Commit Task 3**

```powershell
git add projects/loop-bgm-lab/index.html projects/loop-bgm-lab/app.js projects/loop-bgm-lab/styles.css tests/loop-bgm-lab-page.test.mjs tests/loop-bgm-lab-browser-smoke.mjs
git commit -m "feat: surface disabled Suno API readiness gate"
```

## Final Review and Release Handoff

- Generate one review package from the branch base `7da7cb9bfd958d6af11cab38e5ae24fb7f46bdff` through `HEAD`.
- Dispatch a whole-branch reviewer with the spec, plan, task reports, ledger, and review package.
- Fix every Critical or Important finding with one fix wave and one scoped re-review.
- Re-run the complete focused Node suite, Playwright smoke, Hub audit, `git diff --check`, secret/path scan, and verify `git status --short` is empty after the final commit.
- Push the feature branch and open a PR only after local verification; wait for exact-head CI and Pages checks before merge or public-success claims.
