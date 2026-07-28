# Paws 2D Engineering Grid and Play Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic 2D editor grid with the Unity-aligned bounded board grid and add one-use shuffle, match, and undo tools shared by 2D and 3D play.

**Architecture:** A pure `field-grid-layout.mjs` module derives bounded line and label geometry from the document board, and `Canvas2DView` renders that geometry in board coordinates. The existing `createPlaySession` remains the single owner of play state, tool inventory, deterministic shuffle, forced-pair removal, and stash undo history; `WorkbenchController` only dispatches commands, renders returned snapshots, and presents feedback.

**Tech Stack:** Browser-native ES modules, Canvas 2D, existing Three.js renderer, Node.js `node:test`, Playwright browser smoke tests, PNG assets copied byte-for-byte from the Unity project, FFmpeg-backed recording scripts, GitHub Pages.

## Global Constraints

- Unity project files under `E:\Mahjong\PawsHomeClient` are read-only reference inputs and must not be modified.
- The default board is `7 × 8` macro cells, each macro cell is `8 × 8` micro-cells, and imported legal board dimensions remain supported without clipping.
- The engineering grid is visible only in 2D edit mode; 2D and 3D play must not show it.
- Main grid lines use `rgba(255,255,255,0.72)` at `1px`, center-cross lines use `rgba(255,255,255,0.5)` at `1px`, and the board outline uses `rgba(255,224,51,0.85)` at `2px`.
- The bottom tool order is shuffle, match, undo, using Unity `btn_random.png`, `btn_magnet.png`, and `btn_rollback.png`.
- Every play session starts with one use of each tool; only successful operations consume a use.
- `restart()` and seed changes restore tool inventory; 2D/3D switching preserves the current session and inventory.
- Shuffle preserves tile UID, coordinates, layer, face state, and the exact multiset of types; it tries at most 64 deterministic candidates, preferring two accessible pairs and accepting one.
- Match prefers currently interactive pairs, then hidden pairs ordered by layer descending, Y descending, and X ascending; it removes exactly one pair without special-tile bonus chains.
- Undo restores the most recently stashed tile that remains in the tray and skips stale history entries that were already removed.
- Existing edit undo/redo, AI generation, difficulty scoring, pass-rate evaluation, level JSON schema, LAN trash workflow, and Unity project data remain unchanged.
- Published assets and pages must contain no local paths, password, cookie, token, or authentication material.
- The public release must include a fresh tutorial MP4, poster, captions, recording proof, exact-SHA GitHub Pages deployment, HTTP/hash checks, and real browser acceptance at desktop and `390 × 844`.

---

### Task 1: Pure bounded field-grid layout

**Files:**
- Create: `projects/paws-level-editor/core/field-grid-layout.mjs`
- Create: `tests/paws-level-editor-field-grid-layout.test.mjs`

**Interfaces:**
- Consumes: `board: { width: number, height: number }`
- Produces: `buildFieldGridLayout(board): { bounds, majorLines, centerLines, labels, axisLabels }`
- Produces: line records shaped as `{ x1: number, y1: number, x2: number, y2: number }`
- Produces: coordinate label records shaped as `{ axis: "x" | "y", value: number, x: number, y: number }`

- [ ] **Step 1: Write failing layout tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildFieldGridLayout } from "../projects/paws-level-editor/core/field-grid-layout.mjs";

test("7 by 8 board exposes bounded major lines, center crosses and micro-coordinate labels", () => {
  const layout = buildFieldGridLayout({ width: 7, height: 8 });
  assert.deepEqual(layout.bounds, { minX: 0, minY: 0, maxX: 56, maxY: 64 });
  assert.equal(layout.majorLines.length, 8 + 9);
  assert.equal(layout.centerLines.length, 7 + 8);
  assert.deepEqual(
    layout.labels.filter(({ axis }) => axis === "x").map(({ value }) => value),
    [0, 8, 16, 24, 32, 40, 48, 56],
  );
  assert.deepEqual(
    layout.labels.filter(({ axis }) => axis === "y").map(({ value }) => value),
    [0, 8, 16, 24, 32, 40, 48, 56, 64],
  );
  assert.deepEqual(layout.axisLabels, [
    { text: "X", x: 60, y: 68 },
    { text: "Y", x: -4, y: -4 },
  ]);
});

test("imported legal board dimensions determine the full grid without a 7 by 8 clamp", () => {
  const layout = buildFieldGridLayout({ width: 3, height: 2 });
  assert.deepEqual(layout.bounds, { minX: 0, minY: 0, maxX: 24, maxY: 16 });
  assert.equal(layout.majorLines.length, 4 + 3);
  assert.equal(layout.centerLines.length, 3 + 2);
});
```

- [ ] **Step 2: Run tests and verify the missing-module failure**

Run: `node --test tests/paws-level-editor-field-grid-layout.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `field-grid-layout.mjs`.

