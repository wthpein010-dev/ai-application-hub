# Lighthouse POV Storm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship first-person survivor rescue scenes with stronger storm, light, particles and synchronized sound in Windows and WebGL.

**Architecture:** Keep `RescueGame` authoritative and unchanged. `RescueView` selects top-down versus POV by `RescueSnapshot`, updates pooled UI weather particles, controls spotlight and lightning, and owns separate ambience and one-shot audio sources. Three new background images live in Unity Resources. Release media and Hub pointers follow the rebuilt binaries.

**Tech Stack:** Unity 2022.3 C#, uGUI, OGG/Vorbis, Node tests, Playwright, GitHub Pages and Release.

**Spec:** `docs/superpowers/specs/2026-10-03-lighthouse-pov-storm.md`

## Global Constraints

- Do not change rules, event routing, button coordinates or simulation/official-live boundary.
- Do not run, build, display, download or regenerate ClickFlow on local Windows. Never run unfiltered `node --test` locally.
- No per-frame GameObject allocation for weather. Respect mute and paused stage.
- Release assets and Pages must correspond to the exact merged `main` SHA.

## Review Focus

- Paused during a checkpoint retains POV and does not restart storm one-shot effects on resume.
- Reset or restored checkpoint does not duplicate rescue or damage feedback.
- 390px controls and labels remain unobscured and tappable.
- WebGL can load the added images/audio without errors or excessive startup delay.
- Muting silences ambient rain and thunder as well as existing interaction sounds.

---

### Task 1: POV resources and camera selection

**Files:**
- Add: `build/lighthouse-rescue-unity/Assets/Resources/Art/RescuePOV1.png`, `RescuePOV2.png`, `RescuePOV3.png` and `.meta`
- Modify: `build/lighthouse-rescue-unity/Assets/Scripts/Runtime/RescueView.cs`
- Test: `build/lighthouse-rescue-unity/Assets/Tests/EditMode/RescueViewTests.cs`

**Interfaces:** `RescueView.IsRescuePOV(RescueSnapshot)` returns true for checkpoints or pause from a checkpoint; `Render` activates exactly one corresponding POV art while hiding top-down ship/crew.

- [ ] Write failing EditMode tests for phase selection, pause, art existence and active visual group.
- [ ] Run targeted tests and confirm the expected failure.
- [ ] Add three generated art assets and implement phase-driven visual activation.
- [ ] Run targeted and full Unity EditMode tests; commit.

### Task 2: Weather, spotlight and audio

**Files:**
- Modify: `RescueView.cs`, `RescueViewTests.cs`
- Add: `Assets/Resources/Audio/StormRain.ogg`, `Thunder.ogg`, `Splash.ogg` with `.meta`; `build/lighthouse-rescue-unity/tools/generate_weather_audio.py`

**Interfaces:** `Render` updates fixed rain/spray pools and lightning; `HostControls.Muted` governs all sources; no change to rules.

- [ ] Add failing tests for particle pool size, paused behavior and mute of weather source.
- [ ] Run targeted tests and confirm the expected failure.
- [ ] Generate deterministic audio; implement pooled particles, stage intensity, beam and lightning with thunder/splash.
- [ ] Run EditMode tests and visual/audio capture; commit.

### Task 3: Build and publish

**Files:**
- Modify: WebGL build, `projects/lighthouse-rescue/play.js`, Hub project metadata, video/poster/subtitles and publish tests.
- Create: versioned Windows ZIP and GitHub Release.

**Interfaces:** Hub card points to current WebGL, video and exact Windows Release.

- [ ] Rebuild WebGL and Windows; run a fresh extracted Windows round and desktop/390px WebGL rounds, inspect captures.
- [ ] Replace stage replay video/poster/captions; run named Node tests and publication audit.
- [ ] Verify remote write permission and latest main; PR and merge normally; create immutable versioned Release.
- [ ] Wait for exact-SHA CI/Pages, download and hash public assets, inspect live play/video/controls; update project memory.
