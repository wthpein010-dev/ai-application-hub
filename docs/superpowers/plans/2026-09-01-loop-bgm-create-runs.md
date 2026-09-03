# Loop BGM Lab Create Runs Implementation Plan

> **For agentic workers:** Use `superpowers:test-driven-development`, `superpowers:subagent-driven-development`, and `superpowers:verification-before-completion` while executing this plan.

**Goal:** Preserve one manual Suno Create as one immutable run, allow link-only results, and import multiple downloaded candidates into an explicitly selected run without losing partial successes.

**Architecture:** Extend the pure project-state module first; keep URL and review invariants centralized there. The browser layer renders run output editors and stages all files from one input event against one selected run. No network transport or credential handling is added.

**Spec:** `docs/superpowers/specs/2026-09-01-loop-bgm-create-runs-design.md`

### Task 1: Run outputs and v1→v2 compatibility

**Files:**
- Modify: `projects/loop-bgm-lab/core/project-state.mjs`
- Modify: `projects/loop-bgm-lab/core/prompt-engine.mjs`
- Modify: `tests/loop-bgm-lab-core.test.mjs`
- Modify: `tests/loop-bgm-lab-project-state-hardening.test.mjs`

- [x] Write failing tests for link-only outputs, rejection invariants, frozen registration, old-run migration, output/experiment binding and JSON/Markdown round-trip.
- [x] Run focused tests and confirm the new assertions fail for missing APIs/fields.
- [x] Separate project schema v2 from StyleSpec v1; add rich `outputs`, optional `outputIndex`, `recordCreateRun`, `updateRunOutputs`, `bindExperimentOutput` and synchronized experiment review updates.
- [x] Run focused tests green.

### Task 2: Explicit Create registration UI

**Files:**
- Modify: `projects/loop-bgm-lab/app.js`
- Modify: `projects/loop-bgm-lab/styles.css`
- Modify: `tests/loop-bgm-lab-page.test.mjs`
- Modify: `tests/loop-bgm-lab-browser-smoke.mjs`

- [x] Add failing static/browser assertions for the explicit registration button and two result editors.
- [x] Render the current run, save output URL/score/note/disposition through the pure state API, and keep “open” separate from “record”.
- [x] Verify keyboard labels, live feedback, no new-window opener, and migrated project rendering.

### Task 3: Multi-file same-run candidate import

**Files:**
- Modify: `projects/loop-bgm-lab/index.html`
- Modify: `projects/loop-bgm-lab/app.js`
- Modify: `tests/loop-bgm-lab-browser-smoke.mjs`

- [x] Add failing browser tests: two valid files append to one selected run; valid + invalid preserves the valid result; more than eight is rejected before decode.
- [x] Change candidate input to `multiple`, require an explicit run, process sequentially, store new experiments unbound, and make the last success current.
- [x] Add an explicit candidate-to-output selector; never guess the mapping from file order.
- [x] Preserve latest-selection-wins cancellation and revoke every displaced/staged object URL.

### Task 4: Verification and publication

- [x] Run Loop BGM focused Node tests.
- [x] Run the real browser smoke test and static page/publication contracts.
- [x] Run full repository tests, Hub audit, credential/path scan and `git diff --check`.
- [ ] Request independent review, fix all findings, commit, push, open/merge PR only after CI succeeds, then verify exact Pages publication.
- [ ] Update project memory without storing audio, private paths or credentials.