- [ ] **Step 3: Implement the minimal pure layout builder**

```js
const MICRO_CELLS_PER_MACRO = 8;
const CENTER_OFFSET = 4;

export function buildFieldGridLayout(board = {}) {
  const width = Math.max(1, Number.parseInt(board.width, 10) || 7);
  const height = Math.max(1, Number.parseInt(board.height, 10) || 8);
  const maxX = width * MICRO_CELLS_PER_MACRO;
  const maxY = height * MICRO_CELLS_PER_MACRO;
  const vertical = Array.from({ length: width + 1 }, (_, index) => {
    const x = index * MICRO_CELLS_PER_MACRO;
    return { x1: x, y1: 0, x2: x, y2: maxY };
  });
  const horizontal = Array.from({ length: height + 1 }, (_, index) => {
    const y = index * MICRO_CELLS_PER_MACRO;
    return { x1: 0, y1: y, x2: maxX, y2: y };
  });
  return {
    bounds: { minX: 0, minY: 0, maxX, maxY },
    majorLines: [...vertical, ...horizontal],
    centerLines: [
      ...Array.from({ length: width }, (_, index) => ({
        x1: index * 8 + CENTER_OFFSET, y1: 0,
        x2: index * 8 + CENTER_OFFSET, y2: maxY,
      })),
      ...Array.from({ length: height }, (_, index) => ({
        x1: 0, y1: index * 8 + CENTER_OFFSET,
        x2: maxX, y2: index * 8 + CENTER_OFFSET,
      })),
    ],
    labels: [
      ...Array.from({ length: width + 1 }, (_, index) => ({
        axis: "x", value: index * 8, x: index * 8, y: maxY + 2,
      })),
      ...Array.from({ length: height + 1 }, (_, index) => ({
        axis: "y", value: index * 8, x: -2, y: index * 8,
      })),
    ],
    axisLabels: [
      { text: "X", x: maxX + 4, y: maxY + 4 },
      { text: "Y", x: -4, y: -4 },
    ],
  };
}
```

- [ ] **Step 4: Run the layout tests**

Run: `node --test tests/paws-level-editor-field-grid-layout.test.mjs`

Expected: PASS with `2` passing tests and `0` failures.

- [ ] **Step 5: Commit the pure layout**

```powershell
git add projects/paws-level-editor/core/field-grid-layout.mjs tests/paws-level-editor-field-grid-layout.test.mjs
git commit -m "feat(paws): model bounded Unity field grid"
```

### Task 2: Canvas rendering for the Unity-aligned 2D grid

**Files:**
- Modify: `projects/paws-level-editor/views/canvas-2d.mjs`
- Modify: `tests/paws-level-editor-assets.test.mjs`
- Create: `tests/paws-level-editor-canvas-grid.test.mjs`

**Interfaces:**
- Consumes: `buildFieldGridLayout(this.document.board)`
- Produces: `Canvas2DView.drawFieldGrid(context): void`
- Preserves: `Canvas2DView.draw(): void` rendering order of grid, tiles, previews, and tray

- [ ] **Step 1: Write a failing renderer test using a recording canvas context**

```js
test("2D edit draws the bounded engineering grid and play draws no grid", () => {
  const view = new Canvas2DView();
  view.document = { board: { width: 7, height: 8 }, tiles: [] };
  view.viewport = { scale: 10, offsetX: 100, offsetY: 80 };
  view.mode = "edit";
  const edit = recordingContext();
  view.drawFieldGrid(edit);
  assert.equal(edit.strokes.some(({ strokeStyle }) =>
    strokeStyle === "rgba(255,255,255,0.72)"), true);
  assert.equal(edit.strokes.some(({ strokeStyle }) =>
    strokeStyle === "rgba(255,224,51,0.85)"), true);
  assert.equal(edit.lines.every((line) =>
    line.x1 >= 100 && line.x2 <= 660 && line.y1 >= 80 && line.y2 <= 720), true);

  view.mode = "play";
  const play = recordingContext();
  view.drawFieldGrid(play);
  assert.equal(play.strokes.length, 0);
});
```

The test helper implements real `save`, `restore`, `beginPath`, `moveTo`, `lineTo`, `stroke`, `strokeRect`, and `fillText` recording without replacing `Canvas2DView`.

