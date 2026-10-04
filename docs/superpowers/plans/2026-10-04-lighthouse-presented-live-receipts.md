# Lighthouse Presented Live Receipts Plan

**Goal:** Give the future official live adapter a receipt only after Unity has completed a visual frame for the processed messages.

**Architecture:** `RescueController` retains a bounded queue of processed receipts. Its existing `OnLiveReceipt` path persists and renders state, then enqueues the receipt. One `WaitForEndOfFrame` coroutine calls a private flush method. Fault and round-reset paths clear unpresented receipts; a normal disconnect still passes completed receipts to the adapter for its network retry policy.

**Spec:** `docs/superpowers/specs/2026-10-04-lighthouse-presented-live-receipts.md`

## Constraints

- Preserve rules, event routing, save format and first-person/overhead visuals.
- Do not run ClickFlow or unfiltered Node tests on local Windows.
- Public Windows and WebGL builds remain simulation-only without authorised LiveOpenSDK, AppID and real-room validation.

## Task 1: Red tests and frame delivery

**Files:** `RescueController.cs`, `RescueControllerLiveTests.cs`.

1. Add a test that a live `Update` saves and renders but does not call `HandleReceipt` until the test invokes the frame-complete hook; watch it fail on the current implementation.
2. Add a bounded queue and one end-of-frame coroutine. Enqueue after persistence/UI work. Flush only if the source remains attached, connected and healthy.
3. Update existing controller test helper to simulate frame completion where old tests assert receipts. Verify fault, disconnect, reset, overflow and backlog cases with focused and full EditMode runs.

## Task 2: Rebuild and publish

**Files:** versioned Unity project, WebGL build, Hub and preview release links, release notes, readiness doc and publication tests.

1. Rebuild Windows/WebGL 1.4.13, run fresh extracted Windows short/long routes and desktop/390px WebGL full rounds plus reload recovery.
2. Run named Node tests and publication audit. Verify GitHub write access and latest `origin/main`, push PR, merge, create versioned Windows Release.
3. Wait exact-SHA Pages and complete remote Hub/browser CI; compare public WebGL and ZIP hashes, check public game/video/download, update project memory.
