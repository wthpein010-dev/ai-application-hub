# Download Visibility Implementation Plan

Goal: implement the approved tab-local command with working existing links.
Architecture: a small session-state module feeds the shared presentation CSS and click guard; the homepage command handler calls its public facade. Admin APIs remain independent.
Tech stack: existing vanilla JavaScript modules, CSS, Node test runner, Playwright.
Spec: .scratch/download-command/spec.md

## Constraints
No local full-suite/ClickFlow execution. Preserve package URLs and user content. No server permission claims.

## Review Focus
Storage exceptions, unknown commands, fresh-tab isolation, re-rendered cards, gated download detail pages.

## Tasks
- [x] Add failing unit tests for state, storage failures, command dispatch and default-hidden markup.
- [x] Implement state module, shared CSS/click guard and homepage command integration; version changed entry assets.
- [x] Run named tests and targeted browser checks for Enter/button, refresh, fresh tab, close, navigation and mobile layout; block ClickFlow requests.
- [ ] Review scoped diff, publish via PR, await exact Pages SHA and verify public behavior; update project memory.
