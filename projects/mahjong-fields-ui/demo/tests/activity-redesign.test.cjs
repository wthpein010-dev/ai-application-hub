const test = require('node:test');
const assert = require('node:assert/strict');
const { Session } = require('../state.js');
const Support = require('../support.js');

function harness() {
  let stamp = Date.UTC(2026, 9, 13, 4);
  const data = { screen: 'supportActivity', field: 0, history: [] };
  const session = new Session(100);
  const ui = Support.create({
    getData: () => data, getSession: () => session, now: () => stamp,
    b: (label, action, cls, extra = '') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`,
    badge: (label, cls = '') => `<span class="badge ${cls}">${label}</span>`,
    kv: (label, value) => `<div class="kv"><dt>${label}</dt><dd>${value}</dd></div>`,
    header: label => `<h1>${label}</h1>`, footer: body => `<footer>${body}</footer>`,
    panel: (label, body, cls) => `<section class="${cls}"><h2>${label}</h2>${body}</section>`,
    fmt: String, go: screen => { data.screen = screen; }, refresh() {}, showModal() {}, notify() {}
  });
  return { data, session, ui, advance(ms) { stamp += ms; } };
}

function buttons(html, action) {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map(match => match[0]).filter(markup => markup.includes(`data-action="${action}"`));
}

test('无翻牌资格时提供金币场入口；取得机会后显示原日期截止并锁定一次结果', () => {
  const h = harness();
  let html = h.ui.pages.supportFlip();
  assert.match(buttons(html, 'coin')[0] || '', />去金币场<\/button>/);
  assert.match(html, /有效对局\s*0\s*\/\s*1/);
  assert.equal(buttons(html, 'support:flipCard').filter(markup => !/\bdisabled\b/.test(markup)).length, 0);
  assert.equal(Object.keys(h.data.support.rewards).length, 0);

  h.data.support.flipDates['2026-10-12'] = { qualified: true };
  html = h.ui.pages.supportFlip();
  assert.match(html, /有效对局\s*1\s*\/\s*1/);
  assert.match(html, /2026-10-13 24:00/);
  assert.match(html, /剩余\s*1次/);
  assert.equal(buttons(html, 'coin').length, 0);
  h.ui.dispatch('support:flipCard', '2');
  html = h.ui.pages.supportFlip();
  assert.match(html, /已翻牌/);
  assert.match(html, /3金币|3 金币/);
  assert.equal(h.session.coins, 100);
  h.ui.dispatch('support:flipCard', '0');
  assert.equal(h.data.support.rewards['flip:2026-10-12'].card, 2);
  assert.equal(h.data.support.rewards['flip:2026-10-12'].amount, 3);
});

test('五页规则可通过原生折叠阅读，金额与独立领奖条件留在可读正文', () => {
  const h = harness();
  const pages = [
    ['supportActivity', 'hub', /独立参与/],
    ['supportSignin', 'signin', /补签加成按目标日结束时的VIP状态/],
    ['supportTea', 'tea', /60秒/],
    ['supportReturn', 'return', /收藏、分享和订阅不影响/],
    ['supportFlip', 'flip', /50% \/ 30% \/ 15% \/ 5%/]
  ];
  for (const [page, kind, content] of pages) {
    const html = h.ui.pages[page]();
    const rules = html.match(new RegExp(`<details\\b[^>]*data-view-id="activity-${kind}-rules"[^>]*>([\\s\\S]*?)<\\/details>`));
    assert.ok(rules, page + '应提供可展开规则');
    assert.match(rules[1], /<summary>[^<]*规则[^<]*<\/summary>/);
    assert.match(rules[1], content);
    assert.doesNotMatch(rules[0], /\bhidden\b|aria-hidden="true"/);
  }
  const hub = h.ui.pages.supportActivity();
  for (const amount of ['基础每周700 · VIP共840', '每日3档 · 3 / 3 / 4金币', '每日1次 · 10金币', '每日1次 · 2 / 3 / 5 / 10金币']) assert.ok(hub.includes(amount));
  assert.match(h.ui.pages.supportSignin(), /<strong class="support-coin-number">60<small>金币/);
  assert.equal(Object.keys(h.data.support.rewards).length, 0);
  assert.equal(h.session.coins, 100);
});

test('回访先呈现更早截止的昨日可领奖励，已到账昨日记录排在今日待领之后', () => {
  const h = harness();
  h.ui.pages.supportReturn();
  h.data.support.returnDates['2026-10-12'] = { qualified: true };
  let html = h.ui.pages.supportReturn();
  assert.ok(html.indexOf('昨日回访') < html.indexOf('今日回访'));
  h.ui.dispatch('support:returnClaim', '2026-10-12');
  html = h.ui.pages.supportReturn();
  assert.ok(html.indexOf('昨日回访') < html.indexOf('今日回访'));
  assert.match(buttons(html, 'support:resolveReward').at(-1), /return:2026-10-12/);
  assert.equal(h.data.support.rewards['return:2026-10-12'].amount, 10);
  h.ui.dispatch('support:resolveReward', 'return:2026-10-12');
  html = h.ui.pages.supportReturn();
  assert.ok(html.indexOf('今日回访') < html.indexOf('昨日回访'));
  assert.equal(h.session.coins, 110);
});

test('茶歇按钮明确当前档金额并保留取消、超时、待确认和冷却状态', () => {
  const h = harness();
  assert.match(buttons(h.ui.pages.supportTea(), 'support:teaStart')[0], /观看短片领3金币/);
  h.ui.dispatch('support:teaStart');
  assert.equal(buttons(h.ui.pages.supportTea(), 'support:teaCancel').length, 1);
  h.advance(15 * 60000 + 1);
  let html = h.ui.pages.supportTea();
  assert.match(buttons(html, 'support:teaComplete')[0], /\bdisabled\b/);
  assert.match(buttons(html, 'support:teaCancel')[0], /关闭并重新选择/);
  h.ui.dispatch('support:teaCancel');
  h.ui.dispatch('support:teaStart');
  h.ui.dispatch('support:teaComplete');
  html = h.ui.pages.supportTea();
  assert.equal(buttons(html, 'support:teaStart').length, 0);
  assert.match(buttons(html, 'support:resolveReward')[0], /tea:2026-10-13:1/);
  assert.equal(h.session.coins, 100);
  h.ui.dispatch('support:resolveReward', 'tea:2026-10-13:1');
  assert.match(buttons(h.ui.pages.supportTea(), 'support:teaStart')[0], /disabled[^>]*>冷却剩余60秒/);
  assert.equal(h.session.coins, 103);
});