- [ ] **Step 2: Run the renderer test and verify it fails against `drawGrid`**

Run: `node --test tests/paws-level-editor-canvas-grid.test.mjs`

Expected: FAIL because `drawFieldGrid` is missing and the existing grid is unbounded.

- [ ] **Step 3: Replace the infinite grid with `drawFieldGrid`**

```js
import { buildFieldGridLayout } from "../core/field-grid-layout.mjs";

drawFieldGrid(context) {
  if (this.mode !== "edit" || !this.document?.board) return;
  const layout = buildFieldGridLayout(this.document.board);
  const drawLines = (lines, strokeStyle, lineWidth) => {
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.beginPath();
    for (const line of lines) {
      const first = boardToScreen({ x: line.x1, y: line.y1 }, this.viewport);
      const second = boardToScreen({ x: line.x2, y: line.y2 }, this.viewport);
      context.moveTo(first.x, first.y);
      context.lineTo(second.x, second.y);
    }
    context.stroke();
  };
  context.save();
  drawLines(layout.centerLines, "rgba(255,255,255,0.5)", 1);
  drawLines(layout.majorLines, "rgba(255,255,255,0.72)", 1);
  const first = boardToScreen({ x: 0, y: 0 }, this.viewport);
  const second = boardToScreen(
    { x: layout.bounds.maxX, y: layout.bounds.maxY },
    this.viewport,
  );
  context.strokeStyle = "rgba(255,224,51,0.85)";
  context.lineWidth = 2;
  context.strokeRect(first.x, first.y, second.x - first.x, second.y - first.y);
  // Render labels at their board-derived screen positions with 11px sans-serif.
  context.restore();
}
```

Change `draw()` to call `this.drawFieldGrid(context)` before drawing tiles and remove the old viewport-wide `drawGrid` code.

- [ ] **Step 4: Update asset/static coverage for the new module and bounded method**

Add `core/field-grid-layout.mjs` to `requiredFiles`, assert `canvas-2d.mjs` imports `buildFieldGridLayout`, and assert the source contains `drawFieldGrid` without the previous `screenToBoard({ x: 0, y: 0 }` grid bounds.

- [ ] **Step 5: Run grid and asset tests**

Run: `node --test tests/paws-level-editor-field-grid-layout.test.mjs tests/paws-level-editor-canvas-grid.test.mjs tests/paws-level-editor-assets.test.mjs`

Expected: PASS with no failures.

- [ ] **Step 6: Commit Canvas integration**

```powershell
git add projects/paws-level-editor/views/canvas-2d.mjs tests/paws-level-editor-canvas-grid.test.mjs tests/paws-level-editor-assets.test.mjs
git commit -m "feat(paws): render bounded 2D engineering grid"
```

### Task 3: Publish Unity tool artwork and separate play-control markup

**Files:**
- Modify: `projects/paws-level-editor/core/gameplay-assets.mjs`
- Modify: `projects/paws-level-editor/index.html`
- Modify: `projects/paws-level-editor/styles.css`
- Modify: `tests/paws-level-editor-assets.test.mjs`
- Create: `projects/paws-level-editor/assets/gameplay/btn_magnet.png`
- Create: `projects/paws-level-editor/assets/gameplay/btn_rollback.png`
- Replace from source: `projects/paws-level-editor/assets/gameplay/btn_random.png`

**Interfaces:**
- Produces: `GAMEPLAY_ASSETS.tools.shuffle`, `.match`, and `.undo`
- Produces DOM buttons: `#play-tool-shuffle`, `#play-tool-match`, `#play-tool-undo`
- Produces editor controls separate from `.play-tool-dock`

- [ ] **Step 1: Extend the asset test to fail for the two missing PNGs and new markup**

```js
const expectedGameplayAssets = new Map([
  // existing entries
  ["btn_random.png", { width: 147, height: 122 }],
  ["btn_magnet.png", { width: 147, height: 122 }],
  ["btn_rollback.png", { width: 147, height: 122 }],
]);

assert.match(html, /id="play-tool-shuffle"[\s\S]*btn_random\.png/);
assert.match(html, /id="play-tool-match"[\s\S]*btn_magnet\.png/);
assert.match(html, /id="play-tool-undo"[\s\S]*btn_rollback\.png/);
assert.match(html, /class="play-tool-dock"/);
```

Also compare all three published tool files byte-for-byte with the Unity source directory when that directory exists.

- [ ] **Step 2: Run the asset test and verify the missing assets/markup failure**

Run: `node --test tests/paws-level-editor-assets.test.mjs`

Expected: FAIL because `btn_magnet.png`, `btn_rollback.png`, and the new play-tool buttons do not exist.

