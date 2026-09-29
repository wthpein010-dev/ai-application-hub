# 《灯塔救援队》 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a polished, playable Unity live interaction game with a Windows streamer client, WebGL demo, licensed art, video and Hub entry.

**Architecture:** A pure C# round rules engine owns state and settlement. Unity views and host controls consume snapshots; simulation and official Douyin SDK adapters both translate to the same `GameEvent` contract. WebGL excludes the Windows SDK package. The Hub wraps the actual WebGL build and links a verified Windows release asset.

**Tech Stack:** Unity 2022.3.62f3c1, C#, Unity Test Framework, UGUI/2D, official Douyin LiveOpenSDK when available, Kenney CC0 art, HTML/CSS/JavaScript, Node test runner, Playwright, ffmpeg, GitHub Actions/Pages.

**Spec:** `docs/superpowers/specs/2026-09-29-lighthouse-rescue-design.md`

## Global Constraints

- Match the approved 9:16, 185-second short or 200-second long round; three rescue checkpoints and three endings.
- Initial hull 100; short route has 35-second stages, repair 4, light 3, base damage 8; long route 40 seconds, repair 3, light 4, base damage 6.
- Each checkpoint starts with 1 visible system point for each task; missing repair costs 12 hull per point; 20 likes yield 1 light, at most 2 per checkpoint; no gift changes rules.
- Comments have a 3-second per-user per-command cooldown and a per-stage cap of 4 counted uses per command.
- Source, room, round, event ID and phase guard event acceptance. SDK access and developer permissions are external requirements; the client must never claim live connection before real validation.
- Public WebGL and Windows builds share the same rules. Only Windows builds can compile SDK glue; the WebGL build must remain fully playable in simulation.
- Hub card belongs at the end of the games collection, with real demo, video and Windows download; no Mac button. Video is at most 4 minutes with single-line subtitles.
- Never run, build, show, download or regenerate ClickFlow locally on Windows. Before any Node tests, verify `tests/clickflow-packaging.test.mjs` unconditionally skips its real Python suite on Windows. Run only explicitly named relevant Node tests; full suite runs in remote CI.

## Review Focus

1. A comment delivered at the exact phase transition must affect only one phase; Task 1 tests the boundary.
2. A repeated live event after reconnect must not add a second vote, resource or gift effect; Task 2 tests replay.
3. A batched like count or rapid comment burst must obey progress caps without overflow; Task 1 tests both.
4. An interrupted checkpoint write must leave the last complete snapshot recoverable; Task 2 tests atomic persistence.
5. Missing SDK identifiers or unauthorised access must keep live mode disabled and visibly explain why; Task 4 tests the gate.

---

## File map

- `build/lighthouse-rescue-unity/`: reproducible Unity source project; `Assets/Scripts/Rules/` holds pure rules, `Assets/Scripts/Runtime/` binds UI and adapters, `Assets/Editor/` holds build entry points, `Assets/Tests/EditMode/` verifies rules and persistence.
- `build/lighthouse-rescue-unity/Assets/Art/`: source art with `THIRD_PARTY_ASSETS.md` recording URL, package, licence and exact files; original scene art and Chinese font assets are stored beside it.
- `projects/lighthouse-rescue/`: public Hub shell and WebGL build, cover, rules/host guide and video page. The Windows package is a GitHub release asset.
- `app-20260706-restore-games.js`, `assets/hub-showcase/`: game card and hero image.
- `tests/lighthouse-rescue-*.mjs`: Hub/asset/publication contract and browser smoke checks.

### Task 1: Reproducible project and pure round rules

**Files:** Create `build/lighthouse-rescue-unity/Packages/manifest.json`, `ProjectSettings/ProjectVersion.txt`, `Assets/Scripts/Rules/GameConfig.cs`, `GameEvent.cs`, `RescueGame.cs`, `RescueSnapshot.cs`, `Assets/Tests/EditMode/RescueGameTests.cs` and matching Unity `.meta` files.

