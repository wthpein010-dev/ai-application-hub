# Dynamic Showcase Final-Review Fix Report

## Scope

- Base: `dfe38a0` (`test: make showcase order oracle literal`).
- Worktree: `C:\Users\ASUS\Documents\AI Project\ai-application-hub\.worktrees\hub-homepage-white-themes-20260824`.
- Branch: `feat/hub-readability-20260824`.
- Fixed all five Important findings and the Windows-local exclusion coverage finding in one implementation wave.
- Preserved the 29 production records, literal local order `18 / 5 / 5`, copy, actions, themes, media registry, and 28 non-ClickFlow showcase images.
- No project subpage, package, video player, media asset, or media-build source changed.

## Root Causes And Fixes

1. `normalizeVisualPath()` trimmed input before validating it and classified absolute URLs with prefix regular expressions. It now rejects every raw C0 control and DEL before trimming or parsing, rejects backslashes and protocol-relative paths, structurally parses scheme-bearing URLs with `URL`, and accepts only HTTPS absolute URLs plus forward-slash relative paths.
2. `getFilteredApps()` applied category and type predicates to every record. A shared `isApplicationRecord()` predicate now scopes category/type filtering and category options to application records; the global query still filters applications, games, and engineering records.
3. `ensureSelectedApp()` directly assigned `state.selectedId`. Selection state, guarded storage persistence, and project-query replacement now live in `synchronizeSelectedApp()`. Direct selection renders only the selected state, while fallback synchronization performs no nested catalog render and the active `render()` completes the current filter/search update without replaying entrance motion.
4. `.app-grid` used `grid-auto-flow: dense`, which backfilled later cards ahead of earlier cards. Dense packing was removed. Browser assertions now compute row-major order from real bounding boxes with a 2px same-row tolerance for all three collections at desktop, tablet, and mobile.
5. `index.html` retained the pre-showcase stylesheet cache chain. Styles, registry, and runtime now use the exact `20260826-dynamic-showcase` marker, with all relevant cache tests updated.
6. The Windows-local visibility contract now behaviorally covers `localhost`, `127.0.0.1`, and `file:` on Windows, plus Windows-public and non-Windows local controls. These checks execute the runtime in a VM and do not instantiate, request, or display ClickFlow in a real browser.

## TDD Evidence

The focused RED command was:

```powershell
node --test tests/hub-catalog-copy-and-migration.test.mjs tests/hub-tool-taxonomy.test.mjs tests/hub-dynamic-showcase.test.mjs tests/card-action-layout.test.mjs
```

It reported `23/28` pass and five expected failures: stale cache marker, C0/DEL URL bypasses, dense grid packing, and cross-collection filter behavior. The strengthened browser RED then reported the expected desktop/tablet visual-order differences, missing 5/5 game and engineering collections under application filters, stale fallback query/storage, incorrect filtered progress totals, and the same project-query gap when storage throws.

After the production fixes, the same focused static set passed `28/28`. The first browser GREEN passed `528` assertions. A fresh final browser run produced the same assertion total.

## Final Verification

Syntax:

- `node --check app-20260706-restore-games.js`: pass.
- `node --check hub-project-media.js`: pass.

Exact named 12-file static suite:

```text
tests 74
pass 74
fail 0
skipped 0
```

Bounded browser smoke:

```text
Dynamic showcase browser smoke passed: 528 assertions, 3 viewports, 4 themes, 21 screenshots, max load 222ms, max initial resources 33, 0 browser errors, 0 ClickFlow nodes/requests/resources/screenshots.
```

The browser run also retained exactly 28 cards and exactly 28 loaded, visible, fitted, nonblank images at each viewport; verified filter/search fallback stage, card, progress, query, storage, and hash synchronization; retained one-time motion and throwing-storage behavior; and confirmed literal visual order for applications, games, and engineering at `1440x900`, `1024x768`, and `390x844`.

- `git diff --check`: pass; only existing LF-to-CRLF working-copy warnings were emitted.
- Changed production paths are limited to the homepage runtime, `index.html`, and `styles.css`.
- Screenshot evidence remains untracked under `test-results/hub-showcase/` and is excluded from the commit.
- No unfiltered `node --test` command was run.
- The tracked ClickFlow packaging test was inspected from `HEAD` before local Node tests; its real Python suite is unconditionally skipped on Windows.

## Concerns

- No blocking final-review concern remains.
- Complete ClickFlow publication/runtime coverage remains assigned to remote CI. Windows-local verification intentionally proves exclusion without running, opening, requesting, displaying, downloading, capturing, or regenerating ClickFlow.
