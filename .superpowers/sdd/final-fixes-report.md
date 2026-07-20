# Paws local level import final fixes

Date: 2026-07-20
Branch: `codex/paws-local-level-import`
Fix commit: `fc86fc8 fix: harden paws local imports`

## Findings resolved

### Important 1: atomic browser persistence

Root cause: `saveLevel` wrote the level record and local-file manifest independently. A failure after either `setItem` could leave storage different from its pre-save state.

Fix:

- Snapshot the exact raw record and manifest strings before either write.
- Route record-plus-manifest persistence through one compensating operation.
- If either write throws, attempt restoration of both snapshots, including removal when the prior record was absent.
- Attempt both restoration operations even if the first restoration throws.
- Preserve the original storage error after successful rollback; report `local-storage-rollback-failed` if compensation itself cannot restore the snapshot.

Tests use a storage double that mutates and then throws at each write boundary. They prove the exact prior record and manifest strings are restored after record-write failure, and that a newly written import record is removed while the exact prior manifest is restored after manifest-write failure.

### Important 2: no false import success

Root cause: `refreshLevels` and `openLevel` render their own errors and resolve, so `importLocalLevel` could continue to its success toast.

Fix:

- Add `activateImportedLevel`, an explicit postcondition gate.
- After refresh, require the refreshed list to contain the imported filename.
- After open, require `document.fileName` to equal the imported filename.
- Any direct refresh/open rejection also propagates through the gate.
- The controller awaits the gate before showing the success toast, so caught refresh/open failures become import errors.

Focused tests model both internally caught refresh failure and internally caught open failure and assert stable `import-refresh-failed` / `import-open-failed` errors.

### Important 3: imported-document acceptance and proof

The real Playwright file chooser regression now keeps `local_demo_import.json` open while it:

- selects and edits an imported tile;
- saves and proves the imported localStorage record contains the edit;
- renders the same imported document in the real 3D/WebGL canvas;
- enters play mode and removes a real matching pair through canvas clicks;
- only then returns to the bundled level and cleans up the synthetic imports.

Existing persistence, collision naming, invalid-import isolation, bundled edit/save/reset, 2D/3D play interaction, mobile hiding, overflow, and zero-error assertions remain.

`projects/paws-level-editor/ui/local-level-import.mjs` was added to both recording proof source manifests. The real recording script regenerated the MP4, poster, and proof; no hash was edited manually.

## TDD evidence

### RED: persistence and import activation

Command:

```powershell
node --test tests/paws-level-editor-static-api.test.mjs tests/paws-level-editor-controller-contract.test.mjs
```

Observed before production changes:

```text
tests 23
pass 18
fail 5
```

Expected failures:

- `import activation rejects a refresh failure that was caught by the controller`
  - `activateImportedLevel is not a function`
- `import activation rejects an open failure that was caught by the controller`
  - `activateImportedLevel is not a function`
- `controller gates the import success toast on refreshed and opened postconditions`
  - controller had no activation gate
- `save restores the exact prior record and manifest when the record write fails`
  - actual record remained the failed new value
- `save restores the exact prior record and manifest when the manifest write fails`
  - actual record remained the failed new value

### RED: recording proof source integrity

Command:

```powershell
$env:FFMPEG_PATH='C:\Users\ASUS\AppData\Local\Temp\codex-media-runtime\node_modules\ffmpeg-static\ffmpeg.exe'
node --test tests/paws-level-editor-video.test.mjs
```

Observed before changing the recording source manifest:

```text
tests 5
pass 4
fail 1
```

Expected failure: proof sources omitted `projects/paws-level-editor/ui/local-level-import.mjs`.

### GREEN: focused findings

Command:

```powershell
node --test tests/paws-level-editor-static-api.test.mjs tests/paws-level-editor-controller-contract.test.mjs
```

Result:

```text
tests 23
pass 23
fail 0
```

### Browser acceptance iteration

The first expanded browser run reached the imported edit/save and WebGL assertions, then timed out after switching from 3D to 2D play at the matching-pair state-change wait. The imported acceptance path lacked the renderer-stability wait already used by the bundled path. Adding the same `waitForNetworkAndTextures` condition was a test synchronization correction; no production behavior changed.

