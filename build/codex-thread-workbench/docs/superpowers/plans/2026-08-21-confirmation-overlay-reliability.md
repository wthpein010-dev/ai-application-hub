# Confirmation Overlay Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make confirmation delivery verifiable and reliable while keeping the confirmation bar visible and scans responsive.

**Architecture:** Keep app-server as the fast path, add a Windows Codex deep-link/foreground-input fallback only for active-writer conflicts, and verify delivery through thread history before removing a candidate. Run bounded concurrent reads and render an idle status bar when no candidates exist.

**Tech Stack:** .NET 8, Avalonia 11, xUnit, Codex app-server JSON-RPC, Windows user32 input APIs

**Spec:** `docs/superpowers/specs/2026-08-21-confirmation-overlay-reliability-design.md`

## Global Constraints

- Fixed message must remain exactly `确认，继续开始做，完成前不要停。`.
- Never submit a key unless the foreground process is the installed Codex desktop application.
- Never remove a candidate until thread history proves that exact user message appears after the candidate message.
- Do not open the multi-session workbench in `--confirmation-overlay` mode.
- Do not push or publish to GitHub without separate authorization.

---

### Task 1: Verified Delivery and Active-Writer Fallback

**Files:**
- Create: `src/CodexThreadWorkbench.Core/Confirmation/IConfirmationMessageFallback.cs`
- Create: `src/CodexThreadWorkbench/CodexDesktopMessageFallback.cs`
- Modify: `src/CodexThreadWorkbench.Core/Presentation/ConfirmationOverlayViewModel.cs`
- Modify: `src/CodexThreadWorkbench/App.axaml.cs`
- Test: `tests/CodexThreadWorkbench.Tests/Presentation/ConfirmationOverlayViewModelTests.cs`
- Test: `tests/CodexThreadWorkbench.Desktop.Tests/CodexDesktopMessageFallbackTests.cs`

**Interfaces:**
- Consumes: `ICodexThreadClient`, active-writer `JsonRpcException`, candidate message ID.
- Produces: `IConfirmationMessageFallback.SendAsync(string threadId, string text, CancellationToken)` and verified candidate removal.

- [ ] **Step 1: Write failing tests** for active-writer fallback, unverified delivery retention, and exact deep-link/submit order.
- [ ] **Step 2: Run focused tests and verify RED** with missing fallback types and old premature removal behavior.
- [ ] **Step 3: Implement the minimal fallback and verification loop**; use `codex://threads/{threadId}?prompt=...`, verify the foreground Codex process, send one Enter, and poll history for the exact user message after the candidate.
- [ ] **Step 4: Run focused tests and verify GREEN** with all delivery cases passing.
- [ ] **Step 5: Commit** with `fix: verify confirmation message delivery`.

### Task 2: Persistent Bar, Detection Coverage, and Bounded Scans

**Files:**
- Modify: `src/CodexThreadWorkbench.Core/Confirmation/ConfirmationDetector.cs`
- Modify: `src/CodexThreadWorkbench.Core/Confirmation/ConfirmationMonitor.cs`
- Modify: `src/CodexThreadWorkbench.Core/Presentation/ConfirmationOverlayViewModel.cs`
- Modify: `src/CodexThreadWorkbench/ConfirmationOverlayWindow.axaml.cs`
- Test: `tests/CodexThreadWorkbench.Tests/Confirmation/ConfirmationDetectorTests.cs`
- Test: `tests/CodexThreadWorkbench.Tests/Confirmation/ConfirmationMonitorTests.cs`
- Test: `tests/CodexThreadWorkbench.Desktop.Tests/ConfirmationOverlayWindowTests.cs`

**Interfaces:**
- Consumes: recent thread summaries and unchanged handled-candidate cache.
- Produces: bounded concurrent incremental reads and an always-visible idle overlay.

- [ ] **Step 1: Write failing tests** for “你确认……后”, bounded concurrent reads, incremental publication, and empty-list visibility.
- [ ] **Step 2: Run focused tests and verify RED** against serial scanning and auto-hide behavior.
- [ ] **Step 3: Implement the minimal detector, scan scheduler, and idle copy changes** while preserving timeout/retry semantics.
- [ ] **Step 4: Run focused tests and verify GREEN**.
- [ ] **Step 5: Commit** with `fix: keep confirmation scanner visible and responsive`.

### Task 3: Package, Replace, Restart, and Validate

**Files:**
- Modify: `src/CodexThreadWorkbench/CodexThreadWorkbench.csproj`
- Modify: `README.md`
- Modify: `C:/Users/ASUS/Documents/Obsidian/Codex-Memory/05-项目记忆/CodexThreadWorkbench.md`

**Interfaces:**
- Consumes: completed fixes and existing Windows publish script.
- Produces: version 1.6.0 fixed delivery executable in the stable output path and updated startup launch.

- [ ] **Step 1: Set version 1.6.0 and document the verified fallback behavior**.
- [ ] **Step 2: Run format, diff, Debug, Release, and smoke-test gates**.
- [ ] **Step 3: Back up version 1.5.5, replace the stable EXE/ZIP/README, and restart only `--confirmation-overlay`**.
- [ ] **Step 4: Perform Windows UI read-only acceptance** for persistent visibility and buttons; do not click a real confirmation without fresh authorization.
- [ ] **Step 5: Update project memory with verified hashes, test counts, and runtime state**.
- [ ] **Step 6: Commit** with `chore: ship confirmation delivery reliability`.

