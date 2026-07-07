import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, movePlayer, isWon } from '../src/engine.mjs';
import { levels } from '../src/levels.mjs';

function play(level, moves) {
  return moves.reduce((state, move) => movePlayer(state, move), createGameState(level));
}

test('level one can be cleared with one push', () => {
  const state = play(levels[0], ['right']);

  assert.equal(isWon(state), true);
});

test('level two has a verified full solution path', () => {
  const solution = [
    'right', 'right', 'right',
    'up', 'right', 'right', 'right', 'down', 'right',
    'right', 'right', 'right', 'up', 'up', 'up', 'up', 'up',
    'right', 'right',
    'down', 'right', 'right', 'right', 'up', 'right',
    'right', 'right', 'right', 'down', 'down',
    'right', 'right',
    'down', 'right', 'right', 'right', 'up', 'right',
    'right', 'right', 'right', 'up', 'up',
    'right', 'right', 'right',
    'left', 'left', 'left', 'down', 'down', 'down', 'down', 'down',
    'right', 'right', 'right',
    'left', 'left', 'left', 'up', 'up', 'up', 'left', 'left', 'left',
    'left', 'down', 'left', 'left', 'left', 'left', 'left', 'down', 'down', 'down', 'down', 'down', 'down',
    'right', 'right',
    'down', 'right', 'right', 'right', 'up', 'right',
    'right', 'right', 'right', 'down', 'down',
    'right', 'right', 'right'
  ];

  const state = play(levels[1], solution);

  assert.equal(isWon(state), true);
});

test('level two is a larger multi-gate challenge with three required goals', () => {
  const level = levels[1];

  assert.ok(level.width >= 36);
  assert.ok(level.height >= 24);
  assert.equal(level.goals.length, 3);
  assert.ok(level.crates.length >= 7);
  assert.ok(level.buttons.length >= 4);
  assert.ok(level.doors.length >= 4);
  assert.ok(level.hints.length >= 4);
});
