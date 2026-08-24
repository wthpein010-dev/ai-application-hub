# Codex Confirmation Bar v2.0.0 Public Release Design

## Summary

Rebrand the current confirmation-overlay mode of CodexThreadWorkbench as a focused desktop product named **Codex 待确认悬浮助手** (English package name: **Codex Confirmation Bar**) and publish it through `wthpein010-dev/ai-application-hub` with an interactive demo, a public tutorial video, and verified Windows and macOS downloads.

The product keeps the proven v1.6.0 scanner and delivery verification behavior. Version 2.0.0 makes the confirmation overlay the default startup experience, adds a guarded macOS active-writer fallback, and retains the legacy multi-session workbench only behind an explicit compatibility switch.

## Goals

- Show a persistent always-on-top confirmation bar for Codex tasks that require an unresolved user action.
- Keep the existing lightweight 4 MiB session-tail reader, 24-hour initial scan window, two-second recurring scan, false-positive exclusions, and delivery verification.
- Confirm one task or every visible task with the exact user message `确认，继续开始做，完成前不要停。`.
- Deliver self-contained Windows x64, macOS arm64, and macOS x64 packages.
- Publish source snapshot, demo, video, manifests, package parts, and download pages through AI Application Hub and GitHub Pages.
- Preserve old public links through redirects and migrate existing Hub customization data from the legacy project id.

## Non-goals

- No Linux release in v2.0.0.
- No automatic approval of Codex security, shell, file-write, or connector approval prompts.
- No cloud service, account proxy, credential collection, or remote storage of conversation content.
- No removal of the legacy multi-session implementation from the source tree.
- No claim that an ad-hoc signed macOS app is Apple-notarized.

## Product identity

- Public Chinese name: `Codex 待确认悬浮助手`
- English/product name: `Codex Confirmation Bar`
- Version: `2.0.0`
- Canonical Hub id and slug: `codex-confirmation-bar`
- Windows executable: `CodexConfirmationBar.exe`
- Windows archive: `CodexConfirmationBar-Windows-x64.zip`
- macOS bundle directory: `CodexConfirmationBar.app`
- macOS archives:
  - `CodexConfirmationBar-macOS-arm64.app.zip`
  - `CodexConfirmationBar-macOS-x64.app.zip`
- macOS bundle id: `dev.wthpein010.codex-confirmation-bar`
- Internal C# namespaces may remain `CodexThreadWorkbench` to avoid a cosmetic mass refactor.

## Desktop startup behavior

Launching without arguments starts the confirmation overlay only. The overlay remains visible while idle and displays `暂无待确认 · 常驻扫描`. It never creates the multi-session main window in the default path.

Compatibility switches:

- `--confirmation-overlay` remains accepted and behaves like the new default.
- `--workbench` explicitly opens the legacy multi-session window while retaining the confirmation monitor.
- `--smoke-test` remains non-interactive and exits with a status code.

The Windows package README documents how to add `CodexConfirmationBar.exe` to the current user's Startup folder. The macOS README documents Login Items and the Accessibility permission needed only by the active-writer fallback. Packaging must not silently enable startup on another user's machine.

## Confirmation data flow

1. Start a private local `codex app-server` process and initialize its JSON-RPC connection.
2. List recent Codex tasks every two seconds.
3. Read at most the final 4 MiB of each relevant local `rollout-*.jsonl` session file.
4. Detect interrupted tasks or completed tasks whose final Codex response explicitly requests confirmation, a choice, more information, a reply, or permission to continue.
5. Display candidates in the always-on-top draggable overlay.
6. When the user confirms, try `thread/resume` followed by `turn/start` through app-server.
7. If the task has an active writer, invoke the platform-specific desktop fallback.
8. Remove the candidate only after the session tail contains the exact confirmation message after the candidate message id.
9. Preserve failed candidates and show a retryable error.

The official Codex App Server protocol is the primary supported integration. Desktop deep-link submission is a local fallback for an active-writer conflict and must fail closed when the expected Codex/ChatGPT desktop application cannot be verified.

## Platform adapters

### Windows

- Open `codex://threads/{threadId}?prompt={encodedMessage}` through the registered shell handler.
- Locate only the installed OpenAI Codex desktop window hosted by `ChatGPT.exe`.
- Bring that verified window to the foreground and send a single Enter key after the prefill settles.
- Keep the existing post-send session-log verification.

### macOS

- Open the same encoded deep link with `/usr/bin/open`.
- Use `/usr/bin/osascript` to wait for a frontmost OpenAI desktop application and send Return through System Events.
- Accept only a frontmost application whose bundle identifier belongs to OpenAI and whose visible application name is `ChatGPT` or `Codex`.
- Return a clear Chinese error when Accessibility permission is missing, the Codex URL handler is unavailable, the OpenAI app never becomes frontmost, or the command exits nonzero.
- Keep the candidate visible until the exact confirmation message is observed in the session log.

The macOS implementation uses an injected process runner so command arguments, cancellation, timeouts, failures, and output parsing can be tested without sending real keyboard input in CI.

## Supported systems and prerequisites

- Windows 10/11 x64.
- macOS 13 or newer, with separate Apple Silicon and Intel builds.
- Codex CLI installed and signed in on the local machine.
- Local Codex session logs available under `CODEX_HOME/sessions` or `~/.codex/sessions`.
- Codex/ChatGPT desktop app installed only when active-writer fallback is needed.

