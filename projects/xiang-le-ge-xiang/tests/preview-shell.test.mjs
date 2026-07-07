import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'styles.css'), 'utf8');
const game = readFileSync(join(root, 'src', 'game.mjs'), 'utf8');

test('uses the shared game preview shell structure', () => {
  assert.match(html, /<div class="page">/);
  assert.match(html, /<header class="topbar">/);
  assert.match(html, /<main class="layout">/);
  assert.match(html, /id="startButton"/);
  assert.match(html, /id="stage" class="stage"/);
  assert.match(html, /href="\.\.\/\.\.\/index\.html#games"/);
  assert.match(css, /\.layout\s*{/);
  assert.match(css, /\.stage\s*{/);
  assert.match(css, /\.placeholder\s*{/);
  assert.match(css, /\.is-running \.placeholder/);
});

test('uses swipe gestures instead of virtual direction controls', () => {
  assert.doesNotMatch(html, /class="dpad"/);
  assert.doesNotMatch(html, /data-move=/);
  assert.doesNotMatch(css, /\.dpad/);
  assert.doesNotMatch(html, /gesture-hint/);
  assert.match(game, /stage\.addEventListener\('pointerdown'/);
  assert.match(game, /stage\.addEventListener\('pointerup'/);
});

test('removes decorative thin-line patterns from the preview and game backdrop', () => {
  assert.doesNotMatch(css, /body::before/);
  assert.doesNotMatch(css, /background-size:\s*58px 58px/);
  assert.doesNotMatch(game, /const stars/);
  assert.doesNotMatch(game, /for \(const star of stars\)/);
});