- [ ] **Step 3: Copy the three Unity source PNGs byte-for-byte**

```powershell
$source = 'E:\Mahjong\PawsHomeClient\Assets\GameRes\Runtime\UI\LevelScene\Sprites\Atlas1'
$target = 'projects\paws-level-editor\assets\gameplay'
Copy-Item -LiteralPath "$source\btn_random.png" -Destination "$target\btn_random.png" -Force
Copy-Item -LiteralPath "$source\btn_magnet.png" -Destination "$target\btn_magnet.png" -Force
Copy-Item -LiteralPath "$source\btn_rollback.png" -Destination "$target\btn_rollback.png" -Force
```

- [ ] **Step 4: Add the asset map, semantic buttons, counts, and disabled overlay**

```html
<div class="play-tool-dock play-only" aria-label="游戏道具">
  <button id="play-tool-shuffle" class="play-tool-button" type="button" title="随机" aria-label="随机">
    <img src="./assets/gameplay/btn_random.png" alt="" draggable="false">
    <span class="play-tool-count" aria-hidden="true">1</span>
  </button>
  <button id="play-tool-match" class="play-tool-button" type="button" title="配对" aria-label="配对">
    <img src="./assets/gameplay/btn_magnet.png" alt="" draggable="false">
    <span class="play-tool-count" aria-hidden="true">1</span>
  </button>
  <button id="play-tool-undo" class="play-tool-button" type="button" title="撤回" aria-label="撤回">
    <img src="./assets/gameplay/btn_rollback.png" alt="" draggable="false">
    <span class="play-tool-count" aria-hidden="true">1</span>
  </button>
</div>
```

Keep `restart-play`, `lock-seed`, and `fit-play-view` in an editor-oriented test-control strip. Remove the large `rerandomize` gameplay artwork from that strip; seed randomization remains available from the inspector callback.

Define `.play-tool-button:disabled::after` as an absolute full-button overlay with `background: rgba(0,0,0,.4)` and keep the dock clear of the tray at desktop and mobile breakpoints.

- [ ] **Step 5: Run the asset test**

Run: `node --test tests/paws-level-editor-assets.test.mjs`

Expected: PASS with all PNG dimensions, byte equality, markup, and source references verified.

- [ ] **Step 6: Commit tool artwork and layout**

```powershell
git add projects/paws-level-editor/assets/gameplay/btn_random.png projects/paws-level-editor/assets/gameplay/btn_magnet.png projects/paws-level-editor/assets/gameplay/btn_rollback.png projects/paws-level-editor/core/gameplay-assets.mjs projects/paws-level-editor/index.html projects/paws-level-editor/styles.css tests/paws-level-editor-assets.test.mjs
git commit -m "feat(paws): add Unity play tool dock"
```

### Task 4: Tool inventory and deterministic shuffle

**Files:**
- Modify: `projects/paws-level-editor/core/play-engine.mjs`
- Modify: `tests/paws-level-editor-play-engine.test.mjs`

**Interfaces:**
- Consumes: `XorShift.fromSeed(seed)` and `rng.shuffle(list)` from `core/xorshift.mjs`
- Produces snapshot field `tools: { shuffle: { remaining }, match: { remaining }, undo: { remaining } }`
- Produces `useShuffleTool(): PlayEvent[]`

- [ ] **Step 1: Write failing inventory and restart tests**

```js
test("each play tool starts at one use and restart restores inventory", () => {
  const session = createPlaySession(level([
    tile("a", 0, 0, 1, 1), tile("b", 16, 0, 1, 1),
  ]));
  assert.deepEqual(session.getSnapshot().tools, {
    shuffle: { remaining: 1 },
    match: { remaining: 1 },
    undo: { remaining: 1 },
  });
  session.useMatchTool();
  assert.equal(session.getSnapshot().tools.match.remaining, 0);
  session.restart();
  assert.equal(session.getSnapshot().tools.match.remaining, 1);
});
```

- [ ] **Step 2: Run the inventory test and verify `tools` is missing**

Run: `node --test --test-name-pattern="each play tool starts" tests/paws-level-editor-play-engine.test.mjs`

Expected: FAIL because the snapshot has no `tools` field and `useMatchTool` is not defined.

- [ ] **Step 3: Add runtime tool inventory with atomic reset**

Add:

```js
const freshTools = () => ({
  shuffle: { remaining: 1 },
  match: { remaining: 1 },
  undo: { remaining: 1 },
});
let tools = freshTools();
let stashHistory = [];
```

