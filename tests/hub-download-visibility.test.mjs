import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createDownloadVisibility, DOWNLOAD_VISIBILITY_KEY } from '../assets/download-visibility.mjs';

function fixture(storage = new Map()) {
  const root = { dataset: {} };
  const session = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  return { root, storage, controller: createDownloadVisibility({ root, storage: session }), session };
}

test('visibility is closed by default, reloads only within the same session and can be closed', () => {
  const one = fixture();
  assert.equal(one.controller.enabled, false);
  assert.equal(one.root.dataset.hubDownloads, 'disabled');
  assert.equal(one.controller.setEnabled(true), true);
  assert.equal(one.root.dataset.hubDownloads, 'enabled');
  assert.equal(one.storage.get(DOWNLOAD_VISIBILITY_KEY), 'enabled');
  assert.equal(fixture(one.storage).controller.enabled, true);
  assert.equal(fixture().controller.enabled, false);
  one.controller.setEnabled(false);
  assert.equal(fixture(one.storage).controller.enabled, false);
});

test('unrecognized stored values stay closed and unavailable storage does not break the switch', () => {
  assert.equal(fixture(new Map([[DOWNLOAD_VISIBILITY_KEY, 'true']])).controller.enabled, false);
  const broken = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  const root = { dataset: {} };
  const gate = createDownloadVisibility({root, storage: broken});
  assert.equal(gate.enabled, false);
  assert.equal(gate.setEnabled(true), false);
  assert.equal(gate.enabled, true);
  assert.equal(root.dataset.hubDownloads, 'enabled');
  gate.setEnabled(false);
  assert.equal(gate.enabled, false);
});

test('restored history pages resync the latest same-tab setting', () => {
  const home = fixture();
  home.controller.setEnabled(true);
  const detail = fixture(home.storage);
  home.controller.setEnabled(false);
  assert.equal(detail.controller.enabled, true);
  detail.controller.refresh();
  assert.equal(detail.controller.enabled, false);
  assert.equal(detail.root.dataset.hubDownloads, 'disabled');
  home.controller.setEnabled(true);
  detail.controller.refresh();
  assert.equal(detail.controller.enabled, true);
});

test('maintenance dispatch accepts exact trimmed commands and preserves maintenance', () => {
  const source = readFileSync(new URL('../app-20260706-restore-games.js', import.meta.url), 'utf8');
  const logs = []; const changes = []; let updates = 0;
  const context = { nodes: {command: {value: ''}}, window: {hubDownloadVisibility: {setEnabled(value) {changes.push(value); return true;}}}, log: message => logs.push(message), runMaintenance: () => updates++ };
  vm.runInNewContext(source.slice(source.indexOf('function runCommand()'), source.indexOf('function runMaintenance()')), context);
  for (const command of [' 开启下载 ', '关闭下载']) { context.nodes.command.value = command; context.runCommand(); assert.equal(context.nodes.command.value, ''); }
  assert.deepEqual(changes, [true, false]);
  context.nodes.command.value = '开启下载xxx'; context.runCommand(); assert.equal(changes.length, 2);
  context.nodes.command.value = '1'; context.runCommand(); assert.equal(updates, 1);
  delete context.window.hubDownloadVisibility;
  context.nodes.command.value = '开启下载'; context.runCommand(); assert.match(logs.at(-1), /尚未加载/);
});

test('shared presentation gate is conditional and command state never modifies authentication', () => {
  const css = readFileSync(new URL('../assets/admin-download-gate.css', import.meta.url), 'utf8');
  const gate = readFileSync(new URL('../assets/admin-download-gate.mjs', import.meta.url), 'utf8');
  assert.match(css, /:root:not\(\[data-hub-downloads="enabled"\]\)/);
  assert.match(gate, /!downloadVisibility.enabled/);
  const client = readFileSync(new URL('../assets/admin-download-client.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(client, /hubDownloadVisibility|sessionStorage|localStorage/);
});