The next run and final fresh run passed.

## Recording and media evidence

Real generation command:

```powershell
$env:FFMPEG_PATH='C:\Users\ASUS\AppData\Local\Temp\codex-media-runtime\node_modules\ffmpeg-static\ffmpeg.exe'
node scripts/record-paws-level-editor-demo.mjs
```

Generated:

- `projects/paws-level-editor/video/paws-level-editor-tutorial.mp4`
- `projects/paws-level-editor/video/poster.jpg`
- `projects/paws-level-editor/video/recording-proof.json`

Dedicated verification:

```powershell
node --test tests/paws-level-editor-recording-script.test.mjs tests/paws-level-editor-video.test.mjs tests/project-video-coverage.test.mjs
```

Result:

```text
tests 10
pass 10
fail 0
```

The suite verified full MP4 decoding, H.264, 16:9 dimensions, duration, current media/source hashes, distinct chapter frames, no long black or frozen segment, real state-change proof, and zero recorded browser errors.

## Final verification

### Complete relevant Node regression

```powershell
$env:FFMPEG_PATH='C:\Users\ASUS\AppData\Local\Temp\codex-media-runtime\node_modules\ffmpeg-static\ffmpeg.exe'
node --test tests/paws-level-editor-assets.test.mjs tests/paws-level-editor-controller-contract.test.mjs tests/paws-level-editor-level-summary.test.mjs tests/paws-level-editor-local-import.test.mjs tests/paws-level-editor-publish.test.mjs tests/paws-level-editor-recording-script.test.mjs tests/paws-level-editor-static-api.test.mjs tests/paws-level-editor-static-server.test.mjs tests/paws-level-editor-video.test.mjs tests/project-video-coverage.test.mjs
```

Result:

```text
tests 57
pass 56
fail 0
skipped 1
```

The only skip is the existing Windows file-symlink permission condition; directory-junction escape coverage ran and passed.

### Final real-browser regression

```powershell
npm run test:paws-browser
```

Static server result: 2 pass, 0 fail, 1 existing Windows symlink-permission skip.

Browser summary:

```json
{
  "browser": "chromium 150.0.7871.125",
  "desktopOverflow": false,
  "mobileOverflow": false,
  "importedFileName": "local_demo.json",
  "importPersists": true,
  "collisionFileName": "local_demo_import.json",
  "importedEditSaved": true,
  "importedWebgl": true,
  "importedPlayInteraction": true,
  "mobileImportHidden": true,
  "removedBy2dClicks": 6,
  "threePointerInteraction": true,
  "consoleErrors": 0,
  "httpErrors": 0,
  "pageErrors": 0,
  "requestFailures": 0
}
```

### Syntax, media, privacy, and diff

```text
SYNTAX_OK files=19
MP4_DECODE_OK
SENSITIVE_SCAN_OK matches=0
CREDENTIAL_SCAN_OK matches=0 vendor=excluded
WORKTREE_DIFF_CHECK_OK
BRANCH_DIFF_CHECK_OK
```

The sensitive scan covered `EditorLevels`, local Windows paths, `maque`, password, and cookie markers. The credential scan covered API-key, secret, bearer, authorization, access-token, private-key, and credential markers in application-owned public files. Vendored Three.js was excluded only from the generic credential-word scan because its loader legitimately contains `withCredentials`.

## Self-review

- Compensation snapshots are captured before either write and preserve raw string identity rather than a parsed/normalized manifest.
- Both snapshot keys are restoration-attempted even when one restoration fails.
- The import activation gate is awaited immediately before the success toast.
- The refreshed-list and current-document conditions use the collision-resolved filename returned by preparation.
- Browser cleanup occurs only after imported edit/save, WebGL, and play assertions.
- Recording proof source lists in generator and verifier match and were regenerated by the real script.
- No unrelated files were changed; nothing was pushed or deployed.

Concerns: none. The single skipped check is the pre-existing Windows file-symlink permission condition documented above.