Include `tools` and `stashHistory` in `resetRuntime` rollback state, reset both only after a candidate level assignment succeeds, and clone `tools` into `getSnapshot()`.

- [ ] **Step 4: Write failing shuffle behavior tests**

Cover these literal behaviors in separate tests:

```js
test("shuffle preserves identities and type multiset while exposing a playable pair", () => {
  const session = createPlaySession(shuffleFixture(), 27);
  const before = session.getSnapshot();
  const events = session.useShuffleTool();
  const after = session.getSnapshot();
  assert.deepEqual(events.map(({ type }) => type), ["tool-shuffled"]);
  assert.deepEqual(after.tiles.map(({ uid, x, y, layer }) => ({ uid, x, y, layer })),
    before.tiles.map(({ uid, x, y, layer }) => ({ uid, x, y, layer })));
  assert.deepEqual(after.tiles.map(({ type }) => type).sort((a, b) => a - b),
    before.tiles.map(({ type }) => type).sort((a, b) => a - b));
  assert.equal(after.tools.shuffle.remaining, 0);
});

test("rejected shuffle is atomic and does not consume inventory", () => {
  const session = createPlaySession(noPairShuffleFixture(), 31);
  const before = session.getSnapshot();
  assert.equal(session.useShuffleTool()[0].type, "tool-rejected");
  assert.deepEqual(session.getSnapshot(), before);
});
```

- [ ] **Step 5: Run shuffle tests and verify the missing-method failures**

Run: `node --test --test-name-pattern="shuffle" tests/paws-level-editor-play-engine.test.mjs`

Expected: FAIL because `useShuffleTool` is not defined.

- [ ] **Step 6: Implement deterministic bounded shuffle**

Import `XorShift`, derive candidate seeds from `currentSeed`, attempt indices `0..63`, shuffle only the active non-tray type array, and score each candidate by accessible matching-pair count after `refreshCoverage()`. Store the original type list before attempts; restore it and coverage on rejection. Accept the first candidate with at least two accessible pairs, otherwise retain the first candidate with one accessible pair as fallback. On success decrement `tools.shuffle.remaining` and return:

```js
[playEvent("tool-shuffled", {
  tileUids: boardTiles.map(({ uid }) => uid),
  accessiblePairCount,
})]
```

If fewer than two board tiles remain, no candidate exposes a pair, or inventory is zero, return `tool-rejected` with a machine-readable `reason` and leave the complete snapshot unchanged.

- [ ] **Step 7: Run all play-engine tests**

Run: `node --test tests/paws-level-editor-play-engine.test.mjs`

Expected: PASS with no failures.

- [ ] **Step 8: Commit inventory and shuffle**

```powershell
git add projects/paws-level-editor/core/play-engine.mjs tests/paws-level-editor-play-engine.test.mjs
git commit -m "feat(paws): add deterministic shuffle tool"
```

### Task 5: Match and stash-undo play tools

**Files:**
- Modify: `projects/paws-level-editor/core/play-engine.mjs`
- Modify: `tests/paws-level-editor-play-engine.test.mjs`

**Interfaces:**
- Produces `useMatchTool(): PlayEvent[]`
- Produces `useUndoTool(): PlayEvent[]`
- Extends `stash(uid, slotIndex)` to append successful stashes to `stashHistory`

- [ ] **Step 1: Write failing match tests**

```js
test("match tool removes an interactive pair before a hidden pair", () => {
  const session = createPlaySession(interactiveAndHiddenPairFixture());
  const events = session.useMatchTool();
  assert.equal(events[0].type, "tool-match-removed");
  assert.deepEqual(events[0].tileUids, ["top-a", "top-b"]);
  assert.equal(session.getSnapshot().tools.match.remaining, 0);
});

test("match tool pulls one hidden pair without triggering special bonus chains", () => {
  const session = createPlaySession(hiddenSpecialPairFixture());
  const events = session.useMatchTool();
  assert.equal(events.filter(({ type }) => type === "tool-match-removed").length, 1);
  assert.equal(events.some(({ type }) => type === "special-auto-removed"), false);
  assert.equal(session.getSnapshot().tiles.filter(({ removed }) => removed).length, 2);
});

test("match rejection leaves inventory and tiles unchanged", () => {
  const session = createPlaySession(noPairFixture());
  const before = session.getSnapshot();
  assert.equal(session.useMatchTool()[0].reason, "no-pair");
  assert.deepEqual(session.getSnapshot(), before);
});
```

- [ ] **Step 2: Run match tests and verify missing behavior**

Run: `node --test --test-name-pattern="match tool|match rejection" tests/paws-level-editor-play-engine.test.mjs`

