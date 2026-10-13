const test = require('node:test');
const assert = require('node:assert/strict');
const { Session } = require('../state.js');
const Support = require('../support.js');
const NOW = Date.UTC(2026, 9, 13, 4);
function harness(coins = 128600) {
  const data = { screen: 'supportActivity', field: 0, history: [], tournament: { status: 'none', awarded: false } };
  const session = new Session(coins), notices = [], modals = [];
  const ctx = { getData: () => data, getSession: () => session, getEvent: () => ({ name: '新手杯', award: 100 }), getTournament: () => data.tournament,
    now: () => NOW, b: (name, action, cls, extra = '') => `<button data-action="${action}" ${extra}>${name}</button>`, badge: (name) => `<span>${name}</span>`,
    kv: (name, value) => `<dl>${name}:${value}</dl>`, header: (title) => `<h1>${title}</h1>`, footer: x => `<footer>${x}</footer>`, panel: (title, body) => `<section>${title}${body}</section>`,
    fmt: n => String(n), signed: n => String(n), go: name => { data.screen = name; }, refresh: () => {},
    showModal: (...args) => modals.push(args), notify: text => notices.push(text), activeCoinScreen: () => 'coinLobby' };
  return { data, session, notices, modals, ctx, ui: Support.create(ctx) };
}
test('签到配置总额700，VIP20%为840，已受理金额不随会员变化并只到账一次', () => {
  assert.equal(Support.SIGNIN.reduce((a, n) => a + n, 0), 700);
  assert.equal(Support.SIGNIN.map(n => Support.signinAmount(n, true)).reduce((a, n) => a + n, 0), 840);
  const h = harness(100);
  h.ui.dispatch('support:signin', 'today');
  h.data.support.vip = false;
  h.ui.dispatch('support:resolveReward', 'signin:2026-10-13');
  h.ui.dispatch('support:resolveReward', 'signin:2026-10-13');
  assert.equal(h.session.coins, 160);
  assert.equal(h.data.support.rewards['signin:2026-10-13'].amount, 60);
});
test('救济15加60后可用75且差425，原次重查不重发、余额不低于20不再领取', () => {
  const h = harness(15);
  h.ui.dispatch('support:relief');
  assert.equal(h.session.coins, 15);
  h.ui.dispatch('support:resolveReward', 'relief:2026-10-13:1');
  assert.match(h.ui.pages.supportSupply(),/金币救济已到账 60 金币，距原场门槛还差 425 金币/);
  assert.doesNotMatch(h.ui.pages.supportSupply(),/救济领取已受理/);
  h.ui.dispatch('support:resolveReward', 'relief:2026-10-13:1');
  h.ui.dispatch('support:relief');
  assert.equal(h.session.coins, 75);
  assert.equal(Support.supplyStatus(h.session, 500).gap, 425);
  assert.equal(Object.keys(h.data.support.rewards).length, 1);
});
test('锁定本金也计入救济门槛；锁定资金不能买商品，新增金币可以买', () => {
  const h = harness(1000);
  h.session.queue(20); h.session.seat(); h.session.deal();
  h.ui.dispatch('support:relief');
  assert.equal(Object.keys(h.data.support.rewards).length, 0);
  h.ui.dispatch('support:product', 'expression');
  h.ui.dispatch('support:buyConfirm', 'expression');
  h.ui.dispatch('support:purchase', 'expression');
  assert.equal(h.session.coins, 980);
  assert.equal(h.data.support.orders.length, 0);
  h.session.reward(100);
  h.ui.dispatch('support:purchase', 'expression');
  assert.equal(h.session.coins, 980);
  assert.equal(h.session.principal, 980);
  assert.equal(h.data.support.orders.length, 1);
});
test('永久商品购买和交付分开；重复提交不重复扣费、装备不会再次扣费', () => {
  const h = harness(1000);
  h.ui.dispatch('support:purchase', 'frame');
  h.ui.dispatch('support:purchase', 'frame');
  assert.equal(h.session.coins, 700);
  assert.equal(h.data.support.orders.length, 1);
  assert.equal(h.data.support.owned.frame, undefined);
  h.ui.dispatch('support:deliver', h.data.support.orders[0].id);
  h.ui.dispatch('support:equip', 'frame');
  h.ui.dispatch('support:purchase', 'frame');
  assert.equal(h.session.coins, 700);
  assert.equal(h.data.support.equipped.frame, 'frame');
});
test('茶歇提前关闭不占次数，领奖金额和60秒间隔独立于其他活动', () => {
  const h = harness(100);
  h.ui.dispatch('support:teaStart');
  h.ui.dispatch('support:teaCancel');
  assert.equal(h.data.support.tea['2026-10-13'].success, 0);
  h.ui.dispatch('support:teaStart');
  h.ui.dispatch('support:teaComplete');
  h.ui.dispatch('support:resolveReward', 'tea:2026-10-13:1');
  h.ui.dispatch('support:teaStart');
  assert.equal(h.session.coins, 103);
  assert.equal(h.data.support.tea['2026-10-13'].success, 1);
  assert.equal(h.data.support.tea['2026-10-13'].watching, false);
  h.ui.dispatch('support:returnClaim', '2026-10-13');
  h.ui.dispatch('support:resolveReward', 'return:2026-10-13');
  assert.equal(h.session.coins, 113);
});
test('翻牌需有效完局；原结果重连恢复且不会再次随机或发奖', () => {
  const h = harness(100);
  h.ui.dispatch('support:flipCard', '1');
  assert.equal(Object.keys(h.data.support.rewards).length, 0);
  h.data.history.push({ id: 'demo-' + NOW });
  h.ui.dispatch('support:flipCard', '2');
  const claim = h.data.support.rewards['flip:2026-10-13'];
  assert.equal(claim.amount, 3);
  assert.equal(claim.card, 2);
  h.ui.dispatch('support:resolveReward', 'flip:2026-10-13');
  const restored = Support.create(h.ctx);
  restored.dispatch('support:flipCard', '0');
  restored.dispatch('support:resolveReward', 'flip:2026-10-13');
  assert.equal(h.session.coins, 103);
  assert.equal(claim.card, 2);
});
test('宝箱礼包和直接金币共享一次奖励，重复查看不重发', () => {
  const h = harness(100);
  h.ui.dispatch('support:scenario', 'chestPending');
  h.ui.dispatch('support:chestClaim', 'demo-chest-120');
  h.ui.dispatch('support:resolveReward', 'chest:demo-chest-120');
  h.ui.dispatch('support:scenario', 'chestDirect');
  h.ui.dispatch('support:chestClaim', 'demo-chest-120');
  assert.equal(h.session.coins, 220);
  assert.equal(Object.keys(h.data.support.chests).length, 1);
});
test('未知support动作不冒充处理，全部配套页面可渲染且无真实支付链接', () => {
  const h = harness();
  assert.equal(h.ui.dispatch('support:unknown'), false);
  for (const name of Object.keys(h.ui.pages)) {
    const html = h.ui.pages[name]();
    assert.match(html, /<h1>/);
    assert.doesNotMatch(html, /https:\/\/|支付成功|字段名称/);
  }
});
test('跨日已受理奖励仍在活动中心显示，查询原次不改变原金额', () => {
  const h = harness(100);
  let stamp = NOW; h.ctx.now = () => stamp;
  h.ui.dispatch('support:returnClaim', '2026-10-13');
  stamp += 3 * 86400000;
  assert.match(h.ui.pages.supportActivity(), /2026-10-13 · 10金币/);
  h.ui.dispatch('support:resolveReward', 'return:2026-10-13');
  assert.equal(h.session.coins, 110);
});
test('只有昨日翻牌机会时默认使用昨日机会，不错误要求今日资格', () => {
  const h = harness(100);
  h.ui.dispatch('support:scenario', 'flipYesterday');
  h.ui.dispatch('support:flipCard', '1');
  assert.equal(h.data.support.rewards['flip:2026-10-12'].amount, 3);
  assert.equal(h.data.support.rewards['flip:2026-10-13'], undefined);
});
test('补签消耗当周券并按目标日VIP历史状态，受理后跨周只发原奖励', () => {
  const h = harness(100);
  let stamp = NOW; h.ctx.now = () => stamp;
  h.ui.dispatch('support:scenario', 'makeup');
  h.ui.dispatch('support:signin', '2026-10-12');
  h.ui.dispatch('support:makeup', '2026-10-12');
  assert.equal(h.data.support.rewards['signin:2026-10-12'].amount, 36);
  h.data.support.vip = false;
  stamp += 7 * 86400000;
  assert.match(h.ui.pages.supportActivity(), /2026-10-12 · 36金币/);
  assert.match(h.ui.pages.supportSignin(), /补签券 0 张/);
  h.ui.dispatch('support:resolveReward', 'signin:2026-10-12');
  h.ui.dispatch('support:resolveReward', 'signin:2026-10-12');
  assert.equal(h.session.coins, 136);
});
test('救济日上限2次、滚动168小时5次与到账次数均严格限制', () => {
  const h = harness(15);
  let stamp = NOW; h.ctx.now = () => stamp;
  for (let day = 0; day < 3; day++) {
    stamp = NOW + day * 86400000;
    const key = new Date(stamp + 8 * 3600000).toISOString().slice(0, 10);
    for (let i = 1; i <= 2; i++) {
      h.session.coins = 15;
      h.ui.dispatch('support:relief');
      h.ui.dispatch('support:resolveReward', `relief:${key}:${i}`);
    }
    h.session.coins = 15; h.ui.dispatch('support:relief');
  }
  assert.equal(Object.keys(h.data.support.rewards).length, 5);
  stamp = NOW + 8 * 86400000; h.session.coins = 15;
  h.ui.dispatch('support:relief');
  assert.equal(Object.keys(h.data.support.rewards).length, 6);
});
test('跨午夜完整观看继续原档，原日确认到账后不重发新日档', () => {
  const h = harness(100);
  let stamp = Date.UTC(2026, 9, 13, 15, 59); h.ctx.now = () => stamp;
  h.ui.dispatch('support:teaStart');
  stamp += 2 * 60000;
  h.ui.dispatch('support:teaComplete');
  assert.match(h.ui.pages.supportTea(), /2026-10-13奖励记录/);
  assert.equal(h.data.support.rewards['tea:2026-10-13:1'].amount, 3);
  assert.equal(h.data.support.rewards['tea:2026-10-14:1'], undefined);
  h.ui.dispatch('support:resolveReward', 'tea:2026-10-13:1');
  assert.equal(h.session.coins, 103);
  h.ui.dispatch('support:teaStart');
  assert.equal(h.data.support.tea['2026-10-14'].watching, false);
});

