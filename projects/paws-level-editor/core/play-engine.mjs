import { computeCoverage } from "./coverage.mjs";
import {
  assignRandomTypes,
  isFirstRoundDocument,
} from "./random-assigner.mjs";
import { solveLevel } from "./level-solver.mjs";

const isSpecialType = (type) => type >= 1001 && type <= 1006;

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

  function resetRuntime() {
    const assigned = assignRandomTypes(sourceDocument.tiles ?? [], {
      seed: currentSeed,
      ...(sourceDocument.random ?? {}),
      ...(options.random ?? {}),
      firstRound: options.firstRound ?? isFirstRoundDocument(sourceDocument),
      isSolvable: (candidate) => solveLevel({ tiles: candidate }).solvable,
    });
    tiles = assigned.map((tile) => ({
      ...tile,
      removed: false,
      faceDown: tile.presetColorType === 2,
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
    if (tile.faceDown) {
      tile.faceDown = false;
      events.push(playEvent("tile-face-changed", { tileUid: uid, faceDown: false }));
    }
    refreshCoverage();
    events.push(playEvent("tray-changed", { tileUid: uid, slotIndex, tray: [...tray] }));
    updateEndState(events);
    return events;
  }

  function getSnapshot() {
    return structuredClone({
      seed: currentSeed,
      tiles: tiles.map((tile) => ({ ...tile, selected: tile.uid === selectedTileUid })),
      tray,
      selectedTileUid,
      secondSlotUnlocked,
      won,
      deadlocked,
    });
  }

  function restart({ seed: nextSeed = currentSeed } = {}) {
    currentSeed = Number(nextSeed) | 0;
    resetRuntime();
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
    restart,
    getSnapshot,
    setSecondSlotUnlocked,
  };
}
