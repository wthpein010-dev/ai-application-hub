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

test('活动中心有福利横幅和四个独立整卡入口，金额仍沿既有活动配置', () => {
  const { ui } = activityHarness();
  const html = ui.pages.supportActivity();
  assert.match(html, /class="support-activity-spotlight"[^>]*data-action="support:signinPage"/);
  const cards = Array.from(html.matchAll(/class="support-activity-entry[^\"]*"[^>]*data-action="support:([^\"]+)"/g), match => match[1]);
  assert.deepEqual(cards, ['signinPage', 'teaPage', 'returnPage', 'flipPage']);
  assert.match(html, /aria-label="茶友好礼，查看签到"/);
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

test('活动插画仅作装饰，四页的金额与参与操作仍可独立读取', () => {
  const { ui } = activityHarness();
  const pages = [
    ['supportSignin', 'signin', 'support:signin', '60'],
    ['supportTea', 'tea', 'support:teaStart', '3'],
    ['supportReturn', 'return', 'support:returnClaim', '10'],
    ['supportFlip', 'flip', 'support:flipCard', '2 / 3 / 5 / 10']
  ];
  for (const [page, kind, action, amount] of pages) {
    const html = ui.pages[page]();
    assert.match(html, new RegExp(`<img[^>]*src="assets/activity-${kind}-v2.webp"[^>]*alt=""`));
    assert.match(html, new RegExp(`data-action="${action}"`));
    assert.ok(html.includes(amount), page + '的金币金额仍为文字');
    assert.doesNotMatch(html, /<img[^>]*data-action=/);
  }
  const hub = ui.pages.supportActivity();
  assert.match(hub, /src="assets\/activity-welfare-header-166.webp"[^>]*alt=""/);
  assert.equal((hub.match(/class="support-entry-art[^\"]*"/g) || []).length, 4);
});

test('翻牌插画替换牌背后仍能辨别四张牌，揭开只显示既定奖励且不自动入账', () => {
  const h = activityHarness();
  h.ui.pages.supportFlip();
  h.data.support.flipDates['2026-10-13'] = { qualified: true };
  const before = h.ui.pages.supportFlip();
  assert.equal((before.match(/src="assets\/activity-card-back-v2.webp"/g) || []).length, 4);
  for (let i = 1; i <= 4; i++) assert.match(before, new RegExp(`aria-label="第${i}张好运牌，点击翻牌"`));
  h.ui.dispatch('support:flipCard', '1');
  const after = h.ui.pages.supportFlip();
  assert.match(after, /aria-label="第2张好运牌，3金币"/);
  assert.equal((after.match(/src="assets\/activity-card-back-v2.webp"/g) || []).length, 3);
  assert.equal(h.data.support.rewards['flip:2026-10-13'].amount, 3);
  assert.equal(h.data.support.rewards['flip:2026-10-13'].status, 'pending');
  assert.equal(h.session.coins, 100);
  h.ui.dispatch('support:flipCard', '2');
  assert.equal(h.data.support.rewards['flip:2026-10-13'].card, 1);
});
