import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, movePlayer, undoMove, isWon } from '../src/engine.mjs';

const borderWalls = [
  '0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '6,0',
  '0,4', '1,4', '2,4', '3,4', '4,4', '5,4', '6,4',
  '0,1', '0,2', '0,3',
  '6,1', '6,2', '6,3'
];

const baseLevel = {
  width: 7,
  height: 5,
  player: { x: 2, y: 2 },
  walls: borderWalls,
  crates: [{ x: 3, y: 2 }],
  goals: [{ x: 4, y: 2 }],
  buttons: [],
  doors: []
};

test('pushes a crate onto a goal and wins', () => {
  const state = createGameState(baseLevel);
  const next = movePlayer(state, 'right');

  assert.deepEqual(next.player, { x: 3, y: 2 });
  assert.deepEqual(next.crates, [{ x: 4, y: 2 }]);
  assert.equal(isWon(next), true);
});

test('does not push a crate into a wall', () => {
  const state = createGameState({
    ...baseLevel,
    player: { x: 3, y: 2 },
    crates: [{ x: 4, y: 2 }],
    goals: [{ x: 5, y: 2 }],
    walls: [...borderWalls, '5,2']
  });

  const next = movePlayer(state, 'right');

  assert.equal(next, state);
});

test('undo restores the previous position and crate layout', () => {
  const state = createGameState(baseLevel);
  const pushed = movePlayer(state, 'right');
  const undone = undoMove(pushed);

  assert.deepEqual(undone.player, state.player);
  assert.deepEqual(undone.crates, state.crates);
});

test('closed doors block movement until a matching button is covered', () => {
  const state = createGameState({
    width: 8,
    height: 5,
    player: { x: 2, y: 2 },
    walls: [
      '0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '6,0', '7,0',
      '0,4', '1,4', '2,4', '3,4', '4,4', '5,4', '6,4', '7,4',
      '0,1', '0,2', '0,3',
      '7,1', '7,2', '7,3'
    ],
    crates: [{ x: 3, y: 2 }],
    goals: [{ x: 6, y: 2 }],
    buttons: [{ x: 4, y: 2, group: 'A' }],
    doors: [{ x: 5, y: 2, group: 'A' }]
  });

  const blocked = movePlayer(state, 'right');
  const open = movePlayer(blocked, 'right');

  assert.deepEqual(open.player, { x: 4, y: 2 });
});
