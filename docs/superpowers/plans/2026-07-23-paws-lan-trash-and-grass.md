# Paws LAN Trash and Grass Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the latest Paws web editor as a safe LAN workbench with transactional Unity `_Trash` delete/restore, live multi-user catalog sync, and Unity-matched animated grass in 2D, 3D, and play.

**Architecture:** Add a dependency-free Node HTTP service beside the static Pages project, then select its API only when same-origin health explicitly reports LAN mode. Keep file transactions, auth, static serving, and SSE changes in focused server modules. Render the existing Unity grass atlas through one shared timing/layout module so DOM canvas and Three.js use the same source data.

**Tech Stack:** Node.js 20 ESM, node:test, browser Fetch/EventSource, Canvas 2D, Three.js, PowerShell launcher, Playwright.

## Global Constraints

- GitHub Pages remains static and cannot write the Unity project.
- LAN writes are restricted to the configured `EditorLevels` and block asset directories.
- Save, delete, and restore require same-origin requests plus an in-memory session password.
- Delete and restore move JSON plus optional `.json.meta`; no overwrite is permitted.
- Grass uses the checked-in copy of Unity `Assets/Resources/LevelScene/grass.png` and the 1.0667 second Spine timing.
- `prefers-reduced-motion: reduce` renders static grass.
- Source changes require regenerating `projects/paws-level-editor/video/recording-proof.json` before publication.

---

### Task 1: Transactional level store and authenticated LAN HTTP service

**Files:**
- Create: `tools/paws-level-editor-lan/auth.mjs`
- Create: `tools/paws-level-editor-lan/http-utils.mjs`
- Create: `tools/paws-level-editor-lan/level-store.mjs`
- Create: `tools/paws-level-editor-lan/change-stream.mjs`
- Create: `tools/paws-level-editor-lan/server.mjs`
- Create: `scripts/start-paws-level-editor-lan.ps1`
- Test: `tests/paws-level-editor-lan-store.test.mjs`
- Test: `tests/paws-level-editor-lan-server.test.mjs`

**Interfaces:**
- Consumes: configured `levelDir`, `blockAssetDir`, `webRoot`, password, host and port.
- Produces: `createLanLevelStore()`, `createPawsLanServer()`, `/api/health`, `/api/levels`, `/api/trash`, `/api/events`, auth, save, delete, restore, and block image endpoints.

- [ ] **Step 1: Write failing store tests**

Cover active listing, trash timestamp parsing, expected-version rejection, JSON+meta delete, collision suffixing, restore conflict, and rollback by injecting a failing `rename` implementation.

- [ ] **Step 2: Run store tests and verify missing-module failure**