macOS packages are ad-hoc signed because the repository has no Apple signing or notarization secrets. The download page must state this accurately and provide a first-open instruction; it must not describe the app as notarized.

## Source and release layout

The local app source remains authoritative during implementation. The verified source tree is then copied into the Hub release snapshot:

- `build/codex-confirmation-bar/`
- `.github/workflows/build-codex-confirmation-bar.yml`
- `projects/codex-confirmation-bar/`
- `scripts/split-codex-confirmation-bar.mjs`
- `scripts/split-codex-confirmation-bar-mac.mjs`
- focused tests named `codex-confirmation-bar-*.test.mjs`

The legacy `projects/codex-thread-workbench/` public entry becomes a small redirect to the new canonical page. The old catalog id is migrated to `codex-confirmation-bar` without overwriting user-customized names, descriptions, or ordering.

## Interactive public demo

The canonical demo is a browser-safe simulation that never accesses visitors' Codex data. It uses the Hub shared visual shell and demonstrates:

- idle persistent scanning;
- sample tasks appearing;
- dragging the floating bar;
- single confirmation;
- one-click confirmation of all tasks;
- retry behavior after a simulated failure;
- the exact boundary that security approvals remain in Codex.

The demo labels itself as an interactive simulation. It includes the shared fixed `返回主页` control, works on desktop and mobile widths, has no horizontal overflow, and exposes deterministic controls for browser tests and video capture.

## Tutorial video

Produce a silent 16:9 H.264 video between 60 and 90 seconds with six chapters:

1. Why confirmations are easy to miss.
2. Persistent scanning and candidate detection.
3. Dragging and positioning the overlay.
4. Confirming one task.
5. Confirming all tasks and retrying failures.
6. Windows/macOS downloads and privacy boundary.

Use single-line Simplified Chinese WebVTT captions with non-overlapping cues. Publish a poster, tutorial script, MP4, VTT, shared player shell, and real-browser playback evidence.

## Package publication

Each platform archive is split into deterministic GitHub Pages parts with a JSON manifest containing ordered part paths, part lengths, per-part SHA-256 values, total byte length, full archive SHA-256, product version, and filename.

Download pages must:

- expose progress, verification, retry, and failure states;
- validate every part before assembly;
- validate the final archive before saving;
- show the exact version, architecture, size, and SHA-256;
- provide arm64/x64 selection for macOS;
- never use placeholder files or cross-link one platform to another.

## Testing and verification

### Desktop source

- Follow red-green-refactor for every production behavior change.
- Add launch-option tests for overlay-default, legacy overlay flag, and explicit workbench mode.
- Add platform factory and macOS command-runner tests, including timeout, missing permission, wrong frontmost app, nonzero exit, and cancellation.
- Preserve all v1.6 detector, monitor, bounded-tail, delivery, overlay placement, and packaging tests.
- Run Debug and Release suites, formatting verification, `git diff --check`, Windows publish, packaged smoke test, and a safe UI inspection that never confirms a real task.

### macOS CI

- Run Release tests on macOS arm64 and Intel runners.
- Build each self-contained app, validate `Info.plist`, architecture, executable bit, ad-hoc signature, version, bundle id, archive contents, smoke test, and five-second launch liveness.
- Unit-test the macOS fallback with injected command execution; CI must not send real UI input.

### Hub and public site

- Run only explicitly named local Node tests and preserve the Windows ClickFlow no-run gate.
- Test catalog migration, four required buttons, redirects, demo behavior, responsive layout, download manifests, media encoding, captions, and publication audit.
- Use remote CI for the full repository suite.
- After merge, verify Pages deployment, HTTP 200/206 responses, exact remote commit, browser console/network errors, mobile/desktop layout, video playback, and ordered reconstruction of all three archives with matching hashes.

## GitHub workflow

1. Start from the latest `origin/main` in a clean isolated Hub worktree.
2. Verify the authenticated GitHub identity has write permission.
3. Commit app source changes locally and sync the exact verified tree into the Hub build snapshot.
4. Publish infrastructure and text assets before exposing new manifests.
5. Publish Windows parts in bounded commits.
6. Let the macOS matrix build and publish verified Mac parts to the feature branch.
7. Open a draft pull request, wait for required CI, address review findings, mark ready, and merge without force-push.
8. Wait for GitHub Pages and full Hub workflows on the merge commit.
9. Perform online acceptance before reporting completion.

## Failure handling

- Never remove a confirmation candidate until delivery is verified.
- Never send Enter unless the expected OpenAI desktop application is foreground and verified.
- Preserve failed package parts and manifests off the public activation path until complete.
- Do not publish a platform button if its real archive has not passed platform evidence.
- Do not overwrite unrelated dirty worktrees or force-push a moved remote branch.
- If Apple notarization is unavailable, disclose ad-hoc signing rather than blocking or misrepresenting the release.

## Acceptance criteria

- The default application launch presents only the persistent confirmation overlay.
- Windows and both macOS architectures have verified, non-placeholder packages.
- Primary app-server sending and platform active-writer fallbacks are test-covered and fail closed.
- The Hub card is named `Codex 待确认悬浮助手` and exposes exactly `演示 / 视频 / Wins下载 / Mac下载`.
- The canonical demo, video, captions, download pages, manifests, and redirects are public and functional.
- GitHub Pages serves the merged commit and all three reconstructed downloads match their published byte counts and SHA-256 values.
- No local ClickFlow code, package, UI, or generator is run during the release.
