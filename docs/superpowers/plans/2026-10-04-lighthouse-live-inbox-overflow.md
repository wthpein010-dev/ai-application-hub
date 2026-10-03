# Lighthouse Live Inbox Overflow Fail-Stop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop an authorised live round before any further game action when its bounded inbox overflows.

**Architecture:** `LiveMessageInbox.TryPost` reports why a callback returned false. `RescueController` records overflow with an atomic signal and performs all stop, rollback and UI work on Unity's main thread. `LiveConnectionStatus` carries a short fault title so storage and overload failures have distinct streamer diagnoses.

**Tech Stack:** Unity 2022.3 C#, NUnit EditMode, Windows x64, WebGL, Node/Playwright, GitHub Actions and Pages.

**Spec:** `docs/superpowers/specs/2026-10-04-lighthouse-live-inbox-overflow-design.md`

## Global Constraints

- No authorised official SDK or real-room credentials exist in this project; public builds remain labelled local simulation.
- Do not run, build, display, download or regenerate ClickFlow locally on Windows; never run unfiltered `node --test`.
- A full inbox is terminal for the current live process and produces no ACK for queued messages.
- The SDK callback never touches Unity UI or stops the message source from its callback thread.

## Review Focus

- Exactly 256 queued messages plus one more: the extra post returns false and no queued message is applied in the following frame.
- A previously persisted accepted message remains after overflow rollback.
- Invalid/unbound posts do not falsely fault a connected live session.
- Disconnection after an accepted backlog drains and pauses without being classified as overflow.
- A background callback and main-thread frame can race without showing partial live state or sending pending receipts.

---

### Task 1: Inbox result and controller fail-stop

**Files:** `LiveMessageInbox.cs`, `RescueController.cs`, `LiveMessageInboxTests.cs`, `RescueControllerLiveTests.cs`.

**Interfaces:** Add `LiveInboxPostResult TryPost(LivePushEnvelope, string, long)` with `Accepted`, `Rejected`, `Full`; preserve `bool Post(...)`. Controller uses an atomic overflow flag, checked before `Drain`.

- [x] Write tests for all post results and a full-queue live controller that preserves an earlier durable join but applies none of the 256 pending joins.
- [x] Run targeted EditMode tests and see the new cases fail for the missing behaviour.
- [x] Implement minimal thread-safe signal and main-thread fail-stop; run targeted and full EditMode suites.
- [x] Commit the verified controller/inbox change.

### Task 2: Distinct streamer feedback and release

**Files:** `LiveConnectionStatus.cs`, `RescueView.cs`, their EditMode tests, release metadata, Windows/WebGL outputs.

**Interfaces:** `MarkFaulted(reason, title)` retains the storage default and accepts `输入过载` for queue overflow; `RescueView` renders the title and reason from status.

- [x] Add tests for overload badge/reason, disabled host controls, muted storm and unchanged normal disconnect; observe the badge test fail before implementation.
- [x] Implement feedback; run full Unity EditMode and named Lighthouse Node tests.
- [x] Build and smoke Windows/WebGL, refresh recovery, desktop/390px rounds, video and publication audit; update ZIP hash and versioned docs.
- [ ] Commit, PR, merge and create an exact-SHA Release; verify exact-SHA Pages/CI and public downloads/pages; update project memory.
