import { computeCoverage } from "./coverage.mjs";
import {
  assignRandomTypes,
  isFirstRoundDocument,
} from "./random-assigner.mjs";
import { solveLevel } from "./level-solver.mjs";
import { XorShift } from "./xorshift.mjs";

const isSpecialType = (type) => type >= 1001 && type <= 1006;

const freshTools = () => ({
  shuffle: { remaining: 1 },
  match: { remaining: 1 },
  undo: { remaining: 1 },
});

function playEvent(type, values = {}) {
  return { type, ...values };
}

function sortTopFirst(left, right) {
  return right.layer - left.layer || right.y - left.y || left.x - right.x;
}

export function createPlaySession(document, seed = 1, options = {}) {
  const sourceDocument = structuredClone(document);
  let currentSeed = Number(seed) | 0;
  let secondSlotUnlocked = options.secondSlotUnlocked !== false;
  let tiles = [];
  let tray = [null, null];
  let selectedTileUid = null;
  let selectedTileWasFlip = false;
  let won = false;
  let deadlocked = false;
  let tools = freshTools();
  let stashHistory = [];

  function resetRuntime(nextSeed = currentSeed) {
    const tentativeSeed = Number(nextSeed) | 0;
    const previous = {
      currentSeed,
      tiles,
      tray,
      selectedTileUid,
      selectedTileWasFlip,
      won,
      deadlocked,
      tools,
      stashHistory,
    };
    try {
      const firstRound =
        options.firstRound ?? isFirstRoundDocument(sourceDocument);
      const requireSolvableAssignment =
        firstRound
        || Boolean(sourceDocument?.designerNote?.aiGeneration)
        || options.requireSolvableRandom === true;
      const rawSolution =
        !firstRound && requireSolvableAssignment
          ? solveLevel({ tiles: sourceDocument.tiles ?? [] })
          : null;
      if (
        sourceDocument?.designerNote?.aiGeneration
        && rawSolution
        && !rawSolution.solvable
      ) {
        throw new RangeError("AI level geometry has no complete removal route");
      }
      const assigned = assignRandomTypes(sourceDocument.tiles ?? [], {
        seed: tentativeSeed,
        ...(sourceDocument.random ?? {}),
        ...(options.random ?? {}),
        firstRound,
        isSolvable: requireSolvableAssignment
          ? (candidate) => solveLevel({ tiles: candidate }).solvable
          : undefined,
        solvableMoves: rawSolution?.solvable ? rawSolution.moves : undefined,
      });
      tiles = assigned.map((tile) => ({
        ...tile,
        removed: false,
        faceDown: tile.presetColorType === 2 || tile.presetColorType === 3,
        covered: false,
        sideBlocked: false,
        hiddenPattern: false,
      }));
      tray = [null, null];
      selectedTileUid = null;
      selectedTileWasFlip = false;
      won = false;
      deadlocked = false;
      refreshCoverage();
      updateEndState([]);
      tools = freshTools();
      stashHistory = [];
      currentSeed = tentativeSeed;
    } catch (error) {
      ({
        currentSeed,
        tiles,
        tray,
        selectedTileUid,
        selectedTileWasFlip,
        won,
        deadlocked,
        tools,
        stashHistory,
      } = previous);
      throw error;
    }
  }

  function findTile(uid) {
    return tiles.find((tile) => tile.uid === uid);
  }

  function isInTray(tile) {
    return Number.isInteger(tile?.stashedSlot);
  }

  function isBoardAccessible(tile) {
    return tile && !tile.removed && !isInTray(tile) && !tile.covered && !tile.sideBlocked;
  }

  function isInteractive(tile) {
    return tile && !tile.removed && (isInTray(tile) || isBoardAccessible(tile));
  }

  function refreshCoverage() {
    const coverage = computeCoverage(tiles);
    for (const tile of tiles) {
      const state = coverage.get(tile.uid);
      tile.covered = state?.covered ?? false;
      tile.sideBlocked = state?.sideBlocked ?? false;
      tile.hiddenPattern = state?.hiddenPattern ?? false;
      tile.occlusionPatches = structuredClone(state?.occlusionPatches ?? []);
      if (
        Number(tile.presetColorType) === 3
        && !tile.removed
        && !isInTray(tile)
      ) {
        tile.faceDown = tile.covered;
      }
    }
  }

  function clearTrayTile(tile) {
    if (isInTray(tile) && tray[tile.stashedSlot] === tile.uid) {
      tray[tile.stashedSlot] = null;
    }
    delete tile.stashedSlot;
  }

  function removePair(first, second, eventType, events) {
    first.removed = true;
    second.removed = true;
    clearTrayTile(first);
    clearTrayTile(second);
    events.push(
      playEvent(eventType, {
        tileUid: first.uid,
        otherTileUid: second.uid,
        tileUids: [first.uid, second.uid],
        tileType: first.type,
      }),
    );
    refreshCoverage();
  }

  function findMatchingPair(candidates) {
    const sorted = [...candidates].sort(sortTopFirst);
    for (let firstIndex = 0; firstIndex < sorted.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < sorted.length; secondIndex += 1) {
        if (sorted[firstIndex].type === sorted[secondIndex].type) {
          return [sorted[firstIndex], sorted[secondIndex]];
        }
      }
    }
    return null;
  }

  function countMatchingPairs(candidates) {
    const counts = new Map();
    for (const tile of candidates) {
      counts.set(tile.type, (counts.get(tile.type) ?? 0) + 1);
    }
    return [...counts.values()].reduce((sum, count) => sum + Math.floor(count / 2), 0);
  }

  function rejectTool(tool, reason) {
    return [playEvent("tool-rejected", { tool, reason })];
  }

  function findSpecialBonusPair() {
    const upper = tiles.filter(
      (tile) => isBoardAccessible(tile) && !tile.faceDown && tile.type !== 0 && tile.type !== -1,
    );
    const pair = findMatchingPair(upper);
    if (pair) {
      return pair;
    }

    for (const top of [...upper].sort(sortTopFirst)) {
      const lower = tiles
        .filter(
          (candidate) =>
            !candidate.removed &&
            !isInTray(candidate) &&
            candidate.covered &&
            !candidate.faceDown &&
            candidate.layer < top.layer &&
            candidate.type === top.type,
        )
        .sort(sortTopFirst)[0];
      if (lower) {
        return [top, lower];
      }
    }
    return null;
  }

  function runSpecialBonus(events) {
    for (let count = 0; count < 2; count += 1) {
      refreshCoverage();
      const pair = findSpecialBonusPair();
      if (!pair) {
        break;
      }
      removePair(pair[0], pair[1], "special-auto-removed", events);
    }
  }

  function hasAvailableMatch() {
    const candidates = tiles.filter(isInteractive);
    return findMatchingPair(candidates) !== null;
  }

  function hasEmptyUsableTraySlot() {
    return tray[0] === null || (secondSlotUnlocked && tray[1] === null);
  }

  function updateEndState(events) {
    const active = tiles.filter((tile) => !tile.removed);
    const nextWon = active.length === 0;
    const nextDeadlocked =
      !nextWon &&
      !hasAvailableMatch() &&
      !(hasEmptyUsableTraySlot() && active.some(isBoardAccessible));
    if (nextWon && !won) {
      events.push(playEvent("won"));
    }
    if (nextDeadlocked && !deadlocked) {
      events.push(playEvent("deadlocked"));
    }
    won = nextWon;
    deadlocked = nextDeadlocked;
  }

  function interact(uid) {
    const events = [];
    const tile = findTile(uid);
    if (!isInteractive(tile)) {
      events.push(playEvent("tile-rejected", { tileUid: uid }));
      return events;
    }

    if (selectedTileUid === null) {
      selectedTileWasFlip = tile.faceDown;
      if (tile.faceDown) {
        tile.faceDown = false;
        events.push(playEvent("tile-face-changed", { tileUid: uid, faceDown: false }));
      }
      selectedTileUid = uid;
      events.push(playEvent("tile-selected", { tileUid: uid }));
      return events;
    }

    if (selectedTileUid === uid) {
      selectedTileUid = null;
      events.push(playEvent("selection-cleared", { tileUid: uid }));
      if (selectedTileWasFlip) {
        tile.faceDown = true;
        events.push(playEvent("tile-face-changed", { tileUid: uid, faceDown: true }));
      }
      selectedTileWasFlip = false;
      updateEndState(events);
      return events;
    }

    const selected = findTile(selectedTileUid);
    const selectedWasFlip = selectedTileWasFlip;
    const secondWasFlip = tile.faceDown;
    selectedTileUid = null;
    selectedTileWasFlip = false;
    events.push(playEvent("selection-cleared", { tileUid: selected.uid }));
    if (secondWasFlip) {
      tile.faceDown = false;
      events.push(playEvent("tile-face-changed", { tileUid: uid, faceDown: false }));
    }

    if (selected.type === tile.type) {
      const triggerSpecial = isSpecialType(selected.type);
      removePair(selected, tile, "tiles-removed", events);
      if (triggerSpecial) {
        runSpecialBonus(events);
      }
      updateEndState(events);
      return events;
    }

    events.push(
      playEvent("tiles-mismatched", {
        tileUid: selected.uid,
        otherTileUid: tile.uid,
        tileUids: [selected.uid, tile.uid],
      }),
    );
    if (selectedWasFlip) {
      selected.faceDown = true;
      events.push(playEvent("tile-face-changed", { tileUid: selected.uid, faceDown: true }));
    }
    if (secondWasFlip) {
      tile.faceDown = true;
      events.push(playEvent("tile-face-changed", { tileUid: tile.uid, faceDown: true }));
    }
    updateEndState(events);
    return events;
  }

  function stash(uid, slotIndex) {
    const events = [];
    const tile = findTile(uid);
    const validSlot =
      (slotIndex === 0 || slotIndex === 1) &&
      (slotIndex !== 1 || secondSlotUnlocked) &&
      tray[slotIndex] === null;
    if (!validSlot || !isBoardAccessible(tile)) {
      events.push(playEvent("tile-rejected", { tileUid: uid, slotIndex }));
      return events;
    }

    if (selectedTileUid === uid) {
      selectedTileUid = null;
      selectedTileWasFlip = false;
      events.push(playEvent("selection-cleared", { tileUid: uid }));
    }
    tile.stashedSlot = slotIndex;
    tray[slotIndex] = tile.uid;
    stashHistory.push(tile.uid);
    if (tile.faceDown) {
      tile.faceDown = false;
      events.push(playEvent("tile-face-changed", { tileUid: uid, faceDown: false }));
    }
    refreshCoverage();
    events.push(playEvent("tray-changed", { tileUid: uid, slotIndex, tray: [...tray] }));
    updateEndState(events);
    return events;
  }

  function useShuffleTool() {
    if (tools.shuffle.remaining <= 0) {
      return rejectTool("shuffle", "spent");
    }

    const boardTiles = tiles.filter((tile) => !tile.removed && !isInTray(tile));
    if (boardTiles.length < 2) {
      return rejectTool("shuffle", "insufficient-tiles");
    }

    refreshCoverage();
    const accessibleUids = new Set(
      boardTiles.filter(isBoardAccessible).map(({ uid }) => uid),
    );
    const sourceTypes = boardTiles.map(({ type }) => type);
    let fallback = null;
    let accepted = null;

    for (let attempt = 0; attempt < 64; attempt += 1) {
      const candidateSeed =
        currentSeed ^ Math.imul(attempt + 1, 0x9e3779b9);
      const candidateTypes = XorShift.fromSeed(candidateSeed).shuffle(sourceTypes);
      const accessibleTiles = boardTiles
        .map((tile, index) => ({ ...tile, type: candidateTypes[index] }))
        .filter(({ uid }) => accessibleUids.has(uid));
      const accessiblePairCount = countMatchingPairs(accessibleTiles);
      const candidate = { candidateTypes, accessiblePairCount };
      if (accessiblePairCount >= 2) {
        accepted = candidate;
        break;
      }
      if (!fallback && accessiblePairCount >= 1) {
        fallback = candidate;
      }
    }

    accepted ??= fallback;
    if (!accepted) {
      return rejectTool("shuffle", "no-shuffle-pair");
    }

    boardTiles.forEach((tile, index) => {
      tile.type = accepted.candidateTypes[index];
    });
    selectedTileUid = null;
    selectedTileWasFlip = false;
    tools.shuffle.remaining -= 1;
    refreshCoverage();
    const events = [
      playEvent("tool-shuffled", {
        tileUids: boardTiles.map(({ uid }) => uid),
        accessiblePairCount: accepted.accessiblePairCount,
      }),
    ];
    updateEndState(events);
    return events;
  }

  function useMatchTool() {
    if (tools.match.remaining <= 0) {
      return rejectTool("match", "spent");
    }

    const interactivePair = findMatchingPair(tiles.filter(isInteractive));
    const pair =
      interactivePair ??
      findMatchingPair(tiles.filter((tile) => !tile.removed));
    if (!pair) {
      return rejectTool("match", "no-pair");
    }

    if (pair.some(({ uid }) => uid === selectedTileUid)) {
      selectedTileUid = null;
      selectedTileWasFlip = false;
    }
    const events = [];
    removePair(pair[0], pair[1], "tool-match-removed", events);
    tools.match.remaining -= 1;
    updateEndState(events);
    return events;
  }

  function useUndoTool() {
    if (tools.undo.remaining <= 0) {
      return rejectTool("undo", "spent");
    }

    while (stashHistory.length > 0) {
      const uid = stashHistory.pop();
      const tile = findTile(uid);
      if (!tile || tile.removed || !isInTray(tile)) {
        continue;
      }

      const slotIndex = tile.stashedSlot;
      clearTrayTile(tile);
      if (selectedTileUid === uid) {
        selectedTileUid = null;
        selectedTileWasFlip = false;
      }
      tools.undo.remaining -= 1;
      refreshCoverage();
      const events = [
        playEvent("tool-undone", {
          tileUid: uid,
          slotIndex,
          tray: [...tray],
        }),
      ];
      updateEndState(events);
      return events;
    }

    return rejectTool("undo", "empty-history");
  }

  function getSnapshot() {
    return structuredClone({
      seed: currentSeed,
      tiles: tiles.map((tile) => ({ ...tile, selected: tile.uid === selectedTileUid })),
      tray,
      selectedTileUid,
      secondSlotUnlocked,
      tools,
      won,
      deadlocked,
    });
  }

  function restart({ seed: nextSeed = currentSeed } = {}) {
    resetRuntime(nextSeed);
    return getSnapshot();
  }

  function setSecondSlotUnlocked(value) {
    secondSlotUnlocked = Boolean(value);
    const events = [playEvent("tray-changed", { tray: [...tray], secondSlotUnlocked })];
    updateEndState(events);
    return events;
  }

  resetRuntime();
  return {
    interact,
    stash,
    useShuffleTool,
    useMatchTool,
    useUndoTool,
    restart,
    getSnapshot,
    setSecondSlotUnlocked,
  };
}