**Interfaces:** `RescueGame(GameConfig config, string roomId, string roundId, int seed)`; `Apply(GameEvent e, double nowSeconds) -> ApplyResult`; `Advance(double deltaSeconds) -> RescueSnapshot`; `Snapshot() -> RescueSnapshot`. `GameEvent` includes source, room, round, ID, user, command, count. Phases are `Waiting`, `Gathering`, `Voting`, `Checkpoint1..3`, `Finale`, `Result`, `Paused`.

- [ ] Write failing EditMode tests for phase timing, routes, all endings, no viewers, one viewer, 100-viewer burst, cooldown, comment/like caps, zero-gift win and exact phase-boundary input.
- [ ] Run only `RescueGameTests` with Unity batchmode; confirm failures are due to absent rules.
- [ ] Implement the minimum pure rules and snapshots specified in the design; avoid UnityEngine references in `Rules/`.
- [ ] Re-run EditMode tests and inspect results XML for zero failures.
- [ ] Commit the project and rules tests.

### Task 2: Event validation, replay safety and recovery

**Files:** Create `Assets/Scripts/Runtime/EventRouter.cs`, `SimulationEventSource.cs`, `CheckpointStore.cs`, `Assets/Tests/EditMode/EventRouterTests.cs`, `CheckpointStoreTests.cs`.

**Interfaces:** `IEventSource.Start(Action<GameEvent> onEvent)`, `Stop()`; `EventRouter.Route(GameEvent, RescueGame, double) -> ApplyResult`; `CheckpointStore.Save(RescueSnapshot)` and `TryLoad(roomId, rulesVersion, out snapshot) -> bool`.

- [ ] Write failing tests for wrong room/round, duplicate event, out-of-order replay, late stage input, malformed count, reconnect replay and interrupted atomic snapshot write.
- [ ] Run only those EditMode suites and confirm expected failures.
- [ ] Implement deduplication, phase guards, event result codes and atomic checkpoint replacement; keep a bounded ID history in snapshots.
- [ ] Re-run suites and inspect persisted/recovered state from a simulated crash.
- [ ] Commit the event and recovery work.

### Task 3: Art, audio and complete Unity scene

**Files:** Create `Assets/Scenes/LighthouseRescue.unity`, `Assets/Scripts/Runtime/RescueController.cs`, `RescueView.cs`, `HostControls.cs`, `Assets/Art/THIRD_PARTY_ASSETS.md`, art/audio files and `.meta` files.

**Interfaces:** `RescueController` owns one `RescueGame` and binds `IEventSource` to it; `RescueView.Render(RescueSnapshot)` changes only presentation; `HostControls` invokes start/pause/end/mute/reset and simulation buttons.

- [ ] Download selected source packs only from official publisher pages; verify embedded licence and record URL, version/date, included file names and hashes.
- [ ] Build a 9:16 scene with clear header, route choice, three visible checkpoint tasks, hull/light bars, avatar/nickname queue, weather transitions and three illustrated conclusions. Add a redistributable Chinese font and record its licence.
- [ ] Connect simulation controls for all commands, likes and cosmetic gift; ensure simulated mode stays visibly labelled.
- [ ] Record a complete short- and long-route local playthrough and inspect 1080×1920 capture for readability, contrast, overlap and visual coherence; fix observed defects.
- [ ] Commit the scene, art and source manifest.

### Task 4: Windows live client and SDK permission gate

**Files:** Create `Assets/Scripts/Runtime/DouyinEventSource.cs`, `LiveConnectionStatus.cs`, `Assets/Tests/EditMode/LiveConnectionTests.cs`, `Assets/Editor/BuildLighthouse.cs`, host guide in `projects/lighthouse-rescue/host-guide.html`.

**Interfaces:** SDK adapter implements `IEventSource`; `LiveConnectionStatus` reports `Unavailable`, `Authorising`, `Connected`, `Disconnected` with a user-facing reason. Editor methods `BuildLighthouse.BuildWindows()` and `BuildLighthouse.BuildWebGL()`.

