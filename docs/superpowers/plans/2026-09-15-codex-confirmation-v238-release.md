# Codex Confirmation Bar v2.3.9 Publication Plan

> **For agentic workers:** Use superpowers:executing-plans to execute this publication in the current session, with verification before each public activation.

**Goal:** Publish the verified desktop v2.3.9 portrait update, matching interactive demo, video and Windows/macOS downloads to the existing AI Application Hub.

**Architecture:** Preserve the existing static Pages site and separate multi-thread workbench. Synchronize only the confirmation app source snapshot from the verified local worktree; reuse the verified Windows archive and build both Mac architectures on native GitHub runners. Upload immutable package parts before activating their manifests.

**Tech Stack:** Avalonia/.NET 8; static HTML/CSS/JavaScript; Node test/Playwright; ffmpeg; GitHub Actions and Pages.

**Spec:** Current user request and approved v2.3.8 local portrait layout; publication v2.3.9 additionally fixes the reviewed test-report boundary. Workflow FLOW-20260720-004. The running local app is not replaced by this publication task.

## Global Constraints

- No real confirmation messages, local automation-setting changes, shutdown or ClickFlow execution/download/build on Windows.
- Preserve unrelated dirty worktrees, other Hub projects and the independent multi-thread workbench.
- Keep five existing actions; iOS remains a PWA demonstration, not a desktop controller.
- Captions stay single-line, video under four minutes, packages retain product-specific identities.

### Task 1: Verify and freeze release inputs

- [x] Verify current GitHub identity/write access, latest main, source diff and exact Windows ZIP SHA-256.
- [x] Synchronize tracked source/scripts/tests/README into `build/codex-thread-workbench/`, excluding generated files and unrelated docs.
- [x] Run `dotnet test CodexThreadWorkbench.sln -c Debug` and `-c Release` in the snapshot; 369 passing tests per configuration.

### Task 2: Synchronize the public experience

Files: `projects/codex-thread-workbench/{index.html,styles.css,app.js}`, download/iOS/video pages, `app-20260706-restore-games.js`, `scripts/render-codex-thread-workbench-video.mjs`, `tests/codex-thread-workbench-page.test.mjs`.

- [ ] Add a real-browser regression asserting a portrait panel, vertical cards, a bottom-fixed batch button and a narrow left handle; run it against old layout and observe failure.
- [ ] Mirror the approved 360×560 layout and left docking; keep existing simulated controls, add the existing app's ignore action, and make all demo receipts explicitly simulated.
- [ ] Refresh version/copy, single-line captions and tutorial script; retain shared background/home/video shell.
- [ ] Record the existing seven-chapter walkthrough, refresh poster and Hub preview; validate H.264 1280×720, 86 seconds and decode without errors.

### Task 3: Publish platform packages

Files: `scripts/split-codex-thread-workbench.mjs`, Windows manifest/new immutable parts, `.github/workflows/build-codex-thread-workbench.yml`; Mac publishing scripts reused unchanged.

- [ ] Pin splitter and Windows download test to verified v2.3.9 size/hash; generate five parts in a new version directory and verify full reassembly.
- [ ] Commit/push infrastructure and individual package parts before Windows manifest activation; never force push.
- [ ] Dispatch the existing Mac workflow on the publication branch; wait for both native tests/signatures/smoke/real startup and bot-published manifests.
- [ ] Fetch and fast-forward the branch only after workflow completion; verify both Mac package versions and hashes.

### Task 4: Release and verify online

- [ ] Run explicit Codex-only Node suites, the source-snapshot tests and `git diff --check`; no unfiltered Node tests on Windows.
- [ ] Review scoped diff, open a PR, run full Hub validation remotely, and merge only after required checks pass.
- [ ] Verify Pages for the exact merged main SHA; reassemble all public packages with length/hash checks and run the native Mac public-download audit.
- [ ] Check desktop/mobile demo interactions, five links, media playback/captions and no overflow or browser errors.
- [ ] Update project memory with final URLs, release evidence and source version; report completion only after publication succeeds.
