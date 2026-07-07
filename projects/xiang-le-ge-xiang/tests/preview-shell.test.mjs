import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

test('targets a 750 by 1624 portrait game resolution', () => {
  assert.match(html, /data-resolution="750x1624"/);
  assert.match(html, /<canvas id="gameCanvas"[^>]*width="750"[^>]*height="1624"/);
  assert.match(css, /aspect-ratio:\s*750\s*\/\s*1624/);
  assert.match(css, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(css, /#gameCanvas\s*{[^}]*min-height:\s*0/s);
});

test('uses UGUI-style screen classes for the playable package', () => {
  assert.match(html, /class="game-shell ugui-screen"/);
  assert.match(html, /class="game-topbar ugui-panel"/);
  assert.match(html, /class="clear-panel ugui-panel"/);
  assert.match(css, /\.ugui-screen/);
  assert.match(css, /\.ugui-panel/);
  assert.match(css, /\.ugui-button/);
});

test('ships a rich local art asset set used by the canvas renderer', () => {
  const assetDir = join(root, 'assets', 'art');
  assert.equal(existsSync(assetDir), true);
  const svgAssets = readdirSync(assetDir).filter((name) => name.endsWith('.svg'));
  assert.ok(svgAssets.length >= 12, `expected at least 12 art assets, found ${svgAssets.length}`);
  assert.equal(existsSync(join(root, 'src', 'assets.mjs')), true);
  assert.match(game, /import \{ artAssets \} from '\.\/assets\.mjs'/);
  assert.match(game, /loadArtAssets\(\)/);
  assert.match(game, /drawSprite\(/);
});
