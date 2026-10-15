const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Session } = require('../state.js');
const Support = require('../support.js');

function activityHarness() {
  const data = { screen: 'supportActivity', field: 0, history: [], tournament: { status: 'none' } };
  const session = new Session(100);
  const ui = Support.create({
    getData: () => data, getSession: () => session, now: () => Date.UTC(2026, 9, 13, 4),
    b: (name, action, cls, extra = '') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${name}</button>`,
    badge: name => `<span>${name}</span>`, kv: (name, value) => `<dl>${name}:${value}</dl>`,
    header: name => `<h1>${name}</h1>`, footer: body => `<footer>${body}</footer>`,
    panel: (name, body, cls) => `<section class="${cls}"><h2>${name}</h2>${body}</section>`,
    fmt: String, go: screen => { data.screen = screen; }, refresh: () => {}, notify: () => {}
  });
  return { data, session, ui };
}

test('活动中心有签到主推和四个独立整卡入口，金额仍沿既有活动配置', () => {
  const { ui } = activityHarness();
  const html = ui.pages.supportActivity();
  assert.match(html, /class="support-activity-spotlight"[^>]*data-action="support:signinPage"/);
  const cards = Array.from(html.matchAll(/class="support-activity-entry[^\"]*"[^>]*data-action="support:([^\"]+)"/g), match => match[1]);
  assert.deepEqual(cards, ['signinPage', 'teaPage', 'returnPage', 'flipPage']);
  assert.match(html, /aria-label="七日茶约，查看签到，每周基础700金币，VIP加成20%"/);
  assert.match(html, /aria-label="好运翻牌，完成有效对局后翻牌，每日1次 · 2 \/ 3 \/ 5 \/ 10金币，查看活动"/);
  assert.match(html, /基础每周700 · VIP共840/);
  assert.match(html, /每日3档 · 3 \/ 3 \/ 4金币/);
  assert.match(html, /每日1次 · 10金币/);
  assert.match(html, /每日1次 · 2 \/ 3 \/ 5 \/ 10金币/);
  assert.doesNotMatch(html, /data-action="support:(?:signin|teaStart|returnClaim|flipCard)"/);
  let openButton = false;
  for (const [tag] of html.matchAll(/<\/?button\b[^>]*>/g)) {
    if (tag.startsWith('</')) openButton = false;
    else { assert.equal(openButton, false, '整卡入口不能嵌套其他按钮'); openButton = true; }
  }
  assert.match(html, /class="support-activity-festival"[^>]*alt=""/);
});

test('主推和活动入口只导航，不自动参与或领取，查看不改变已受理奖励', () => {
  const h = activityHarness();
  h.ui.pages.supportActivity();
  h.data.support.rewards.existing = { id: 'existing', kind: 'return', date: '2026-10-10', label: '回访有礼', amount: 10, status: 'pending', acceptedAt: 1791518400000 };
  const before = JSON.stringify(h.data.support.rewards);
  for (const [action, screen] of [['signinPage', 'supportSignin'], ['teaPage', 'supportTea'], ['returnPage', 'supportReturn'], ['flipPage', 'supportFlip']]) {
    h.ui.dispatch('support:' + action);
    assert.equal(h.data.screen, screen);
    h.ui.pages[screen]();
    assert.equal(h.session.coins, 100);
    assert.equal(JSON.stringify(h.data.support.rewards), before);
  }
  assert.match(h.ui.pages.supportActivity(), /2026-10-10 · 10金币/);
});

test('活动新布局继续使用正文滚动，并为横幅轻动效提供减少动态替代', () => {
  const css = fs.readFileSync(path.join(__dirname, '../support.css'), 'utf8');
  assert.match(css, /\.support-activity-hub[^}]*>/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.support-activity-spotlight::after[^}]*animation/);
  assert.doesNotMatch(css, /--sheet-(?:width|height)\s*:/);
});
