export function createGameState(level) {
  return normalizeState({
    level,
    player: { ...level.player },
    crates: level.crates.map((crate) => ({ ...crate })),
    history: [],
    moves: 0,
    pushes: 0
  });
}

export function movePlayer(state, direction) {
  const delta = DIRECTIONS[direction];
  if (!delta) return state;

  const target = add(state.player, delta);
  if (isBlocked(state, target)) return state;

  const crateIndex = findCrate(state.crates, target);
  if (crateIndex >= 0) {
    const crateTarget = add(target, delta);
    if (isBlocked(state, crateTarget) || findCrate(state.crates, crateTarget) >= 0) {
      return state;
    }

    const crates = state.crates.map((crate, index) => (
      index === crateIndex ? crateTarget : { ...crate }
    ));

    return normalizeState({
      ...state,
      player: target,
      crates,
      history: [...state.history, snapshot(state)],
      moves: state.moves + 1,
      pushes: state.pushes + 1
    });
  }

  return normalizeState({
    ...state,
    player: target,
    crates: state.crates.map((crate) => ({ ...crate })),
    history: [...state.history, snapshot(state)],
    moves: state.moves + 1
  });
}

export function undoMove(state) {
  const previous = state.history[state.history.length - 1];
  if (!previous) return state;

  return normalizeState({
    ...state,
    player: { ...previous.player },
    crates: previous.crates.map((crate) => ({ ...crate })),
    history: state.history.slice(0, -1),
    moves: previous.moves,
    pushes: previous.pushes
  });
}

export function isWon(state) {
  return state.level.goals.every((goal) => findCrate(state.crates, goal) >= 0);
}

export function isDoorOpen(state, door) {
  const groupButtons = state.level.buttons.filter((button) => button.group === door.group);
  return groupButtons.length > 0 && groupButtons.every((button) => findCrate(state.crates, button) >= 0);
}

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

function normalizeState(state) {
  return {
    ...state,
    wallSet: makeSet(state.level.walls),
    buttonSet: makeSet(state.level.buttons),
    goalSet: makeSet(state.level.goals),
    doorSet: makeSet(state.level.doors),
    crateSet: makeSet(state.crates)
  };
}

function snapshot(state) {
  return {
    player: { ...state.player },
    crates: state.crates.map((crate) => ({ ...crate })),
    moves: state.moves,
    pushes: state.pushes
  };
}

function isBlocked(state, point) {
  if (point.x < 0 || point.y < 0 || point.x >= state.level.width || point.y >= state.level.height) {
    return true;
  }

  if (state.wallSet.has(key(point))) {
    return true;
  }

  const door = state.level.doors.find((candidate) => samePoint(candidate, point));
  return Boolean(door && !isDoorOpen(state, door));
}

function findCrate(crates, point) {
  return crates.findIndex((crate) => samePoint(crate, point));
}

function makeSet(points) {
  return new Set(points.map((point) => (typeof point === 'string' ? point : key(point))));
}

function add(point, delta) {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y
  };
}

function samePoint(a, b) {
  return a.x === b.x && a.y === b.y;
}

function key(point) {
  return `${point.x},${point.y}`;
}