Run: `node --test tests/paws-level-editor-lan-store.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `tools/paws-level-editor-lan/level-store.mjs`.

- [ ] **Step 3: Implement the minimal file store**

Export:

```js
createLanLevelStore({ levelDir, now, randomSuffix, fsOps })
// listLevelCatalog({ defaultFileName })
// readLevel(fileName)
// saveLevel({ fileName, value, expectedVersion, saveAs })
// listTrash()
// deleteLevel({ fileName, expectedVersion })
// restoreLevel({ trashId })
```

Use `rename` for moves, preflight both JSON/meta destinations, reverse completed moves on error, and emit stable `HttpError` codes.

- [ ] **Step 4: Write failing HTTP/SSE tests**

Assert public reads, rejected unauthenticated writes, login cookie, authenticated delete/list/restore, traversal rejection, restricted assets, SSE initial event and mutation event.

- [ ] **Step 5: Implement auth, safe static service, and SSE hub**

Use an `HttpOnly; SameSite=Strict` session cookie, `Origin` comparison for writes, 5 MiB JSON bodies, realpath containment for static files, `fs.watch` with an 80 ms debounce, and immediate `notify()` after service writes.

- [ ] **Step 6: Add the PowerShell launcher**

Prompt with `Read-Host -AsSecureString` unless `WORKBENCH_PASSWORD` already exists, set only process environment variables, show local/LAN URLs, and restore previous environment values on exit.

- [ ] **Step 7: Run focused server tests**

Run: `node --test tests/paws-level-editor-lan-store.test.mjs tests/paws-level-editor-lan-server.test.mjs`
Expected: all tests pass and the temporary fixtures are removed.

### Task 2: Runtime API selection, authentication, trash UI, and live sync

**Files:**
- Create: `projects/paws-level-editor/lan-api-client.mjs`
- Create: `projects/paws-level-editor/runtime-api-client.mjs`
- Modify: `projects/paws-level-editor/app.mjs`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Modify: `projects/paws-level-editor/index.html`
- Modify: `projects/paws-level-editor/styles.css`
- Test: `tests/paws-level-editor-lan-client.test.mjs`
- Modify: `tests/paws-level-editor-controller-contract.test.mjs`

**Interfaces:**
- Consumes: the LAN HTTP API or existing `static-api-client.mjs`.
- Produces: one controller-compatible client with `runtimeMode`, `canDeleteBundled`, `listTrash()`, `restoreLevel()`, `login()`, and `subscribeCatalog()`.

- [ ] **Step 1: Write failing client-selection and controller contract tests**

Assert explicit `mode: "lan"` selects LAN, 404/HTML/timeout selects static, LAN methods send credentials and versions, the trash dialog exists, and public bundled deletion remains disabled.

- [ ] **Step 2: Run the tests and verify the new contracts fail**

Run: `node --test tests/paws-level-editor-lan-client.test.mjs tests/paws-level-editor-controller-contract.test.mjs`
Expected: FAIL because runtime selection and trash UI do not exist.

- [ ] **Step 3: Implement API selection and write authentication retry**

Construct the controller only after `createRuntimeApiClient()` resolves. For a LAN write returning `authentication-required`, open the password dialog, call `api.login(password)`, then retry the single original operation once.

- [ ] **Step 4: Implement delete/restore UI and sync policy**

Make delete available for LAN project files, pass the open version, populate the trash dialog, restore and open returned files, and subscribe to catalog events. Preserve dirty deleted documents; otherwise clear and open the default file.

- [ ] **Step 5: Run focused API/controller tests**

Run: `node --test tests/paws-level-editor-lan-client.test.mjs tests/paws-level-editor-controller-contract.test.mjs tests/paws-level-editor-controller-race.test.mjs tests/paws-level-editor-static-api.test.mjs`
Expected: all pass; static behavior is unchanged.

### Task 3: Shared Unity grass renderer in 2D, play, and 3D

**Files:**
- Create: `projects/paws-level-editor/core/grass-layout.mjs`
- Create: `projects/paws-level-editor/ui/grass-field.mjs`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Modify: `projects/paws-level-editor/views/three-3d.mjs`
- Modify: `projects/paws-level-editor/styles.css`
- Test: `tests/paws-level-editor-grass.test.mjs`

**Interfaces:**
- Consumes: `GAMEPLAY_ASSETS.grass`, host dimensions, animation time, and reduced-motion preference.
- Produces: `GRASS_PATCHES`, `grassPulseScale(seconds)`, `drawGrassAtlasPatch()`, `GrassField`, and Three.js grass patch meshes.

- [ ] **Step 1: Write failing layout/timing/source tests**

Assert 12 patches, atlas rectangles `2,3,53,29` and rotated `57,2,30,35`, Spine positions, scale values at 0.4667/0.5/0.5333, a grass canvas behind level canvases, shared 3D timing, and reduced-motion guards.

- [ ] **Step 2: Run the grass tests and observe failure**

Run: `node --test tests/paws-level-editor-grass.test.mjs`
Expected: FAIL because the shared module and renderers do not exist.

- [ ] **Step 3: Implement the shared timing and 2D field**

Load the atlas once, draw the two rotated/non-rotated regions at normalized Spine positions, scale around each patch base, pause when hidden, and stop animation under reduced motion. Mount once in the canvas host and destroy with the controller.

- [ ] **Step 4: Replace flat 3D atlas planes**

Create two cropped `CanvasTexture` objects after atlas load, instantiate 12 double-sided upright planes around the board, set `depthWrite: false`, and apply `grassPulseScale()` to Y in the existing animation loop.

- [ ] **Step 5: Run grass and asset tests**

Run: `node --test tests/paws-level-editor-grass.test.mjs tests/paws-level-editor-assets.test.mjs`
Expected: all pass and existing gameplay artwork assertions remain valid.

### Task 4: Browser integration, documentation, published catalog, and proof

**Files:**
- Modify: `tests/paws-level-editor-browser-smoke.mjs`
- Modify: `tests/paws-level-editor-ai-browser-smoke.mjs` only if selectors change.
- Modify: `docs/paws-level-editor-lan.md`
- Modify: `projects/paws-level-editor/levels/index.json` and active level copies through the sync script.
- Regenerate: `projects/paws-level-editor/video/recording-proof.json` and tutorial media outputs as required by the recorder.

**Interfaces:**
- Consumes: completed LAN server and web editor.
- Produces: documented launch flow and fresh proof artifacts.

- [ ] **Step 1: Add a two-client LAN browser scenario**

Start the real LAN server on a temporary fixture, open two Playwright contexts, login, delete from A, assert B updates without manual refresh, restore from B, assert A updates, and verify dirty-document preservation.

- [ ] **Step 2: Add visual/reduced-motion checks**

Capture 2D, 3D, play, and 390×844 screenshots; assert grass canvas pixels differ across an animation pulse, reduced-motion frames stay stable, and console/page/request errors remain empty.

- [ ] **Step 3: Document launch and safety boundary**

Document `scripts/start-paws-level-editor-lan.ps1`, default directories, password lifetime, `_Trash` recovery, LAN URL, firewall private-network restriction, and the Pages/static distinction.

- [ ] **Step 4: Synchronize active project levels**

Run:

```powershell
node scripts/sync-paws-published-levels.mjs `
  'E:\Mahjong\PawsHomeClient\Assets\GameRes\Resources\Config\Gameplay\EditorLevels' `
  'projects\paws-level-editor\levels' `
  'level_0021_r2_第二关模板12.json'
```