- [ ] Inspect local availability and official distribution rules for LiveOpenSDK. If authorised package exists, integrate its exact supported API and test with a real permitted room; otherwise keep the adapter compile isolated and disable live mode with an accurate reason.
- [ ] Write and run tests that deny live mode without SDK/permission/stable event ID, and verify reconnect never double-settles.
- [ ] Implement host buttons, ACK after accepted rendering where official SDK requires it, pause/resume and clear connection diagnostics.
- [ ] Build Windows x64; run it locally through a full simulated round and, only if official permission is available, a real live integration round.
- [ ] Commit the Windows client and host guide; record any external access blocker separately from build success.

### Task 5: WebGL game and Hub demo shell

**Files:** Create `projects/lighthouse-rescue/index.html`, `game/` WebGL output, page assets, `tests/lighthouse-rescue-page.test.mjs`, `tests/lighthouse-rescue-browser-smoke.mjs`.

**Interfaces:** Public shell uses existing `assets/subpage-shell.css`, starts a real Unity WebGL build and links back to `../../index.html#games`. Game remains usable by mouse/touch at desktop and 390px mobile widths.

- [ ] Write the Hub page contract test to require actual WebGL loader/data/wasm, responsive 9:16 stage, simulation disclosure and return button; confirm it fails before build.
- [ ] Build WebGL from the same Unity project and wire the shell; no SDK symbols or secrets in public output.
- [ ] Run targeted Node test and real browser smoke for one full simulated round, mobile touch, refresh/restart and console errors.
- [ ] Inspect screenshots, fix loading, font, framing or interaction issues, then commit the WebGL deliverable.

### Task 6: Video, Windows package and Hub listing

**Files:** Create `projects/lighthouse-rescue/video/index.html`, MP4, poster and single-line VTT; modify `app-20260706-restore-games.js`; create `assets/hub-showcase/lighthouse-rescue.webp`, `tests/lighthouse-rescue-publish.test.mjs`.

**Interfaces:** Card has `status: "game"`, valid web/video/Windows URLs and empty mac; Windows URL targets the exact GitHub release ZIP and matches the verified package hash.

- [ ] Make a ≤4-minute real-game walkthrough video with one subtitle line at a time; verify codec, duration, VTT geometry and actual browser playback.
- [ ] Package Windows build into ZIP, inspect EXE and data folder, extract to a fresh path, complete a round and compute SHA-256.
- [ ] Create a release asset, add the card at the end of the games collection and a matching cover; write then run targeted publication tests.
- [ ] Run Hub publication audit and targeted desktop/mobile browser smoke; correct any missing links, overlap or overflow.
- [ ] Commit the release integration.

### Task 7: Full release verification and memory

**Files:** Update `README.md` or project documentation, relevant Hub tests and Obsidian project memory after publication.

**Interfaces:** Final result provides repository, precise commit SHA, Pages URL, release asset URL/hash, video URL, verified test/build outcomes and the exact status of official Douyin integration.

- [ ] Recheck GitHub identity/write access, fetch current `origin/main`, rebase or merge safely without overwriting unrelated changes; never force push.
- [ ] Run relevant local Unity and selected Node tests; remote CI covers the full Hub suite and ClickFlow on non-Windows runners.
- [ ] Push a branch, create/attach PR if repository policy uses PRs, merge to `main`, and wait for exact-SHA Pages/CI success.
- [ ] Verify public Hub card, WebGL playthrough, video playback with Range, Windows ZIP download and hash against release; capture evidence.
- [ ] Update long-term project memory with confirmed release and remaining platform-permission conditions; audit the complete user objective before claiming completion.

## Execution

The user explicitly chose autonomous native execution without further review prompts. Implement tasks in order using `superpowers:executing-plans`, committing each independently useful change. Any unavailable SDK entitlement or live room access must remain an explicit unmet platform acceptance item; a simulation build is never labelled a completed Douyin live integration.
