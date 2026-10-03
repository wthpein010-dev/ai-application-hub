# Lighthouse Live Storage Fail-Stop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a live round safely when an accepted message cannot be persisted before its fulfillment receipt.

**Architecture:** Keep `RescueGame` and the SDK-facing interface unchanged. `RescueController` catches only failures from its persistence step, marks the source permanently faulted in this process, restores the last durable same-room state when possible, and aborts the inbox drain. `RescueView` renders the status reason in its existing instruction area.

**Tech Stack:** Unity 2022.3 C#, NUnit EditMode, Windows x64, WebGL, Node/Playwright, GitHub Actions and Pages.

**Spec:** `docs/superpowers/specs/2026-10-04-lighthouse-live-storage-fail-stop.md`

## Global Constraints

- No official SDK types or credentials in the shared Windows/WebGL runtime.
- No ACK for a message whose persistence failed; no later queued event may apply in that process.
- Do not run, build, display, download or regenerate ClickFlow locally on Windows; never run unfiltered `node --test`.
- Preserve the public simulation label and current POV/weather/audio gameplay.

## Review Focus

- The failed accepted message has already mutated in-memory state; restore from disk before showing a stable state.
- A queued second message must not slip through `Drain` in the same frame.
- Disk read failure must not escape the Unity frame loop.
- Host buttons must not restart or finish a failed live round in-process.
- Ordinary SDK disconnection must still drain the bounded backlog and then pause.

---

### Task 1: Failure boundary and rule-state rollback

**Files:** `RescueController.cs`, `RescueControllerLiveTests.cs`.

**Interfaces:** `OnLiveReceipt` persists before `HandleReceipt`; a private fault exception aborts the current `LiveMessageInbox.Drain` call, and `Update` catches only that exception. A permanent controller fault flag blocks future input and host actions.

- [ ] Write failing EditMode tests with a directory at `checkpoint.json.journal`; assert no receipt, no second message, no time advance and rollback to the saved checkpoint. Add a read-failure case.
- [ ] Run the targeted test and confirm it fails for the current implementation.
- [ ] Implement fail-stop and restore handling; re-run targeted and full EditMode tests.
- [ ] Commit the verified controller change.

### Task 2: Streamer diagnostic and release

**Files:** `RescueView.cs`, `RescueViewTests.cs`, release documentation, versioned Windows/WebGL outputs and Hub pointers.

**Interfaces:** On disconnected live status, `Render` puts the status reason in the existing instruction line and shows a concise disconnected mode badge. The simulation display stays unchanged.

- [ ] Add a failing view test that the storage failure reason is visible, then implement the minimal rendering change.
- [ ] Run Unity EditMode and named Lighthouse Node tests; build Windows and WebGL, run freshly extracted Windows short/long rounds and desktop/mobile browser rounds.
- [ ] Update version and release docs; audit Hub, self-review diff, PR, merge and create exact-SHA Release.
- [ ] Wait for exact-SHA Pages/CI and verify public download, playable page and video; update project memory.
