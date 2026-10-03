# Lighthouse Audience Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show recent accepted viewer contributions with safe display names in the live game picture, then publish matching Windows/WebGL builds.

**Architecture:** `GameEvent.DisplayName` is presentation-only. A bounded `AudienceActivityFeed` filters event results and formats short labels; `RescueView` renders its current item in the existing hint row. `RescueController` supplies the full event and resets the feed at round boundaries; `RescueGame` remains unchanged.

**Tech Stack:** Unity 2022.3.62f3c1, C#, NUnit EditMode, Windows x64, WebGL, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-03-lighthouse-audience-activity.md`

## Global Constraints

- The public game remains a local simulation and must never claim a live Douyin connection.
- Do not change event validation, cooldowns, vote rules, outcomes, or gifts' cosmetic-only effect.
- Do not run ClickFlow locally on Windows; use targeted lighthouse tests locally and full CI remotely.

## Review Focus

- Raw platform user IDs must never become public labels when `DisplayName` is absent.
- Newlines, rich text tags, and Unicode control characters must not break the portrait layout.
- Rejected and host events must never appear as credited audience actions.
- Bursts must keep at most three items and leave the existing buttons responsive.
- Recovery and a new round must not display a previous viewer's action.

---

### Task 1: Safe, bounded audience feed

**Files:**
- Modify: `build/lighthouse-rescue-unity/Assets/Scripts/Rules/GameEvent.cs`
- Create: `build/lighthouse-rescue-unity/Assets/Scripts/Runtime/AudienceActivityFeed.cs`
- Create: `build/lighthouse-rescue-unity/Assets/Tests/EditMode/AudienceActivityFeedTests.cs`

**Interfaces:**
- `GameEvent.DisplayName: string` is presentation-only.
- `AudienceActivityFeed.Record(GameEvent, ApplyResult, float)` records only accepted viewer actions.
- `AudienceActivityFeed.Current(float): string` returns one label or null; `Reset()` clears it.

- [ ] Write NUnit tests for anonymous/unsafe names, filtered results, burst cap, expiry and reset.
- [ ] Run EditMode tests and verify they fail because the feed is missing.
- [ ] Implement the minimal bounded feed and rerun EditMode tests to green.
- [ ] Commit source and tests.

### Task 2: Render contribution in the existing 9:16 view

**Files:**
- Modify: `build/lighthouse-rescue-unity/Assets/Scripts/Runtime/RescueView.cs`
- Modify: `build/lighthouse-rescue-unity/Assets/Scripts/Runtime/RescueController.cs`
- Modify: `build/lighthouse-rescue-unity/Assets/Tests/EditMode/RescueViewTests.cs`

**Interfaces:** `RescueView.ShowFeedback(GameEvent, ApplyResult)` feeds the event into `AudienceActivityFeed`; the hint line falls back to the system progress copy.

- [ ] Write failing EditMode view tests for accepted action display, rejected action exclusion, display-only nickname and round reset.
- [ ] Run tests and verify the expected red result.
- [ ] Wire the feed to controller and view; retain current generic result feedback.
- [ ] Run all EditMode tests and commit.

### Task 3: Build, record and publish

**Files:** Unity `ProjectSettings`, WebGL output and `projects/lighthouse-rescue/` version, guide, video, release notes and publication tests as required.

**Interfaces:** Exact same Unity rules and view code in Windows and WebGL; Hub card points to a real release asset and public playable video.

- [ ] Build Windows x64 and WebGL; run a fresh Windows round and desktop/390px public-style WebGL rounds, inspect captures.
- [ ] Re-record the actual game video, keep captions one line, update poster and guides.
- [ ] Run targeted Node/Unity tests and publication audit without local ClickFlow execution.
- [ ] Push, create PR, merge, publish Windows release, wait for exact-SHA Pages/CI and verify public assets.