Expected: FAIL because `useMatchTool` is not defined.

- [ ] **Step 3: Implement accessible-first then hidden match**

Call `findMatchingPair(tiles.filter(isInteractive))` first. If absent, call `findMatchingPair(tiles.filter(tile => !tile.removed))`; both use existing `sortTopFirst`. Remove the selected pair with event type `tool-match-removed`, clear selection if either UID was selected, call `updateEndState(events)`, decrement inventory only after removal, and do not call `runSpecialBonus`.

- [ ] **Step 4: Run match tests**

Run: `node --test --test-name-pattern="match tool|match rejection" tests/paws-level-editor-play-engine.test.mjs`

Expected: PASS with no failures.

- [ ] **Step 5: Write failing undo tests**

```js
test("undo restores the newest tile still in the tray", () => {
  const session = createPlaySession(undoFixture());
  session.stash("first", 0);
  session.stash("second", 1);
  const events = session.useUndoTool();
  assert.equal(events[0].type, "tool-undone");
  assert.equal(events[0].tileUid, "second");
  assert.deepEqual(session.getSnapshot().tray, ["first", null]);
  assert.equal(session.getSnapshot().tools.undo.remaining, 0);
});

test("undo skips a stash history entry already removed by matching", () => {
  const session = createPlaySession(staleUndoFixture());
  session.stash("stale", 0);
  session.interact("stale");
  session.interact("stale-pair");
  session.stash("restorable", 0);
  assert.equal(session.useUndoTool()[0].tileUid, "restorable");
});

test("undo rejection is atomic when no stashed tile remains", () => {
  const session = createPlaySession(undoFixture());
  const before = session.getSnapshot();
  assert.equal(session.useUndoTool()[0].reason, "empty-history");
  assert.deepEqual(session.getSnapshot(), before);
});
```

- [ ] **Step 6: Run undo tests and verify missing behavior**

Run: `node --test --test-name-pattern="undo" tests/paws-level-editor-play-engine.test.mjs`

Expected: FAIL because `useUndoTool` is not defined.

- [ ] **Step 7: Implement stash history and undo**

Append `uid` only after `stash` has accepted the tile. In `useUndoTool`, scan `stashHistory` from the end, discarding UIDs whose tile is missing, removed, or no longer in the tray. For the first valid entry, call `clearTrayTile(tile)`, clear matching selection state, refresh coverage, update end state, decrement `tools.undo.remaining`, and return:

```js
[playEvent("tool-undone", {
  tileUid: tile.uid,
  slotIndex,
  tray: [...tray],
})]
```

If inventory is zero or no valid history entry remains, return `tool-rejected` without modifying the snapshot.

- [ ] **Step 8: Run all play-engine tests**

Run: `node --test tests/paws-level-editor-play-engine.test.mjs`

Expected: PASS with no failures.

- [ ] **Step 9: Commit match and undo**

```powershell
git add projects/paws-level-editor/core/play-engine.mjs tests/paws-level-editor-play-engine.test.mjs
git commit -m "feat(paws): add match and undo play tools"
```

### Task 6: Controller wiring, feedback, and shared 2D/3D UI state

**Files:**
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Modify: `projects/paws-level-editor/styles.css`
- Modify: `tests/paws-level-editor-assets.test.mjs`

**Interfaces:**
- Consumes DOM buttons `#play-tool-shuffle`, `#play-tool-match`, `#play-tool-undo`
- Consumes `playSession.useShuffleTool()`, `.useMatchTool()`, `.useUndoTool()`
- Produces `WorkbenchController.usePlayTool(toolName): void`

- [ ] **Step 1: Add failing controller/static assertions**

Assert the controller caches all three IDs, binds them through a `data-play-tool` selector, defines `usePlayTool(toolName)`, and maps `tool-rejected` reasons to these exact messages:

```js
const rejectedMessages = {
  "insufficient-tiles": "剩余砖块不足，无法随机",
  "no-shuffle-pair": "当前局面无法生成可用配对",
  "no-pair": "没有可配对的砖块",
  "empty-history": "暂无可撤回的砖块",
  "spent": "该道具本局已使用",
};
```

- [ ] **Step 2: Run the asset/static test and verify controller wiring is absent**

Run: `node --test tests/paws-level-editor-assets.test.mjs`

Expected: FAIL on missing controller bindings.

- [ ] **Step 3: Implement the controller command boundary**