test('正式归档与当前赛事共享稳定标记，三场归档可达成补签且不会重复计次', () => {
  const h=harness();
  h.data.eventArchives=[0,1,2].map(i=>({id:'event-'+(NOW+i),tournament:{status:'final',archiveId:'event-'+(NOW+i),reviewStarted:NOW}}));
  h.data.eventArchives.push(h.data.eventArchives[0]);
  h.data.tournament={...h.data.eventArchives[2].tournament};
  assert.match(h.ui.pages.supportSignin(),/本周有效对局 3 \/ 3/);
  assert.match(h.ui.pages.supportSignin(),/补签券 1 张/);
  h.data.tournament={status:'registered'};
  assert.match(h.ui.pages.supportSignin(),/本周有效对局 3 \/ 3/);
});

test('归档按原完赛日期参与本周计次及昨日翻牌，不纳入旧周或未确认归档', () => {
  const h=harness();
  h.data.eventArchives=[
    {id:'event-'+(NOW-8*86400000),tournament:{status:'final',reviewStarted:NOW-8*86400000}},
    {id:'event-'+(NOW-86400000),tournament:{status:'final',reviewStarted:NOW-86400000}},
    {id:'event-'+NOW,tournament:{status:'finalTemp',reviewStarted:NOW}}
  ];
  h.data.tournament={status:'registered'};
  assert.match(h.ui.pages.supportSignin(),/本周有效对局 1 \/ 3/);
  assert.match(h.ui.pages.supportSignin(),/补签券 0 张/);
  h.ui.dispatch('support:flipCard','1');
  assert.equal(h.data.support.rewards['flip:2026-10-12'].amount,3);
  assert.equal(h.data.support.rewards['flip:2026-10-13'],undefined);
});

test('临时完赛保留原计次口径，正式归档后不会因标记变化重复累计', () => {
  const h=harness();h.data.event=0;
  h.data.tournament={status:'finalTemp',reviewStarted:NOW};
  assert.match(h.ui.pages.supportSignin(),/本周有效对局 1 \/ 3/);
  const archived={id:'event-'+NOW,tournament:{status:'final',archiveId:'event-'+NOW,reviewStarted:NOW}};
  h.data.eventArchives=[archived];h.data.tournament={...archived.tournament};
  assert.match(h.ui.pages.supportSignin(),/本周有效对局 1 \/ 3/);
  h.data.tournament={status:'registered'};
  assert.match(h.ui.pages.supportSignin(),/本周有效对局 1 \/ 3/);
});
