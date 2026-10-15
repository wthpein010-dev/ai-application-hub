const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Reuse only the existing VM browser harness, without registering its tests.
// The generated buttons, player click handler, support module and balance stay real.
const harnessPath = path.join(__dirname, 'app-flow.test.cjs');
const harnessSource = fs.readFileSync(harnessPath, 'utf8').split(/\r?\n(?=test\()/, 1)[0];
const harnessModule = { exports: {} };
vm.runInNewContext(harnessSource + '\nmodule.exports = boot;', {
  require, __dirname, module: harnessModule
}, { filename: harnessPath });
const boot = harnessModule.exports;

function returnAction(markup, label) {
  const button = [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .find(match => match[2].replace(/<[^>]+>/g, '').trim() === label);
  assert.ok(button, `${label} must be rendered by the production confirmation`);
  return button[1].match(/data-action="([^"]+)"/)?.[1];
}

test('补签确认返回签到会关闭提示，保留补签券且不发奖励', () => {
  const app = boot();
  app.click('activity');
  app.click('support:signinPage');
  app.click('support:scenario', 'makeup');
  const before = app.state();
  app.click('support:signin', '2026-10-12');
  assert.match(app.modal(), /确认补签/);
  assert.equal(returnAction(app.modal(), '返回签到'), 'closeModal');

  app.clickText(/^返回签到$/);
  assert.equal(app.modal(), '');
  const after = app.state();
  assert.equal(after.data.screen, 'supportSignin');
  assert.deepEqual(after.session, before.session);
  assert.deepEqual(after.data.support.makeupByWeek, before.data.support.makeupByWeek);
  assert.deepEqual(after.data.support.rewards, before.data.support.rewards);
  assert.match(app.html(), /补签券 1 张/);
  app.click('support:signin', '2026-10-12');
  assert.match(app.modal(), /确认补签/);
});

test('购买确认返回商品会关闭提示，不扣金币且不建立订单', () => {
  const app = boot();
  app.click('shop');
  app.click('support:product', 'expression');
  const before = app.state();
  app.click('support:buyConfirm', 'expression');
  assert.match(app.modal(), /确认购买/);
  assert.equal(returnAction(app.modal(), '返回商品'), 'closeModal');

  app.clickText(/^返回商品$/);
  assert.equal(app.modal(), '');
  const after = app.state();
  assert.equal(after.data.screen, 'supportProduct');
  assert.deepEqual(after.session, before.session);
  assert.deepEqual(after.data.support.orders, before.data.support.orders);
  assert.deepEqual(after.data.support.owned, before.data.support.owned);
  app.click('support:buyConfirm', 'expression');
  assert.match(app.modal(), /确认购买/);
});