```js
usePlayTool(toolName) {
  if (!this.playSession || this.mode !== "play") return;
  const methods = {
    shuffle: "useShuffleTool",
    match: "useMatchTool",
    undo: "useUndoTool",
  };
  const method = methods[toolName];
  const events = method ? this.playSession[method]() : [];
  this.playSnapshot = this.playSession.getSnapshot();
  this.refreshRenderer();
  this.presentPlayToolEvents(events);
  this.updateUI();
}
```

Use the existing `refreshRenderer()` method so both renderers receive `setPlaySnapshot(this.playSnapshot)` without remounting the renderer or recreating `playSession`.

In `updateUI()`, set the visible count from `playSnapshot.tools[name].remaining`, set `disabled` when remaining is zero or mode is not play, and keep the same snapshot when switching view.

- [ ] **Step 4: Add lightweight success feedback CSS**

Apply one short `play-tool-used` class animation to the dock and use existing Toast infrastructure for all success/rejection messages. Do not add Unity ads, popups, audio, or long trajectory animation.

- [ ] **Step 5: Run static and play-engine tests**

Run: `node --test tests/paws-level-editor-assets.test.mjs tests/paws-level-editor-play-engine.test.mjs`

Expected: PASS with no failures.

- [ ] **Step 6: Commit controller wiring**

```powershell
git add projects/paws-level-editor/ui/workbench-controller.mjs projects/paws-level-editor/styles.css tests/paws-level-editor-assets.test.mjs
git commit -m "feat(paws): wire shared play tool controls"
```

### Task 7: Real-browser behavior and visual regression

**Files:**
- Modify: `tests/paws-level-editor-browser-smoke.mjs`

**Interfaces:**
- Consumes public page `projects/paws-level-editor/index.html`
- Produces screenshots under the existing Paws artifact root
- Verifies browser console, page error, request failure, and HTTP response failure collections remain empty

- [ ] **Step 1: Add failing browser assertions for the grid and three tools**

In edit 2D, collect a screenshot and use page evaluation to confirm the view method is `drawFieldGrid` and the board is `7 × 8`. Enter play, click a usable tile into the tray, click undo, assert the tile returns and undo count becomes `0`. Click match and assert removed count increases by exactly `2`. Click shuffle and assert the active UID/coordinate sequence is unchanged while the type sequence changes or the success event reports a playable retained candidate.

Switch from 2D to 3D between tool uses and assert:

```js
assert.deepEqual(
  await page.evaluate(() => window.pawsWorkbench.playSnapshot.tools),
  expectedToolsAfterUses,
);
```

Finally restart and assert all three counts return to `1`.

- [ ] **Step 2: Run the browser smoke and verify it fails before the UI is complete**

Run: `node tests/paws-level-editor-browser-smoke.mjs`

Expected: FAIL on a missing play-tool selector or incorrect count/state.

- [ ] **Step 3: Resolve only browser-observed integration defects**

For each defect, add or tighten a unit/static assertion first, run it to observe the failure, implement the smallest correction, then rerun the focused test before rerunning the browser smoke.

- [ ] **Step 4: Run desktop and mobile browser gates**

Run: `node tests/paws-level-editor-browser-smoke.mjs`

Run: `node tests/paws-level-editor-ai-browser-smoke.mjs`

Expected: both exit `0`, desktop and `390 × 844` screenshots contain no horizontal overflow, and all four browser error collections contain `0` entries.

- [ ] **Step 5: Inspect the generated desktop and mobile screenshots**

Open the latest screenshots and verify:

- 2D edit grid stops exactly at the yellow `7 × 8` boundary.
- Macro lines and `+4` center crosses align with tile micro-coordinates.
- X/Y labels remain legible at the fitted viewport.
- The shuffle, match, and undo artwork is ordered left-to-right and does not cover tray tiles.
- Disabled buttons retain their artwork under a `40%` black overlay.
- 3D play shows the same remaining counts as 2D play.

- [ ] **Step 6: Commit browser coverage**

```powershell
git add tests/paws-level-editor-browser-smoke.mjs
git commit -m "test(paws): cover grid and play tools in browser"
```

### Task 8: Fresh media, full gates, release, and online acceptance

**Files:**
- Modify: `scripts/record-paws-level-editor-demo.mjs`
- Modify: `scripts/paws-recording-support.mjs` if proof capture needs a new chapter action
- Modify: `projects/paws-level-editor/video/tutorial-script.md`
- Modify: `projects/paws-level-editor/video/paws-level-editor-tutorial.vtt`
- Replace: `projects/paws-level-editor/video/paws-level-editor-tutorial.mp4`
- Replace: `projects/paws-level-editor/video/poster.jpg`
- Replace: `projects/paws-level-editor/video/recording-proof.json`
- Modify: `tests/paws-level-editor-video.test.mjs`

