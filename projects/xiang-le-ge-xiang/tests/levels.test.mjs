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
    'up', 'right', 'right', 'down', 'right', 'right',

    'down', 'down', 'down', 'right', 'right', 'right', 'right',
    'up', 'up', 'up', 'up', 'up', 'up', 'up', 'right', 'right', 'right', 'right',

    'right', 'right', 'right', 'right',
    'down', 'down', 'down', 'down', 'down', 'right', 'right', 'right', 'right',

    'up', 'up', 'right', 'right', 'right', 'down', 'right', 'up',
    'down', 'down', 'down', 'down', 'down', 'down', 'left', 'left', 'left',
    'up', 'up', 'right', 'right', 'up', 'right', 'down'
  ];

  const state = play(levels[1], solution);

  assert.equal(isWon(state), true);
});
