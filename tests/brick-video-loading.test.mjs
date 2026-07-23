import test from 'node:test';
import assert from 'node:assert/strict';

import { getBufferedPercent } from '../projects/brick-light-motion-lab/video/video-load-model.mjs';

test('video buffering progress is real, bounded, and reserves completion for canplay', () => {
  assert.equal(getBufferedPercent(5, 20, false), 25);
  assert.equal(getBufferedPercent(20, 20, false), 95);
  assert.equal(getBufferedPercent(0, 0, false), 8);
  assert.equal(getBufferedPercent(0, 0, true), 100);
  assert.equal(getBufferedPercent(-5, 20, false), 8);
});