**Interfaces:**
- Consumes the final public source tree and browser flow
- Produces an H.264 `1280 × 720` tutorial lasting `75–110` seconds
- Produces recording proof hashes for every Paws source file named by `SOURCE_FILES`
- Produces GitHub Pages content at `https://wthpein010-dev.github.io/ai-application-hub/projects/paws-level-editor/index.html`

- [ ] **Step 1: Add the new grid/tool chapter to the recording script and video test**

Record one clear sequence that shows the bounded 2D engineering grid, enters play, uses undo after stashing, uses match, switches to 3D with shared counts, and uses shuffle. Keep captions to one visible line and retain the total duration range.

- [ ] **Step 2: Run the video test and verify proof hashes are stale**

Run: `node --test tests/paws-level-editor-video.test.mjs`

Expected: FAIL because source hashes and/or the new chapter evidence do not match the previous recording.

- [ ] **Step 3: Regenerate tutorial media and proof**

Run: `node scripts/record-paws-level-editor-demo.mjs`

Expected: exit `0`; the script writes the MP4, poster, captions-aligned proof, media probe, screenshot proof, and current SHA-256 source hashes.

- [ ] **Step 4: Verify media and focused Paws gates**

Run: `node --test tests/paws-level-editor-video.test.mjs tests/paws-level-editor-field-grid-layout.test.mjs tests/paws-level-editor-canvas-grid.test.mjs tests/paws-level-editor-play-engine.test.mjs tests/paws-level-editor-assets.test.mjs`

Run: `node tests/paws-level-editor-browser-smoke.mjs`

Run: `node tests/paws-level-editor-ai-browser-smoke.mjs`

Expected: all commands exit `0`, video is H.264 `1280 × 720` and `75–110` seconds, and browser error collections remain empty.

- [ ] **Step 5: Run the complete repository test and module syntax gates**

Run: `node --test`

Run:

```powershell
$files = rg --files projects/paws-level-editor tools/paws-level-editor-lan scripts tests -g '*.mjs'
foreach ($file in $files) { node --check $file; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

Expected: the repository suite has `0` failures, with only the documented Windows ordinary-user symlink permission test allowed to skip, and every checked module exits `0`.

- [ ] **Step 6: Review final diff and commit the verified release**

Run: `git status --short`

Run: `git diff --check`

Run: `git diff 7496db7bc7a7c216c65ac0190143e256eb172c50 --stat`

Expected: only the planned Paws grid, tool, test, documentation, and media files are present; `git diff --check` exits `0`.

```powershell
git add scripts/record-paws-level-editor-demo.mjs scripts/paws-recording-support.mjs projects/paws-level-editor/video tests/paws-level-editor-video.test.mjs
git commit -m "docs(paws): refresh grid and tools tutorial"
```

- [ ] **Step 7: Confirm identity, synchronize, and push without force**

Run: `gh auth status`

Run: `git fetch origin main`

If `origin/main` advanced, rebase the feature branch onto `origin/main`, resolve only overlapping planned files, and rerun Steps 4–6. Then:

```powershell
git switch main
git merge --ff-only codex/paws-engine-sync-20260728
git push origin main
```

Expected: push succeeds without `--force`, and `git rev-parse HEAD` equals `git rev-parse origin/main`.

- [ ] **Step 8: Wait for the exact-SHA GitHub Pages workflow**

Run: `gh run list --workflow pages.yml --branch main --limit 10 --json databaseId,headSha,status,conclusion,url`

Select the run whose `headSha` equals `git rev-parse HEAD`, then:

Run: `gh run watch <databaseId> --exit-status`

Expected: the exact-SHA run finishes with conclusion `success`.

- [ ] **Step 9: Perform online HTTP, hash, and browser acceptance**

Fetch the public HTML, CSS, play engine, grid layout, controller, three PNGs, tutorial MP4, poster, and recording proof with cache-busting query strings. Assert HTTP `200`, compare SHA-256 for source/assets/media with the local files, and load the public page in a real browser.

Repeat the Task 7 tool flow online at desktop and `390 × 844`; verify the bounded edit grid, shared 2D/3D inventory, success-only consumption, restart reset, no overflow, and zero console/page/request/HTTP errors.

- [ ] **Step 10: Update long-term project memory**

Update existing confirmed Paws entries in:

- `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\AI-Application-Hub.md`
- `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\麻将竞品.md`

Record the final commit SHA, Pages workflow ID, test totals, public URL, Unity-aligned grid behavior, three one-use success-consumed tools, and fresh media result. Do not record any credential, password, cookie, token, or full conversation transcript.
