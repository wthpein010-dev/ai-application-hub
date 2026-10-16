const test = require('node:test');
const assert = require('node:assert/strict');
const { Session } = require('../state.js');
const Support = require('../support.js');

function harness() {
  let stamp = Date.UTC(2026, 9, 13, 4);
  const data = { screen: 'supportActivity', field: 0, history: [] };
  const session = new Session(100), notices = [];
  const ui = Support.create({
    getData: () => data, getSession: () => session, now: () => stamp,
    b: (label, action, cls, extra = '') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`,
    badge: (label, cls = '') => `<span class="badge ${cls}">${label}</span>`,
    kv: (label, value) => `<div class="kv"><dt>${label}</dt><dd>${value}</dd></div>`,
    header: label => `<h1>${label}</h1>`, footer: body => `<footer>${body}</footer>`,
    panel: (label, body, cls) => `<section class="${cls}"><h2>${label}</h2>${body}</section>`,
    fmt: String, go: screen => { data.screen = screen; }, refresh() {},
    showModal() {}, notify: text => notices.push(text)
  });
  return { data, session, notices, ui, advance(ms) { stamp += ms; } };
}

function button(html, action, value) {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]).filter(markup => {
    return markup.includes(`data-action="support:${action}"`) && (value === undefined || markup.includes(`data-value="${value}"`));
  }).at(-1);
}

test('活动卡随当日领取记录显示状态和进度，浏览不会受理奖励', () => {
  const h = harness();
  let html = h.ui.pages.supportActivity();
  assert.match(button(html, 'signinPage'), /可领取/);
  assert.match(button(html, 'teaPage'), /0\s*\/\s*3/);
  assert.match(button(html, 'flipPage'), /有效对局\s*0\s*\/\s*1/);
  assert.equal(Object.keys(h.data.support.rewards).length, 0);
  h.ui.dispatch('support:signin', 'today');
  assert.match(button(h.ui.pages.supportActivity(), 'signinPage'), /确认中/);
  h.ui.dispatch('support:resolveReward', 'signin:2026-10-13');
  html = h.ui.pages.supportActivity();
  assert.match(button(html, 'signinPage'), /已领取/);
  assert.match(button(html, 'returnPage'), /可领取/);
  assert.equal(h.session.coins, 160);
});

test('茶歇只把当前档显示为可参与，后续档说明前置条件且冷却时禁止启动', () => {
  const h = harness();
  let html = h.ui.pages.supportTea();
  assert.equal((html.match(/未开放/g) || []).length, 2);
  assert.match(html, /完成前一档/);
  h.ui.dispatch('support:teaStart');
  html = h.ui.pages.supportTea();
  assert.match(button(html, 'teaComplete'), /完成观看/);
  assert.match(html, /15分钟/);
  h.ui.dispatch('support:teaComplete');
  h.ui.dispatch('support:resolveReward', 'tea:2026-10-13:1');
  html = h.ui.pages.supportTea();
  assert.match(button(html, 'teaStart'), /disabled/);
  assert.match(html, /冷却/);
  assert.equal((html.match(/未开放/g) || []).length, 1);
  h.ui.dispatch('support:teaStart');
  assert.equal(h.data.support.tea['2026-10-13'].watching, false);
  h.advance(60000);
  assert.doesNotMatch(button(h.ui.pages.supportTea(), 'teaStart'), /disabled/);
});

test('回访明确每份资格的截止日期，已领昨日记录不再写成未领', () => {
  const h = harness();
  h.ui.pages.supportReturn();
  h.data.support.returnDates['2026-10-12'] = { qualified: true };
  let html = h.ui.pages.supportReturn();
  assert.match(html, /2026-10-13 24:00/);
  assert.match(html, /2026-10-14 24:00/);
  h.ui.dispatch('support:returnClaim', '2026-10-12');
  h.ui.dispatch('support:resolveReward', 'return:2026-10-12');
  html = h.ui.pages.supportReturn();
  assert.doesNotMatch(html, /昨日未领/);
  assert.match(html, /已领取/);
  assert.equal(h.session.coins, 110);
});

test('回访过期资格不再有领取按钮，过期前已受理的奖励仍可确认且只到账一次', () => {
  const h = harness();
  h.ui.pages.supportReturn();
  h.data.support.returnDates['2026-10-11'] = { qualified: true };
  h.ui.dispatch('support:returnClaim', '2026-10-13');
  h.advance(3 * 86400000);
  const html = h.ui.pages.supportReturn();
  assert.match(html, /2026-10-11/);
  assert.match(html, /已过期/);
  assert.equal(button(html, 'returnClaim', '2026-10-11'), undefined);
  assert.ok(button(html, 'resolveReward', 'return:2026-10-13'));
  h.ui.dispatch('support:resolveReward', 'return:2026-10-13');
  h.ui.dispatch('support:resolveReward', 'return:2026-10-13');
  assert.equal(h.session.coins, 110);
});

test('签到显示七日具体日期，未到日期和无补签券的漏签不可操作', () => {
  const h = harness();
  const html = h.ui.pages.supportSignin();
  assert.match(button(html, 'signin', '2026-10-14'), /<time[^>]*>2026-10-14<\/time>/);
  assert.match(button(html, 'signin', '2026-10-14'), /disabled/);
  assert.match(button(html, 'signin', '2026-10-12'), /disabled/);
  assert.match(html, /往期.*已过期/);
  h.ui.dispatch('support:signin', '2026-10-14');
  assert.equal(Object.keys(h.data.support.rewards).length, 0);
});

test('跨周签到页面继续呈现原次待确认奖励，不把受理奖励作过期清除', () => {
  const h = harness();
  h.ui.dispatch('support:signin', 'today');
  h.advance(7 * 86400000);
  const html = h.ui.pages.supportSignin();
  assert.ok(button(html, 'resolveReward', 'signin:2026-10-13'));
  assert.match(html, /2026-10-13/);
  h.ui.dispatch('support:resolveReward', 'signin:2026-10-13');
  assert.equal(h.session.coins, 160);
});

test('已受理签到展示原VIP与金额，之后会员变化不会改写奖励说明', () => {
  const h = harness();
  h.ui.dispatch('support:signin', 'today');
  h.data.support.vip = false;
  const html = h.ui.pages.supportSignin();
  const today = html.slice(html.indexOf('<section class="support-today"'), html.indexOf('<section><div class="support-week-grid"'));
  assert.match(today, /VIP加成20%/);
  assert.match(today, /<strong class="support-coin-number">60/);
  assert.match(button(h.ui.pages.supportActivity(), 'signinPage'), /今日 60金币/);
});

test('今日已翻后昨日仍可翻时，活动卡保留剩余机会提示', () => {
  const h = harness();
  h.ui.pages.supportActivity();
  h.data.support.flipDates['2026-10-12'] = { qualified: true };
  h.data.support.flipDates['2026-10-13'] = { qualified: true };
  h.data.support.flipDate = '2026-10-13';
  h.ui.dispatch('support:flipCard', '0');
  h.ui.dispatch('support:resolveReward', 'flip:2026-10-13');
  const html = button(h.ui.pages.supportActivity(), 'flipPage');
  assert.match(html, /可翻牌/);
  assert.match(html, /待翻 1次/);
  assert.equal(h.session.coins, 103);
});

test('超过15分钟的观看显示超时并停止确认操作，重新观看沿用原有取消路径', () => {
  const h = harness();
  h.ui.dispatch('support:teaStart');
  h.advance(15 * 60000 + 1);
  const html = h.ui.pages.supportTea();
  assert.match(html, /观看已超时/);
  assert.match(button(html, 'teaComplete'), /disabled/);
  assert.match(button(h.ui.pages.supportActivity(), 'teaPage'), /观看超时/);
  h.ui.dispatch('support:teaCancel');
  h.ui.dispatch('support:teaStart');
  assert.equal(h.data.support.tea['2026-10-13'].watching, true);
  assert.equal(Object.keys(h.data.support.rewards).length, 0);
});

test('过期的翻牌原单在翻牌页仍能查询，不要求重新取得机会', () => {
  const h = harness();
  h.ui.pages.supportFlip();
  h.data.support.flipDates['2026-10-13'] = { qualified: true };
  h.ui.dispatch('support:flipCard', '1');
  h.advance(3 * 86400000);
  const html = h.ui.pages.supportFlip();
  assert.ok(button(html, 'resolveReward', 'flip:2026-10-13'));
  h.ui.dispatch('support:resolveReward', 'flip:2026-10-13');
  assert.equal(h.session.coins, 103);
});

test('翻牌卡区分未完成、可翻与已领取，原结果保持且不自动到账', () => {
  const h = harness();
  h.ui.pages.supportActivity();
  h.data.history.push({ id: 'demo-' + Date.UTC(2026, 9, 13, 4) });
  assert.match(button(h.ui.pages.supportActivity(), 'flipPage'), /可翻牌/);
  h.ui.dispatch('support:flipCard', '2');
  assert.match(button(h.ui.pages.supportActivity(), 'flipPage'), /确认中/);
  assert.equal(h.session.coins, 100);
  h.ui.dispatch('support:resolveReward', 'flip:2026-10-13');
  assert.match(button(h.ui.pages.supportActivity(), 'flipPage'), /已领取/);
  h.ui.dispatch('support:flipCard', '0');
  assert.equal(h.data.support.rewards['flip:2026-10-13'].card, 2);
  assert.equal(h.session.coins, 103);
});
