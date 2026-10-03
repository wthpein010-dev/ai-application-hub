# Lighthouse View Snapshot Scalability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Unity frame and live-message snapshot work independent of accumulated audience and dedupe history.

**Architecture:** Keep `Snapshot()` as the complete persistence representation. Add a scalar-only `ViewSnapshot()` and an `AdvanceForView()` path for render loops. Mark transient snapshots with rules version 0 and reject them before checkpoint writes. The controller and live inbox select the snapshot path according to their actual use.

**Tech Stack:** Unity 2022.3 C#, NUnit EditMode, Node publication checks, WebGL, Windows x64.

**Spec:** `docs/superpowers/specs/2026-10-04-lighthouse-view-snapshot-scalability.md`

## Global Constraints

- Preserve all rule outcomes and existing version 1 save recovery.
- Do not run or build ClickFlow on local Windows; no unfiltered `node --test`.
- Public builds remain simulation only until official SDK permissions and live-room validation are available.

## Review Focus

- A transient snapshot cannot overwrite a valid persistent checkpoint.
- A full snapshot still restores duplicate-event and cooldown state.
- `AdvanceForView` reaches the same phase and timer as `Advance` for the same delta.
- The live inbox handles high-volume messages without copying historical lists per item.
- Disconnect, pause and recovery retain their current behavior.

---

### Task 1: Snapshot boundary

**Files:** `RescueGame.cs`, `CheckpointStore.cs`, `RescueGameTests.cs`, `CheckpointStoreTests.cs`.

**Interfaces:** `RescueGame.ViewSnapshot(): RescueSnapshot`, `RescueGame.AdvanceForView(double): RescueSnapshot`; `Snapshot()` remains complete.

- [ ] Write and run failing tests for scalar parity, empty transient history, full restore, phase advance and checkpoint write rejection.
- [ ] Implement shared scalar snapshot construction and separate full-history population; reject rules version 0 in `CheckpointStore.Save`.
- [ ] Run focused and full Unity EditMode tests.

### Task 2: Runtime hot paths

**Files:** `RescueController.cs`, `LiveMessageInbox.cs`, `RescueControllerLiveTests.cs`, `LiveMessageInboxTests.cs`.

- [ ] Add a stress-oriented test proving live drain and controller frames retain correct state with hundreds of prior audience events.
- [ ] Route every frame and every pending message through `ViewSnapshot`; keep complete `Snapshot()` only at explicit persistence and recovery points.
- [ ] Run focused and full Unity EditMode tests and inspect the diff for accidental persistence of transient snapshots.

### Task 3: Build and release

**Files:** Unity WebGL build, versioned public loader, gameplay video/poster, Hub and atlas release links, release notes and publication tests.

- [ ] Build WebGL and Windows; record and rebuild the video from the current WebGL binary.
- [ ] Run named Node tests, publication audit, extracted Windows playthrough, desktop and mobile WebGL playthroughs.
- [ ] Verify remote write permission and current `main`; merge PR, create matching release, wait for exact-SHA Pages/CI, and verify public assets and links.
