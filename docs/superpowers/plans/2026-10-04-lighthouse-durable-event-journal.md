# Lighthouse Durable Event Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist accepted stage events with small append-only records while preserving exact deduplication and cooldown recovery.

**Architecture:** A complete `RescueSnapshot` remains the phase boundary anchor and carries `JournalSequence`. `CheckpointStore` owns a sidecar UTF-8 journal, validates and replays newer entries when loading, and compacts at 2 MiB. `RescueController` records accepted non-lifecycle events before feedback and future SDK receipt; lifecycle and phase transitions still save complete snapshots.

**Tech Stack:** Unity 2022.3 C#, NUnit EditMode, JsonUtility, SHA-256, Windows/WebGL builds, Node, Playwright, GitHub Pages/Release.

**Spec:** `docs/superpowers/specs/2026-10-04-lighthouse-durable-event-journal.md`

## Global Constraints

- Windows local ClickFlow run/build/display/download/regeneration is forbidden. Never run unfiltered `node --test` locally; full Hub regression runs only in remote CI.
- Preserve RulesVersion 1 and 1.4.4 active checkpoint compatibility. Transient view snapshots remain unsaveable.
- No SDK claim or live-connected UI without the authorized SDK, gameplay permission, room, ACK verification and review.
- A successful applied receipt follows durable append; static visual/audio flow remains unchanged.

## Review Focus

- Crash after complete checkpoint replacement but before old journal deletion must not apply old entries again.
- A torn final line must not block future events after recovery.
- A prior room/round journal must not join a new round even when deletion failed.
- An invalid hash or out-of-order current-round sequence must stop replay at the last valid prefix.
- WebGL persistent storage must restore an interrupted round after a page reload, not merely pass editor tests.

---

### Task 1: Journal storage and replay

**Files:**
- Modify: `build/lighthouse-rescue-unity/Assets/Scripts/Rules/RescueSnapshot.cs`
- Modify: `build/lighthouse-rescue-unity/Assets/Scripts/Runtime/CheckpointStore.cs`
- Modify: `build/lighthouse-rescue-unity/Assets/Tests/EditMode/CheckpointStoreTests.cs`

**Interfaces:** `CheckpointStore.AppendAccepted(GameEvent gameEvent, RescueGame game)`; `CheckpointStore.Save(RescueSnapshot snapshot)` stamps current `JournalSequence`; `TryLoad` replays valid records and returns a complete snapshot.

- [ ] Add failing EditMode tests for old checkpoint compatibility, many appended joins with one complete snapshot, duplicate/cooldown after replay, phase compaction and stale old journal, torn/tampered tail and new-round isolation.
- [ ] Run targeted EditMode tests and confirm expected red failures.
- [ ] Implement line-delimited checksummed journal, ordered replay, truncation, sequence stamping, 2 MiB compaction, and 16 KiB line limit.
- [ ] Run targeted and full Lighthouse EditMode tests; commit storage and tests.

### Task 2: Controller durability order

**Files:**
- Modify: `build/lighthouse-rescue-unity/Assets/Scripts/Runtime/RescueController.cs`
- Modify: `build/lighthouse-rescue-unity/Assets/Tests/EditMode/RescueControllerLiveTests.cs`
- Modify: `docs/lighthouse-rescue-live-sdk-readiness.md`

**Interfaces:** accepted `Start/Pause/Resume/End` and phase changes use `Save(game.Snapshot())`; other accepted live and simulation events call `AppendAccepted(event, game)` before feedback/receipt.

- [ ] Add failing tests: 200 live joins drain with one full checkpoint copy and recover all joined IDs; receipt observes durable journal; reset starts a clean round.
- [ ] Run targeted tests and confirm red failures from current per-message snapshots.
- [ ] Replace accepted-event hot path saves; document durability/ACK boundary and unchanged SDK dependency.
- [ ] Run full Lighthouse EditMode and targeted Node tests; commit integration.

### Task 3: Package and publish 1.4.5

**Files:**
- Modify: `projects/lighthouse-rescue/play.js`, `projects/lighthouse-rescue/game/`, `projects/lighthouse-rescue/RELEASE_NOTES.md`, Hub and atlas release links, publication tests, Unity project version.
- Output: `LighthouseRescue-Windows-x64.zip` release asset for 1.4.5.

**Interfaces:** Same public game flow, exact versioned Windows download, local simulation disclosure.

- [ ] Rebuild Unity WebGL and Windows from this branch. Verify fresh Windows short/long rounds and crash recovery, desktop/390px WebGL complete rounds plus reload recovery.
- [ ] Run Lighthouse Node tests and publication audit; inspect `git diff --check`, binary sizes, asset metadata and video link.
- [ ] Verify GitHub write permission/latest `origin/main`; push PR, wait required checks, merge normally, create Release at exact merged SHA.
- [ ] Wait exact-SHA Pages and remote full Hub/browser CI; public hash/download, game/video browser playback and link checks; update project memory.
