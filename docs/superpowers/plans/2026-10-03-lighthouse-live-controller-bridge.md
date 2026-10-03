# Lighthouse Rescue Live Controller Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Connect the verified live message queue to the Unity controller while keeping the public simulation build unable to claim a Douyin connection.

**Architecture:** An SDK-specific Windows assembly will later implement `ILiveMessageSource`. The shared controller only accepts a source with a verified room and connected status. Its callback copies envelopes into `LiveMessageInbox`; `Update` drains on the Unity main thread, saves accepted state, renders feedback, then hands receipts to the source for SDK-specific fulfilment. Simulation remains the default when no source is attached.

**Tech Stack:** Unity 2022.3.62f3c1, C#, NUnit EditMode, GitHub Actions.

**Spec:** `docs/lighthouse-rescue-live-sdk-readiness.md`, especially “接入顺序” steps 3–6.

## Global Constraints

- No `LiveOpenSDK` package, credential, token, or SDK type enters the shared Windows/WebGL assembly.
- Only a connected, verified room can activate live mode; the absent SDK leaves public builds in local simulation mode.
- SDK callback threads cannot mutate Unity objects or game rules.
- A failed queue post is visible to the SDK adapter; receipts retain original message identity for future ACK decisions.
- Never run ClickFlow on this Windows host; full Hub regression runs in remote CI.

## Review Focus

- A late message from the previous round must not act in the next round.
- A message from before a stage transition must not act in the new stage.
- The host must still be able to start, pause and end a live round without simulated audience input.
- Disconnection must freeze the countdown; reconnect must require an explicit host resume.
- A source whose startup throws must leave the simulation playable.

### Task 1: Main-thread receipt carries the applied event

**Files:** `Assets/Scripts/Runtime/LiveMessageInbox.cs`, `Assets/Tests/EditMode/LiveMessageInboxTests.cs`.

**Interfaces:** Add `GameEvent GameEvent` to `LiveInboxReceipt` only for translated game commands.

- [x] Add a failing test proving an accepted receipt carries the routed event and original message identity.
- [x] Run the targeted Unity EditMode filter and confirm the expected failure.
- [x] Implement the minimal receipt field and rerun the targeted test.

### Task 2: Controller accepts and drains a verified source

**Files:** create `Assets/Scripts/Runtime/ILiveMessageSource.cs` and `.meta`; modify `RescueController.cs`; add `RescueControllerLiveTests.cs` and `.meta`.

**Interfaces:** `ILiveMessageSource` exposes `RoomId`, `Status`, `Start(Func<LivePushEnvelope,string,long,bool>)`, `Stop()`, and `HandleReceipt(LiveInboxReceipt)`; controller exposes `bool AttachLiveSource(ILiveMessageSource)`.

- [x] Add failing EditMode tests for unavailable source, accepted background callback, save/render receipt order, round isolation, stage freshness, disconnection, and startup rollback.
- [x] Run the targeted filter and confirm failures from missing live attachment.
- [x] Implement main-thread drain with a per-frame budget of 64, wall-clock stage boundary updates, round rebinds, host command routing, and graceful rollback.
- [x] Rerun the targeted filter, then the full Unity EditMode suite.

### Task 3: Live UI cannot mix simulated audience actions

**Files:** modify `RescueView.cs` and `RescueController.cs`; extend `RescueViewTests.cs`.

- [x] Add a failing test proving live mode changes the badge and disables simulated audience/speed buttons while leaving host buttons usable.
- [x] Implement the mode switch and rerun targeted and full Unity EditMode suites.

### Task 4: Document and verify the integration boundary

**Files:** modify `docs/lighthouse-rescue-live-sdk-readiness.md`; add a narrowly scoped publication test if needed.

- [x] Record exactly what is wired and what still requires the authorised SDK, real room, ACK semantics, Windows run, and platform approval.
- [x] Run relevant Node tests and publication audit; inspect diff and `git diff --check`.
- [ ] Commit, open a PR, merge after validation, and verify exact main SHA CI/Pages. Do not create a player release because the SDK is still absent.
