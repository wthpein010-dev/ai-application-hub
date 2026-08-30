# Loop BGM Lab final-review-2 fix report

Date: 2026-08-30

Baseline: `521fc8daf400d0aafa38600ac48b0d4502938d85`

Implementation commit: `5fbaa89645333d01ba971c576f1d8b485b223b2a`

## Status

DONE. All six Important findings from final review 2 are resolved and covered by real-behavior regressions. The five cards remain a mutable deterministic planning queue; each recorded generation is now an independently archived run with a stable ID and frozen prompt, exclusion, StyleSpec, source, and record-time status. Experiments bind to their own runs, while a changed prompt basis resets only the affected current card.

No push, PR, merge, Pages publication, external-memory update, Suno interaction, login/session access, or credit consumption was performed.

## Design and invariants

- `runs[]` is the durable generation archive. A run has a globally unique ID, source URL, record-time status/generated URL, and canonical `generationConditions`.
- Current batch progress is an exact pointer pair: `currentRunId` plus frozen conditions, and (when a candidate exists) `currentCandidateId` plus matching SHA-256. Hashes are evidence, not identities.
- Rebuilding the prompt queue compares complete generation conditions. An unchanged card retains progress; a changed card returns to `planned` and clears current URL/run/candidate/review progress without deleting runs, candidates, or experiments.
- Every experiment must reference an existing run and exactly equal that run's generation conditions. It no longer validates against a mutable batch-wide snapshot.
- Legacy version-1 JSON without `runs` is migrated during import into explicit runs/current IDs; new-format literals remain strictly validated.
- Local filenames remain session-only. A durable `displayName` exists only after explicit user editing and passes the same portable-value validation as imports and exports.

## Exact RED evidence

1. `node --test --test-name-pattern "successive same-batch" tests/loop-bgm-lab-final-review2.test.mjs`
   - RED: expected exported `rebuildPromptQueue` to be a function; actual value was `undefined`. The old model could neither archive successive same-batch runs nor reset a changed current card.
2. `node --test --test-name-pattern "Markdown explicitly" tests/loop-bgm-lab-final-review2.test.mjs`
   - RED: `TypeError` while reading `runs[0]`; the project had no run archive and Markdown could not emit a submitted-without-candidate snapshot.
3. `node --test --test-name-pattern "encoded and prefixed" tests/loop-bgm-lab-final-review2.test.mjs`
   - RED: `AssertionError: Missing expected exception` for `https://example.test/song?%74oken=private`; encoded/prefixed query or fragment secret names survived validation.
4. `node --test --test-name-pattern "duplicate candidate hashes" tests/loop-bgm-lab-final-review2.test.mjs`
   - RED: expected exported `rebuildPromptQueue` to be a function; actual value was `undefined`. The test also required exact current/current-best IDs for equal hashes, which the old hash pointer could not represent.
5. `node --test --test-name-pattern "explicit portable display-name" tests/loop-bgm-lab-page.test.mjs`
   - RED: page/app source did not match `/reference-display-name/`; no explicit durable-name editor existed and the UI rendered session filenames.
6. `node --test --test-name-pattern "dated Suno free-tier" tests/loop-bgm-lab-page.test.mjs`
   - RED: the free-tier attribution regex did not match; the notice omitted attribution, the official terms link, and a Suno provenance-ledger option.
7. `node tests/loop-bgm-lab-browser-smoke.mjs`
   - RED: timed out after 30 seconds waiting for `#reference-list .reference-display-name`, proving the browser workflow lacked the approved explicit-name/privacy behavior.

## Implementation