Expected: active JSON files only; `_Trash` remains unpublished.

- [ ] **Step 5: Regenerate source-hash-bound media proof**

Run: `node scripts/record-paws-level-editor-demo.mjs`
Expected: recorder completes, video decodes, proof hashes match current sources, captions remain one line.

### Task 5: Fresh regression, commit, push, Pages, and online acceptance

**Files:**
- Verify all changed files and generated proof artifacts.

**Interfaces:**
- Consumes: the completed implementation.
- Produces: a fast-forward `origin/main` release and evidence-backed local/LAN/public acceptance.

- [ ] **Step 1: Run syntax and full automated regression**

Run every repository `tests/*.test.mjs`, then `node --check` for every project/script/test `.mjs`. Expected: zero failures; only the documented Windows symlink-permission test may skip.

- [ ] **Step 2: Run local static and LAN browser acceptance**

Verify static Pages mode cannot delete bundled files, LAN mode can delete/restore JSON+meta, two clients sync, 2D/3D/play grass matches, mobile has no horizontal overflow, and all four browser error channels are zero.

- [ ] **Step 3: Inspect scope and commit intentionally**

Run `git status -sb`, `git diff --check`, and inspect the full diff. Stage only Paws feature, tests, docs, synchronized levels, and proof files; commit with a terse Paws LAN trash/grass message.

- [ ] **Step 4: Rebase and push without force**

Fetch `origin/main`; if it advanced, rebase the feature commits and rerun affected tests. Push the resulting fast-forward history to `origin/main`.

- [ ] **Step 5: Wait for Pages and verify online**

Confirm the deployed workflow SHA equals remote `main`, key resources return HTTP 200, the public page remains static/browser-local, grass animates in normal motion and stops under reduced motion, 2D/3D/play work, video plays, mobile does not overflow, and console/page/request/HTTP failures are zero.
