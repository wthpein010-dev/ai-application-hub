# Hub Visual Polish Implementation Plan

**Goal:** Improve every homepage project visual, action area, motion layer, theme transition, and text treatment while preserving project data, link targets, ordering, editing, filtering, and platform behavior.

**Architecture:** Keep the existing static HTML/CSS/JavaScript stack. Upgrade the media builder to produce consistent product-showcase compositions from authentic local pages, public demos, video frames, or owned source images. Keep the runtime registry as the only media lookup boundary. Add progressive CSS/JavaScript enhancements that remain usable with reduced motion and unavailable browser storage.

**Safety:** Never load, render, capture, build, or regenerate ClickFlow on Windows. Run only explicitly filtered Hub tests locally; use remote CI for the repository-wide ClickFlow coverage.

## Round 1: Product-Focused Media

1. Extend the focused Hub test before implementation to require content-aware media descriptors, image metadata, and fixed output geometry.
2. Verify the new test fails because the current builder only captures whole viewports.
3. Add deterministic focus selection and product-frame composition to `scripts/build-hub-showcase-media.mjs`.
4. Add per-project visual focus and feature metadata to `scripts/hub-showcase-media-sources.json`.
5. Regenerate all 28 non-ClickFlow WebP assets and `hub-project-media.js`.
6. Inspect a full contact sheet and correct weak crops or generic frames.

## Round 2: Cards And Actions

1. Add failing checks for readable card text, stable media geometry, complete button labels, icon treatment, minimum hit area, and two-column action layout.
2. Update runtime card rendering with semantic action icons and a concise feature line that does not repeat the description.
3. Rework card layout so content and action areas align across cards without truncation.
4. Verify desktop, tablet, and mobile layouts, including cards with five platform actions.

## Round 3: Motion, Themes, And Readability

1. Add failing checks for ambient grid/scan layers, scroll progress, theme transition state, reduced-motion behavior, and minimum text sizes.
2. Add lightweight code-native ambient motion, project image depth, theme transition feedback, and clearer focus/hover states.
3. Keep motion out of normal list re-rendering and honor `prefers-reduced-motion`.
4. Tune all four themes for contrast, spacing, and visual consistency.

## Verification And Release

1. Run focused static tests, syntax checks, publication audit, and `git diff --check`.
2. Run the dedicated real-browser smoke across desktop, tablet, mobile, four themes, reduced motion, filters, navigation, editor, image loading, and overflow checks.
3. Perform an independent code/visual review and fix all findings.
4. Commit the branch, verify GitHub write access and the current remote `main`, then fast-forward publish without force pushing.
5. Wait for Pages, full remote Hub/ClickFlow, and macOS audits as applicable.
6. Verify public resource hashes, HTTP status, desktop/mobile rendering, interactions, and browser errors before reporting completion.