1. Added run IDs, `currentRunId`, and `currentCandidateId`; introduced canonical run recording, prompt-queue rebuilding/reset, exact current-run/candidate validation, globally unique run IDs, and legacy v1 import migration. Successive candidates on one card receive separate runs and retain independent experiment snapshots.
2. Added an explicit Markdown `生成运行快照` section for every run, including candidate-less submissions, with run/batch/axis IDs, source, status, generated URL when present, prompt, exclusions, and full frozen StyleSpec.
3. Parse query and fragment parameters with `URLSearchParams`, decode names defensively, and apply existing normalized secret-key detection. Encoded and prefixed secret names are rejected without blocking ordinary HTTPS URLs.
4. Made candidate SHA-256 read-only in the browser. Current-card rendering, review mirroring, and current-best selection use candidate IDs; validation requires exact ID/hash/run/experiment agreement, so duplicate hashes remain unambiguous.
5. Added implicitly labelled reference/candidate display-name inputs, 120-character validation, persisted reference-name rendering, generic fallbacks, live success/error feedback, and current-best name synchronization. File analysis still persists no filename or default display name.
6. Added the dated conservative Basic/free-tier personal/noncommercial and attribution reminder, official `https://suno.com/terms` link, no-clearance warning, and an explicit Suno source/provenance choice and ledger explanation.

## Exact GREEN evidence

- `node --test tests/loop-bgm-lab-final-review2.test.mjs tests/loop-bgm-lab-page.test.mjs tests/loop-bgm-lab-core.test.mjs tests/loop-bgm-lab-candidate.test.mjs tests/loop-bgm-lab-project-state-hardening.test.mjs` — `51/51` passed, `0` failed.
- `node --test tests/loop-bgm-lab-*.test.mjs` — `77/77` passed, `0` failed.
- `node tests/loop-bgm-lab-browser-smoke.mjs` — passed the complete workflow, persistence, import/export, licensing, privacy, reduced motion, four responsive viewports, and zero observed browser errors.
- `node --check` on all 10 changed `.js`/`.mjs` files — passed.
- `git diff --check` — passed (Git emitted only the repository's existing LF-to-CRLF checkout notices, not whitespace errors).

## Files

- `projects/loop-bgm-lab/app.js`
- `projects/loop-bgm-lab/core/portable-safety.mjs`
- `projects/loop-bgm-lab/core/project-state.mjs`
- `projects/loop-bgm-lab/core/prompt-engine.mjs`
- `projects/loop-bgm-lab/index.html`
- `projects/loop-bgm-lab/styles.css`
- `tests/loop-bgm-lab-final-review2.test.mjs`
- `tests/loop-bgm-lab-browser-smoke.mjs`
- `tests/loop-bgm-lab-candidate.test.mjs`
- `tests/loop-bgm-lab-core.test.mjs`
- `tests/loop-bgm-lab-page.test.mjs`
- `tests/loop-bgm-lab-project-state-hardening.test.mjs`

## Self-review

- Run history is append-only through production workflows; prompt/reference edits preserve archives and reset current progress only when canonical conditions differ. The five deterministic prompt definitions and 50-credit local plan were not changed.
- Duplicate hashes no longer influence identity. The browser smoke creates two same-hash candidates on the same batch, keeps the second as current, keeps the first as explicit best, and proves both experiment-to-run links.
- A candidate-less submitted run survives JSON round-trip and appears completely in Markdown. Legacy v1 migration has a dedicated regression restoring its run and exact current candidate.
- Query and fragment URL names are decoded before normalized secret matching; ordinary HTTPS URL, license, and portable display-name cases remain green.
- No durable record is initialized from `File.name`; browser export assertions reject both private fixture filenames. Raw audio, object URLs, absolute paths, credentials, and session data remain outside persistence. Existing object-URL cleanup/race checks pass unchanged.
- Manual Suno boundaries remain intact: links require user gestures, no status is inferred from opening Suno, and no automation/API/session behavior was added.
- Display-name controls are keyboard reachable through native inputs and implicit labels, validation errors use the existing alert, and successful saves use the existing polite live region. Responsive and reduced-motion checks remain green.
- Hub and media contracts were not modified; the complete Loop suite retained all publication/video/provenance checks.

## Residuals

No known defect remains in the six-finding repair scope. Remote release work remains deliberately outstanding and unauthorized for this task.

## Commit SHA(s)

- `5fbaa89645333d01ba971c576f1d8b485b223b2a` — `fix(loop-bgm-lab): preserve immutable generation runs`
