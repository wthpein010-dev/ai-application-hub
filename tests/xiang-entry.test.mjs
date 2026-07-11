import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const appScript = readFileSync(join(root, 'app-20260706-restore-games.js'), 'utf8');

test('home page exposes the Xiang Le Ge Xiang playable entry', () => {
  assert.match(indexHtml, /app-20260706-restore-games\.js\?v=[^"]+/);
  assert.match(appScript, /id:\s*"xiang-le-ge-xiang"/);
  assert.match(appScript, /name:\s*"箱了个箱"/);
  assert.match(appScript, /entry:\s*"\.\/projects\/xiang-le-ge-xiang\/index\.html"/);
  assert.equal(existsSync(join(root, 'projects', 'xiang-le-ge-xiang', 'index.html')), true);
  assert.equal(existsSync(join(root, 'projects', 'xiang-le-ge-xiang', 'src', 'game.mjs')), true);
});
