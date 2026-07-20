function clone(value) {
  return structuredClone(value);
}

function findTiles(document, tileUids) {
  const wanted = new Set(tileUids);
  return document.tiles.filter((tile) => wanted.has(tile.uid));
}

export class EditHistory {
  constructor(document, { limit = 100 } = {}) {
    this.document = document;
    this.limit = Math.max(1, Math.trunc(limit));
    this.undoStack = [];
    this.redoStack = [];
    this.nextStateId = 1;
    this.stateId = 0;
    this.savedStateId = 0;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  get dirty() {
    return this.stateId !== this.savedStateId;
  }

  execute(command) {
    if (!command || typeof command.apply !== "function" || typeof command.revert !== "function") {
      throw new TypeError("History commands require apply and revert functions");
    }
    const entry = {
      command,
      beforeStateId: this.stateId,
      afterStateId: this.nextStateId++,
    };
    command.apply(this.document);
    this.stateId = entry.afterStateId;
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
    return command;
  }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) {
      return false;
    }
    entry.command.revert(this.document);
    this.stateId = entry.beforeStateId;
    this.redoStack.push(entry);
    return true;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) {
      return false;
    }
    entry.command.apply(this.document);
    this.stateId = entry.afterStateId;
    this.undoStack.push(entry);
    return true;
  }

  markSaved() {
    this.savedStateId = this.stateId;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.stateId = this.nextStateId++;
    this.savedStateId = this.stateId;
  }
}

export function createAddTilesCommand(tiles) {
  const additions = clone(tiles);
  return {
    label: additions.length === 1 ? "放置砖块" : `放置 ${additions.length} 个砖块`,
    apply(document) {
      document.tiles.push(...clone(additions));
    },
    revert(document) {
      const uids = new Set(additions.map((tile) => tile.uid));
      document.tiles = document.tiles.filter((tile) => !uids.has(tile.uid));
    },
  };
}

export function createDeleteTilesCommand(tileUids) {
  const wanted = new Set(tileUids);
  let deleted = null;
  return {
    label: wanted.size === 1 ? "删除砖块" : `删除 ${wanted.size} 个砖块`,
    apply(document) {
      if (deleted === null) {
        deleted = document.tiles
          .map((tile, index) => ({ tile: clone(tile), index }))
          .filter(({ tile }) => wanted.has(tile.uid));
      }
      document.tiles = document.tiles.filter((tile) => !wanted.has(tile.uid));
    },
    revert(document) {
      for (const { tile, index } of deleted ?? []) {
        document.tiles.splice(Math.min(index, document.tiles.length), 0, clone(tile));
      }
    },
  };
}

export function createMoveTilesCommand(tileUids, dx, dy, layerDelta = 0) {
  const wanted = [...tileUids];
  return {
    label: wanted.length === 1 ? "移动砖块" : `移动 ${wanted.length} 个砖块`,
    apply(document) {
      for (const tile of findTiles(document, wanted)) {
        tile.x += dx;
        tile.y += dy;
        tile.layer += layerDelta;
      }
    },
    revert(document) {
      for (const tile of findTiles(document, wanted)) {
        tile.x -= dx;
        tile.y -= dy;
        tile.layer -= layerDelta;
      }
    },
  };
}

export function createPatchTilesCommand(tileUids, patch) {
  const wanted = [...tileUids];
  const changes = clone(patch);
  let previous = null;
  return {
    label: wanted.length === 1 ? "修改砖块属性" : `修改 ${wanted.length} 个砖块属性`,
    apply(document) {
      const targets = findTiles(document, wanted);
      if (previous === null) {
        previous = new Map(
          targets.map((tile) => [
            tile.uid,
            Object.fromEntries(
              Object.keys(changes).map((key) => [
                key,
                { existed: Object.hasOwn(tile, key), value: clone(tile[key]) },
              ]),
            ),
          ]),
        );
      }
      for (const tile of targets) {
        Object.assign(tile, clone(changes));
      }
    },
    revert(document) {
      for (const tile of findTiles(document, wanted)) {
        const fields = previous?.get(tile.uid);
        if (!fields) {
          continue;
        }
        for (const [key, field] of Object.entries(fields)) {
          if (field.existed) {
            tile[key] = clone(field.value);
          } else {
            delete tile[key];
          }
        }
      }
    },
  };
}
