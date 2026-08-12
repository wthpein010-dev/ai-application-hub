# Hub Application Group and Carousel Implementation Plan

**Goal:** Reclassify PlanMap and SimuAI as applications and ship a compact, responsive carousel status control.

**Architecture:** Keep the existing catalog, filtering, rendering, and selection flow. Change two catalog defaults and targeted migration rules, then make `renderDots` render a single semantic state block instead of project buttons. Add authoritative CSS near the existing final carousel overrides.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner, Playwright/Chromium, GitHub Pages.

## Task 1: Lock Behavior With Tests

- [ ] Add catalog assertions for PlanMap and SimuAI application status and badges.
- [ ] Add migration assertions for legacy engineering entries while preserving custom copy and links.
- [ ] Add carousel rendering assertions for name, padded index, total, progress, and no dot buttons.
- [ ] Add navigation assertions for previous/next and wraparound behavior.
- [ ] Run focused tests and confirm the new assertions fail for the expected reasons.

## Task 2: Implement the Homepage Changes

- [ ] Update the two catalog defaults and targeted migration behavior.
- [ ] Replace dot rendering and remove the obsolete dot click listener.
- [ ] Update the carousel markup semantics if required.
- [ ] Add responsive status-bar styling without disturbing the existing hero layout.
- [ ] Bump the homepage runtime cache key.

## Task 3: Verify and Publish

- [ ] Run focused tests, related Hub tests, syntax checks, and publication audit.
- [ ] Verify desktop and mobile rendering and interaction in Chromium.
- [ ] Commit the scoped changes and push through the repository's normal review and main-branch workflow.
- [ ] Verify the exact GitHub Pages deployment and public homepage.
- [ ] Update the existing Hub and PlanMap long-term memory records in place.
