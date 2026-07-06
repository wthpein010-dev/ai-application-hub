import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'styles.css'), 'utf8');

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
