const test = require('node:test');
const assert = require('node:assert/strict');
const Support = require('../support.js');
const { Session } = require('../state.js');

function harness() {
  const data = { screen: 'supportActivity', field: 0, region: '洛阳', history: [] };
  const session = new Session(100), modals = [];
  const ui = Support.create({
    getData: () => data, getSession: () => session, now: () => Date.UTC(2026, 9, 13, 4),
    gameName: '洛阳麻将', profile: { name: '洛阳麻将', rules: ['按本玩法规则完成摸牌、出牌与胡牌。'] },
    b: (label, action, cls, extra = '') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`,
    badge: (label, cls = '') => `<span class="badge ${cls}">${label}</span>`,
    kv: (label, value) => `<div class="kv"><dt>${label}</dt><dd>${value}</dd></div>`,
    header: label => `<h1>${label}</h1>`, footer: body => `<footer>${body}</footer>`,
    panel: (label, body, cls) => `<section class="${cls}"><h2>${label}</h2>${body}</section>`,
    fmt: String, go: screen => { data.screen = screen; }, refresh() {}, notify() {},
    showModal: (title, body, actions) => modals.push({ title, body, actions })
  });
  return { ui, data, session, modals };
}

test('普通邀请展示当前真实玩法，只预览卡片，不创建关系、进度或奖励', () => {
  const h = harness();
  h.ui.dispatch('support:signin', 'today');
  const before = JSON.stringify(h.data.support);
  h.ui.dispatch('support:invitePage');
  assert.equal(h.data.screen, 'supportInvite');
  const html = h.ui.pages.supportInvite();
  assert.match(html, /和朋友一起玩/);
  assert.match(html, /洛阳麻将/);
  assert.match(html, /了解玩法[\s\S]*新手教学[\s\S]*首次有效体验/);
  assert.match(html, /同资格[\s\S]*同一份新手计划/);
  assert.doesNotMatch(html, /(?:200|100)\s*金币|我的伙伴|接受邀请|参加活动并邀请|data-action="support:(?:returnClaim|signin|teaStart|flipCard)"/);
  assert.match(html, /data-action="support:invitePreview"/);
  assert.equal(h.ui.dispatch('support:invitePreview'), true);
  assert.equal(h.modals.length, 1);
  assert.match(h.modals[0].body, /洛阳麻将/);
  assert.match(h.modals[0].actions, /data-action="closeModal"/);
  assert.doesNotMatch(h.modals[0].body, /分享成功|已发送|新手任务已完成/);
  assert.equal(h.data.screen, 'supportInvite');
  assert.equal(JSON.stringify(h.data.support), before);
  assert.equal(h.session.coins, 100);
});

test('活动总览分别呈现四项奖励任务与导航，进度跟随原领取记录且不会自动参与', () => {
  const h = harness();
  function rows() {
    return [...h.ui.pages.supportActivity().matchAll(/<article\b[^>]*aria-label="(七日茶约|茶歇好礼|回访有礼|好运翻牌)"[^>]*>([\s\S]*?)<\/article>/g)];
  }
  const first = rows();
  assert.deepEqual(first.map(row => row[1]), ['七日茶约', '茶歇好礼', '回访有礼', '好运翻牌']);
  for (const row of first) {
    assert.equal((row[2].match(/<button\b/g) || []).length, 1);
    assert.match(row[2], /<progress\b/);
  }
  assert.match(first[0][2], /700/);
  assert.match(first[0][2], /840/);
  assert.match(first[1][2], /3 \/ 3 \/ 4金币/);
  assert.match(first[2][2], /10/);
  assert.match(first[3][2], /2 \/ 3 \/ 5 \/ 10金币/);
  assert.equal(Object.keys(h.data.support.rewards).length, 0);
  h.ui.dispatch('support:signin', 'today');
  h.ui.dispatch('support:resolveReward', 'signin:2026-10-13');
  const signed = rows()[0][2];
  assert.match(signed, /已领取/);
  assert.match(signed, /<progress\b[^>]*value="1"[^>]*max="7"/);
  assert.equal(h.session.coins, 160);
});

test('茶歇把观看和原次确认操作放在奖励任务区域，左场景没有第二份参与按钮', () => {
  const h = harness();
  let html = h.ui.pages.supportTea();
  const split = html.indexOf('<section class="support-tea-progress"');
  assert.ok(split > 0);
  assert.doesNotMatch(html.slice(0, split), /data-action="support:teaStart"/);
  assert.match(html.slice(split), /data-action="support:teaStart"/);
  h.ui.dispatch('support:teaStart');
  html = h.ui.pages.supportTea();
  assert.match(html.slice(html.indexOf('<section class="support-tea-progress"')), /data-action="support:teaComplete"[\s\S]*data-action="support:teaCancel"/);
  h.ui.dispatch('support:teaComplete');
  assert.match(h.ui.pages.supportTea(), /data-action="support:resolveReward"[^>]*data-value="tea:2026-10-13:1"/);
  assert.equal(h.data.support.rewards['tea:2026-10-13:1'].amount, 3);
  assert.equal(h.session.coins, 100);
});
