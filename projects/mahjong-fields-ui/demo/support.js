/* 配套页面本地模拟。配置依据：latest_text/04.md、01.md、活动_签到.md（2026-10-12）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FieldSupport = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SIGNIN = [30, 50, 60, 80, 100, 130, 250];
  const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const TEA = [3, 3, 4];
  const PRODUCTS = [
    { id: 'expression', type: 'expression', category: '表情', name: '茶友表情', price: 100, note: '永久表情 · 1套', art: 'expression', description: '对局中发送茶友表情，表达开心、赞许与招呼。' },
    { id: 'frame', type: 'frame', category: '头像框', name: '金玉茶环', price: 300, note: '永久头像框 · 1件', art: 'frame', description: '金玉描边头像框，展示在个人头像周围。' },
    { id: 'cardback', type: 'cardback', category: '牌背', name: '青竹牌背', price: 800, note: '永久牌背 · 1套', art: 'cardback', description: '青竹纹样牌背，替换自己可见的默认牌背。' },
    { id: 'theme', type: 'theme', category: '主题', name: '古城茶庭', price: 1200, note: '永久主题 · 1套', art: 'theme', description: '蓝天古城与茶庭背景，保持当前对局的信息布局。' }
  ];
  const signupAmount = (base, vip) => base + (vip ? Math.floor(base * 0.2) : 0);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const dateKey = stamp => new Date(stamp + 8 * 3600000).toISOString().slice(0, 10);
  const dateInfo = stamp => {
    const shifted = new Date(stamp + 8 * 3600000), index = (shifted.getUTCDay() + 6) % 7;
    const monday = new Date(shifted); monday.setUTCDate(monday.getUTCDate() - index);
    return { today: shifted.toISOString().slice(0, 10), index, week: monday.toISOString().slice(0, 10), stamp };
  };
  const addDays = (key, number) => new Date(Date.parse(key + 'T00:00:00Z') + number * 86400000).toISOString().slice(0, 10);
  const supplyStatus = (session, threshold) => ({ available: session.available, locked: session.principal, reserved: session.reserved,
    threshold, gap: Math.max(0, threshold - session.available), balanceEligible: session.available + session.principal < 20 });

  function create(ctx) {
    const d = () => ctx.getData(), session = () => ctx.getSession(), now = () => ctx.now ? ctx.now() : Date.now();
    const clock = () => dateInfo(now());
    const state = () => {
      if (!d().support || typeof d().support !== 'object') d().support = {};
      const s = d().support;
      if (s.vip === undefined) s.vip = true;
      if (!s.rewards || typeof s.rewards !== 'object') s.rewards = {};
      if (!s.signClaims || typeof s.signClaims !== 'object') s.signClaims = {};
      if (!s.makeupByWeek || typeof s.makeupByWeek !== 'object') s.makeupByWeek = {};
      if (!s.tea || typeof s.tea !== 'object') s.tea = {};
      if (!s.returnDates || typeof s.returnDates !== 'object') s.returnDates = {};
      if (!s.flipDates || typeof s.flipDates !== 'object') s.flipDates = {};
      if (!Array.isArray(s.orders)) s.orders = [];
      if (!s.owned || typeof s.owned !== 'object') s.owned = {};
      if (!s.equipped || typeof s.equipped !== 'object') s.equipped = {};
      if (!s.chests || typeof s.chests !== 'object') s.chests = {};
      if (!s.vipHistory || typeof s.vipHistory !== 'object') s.vipHistory = {};
      if (!s.completedEvents || typeof s.completedEvents !== 'object') s.completedEvents = {};
      if (!s.originKind) s.originKind = 'coin';
      if (!s.returnDates[clock().today]) s.returnDates[clock().today] = { qualified: true };
      return s;
    };
    const product = id => PRODUCTS.find(p => p.id === id);
    const refresh = () => ctx.refresh ? ctx.refresh() : ctx.go(d().screen);
    const B = (text, action, cls = 'gold-button', value = '', extra = '') => ctx.b(text, 'support:' + action, cls, `${value !== '' ? `data-value="${escape(value)}"` : ''} ${extra}`);
    const pill = (text, cls = '') => ctx.badge(text, cls);
    const footer = actions => ctx.footer(actions || '', state().originKind);
    const full = (title, body, klass = '') => ctx.panel(title, body, 'support-panel ' + klass);
    const title = text => ctx.header(text, 'back');
    const safeText = text => escape(text);
    const activityArt = (name, klass = '', width = 640, height = 520) => `<img class="support-activity-illustration ${klass}" src="assets/activity-${name}-v2.webp" alt="" width="${width}" height="${height}" decoding="async">`;
    const inviteCard = () => `<article class="activity-invite-card"><span>和朋友一起玩</span><h2>${safeText(ctx.gameName || ctx.profile?.name || '当前玩法')}</h2><p>一起玩一局，看看这个玩法</p><small>${safeText(d().region || '当前地区')} · 玩法介绍</small><p>${safeText(ctx.profile?.rules?.[0] || '先了解玩法规则，再自主选择是否参加体验。')}</p></article>`;
    const open = page => { state(); if (!String(d().screen).startsWith('support')) state().originKind = String(d().screen).startsWith('event') ? 'tournament' : 'coin'; ctx.go(page); };
    const threshold = () => ctx.fields?.[Number(d().field)||0]?.min || [500,5000,50000,500000][Number(d().field)||0];
    function activityNav(active) {
      const c = clock(), s = state(), sign = s.rewards['signin:' + c.today];
      const claimable = {
        signinPage: !sign || sign.status === 'pending',
        teaPage: Object.values(s.rewards).some(r => r.kind === 'tea' && r.status === 'pending'),
        returnPage: Object.keys(s.returnDates).some(key => key >= addDays(c.today, -1) && key <= c.today && !s.rewards['return:' + key]) || Object.values(s.rewards).some(r => r.kind === 'return' && r.status === 'pending'),
        flipPage: Object.keys(s.flipDates).some(key => key >= addDays(c.today, -1) && key <= c.today && !s.rewards['flip:' + key]) || Object.values(s.rewards).some(r => r.kind === 'flip' && r.status === 'pending')
      };
      claimable.activities = Object.values(claimable).some(Boolean);
      const items = [['活动中心', 'activities', ''], ['七日茶约', 'signinPage', 'signin'], ['茶歇好礼', 'teaPage', 'tea'], ['回访有礼', 'returnPage', 'return'], ['好运翻牌', 'flipPage', 'flip'], ['和朋友一起玩', 'invitePage', 'invite']];
      return `<nav class="side-tabs support-side activity-poster-nav" aria-label="活动">${items.map(([label, action, art]) => B(`${art ? `<span class="activity-poster-art" aria-hidden="true"><img src="assets/${art === 'invite' ? 'activity-invite-170.webp' : 'activity-' + art + '-v2.webp'}" alt="" width="640" height="520" decoding="async"></span>` : '<span class="support-nav-icon" aria-hidden="true">✦</span>'}<span class="activity-poster-label">${label}</span>${claimable[action] ? '<span class="support-nav-dot" aria-hidden="true"></span>' : ''}`, action, `${active === action ? 'active ' : ''}${action === 'activities' ? 'activity-poster-overview' : action === 'invitePage' ? 'activity-poster-invite' : 'activity-poster-' + art}`, '', `aria-label="${label}"${active === action ? ' aria-current="page"' : ''}`)).join('')}</nav>`;
    }
    function shopNav(active) {
      return `<nav class="side-tabs support-side" aria-label="商城">${[['商城', 'shop'], ['我的订单', 'orders'], ['我的装扮', 'wardrobe']].map(([label, action]) => B(label, action, active === action ? 'active' : '')).join('')}</nav>`;
    }
    function syncProgress() {
      const c = clock(), s = state(), unique = new Set();
      (d().history || []).forEach(h => {
        const formatted = String(h.time || '').match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
        const stamp = h.completedAt || Number(String(h.id || '').replace(/^demo-/, ''));
        const date = formatted ? `${formatted[1]}-${formatted[2].padStart(2, '0')}-${formatted[3].padStart(2, '0')}` : Number.isFinite(stamp) && stamp > 0 ? dateKey(stamp) : '';
        if (date >= c.week && date <= c.today) unique.add(h.id);
        if (date >= addDays(c.today, -1) && date <= c.today && !s.flipDates[date]) s.flipDates[date] = { qualified: true };
      });
      const countEvent = (id, stamp, fallback = '') => {
        if (!id) return;
        if (!s.completedEvents[id]) {
          const date = Number.isFinite(stamp) && stamp > 0 ? dateKey(stamp) : fallback;
          if (!date) return;
          s.completedEvents[id] = date;
        }
        const date = s.completedEvents[id];
        if (date >= c.week && date <= c.today) unique.add(id);
        if (date >= addDays(c.today, -1) && date <= c.today && !s.flipDates[date]) s.flipDates[date] = { qualified: true };
      };
      (Array.isArray(d().eventArchives) ? d().eventArchives : []).forEach(archive => {
        if (archive?.tournament?.status !== 'final') return;
        const id = archive.tournament.archiveId || archive.id;
        const formatted = String(archive.time || '').match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
        const date = formatted ? `${formatted[1]}-${formatted[2].padStart(2, '0')}-${formatted[3].padStart(2, '0')}` : '';
        countEvent(id, archive.tournament.reviewStarted || Number(String(id).replace(/^event-/, '')), date);
      });
      const t = ctx.getTournament?.();
      if (t && ['finalTemp', 'final'].includes(t.status)) {
        const id = t.archiveId || `event:${d().event || 0}:${t.reviewStarted || ''}`;
        countEvent(id, t.reviewStarted, c.today);
      }
      const count = Math.max(unique.size, s.demoValidGamesWeek === c.week ? s.demoValidGames || 0 : 0);
      return { count, coupon: count >= 3 && !s.makeupByWeek[c.week] ? 1 : 0 };
    }
    function reward(id, amount, label, page, meta = {}) {
      const s = state(); if (s.rewards[id]) return s.rewards[id];
      const r = { id, amount, label, page, status: 'pending', acceptedAt: now(), ...meta }; s.rewards[id] = r; return r;
    }
    function resolveReward(id) {
      const s = state(), r = s.rewards[id];
      if (!r) { ctx.notify('未找到待确认奖励'); return; }
      const confirmedMessage = () => {
        s.message = `${r.label}已到账 ${ctx.fmt(r.amount)} 金币`;
        if (r.kind === 'relief') {
          const gap = supplyStatus(session(), threshold()).gap;
          s.message += gap ? `，距原场门槛还差 ${ctx.fmt(gap)} 金币。` : '，已符合原场门槛，可返回选场。';
        }
      };
      if (r.status === 'paid') { confirmedMessage(); refresh(); ctx.notify('这笔奖励已到账'); return; }
      session().reward(r.amount); r.status = 'paid'; r.paidAt = now();
      if (r.kind === 'tea') { const tea = s.tea[r.date]; tea.success = r.slot; tea.nextAt = now() + 60000; tea.pending = null; tea.watching = false; }
      if (r.kind === 'chest') { const chest = s.chests[r.chest]; chest.status = 'paid'; }
      confirmedMessage();
      refresh(); ctx.notify(`${r.label}已到账 ${ctx.fmt(r.amount)} 金币`);
    }
    function claimUI(r, pageAction) {
      if (!r) return '';
      return `<div class="support-confirmed" role="status"><div>${pill(r.status === 'paid' ? '已到账' : '奖励确认中', r.status === 'paid' ? 'green' : 'blue')}<strong>${ctx.fmt(r.amount)} 金币</strong></div><p>${r.status === 'paid' ? '金币已加入可用余额。' : '本次金额已确定，请查看到账状态。'}</p>${r.status === 'paid' ? '' : B('查看到账状态', 'resolveReward', 'blue-button small', r.id)}${pageAction || ''}</div>`;
    }
    function unfinishedRewards(include = () => true) {
      const items = Object.values(state().rewards).filter(r => r.status === 'pending' && include(r));
      if (!items.length) return '';
      return `<section class="support-pending-ledger" aria-label="待确认的奖励记录"><h2>奖励确认中</h2>${items.map(r => `<article><div><strong>${safeText(r.label)}</strong><p>${safeText(r.date || dateKey(r.acceptedAt))} · ${r.amount}金币</p></div>${B('查看到账状态', 'resolveReward', 'blue-button small', r.id)}</article>`).join('')}</section>`;
    }
    function selectedFlipDate() {
      const c = clock(), s = state(), dates = Object.keys(s.flipDates).filter(key => key >= addDays(c.today, -1) && key <= c.today).sort().reverse();
      return dates.includes(s.flipDate) ? s.flipDate : dates[0] || c.today;
    }
    function teaFlow() {
      const s = state(), c = clock();
      const active = Object.entries(s.tea).find(([, tea]) => tea.watching || tea.pending);
      if (active) return { date: active[0], tea: active[1] };
      if (!s.tea[c.today]) s.tea[c.today] = { success: 0, watching: false, pending: null, nextAt: Math.max(0, ...Object.values(s.tea).map(tea => tea.nextAt || 0)) };
      return { date: c.today, tea: s.tea[c.today] };
    }
    function reliefInfo() {
      const c = clock(), s = state(), received = Object.values(s.rewards).filter(r => r.kind === 'relief');
      const today = received.filter(r => r.date === c.today).length, rolling = received.filter(r => now() - r.acceptedAt < 168 * 3600000).length;
      const pending = received.find(r => r.status !== 'paid');
      const status = supplyStatus(session(), threshold());
      return { ...status, today, rolling, pending, eligible: status.balanceEligible && today < 2 && rolling < 5 && !pending };
    }
    function reliefReason(r) {
      if (r.pending) return '已有一笔救济确认中，查看到账状态后再查看资格。';
      if (!r.balanceEligible) return '可用与锁定金币合计须低于20金币。';
      if (r.today >= 2) return '今日救济已达2次。';
      if (r.rolling >= 5) return '最近168小时救济已达5次。';
      return '本次可领60金币，到账后重新检查入场条件。';
    }
    const pages = {
      supportSupply() {
        const s = state(), r = reliefInfo();
        return title('金币补给') + full('补充金币，再回原场次', `<div class="support-supply-layout"><section class="support-balance"><h2>可用金币</h2><strong class="support-coin-number">${ctx.fmt(r.available)}</strong><dl>${ctx.kv('锁定本金', ctx.fmt(r.locked))}${ctx.kv('预留服务费', ctx.fmt(r.reserved))}${ctx.kv('原场门槛', ctx.fmt(r.threshold))}${ctx.kv('还差', ctx.fmt(r.gap) + ' 金币')}</dl><p class="support-note">${r.gap ? '到账后仍不足时，可继续通过活动补充金币。' : '已符合本场门槛。返回选场后自行开始。'}</p></section><section class="support-supply-options"><article class="support-relief"><h2>金币救济</h2><strong>60 <small>金币 / 次</small></strong><p>${reliefReason(r)}</p><p class="support-small">今日 ${r.today}/2次 · 最近168小时 ${r.rolling}/5次</p>${r.pending ? B('查看到账状态', 'resolveReward', 'blue-button small', r.pending.id) : B(r.eligible ? '领取60金币' : '暂不符合救济', 'relief', 'gold-button small', '', r.eligible ? '' : 'disabled')}</article><div class="support-two-paths"><article><h3>活动奖励</h3><p>签到、茶歇、回访和翻牌</p>${B('查看活动', 'activities', 'blue-button small')}</article><article><h3>商城</h3><p>使用金币购买装扮</p>${B('查看商城', 'shop', 'blue-button small')}</article></div><div class="support-inline-status" role="status">${s.message ? safeText(s.message) : '补给不会自动开始新对局。'}</div></section></div>`, 'support-wide') + footer();
      },
      supportActivity() {
        syncProgress();
        const c = clock(), s = state(), sign = s.rewards['signin:' + c.today], flow = teaFlow(), tea = flow.tea;
        const returnDates = Object.keys(s.returnDates).filter(key => key >= addDays(c.today, -1) && key <= c.today);
        const returnPending = Object.values(s.rewards).find(r => r.kind === 'return' && r.status === 'pending');
        const returnAvailable = returnDates.filter(key => !s.rewards['return:' + key]);
        const flipAvailable = Object.keys(s.flipDates).filter(key => key >= addDays(c.today, -1) && key <= c.today && !s.rewards['flip:' + key]).sort();
        const flipPending = Object.values(s.rewards).find(r => r.kind === 'flip' && r.status === 'pending');
        const flipDate = flipAvailable[0] || selectedFlipDate(), flip = flipPending || s.rewards['flip:' + flipDate], flipValid = Boolean(s.flipDates[flipDate]);
        const signCount = SIGNIN.filter((_, i) => s.rewards['signin:' + addDays(c.week, i)]?.status === 'paid').length;
        const teaExpired = tea.watching && now() - tea.startedAt > 15 * 60000;
        const statuses = {
          signinPage: { label: sign ? sign.status === 'paid' ? '已领取' : '确认中' : '可领取', tone: sign?.status === 'paid' ? 'done' : 'ready', progress: `本周已签到 ${signCount}/7 · 今日 ${sign?.amount || signupAmount(SIGNIN[c.index], s.vip)}金币`, deadline: sign ? '今日奖励已受理，金额已确定' : `${c.today} 24:00前签到`, action: sign ? '查看签到' : '查看今日奖励' },
          teaPage: { label: tea.pending ? '确认中' : teaExpired ? '观看超时' : tea.watching ? '观看中' : tea.success >= 3 ? '已领取' : '进行中', tone: tea.success >= 3 ? 'done' : 'progress', progress: `已领取 ${tea.success}/3档 · 完整观看后领取`, deadline: tea.pending ? `${flow.date}原档奖励待确认` : teaExpired ? '本次已超过15分钟，需重新观看' : tea.nextAt > now() ? `冷却剩余 ${Math.ceil((tea.nextAt - now()) / 1000)}秒` : '每次成功后间隔60秒', action: tea.pending ? '查看到账状态' : teaExpired ? '查看重试方式' : tea.watching ? '继续观看' : tea.success >= 3 ? '查看奖励' : '查看茶歇奖励' },
          returnPage: { label: returnPending ? '确认中' : returnAvailable.length ? '可领取' : '已领取', tone: returnPending || returnAvailable.length ? 'ready' : 'done', progress: returnPending ? `${returnPending.date}奖励确认中` : `今日 ${s.rewards['return:' + c.today]?.status === 'paid' ? '已领取' : '可领取'} · 待领取 ${returnAvailable.length}份`, deadline: returnPending ? '已受理奖励保留，可继续确认原次' : returnAvailable.length ? `最早 ${addDays(returnAvailable.sort()[0], 1)} 24:00截止` : '资格保留至次日24:00', action: returnPending ? '查看到账状态' : returnAvailable.length ? '查看回访奖励' : '查看领取记录' },
          flipPage: { label: flip?.status === 'pending' ? '确认中' : flipAvailable.length ? '可翻牌' : flip?.status === 'paid' ? '已领取' : '进行中', tone: flipAvailable.length ? 'ready' : flip?.status === 'paid' ? 'done' : 'progress', progress: `有效对局 ${flipValid ? 1 : 0}/1 · ${flipAvailable.length ? `待翻 ${flipAvailable.length}次` : '每日1次'}`, deadline: flip?.status === 'pending' ? `${flip.date}原次奖励待确认` : flipAvailable.length ? `${addDays(flipDate, 1)} 24:00前翻牌` : flip ? `${flipDate}机会已使用` : '完成一场有效对局后获得机会', action: flip?.status === 'pending' ? '查看到账状态' : flipAvailable.length ? '前往翻牌' : flip ? '查看翻牌结果' : '查看参与条件' }
        };
        const definitions = [
          ['signinPage', '七日茶约', '每日签到领金币', '基础每周700 · VIP共840', 'signin', '700', '金币 / 周', signCount, 7],
          ['teaPage', '茶歇好礼', '观看激励短片', '每日3档 · 3 / 3 / 4金币', 'tea', '10', '金币 / 天', tea.success, 3],
          ['returnPage', '回访有礼', '回到大厅领好礼', '每日1次 · 10金币', 'return', '10', '金币 / 次', s.rewards['return:' + c.today]?.status === 'paid' ? 1 : 0, 1],
          ['flipPage', '好运翻牌', '完成有效对局后翻牌', '每日1次 · 2 / 3 / 5 / 10金币', 'flip', '2–10', '金币 / 次', flipValid ? 1 : 0, 1]
        ];
        const spotlight = B(`<img class="support-activity-festival" src="assets/activity-welfare-header-166.webp" alt="" width="1536" height="640" decoding="async"><span class="support-spotlight-copy"><span class="support-spotlight-label">每日好礼</span><span class="support-spotlight-title">茶友福利站</span><span class="support-spotlight-reward">相聚茶桌，好礼相伴</span></span><span class="support-spotlight-link">查看签到 <span aria-hidden="true">›</span></span>`, 'signinPage', 'support-activity-spotlight activity-campaign-banner', '', 'aria-label="茶友好礼，查看签到"');
        const entries = definitions.map(([action, name, purpose, amount, art, number, unit, progress, max]) => {
          const status = statuses[action];
          return `<article class="activity-task-row kind-${art}" aria-label="${name}"><div class="activity-task-info"><h2>${name}<span id="${action}-status" class="support-entry-state ${status.tone}">${status.label}</span></h2><p class="activity-task-detail">${amount}</p><p id="${action}-deadline" class="support-entry-deadline">${status.deadline}</p></div><div class="activity-task-progress"><span id="${action}-progress">${status.progress}</span><progress value="${progress}" max="${max}" aria-label="${name}进度">${progress}/${max}</progress></div><div class="activity-task-reward"><span class="activity-reward-art kind-${art}" aria-hidden="true"></span><strong>${number}</strong><small>${unit}</small></div>${B(status.action, action, 'gold-button small activity-task-action', '', `aria-label="${safeText(name + '，' + purpose + '，' + amount + '，查看活动')}" aria-describedby="${action}-status ${action}-progress ${action}-deadline"`)}</article>`;
        }).join('');
        return title('活动') + activityNav('activities') + full('每日活动', `${spotlight}<div class="activity-task-list" aria-label="全部活动">${entries}</div><div class="activity-invite-entry"><span>和朋友一起玩 · 先了解玩法，再一起体验</span>${B('看看邀友卡片', 'invitePage', 'blue-button small')}</div>${unfinishedRewards()}<details class="support-activity-rules" data-view-id="activity-hub-rules"><summary>活动规则</summary><p class="support-activity-independence">四项活动独立参与，奖励分别领取；参与或领取其他活动不影响本活动。</p><p>签到按周累计，茶歇、回访与翻牌各有独立次数和期限。查看活动不会自动领取，奖励确认中请查询原次到账状态。</p></details>`, 'support-activity-hub activity-redesign activity-hub-166 activity-170 activity-hub-170') + footer();
      },
      supportSignin() {
        const c = clock(), s = state(), progress = syncProgress(), date = c.today, current = s.rewards['signin:' + date];
        const amount = current?.amount || signupAmount(SIGNIN[c.index], s.vip), todayVip = current ? current.vip : s.vip;
        const received = SIGNIN.filter((_, i) => s.rewards['signin:' + addDays(c.week, i)]?.status === 'paid').length;
        const cards = SIGNIN.map((base, i) => {
          const key = addDays(c.week, i), r = s.rewards['signin:' + key], future = i > c.index, missed = i < c.index && !r;
          const vip = r ? r.vip : i === c.index ? s.vip : Boolean(s.vipHistory[key]);
          const total = r?.amount || signupAmount(base, vip);
          const label = r ? r.status === 'paid' ? '已领取' : '确认中' : future ? '未到日期' : missed ? progress.coupon ? '可补签' : '漏签 · 需补签券' : '今日可领取';
          const disabled = future || r?.status === 'paid' || (missed && !progress.coupon);
          return `<button type="button" onclick="FieldUI.handle(event)" class="support-day activity-reward-item ${i === c.index ? 'today' : ''} ${i === 6 ? 'last' : ''} ${r?.status === 'paid' ? 'done' : ''}" data-action="support:signin" data-value="${key}" ${disabled ? 'disabled' : ''}><span class="support-day-date"><span>${DAYS[i]}</span><time datetime="${key}">${key}</time></span><i class="reward-art reward-coins support-day-coin" aria-hidden="true"></i><strong>${total}</strong><small>基础${base}${vip ? ` + VIP${Math.floor(base * .2)}` : ''}</small><em>${label}</em></button>`;
        }).join('');
        return title('七日茶约') + activityNav('signinPage') + full('七日签到', `<div class="support-signin-layout"><section class="support-today activity-banner">${activityArt('signin', 'support-signin-art')}<h2>今日 · ${DAYS[c.index]}</h2>${pill(todayVip ? 'VIP加成20%' : '基础奖励', todayVip ? '' : 'blue')}<strong class="support-coin-number">${amount}<small>金币</small></strong><dl>${ctx.kv('基础奖励', SIGNIN[c.index])}${ctx.kv('VIP额外', current ? current.amount - SIGNIN[c.index] : s.vip ? Math.floor(SIGNIN[c.index] * .2) : 0)}${ctx.kv('共得', amount)}</dl>${current ? claimUI(current) : B(`签到领${amount}金币`, 'signin', 'gold-button small', 'today')}<p class="support-deadline">${current ? '本次奖励已受理，金额已确定' : c.today + ' 24:00前领取'}</p></section><section class="support-signin-calendar"><div class="support-signin-summary"><div><strong>本周已领取 ${received} / 7 天</strong><progress value="${received}" max="7" aria-label="本周已领取天数">${received}/7</progress></div><span>基础700金币 · VIP加成20%共840金币</span></div><div class="support-week-grid">${cards}</div><div class="support-coupon"><div><strong>补签券 ${progress.coupon} 张</strong><p>本周有效对局 ${Math.min(progress.count, 3)} / 3 · 每周可补1天</p></div>${pill('本周基础700 · VIP840', 'blue')}</div><p class="support-note">${s.makeupByWeek[c.week] ? '本周补签机会已使用。' : progress.coupon ? '可点击本周漏签日，使用1张补签券。' : '本周完成3场有效对局，可获得1张补签券。'}</p></section></div>${unfinishedRewards(r => r.kind === 'signin' && r.date < c.week)}<details class="support-activity-rules" data-view-id="activity-signin-rules"><summary>签到规则</summary><p>每日手动签到；基础七日奖励30 / 50 / 60 / 80 / 100 / 130 / 250金币，每周共700金币。有效VIP加成20%，共840金币；普通签到按受理时的VIP状态计算，已受理金额不再变化。</p><p>完成本周3场有效对局获得1张当周补签券，每周可补1天。点击本周漏签日补签，需消耗1张补签券。补签加成按目标日结束时的VIP状态。</p><p>往期未受理的漏签已过期，不能补签；已受理奖励仍可确认到账。活动独立参与，其他活动领奖不影响签到。</p></details>`, 'support-activity-page support-signin-page activity-redesign activity-signin-166 activity-170 activity-signin-170') + footer();
      },
      supportTea() {
        const c = clock(), s = state(), flow = teaFlow(), tea = flow.tea;
        const r = tea.pending ? s.rewards[tea.pending] : null, wait = Math.max(0, Math.ceil((tea.nextAt - now()) / 1000));
        const next = TEA[Math.min(tea.success, 2)];
        const viewing = tea.watching, expired = viewing && now() - tea.startedAt > 15 * 60000;
        const controls = viewing ? B('完成观看并确认', 'teaComplete', 'gold-button small', '', expired ? 'disabled' : '') + B(expired ? '关闭并重新选择' : '提前关闭', 'teaCancel', 'blue-button small') : r ? B('查看到账状态', 'resolveReward', 'blue-button small', r.id) : B(tea.success >= 3 ? '今日已领完' : wait ? `冷却剩余${wait}秒` : `观看短片领${next}金币`, 'teaStart', 'gold-button small', '', tea.success >= 3 || wait ? 'disabled' : '');
        const stages = TEA.map((n, i) => {
          const paid = i < tea.success, current = i === tea.success;
          const label = paid ? '已领取' : !current ? '未开放' : r ? '确认中' : expired ? '已超时' : viewing ? '观看中' : wait ? '冷却中' : '可参与';
          const detail = paid ? '已加入可用金币' : !current ? '完成前一档并等待冷却后开放' : r ? '本档已受理，请查看到账状态' : expired ? '关闭本次观看后可重新观看' : viewing ? '完整观看并确认后领取' : wait ? `剩余${wait}秒后可观看` : '完整观看本档短片后领取';
          return `<div class="support-reward-stage activity-task-row activity-reward-item ${paid ? 'done' : current ? 'current' : 'locked'}"><span class="activity-task-number" aria-hidden="true">${paid ? '✓' : i + 1}</span><div class="activity-task-info"><h3>第${i + 1}档茶歇</h3><p>${detail}</p>${pill(label, paid ? 'green' : current ? 'blue' : 'gray')}</div><div class="activity-task-reward"><span class="activity-reward-art kind-tea" aria-hidden="true"></span><strong>${n} <small>金币</small></strong></div><div class="support-tea-actions">${current ? controls : ''}</div></div>`;
        }).join('');
        return title('茶歇好礼') + activityNav('teaPage') + full('闲歇片刻，领取好礼', `<div class="support-tea-layout"><section class="support-tea-hero activity-banner">${activityArt('tea', 'support-tea-art')}<h2>${expired ? '观看已超时' : viewing ? '短片播放中' : tea.success >= 3 ? '今日好礼已领完' : '本档茶歇奖励'}</h2><strong class="support-coin-number">${tea.success < 3 ? r?.amount || next : '10'}<small>${tea.success < 3 ? '本档金币' : '今日合计'}</small></strong>${viewing ? `<div class="support-video-preview"><span aria-hidden="true">▶</span><strong>${expired ? '观看已超时' : '广告播放中'}</strong></div>` : '<p>闲歇片刻，看看短片</p>'}</section><section class="support-tea-progress"><h2>${flow.date === c.today ? '今日奖励' : flow.date + '奖励记录'} ${tea.success}/3</h2><div class="activity-task-list">${stages}</div>${tea.success >= 3 ? `<div class="support-tea-actions">${controls}</div>` : ''}<div class="support-inline-status" role="status">${expired ? '本次观看已超过15分钟，请关闭后重新观看。' : viewing ? '本次观看须在15分钟内确认，提前关闭不领奖。' : r ? '本档金额已确定，确认期间不重复观看。' : tea.success >= 3 ? '今日3档已完成，明日重新开放。' : wait ? '两次成功奖励间隔60秒，请等待冷却结束。' : '自愿观看短片，完整观看后领取；广告不可用时可稍后重试。'}</div><p class="support-note">每日3档，共10金币</p></section></div><details class="support-activity-rules" data-view-id="activity-tea-rules"><summary>茶歇规则</summary><p>自愿完整观看短片，按顺序领取3 / 3 / 4金币，每日3档共10金币。两次成功奖励间隔60秒，完成前一档并等待冷却后开放下一档。</p><p>本次观看须在15分钟内确认，超时需关闭后重新观看。提前关闭、播放失败或广告不可用均不消耗成功次数。同一档确认中时查看原次到账状态，不重复观看。</p><p>已受理的跨日奖励仍按原日期和档位确认。活动独立参与，其他活动领奖不影响茶歇。</p></details>`, 'support-activity-page support-tea-page activity-redesign activity-tea-166 activity-170 activity-tea-170') + footer();
      },
      supportReturn() {
        const c = clock(), s = state();
        const dates = [...new Set([...Object.keys(s.returnDates), ...Object.values(s.rewards).filter(r => r.kind === 'return').map(r => r.date)])].filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key) && key <= c.today).sort().reverse();
        const row = key => {
          const r = s.rewards['return:' + key], expired = !r && key < addDays(c.today, -1);
          const label = r ? r.status === 'paid' ? '已领取 · 已到账' : '奖励确认中' : expired ? '已过期' : '可领取';
          return `<article class="support-return-row activity-task-row ${expired ? 'expired' : ''}"><div><h3>${key === c.today ? '今日回访' : key === addDays(c.today, -1) ? '昨日回访' : '回访记录'}<small>${key}</small></h3><p>${r ? r.status === 'paid' ? '金币已加入可用余额。' : '已在有效期内受理，可继续确认到账。' : `领取截止 ${addDays(key, 1)} 24:00${expired ? '，未领取资格已失效。' : ''}`}</p></div><strong>${r?.amount || 10} 金币</strong><div class="support-return-action">${pill(label, r?.status === 'paid' ? 'green' : expired ? 'gray' : 'blue')}${r ? r.status === 'pending' ? B('查看到账状态', 'resolveReward', 'blue-button small', r.id) : '' : expired ? '' : B('领取10金币', 'returnClaim', 'gold-button small', key)}</div></article>`;
        };
        const current = dates.filter(key => key >= addDays(c.today, -1) || s.rewards['return:' + key]?.status === 'pending').sort((a, b) => {
          const aPaid = s.rewards['return:' + a]?.status === 'paid', bPaid = s.rewards['return:' + b]?.status === 'paid';
          return Number(aPaid) - Number(bPaid) || a.localeCompare(b);
        });
        const history = dates.filter(key => !current.includes(key));
        return title('回访有礼') + activityNav('returnPage') + full('回到大厅，好礼相迎', `<div class="support-return-layout"><section class="support-return-hero">${activityArt('return', 'support-return-art')}<h2 class="heading">每日回访好礼</h2><strong class="support-coin-number">10<small>金币 / 次</small></strong><p class="support-note">回到大厅，每日手动领取一次</p></section><section class="support-return-content"><h2>我的回访奖励</h2><div class="support-return-rewards">${current.map(row).join('')}</div>${history.length ? `<details class="support-activity-history" data-view-id="activity-history"><summary>往期回访记录（${history.length}）</summary><div class="support-return-rewards">${history.map(row).join('')}</div></details>` : ''}</section></div><details class="support-activity-rules" data-view-id="activity-return-rules"><summary>回访规则</summary><p>进入大厅即获得当日资格，每天手动领取一次10金币；资格保留至次日24:00。今日与昨日资格分别领取，优先查看更早截止的未领奖励。</p><p>未受理的过期资格不能领取；已在有效期内受理的奖励，可继续查看原次到账状态，每份奖励只到账一次。</p><p>收藏、分享和订阅不影响本活动领奖。活动独立参与，其他活动领奖不影响回访。</p></details>`, 'support-activity-page support-return-page activity-redesign activity-return-166 activity-170 activity-return-170') + footer();
      },
      supportFlip() {
        syncProgress(); const c = clock(), s = state(), dates = Object.keys(s.flipDates).filter(key => key >= addDays(c.today, -1) && key <= c.today).sort().reverse();
        const selected = selectedFlipDate(), r = s.rewards['flip:' + selected], valid = Boolean(s.flipDates[selected]);
        return title('好运翻牌') + activityNav('flipPage') + full('完成对局，好运翻牌', `<div class="support-flip-heading activity-banner">${activityArt('flip', 'support-flip-art')}<div class="support-flip-copy"><h2>有效对局 ${valid ? 1 : 0} / 1</h2><p class="support-flip-progress">${r ? '已翻牌 · 本次机会已使用' : valid ? '剩余1次 · 四张任选一张' : '完成一场有效对局，获得今日机会'}</p><p class="support-deadline">${valid || r ? `${selected}机会 · ${addDays(selected, 1)} 24:00截止` : '金币场正常完成一局计1场；取消或未完成不计。'}</p></div><div class="support-flip-dates">${dates.map(key => B(key === c.today ? '今日机会' : '昨日机会', 'flipDate', key === selected ? 'gold-button small' : 'blue-button small', key)).join('') || pill('暂无翻牌机会', 'gray')}</div></div><div class="support-flip-cards">${[0, 1, 2, 3].map(i => `<button type="button" onclick="FieldUI.handle(event)" class="support-flip-card ${r && r.card === i ? 'revealed' : ''}" data-action="support:flipCard" data-value="${i}" ${!valid || r ? 'disabled' : ''} aria-label="第${i + 1}张好运牌，${r && r.card === i ? r.amount + '金币' : '点击翻牌'}">${r && r.card === i ? `<strong>${r.amount}</strong><small>金币</small>` : activityArt('card-back', 'support-flip-card-art', 400, 600) + '<small>好运翻牌</small>'}</button>`).join('')}</div><div class="support-flip-feedback" role="status">${r ? claimUI(r) : `<p class="support-note support-centered">${valid ? '选择后锁定结果，其余卡不能再翻。' : '还差一场有效对局，即可来翻好礼。'}</p>${!valid ? ctx.b('去金币场', 'coin', 'gold-button small') : ''}`}</div>${unfinishedRewards(r => r.kind === 'flip' && r.date < addDays(c.today, -1))}<details class="support-activity-rules" data-view-id="activity-flip-rules"><summary>翻牌规则</summary><p>每完成一场有效对局获得当日机会，每日1次，资格保留至次日24:00。同一有效对局可同时累计签到补签进度，活动分别领奖。</p><div class="support-flip-prizes">奖面 2 / 3 / 5 / 10 金币 · 概率 50% / 30% / 15% / 5%</div><p>四张牌任选一张，选择后锁定结果，其余卡不能再翻。已受理奖励按原次确认到账，重复查看不会改变金额或重复发奖。</p></details>`, 'support-activity-page support-flip-page activity-redesign activity-flip-166 activity-170 activity-flip-170') + footer();
      },
      supportInvite() {
        state();
        const ongoing = session().status !== 'idle';
        return title('和朋友一起玩') + activityNav('invitePage') + full('茶友相聚', `<section class="activity-invite-hero activity-banner"><div class="activity-invite-copy">${inviteCard()}</div><div class="activity-invite-actions">${B('预览邀友卡片', 'invitePreview', 'gold-button small')}${ctx.b(ongoing ? '返回原进度' : '去体验', ongoing ? 'resumeCoin' : 'coin', 'blue-button small')}</div></section><section class="activity-invite-summary"><h3>从了解玩法开始</h3><ol class="activity-invite-steps"><li><strong>了解玩法</strong><p>先看看当前玩法规则，再决定是否体验。</p></li><li><strong>新手教学</strong><p>首次玩家按现有新手计划学习基本操作。</p></li><li><strong>首次有效体验</strong><p>确认身份、入场条件与费用后，选择当前可参与的体验。</p></li></ol></section><details class="support-activity-rules" data-view-id="activity-invite-rules"><summary>邀友与新人规则</summary><p>同资格的新玩家通过普通入口或分享入口，使用同一份新手计划；已开始的计划继续原进度，来源不增加额外权益。</p><p>卡片用于介绍真实玩法。预览、打开或取消卡片都不代表已经发送，也不计入新手教学或有效体验进度；介绍者不因发送、打开或新人完成体验获得奖励。</p><p>登录成功后仍需完成原有身份与服务资格核验。本人有未结束的金币牌局时只返回原进度，托管也不能另开新局；结束后重新核对所选玩法的条件与费用。</p></details>`, 'support-activity-page support-invite-page activity-redesign activity-170 activity-invite-170') + footer();
      },
      supportShop() {
        const s = state(), cat = s.category || '全部', filtered = PRODUCTS.filter(p => cat === '全部' || p.category === cat);
        return title('商城') + shopNav('shop') + full('装扮好礼', `<div class="support-shop-toolbar"><div class="support-categories">${['全部', '表情', '头像框', '牌背', '主题'].map(x => B(x, 'category', cat === x ? 'active' : '', x)).join('')}</div><span>可用 ${ctx.fmt(session().available)} 金币</span></div><div class="support-product-grid">${filtered.map(p => `<article class="support-product-card">${art(p)}<h2>${p.name}</h2><p>${p.note}</p><strong>${ctx.fmt(p.price)} 金币</strong>${B(s.owned[p.id] ? '已拥有 · 查看' : '预览商品', 'product', 'gold-button small', p.id)}</article>`).join('')}</div><p class="support-footnote">装扮不改变玩法与成绩。</p>`) + footer();
      },
      supportProduct() {
        const s = state(), p = product(s.product) || PRODUCTS[0], owned = Boolean(s.owned[p.id]), pending = s.orders.find(o => o.product === p.id && o.status !== 'delivered');
        return title('商品预览') + shopNav('shop') + full(p.name, `<div class="support-product-detail"><section class="support-product-showcase">${art(p)}<p>外观预览</p></section><section class="support-product-description"><h2>${p.name}</h2>${pill(p.category, 'blue')}<p>${p.description}</p><dl>${ctx.kv('价格', ctx.fmt(p.price) + '金币')}${ctx.kv('数量', '1')}${ctx.kv('有效期', '永久')}${ctx.kv('可用金币', ctx.fmt(session().available))}</dl><div class="support-inline-status ${s.error ? 'error' : ''}" role="status">${s.error ? safeText(s.error) : owned ? '已拥有，可在我的装扮中装备。' : pending ? '订单已扣费，等待装扮交付。' : '使用金币购买，不能动用锁定本金。'}</div>${owned ? B('前往装扮', 'wardrobe', 'gold-button') : pending ? B('查看原订单', 'orders', 'blue-button') : B('购买确认', 'buyConfirm', 'gold-button', p.id)}${session().available < p.price && !owned && !pending ? B('金币补给', 'supply', 'blue-button small') : ''}</section></div>`) + footer();
      },
      supportOrders() {
        const s = state(), body = s.orders.length ? `<div class="support-order-list">${[...s.orders].reverse().map(o => { const p = product(o.product); return `<article class="support-order"><div><h2>${p.name}</h2><p>${safeText(o.id)} · 数量1 · 永久</p><p>${o.status === 'delivered' ? '商品已交付，可前往我的装扮装备。' : '金币已扣，装扮交付中。查询原订单，不重复购买。'}</p></div><strong>${o.price} 金币</strong><div>${pill(o.status === 'delivered' ? '已交付' : '交付中', o.status === 'delivered' ? 'green' : 'blue')}${o.status === 'delivered' ? B('我的装扮', 'wardrobe', 'gold-button small') : B('查询原订单', 'deliver', 'blue-button small', o.id)}</div></article>`; }).join('')}</div>` : `<div class="empty-state"><div class="icon">单</div><h2>还没有购买记录</h2><p>商城可以先预览商品，再确认购买。</p>${B('前往商城', 'shop', 'gold-button')}</div>`;
        return title('我的订单') + shopNav('orders') + full('订单记录', body) + footer();
      },
      supportWardrobe() {
        const s = state(), owned = PRODUCTS.filter(p => s.owned[p.id]);
        return title('我的装扮') + shopNav('wardrobe') + full('已拥有的装扮', `<div class="support-wardrobe-status"><div><h2>默认外观</h2><p>随时可用。购买与装备分别操作。</p></div>${B('恢复全部默认', 'defaultEquip', 'blue-button small')}</div>${owned.length ? `<div class="support-product-grid">${owned.map(p => `<article class="support-product-card">${art(p)}<h2>${p.name}</h2>${pill(s.equipped[p.type] === p.id ? '已装备' : '永久拥有', s.equipped[p.type] === p.id ? 'green' : 'blue')}${B(s.equipped[p.type] === p.id ? '恢复默认' : '装备', 'equip', 'gold-button small', p.id)}</article>`).join('')}</div>` : `<div class="empty-state support-empty"><h2>暂无额外装扮</h2><p>默认外观已启用，前往商城可查看新装扮。</p>${B('前往商城', 'shop', 'gold-button')}</div>`}`) + footer();
      },
      supportChest() {
        const s = state(), items = Object.values(s.chests), t = ctx.getTournament?.(), event = ctx.getEvent?.();
        const fixed = t && ['finalTemp', 'final'].includes(t.status) && event?.award;
        return title('宝箱与奖励') + full('我的奖励', `<div class="support-chest-layout"><section class="support-chest-hero"><div class="support-chest-art" aria-hidden="true"><span>礼</span></div><h2>对局宝箱</h2><p>可获得80 / 120 / 200金币</p><p class="support-note">完成有效对局有机会获得宝箱，每日最多3箱。</p></section><section class="support-chest-records">${fixed ? `<article class="support-chest-record"><div><h3>${safeText(event.name)} · 固定奖励</h3><p>${t.awarded ? '正式结果确认后自动到账，无需领取。' : '结果复核中，固定奖待确认。'}</p></div><strong>${event.award} 金币</strong>${pill(t.awarded ? '已自动到账' : '待复核', t.awarded ? 'green' : 'gray')}</article>` : ''}${items.map(chest => { const r = s.rewards['chest:' + chest.id]; return `<article class="support-chest-record"><div><h3>${chest.packaging === 'direct' ? '宝箱金币' : '宝箱金币礼包'}</h3><p>${chest.packaging === 'direct' ? '直接金币已自动入账，开箱仅查看奖品。' : '领取后加入可用金币，每份礼包仅可领取一次。'}</p></div><strong>${chest.amount} 金币</strong>${chest.status === 'paid' ? pill('已到账', 'green') : chest.status === 'confirming' ? B('查看到账状态', 'resolveReward', 'blue-button small', r.id) : B('领取礼包', 'chestClaim', 'gold-button small', chest.id)}</article>`; }).join('')}${!items.length && !fixed ? `<div class="empty-state support-empty"><h2>暂无宝箱或赛事奖励</h2><p>获得的宝箱和赛事奖励会显示在这里。</p></div>` : ''}</section></div>`, 'support-wide') + footer();
      }
    };
    function art(p) {
      if (p.art === 'expression') return '<div class="support-product-art expression" aria-label="三款茶友表情预览"><span>☺</span><span>✌</span><span>♡</span></div>';
      if (p.art === 'frame') return '<div class="support-product-art frame" aria-label="金玉头像框预览"><div class="support-portrait"></div></div>';
      if (p.art === 'cardback') return '<div class="support-product-art cardback" aria-label="青竹牌背预览"><span>竹</span><span>竹</span><span>竹</span></div>';
      return '<div class="support-product-art theme" aria-label="古城茶庭主题预览"></div>';
    }
    function signin(value) {
      const s = state(), c = clock(), progress = syncProgress(), date = value === 'today' || !value ? c.today : value;
      const index = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(c.week + 'T00:00:00Z')) / 86400000);
      if (!Number.isFinite(index) || index < 0 || index > c.index) { ctx.notify('只能签到今日，或补签本周已过去的有效日期'); return; }
      const id = 'signin:' + date, old = s.rewards[id];
      if (old) { if (old.status === 'pending') resolveReward(id); else ctx.notify('该日期已签到'); refresh(); return; }
      if (index < c.index) {
        if (!progress.coupon) { ctx.notify('需要1张补签券，本周3场有效对局可获得'); return; }
        const vip = Boolean(s.vipHistory[date]), amount = signupAmount(SIGNIN[index], vip);
        s.makeupTarget = date;
        ctx.showModal('确认补签', `<div class="modal-kv"><span>补签日期</span><b>${date}</b></div><div class="modal-kv"><span>基础 / VIP额外 / 共得</span><b>${SIGNIN[index]} / ${amount - SIGNIN[index]} / ${amount}金币</b></div><p class="modal-copy">消耗1张当周补签券，本周补签机会用完。</p>`, ctx.b('返回签到', 'closeModal', 'blue-button') + B('确认补签', 'makeup', 'gold-button', date)); return;
      }
      reward(id, signupAmount(SIGNIN[index], s.vip), '签到奖励', 'supportSignin', { kind: 'signin', date, vip: s.vip });
      s.signClaims[date] = id; refresh();
    }
    function makeup(date) {
      const s = state(), c = clock(), p = syncProgress();
      if (s.rewards['signin:' + date]) { open('supportSignin'); return; }
      if (date !== s.makeupTarget || date < c.week || date >= c.today || !p.coupon) { ctx.notify('补签资格已变化，请返回签到重新查看'); return; }
      const i = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(c.week + 'T00:00:00Z')) / 86400000), vip = Boolean(s.vipHistory[date]);
      s.makeupByWeek[c.week] = date; s.signClaims[date] = 'signin:' + date;
      reward('signin:' + date, signupAmount(SIGNIN[i], vip), '补签奖励', 'supportSignin', { kind: 'signin', date, vip, makeup: true });
      open('supportSignin');
    }
    function purchase(id) {
      const s = state(), p = product(id); if (!p) { ctx.notify('商品不存在'); return; }
      const previous = s.orders.find(o => o.product === id);
      if (previous || s.owned[id]) { open(previous && previous.status !== 'delivered' ? 'supportOrders' : 'supportWardrobe'); ctx.notify('永久商品不重复购买'); return; }
      if (session().available < p.price) { s.error = `可用金币不足，还差${ctx.fmt(p.price - session().available)}金币；锁定本金不能用于购买。`; s.product = id; open('supportProduct'); return; }
      session().spend(p.price); s.orders.push({ id: '订单' + now() + '-' + (s.orders.length + 1), product: id, price: p.price, status: 'delivering', createdAt: now() });
      s.error = ''; open('supportOrders'); ctx.notify('金币已扣，正在交付商品');
    }
    function scenario(value) {
      const s = state(), c = clock();
      if (value === 'vip') s.vip = !s.vip;
      if (value === 'makeup') { s.demoValidGames = 3; s.demoValidGamesWeek = c.week; s.vipHistory[addDays(c.today, -1)] = true; }
      if (value === 'returnYesterday') s.returnDates[addDays(c.today, -1)] = { qualified: true };
      if (value === 'flipYesterday') s.flipDates[addDays(c.today, -1)] = { qualified: true };
      if (value === 'teaReady') { const tea = s.tea[c.today]; if (tea) tea.nextAt = 0; }
      if (value === 'chestPending' || value === 'chestDirect') {
        const id = 'demo-chest-120';
        if (!s.chests[id]) {
          const direct = value === 'chestDirect'; s.chests[id] = { id, amount: 120, packaging: direct ? 'direct' : 'package', status: direct ? 'paid' : 'available' };
          if (direct) { const r = reward('chest:' + id, 120, '宝箱金币', 'supportChest', { kind: 'chest', chest: id }); session().reward(120); r.status = 'paid'; r.paidAt = now(); }
        }
        open('supportChest'); return;
      }
      refresh(); ctx.notify('已切换配套演示状态');
    }
    function dispatch(action, value) {
      if (!String(action).startsWith('support:')) return false;
      const name = String(action).slice(8), s = state(), c = clock();
      const destinations = { activities: 'supportActivity', supply: 'supportSupply', signinPage: 'supportSignin', teaPage: 'supportTea', returnPage: 'supportReturn', flipPage: 'supportFlip', invitePage: 'supportInvite', shop: 'supportShop', orders: 'supportOrders', wardrobe: 'supportWardrobe', chest: 'supportChest' };
      if (destinations[name]) { open(destinations[name]); return true; }
      switch (name) {
        case 'refresh': refresh(); break;
        case 'invitePreview': ctx.showModal('邀友卡片预览', `<div class="activity-invite-preview">${inviteCard()}<p>这是玩法卡片预览。可关闭返回，继续了解玩法。</p></div>`, ctx.b('返回邀友页', 'closeModal', 'blue-button')); break;
        case 'signin': signin(value); break;
        case 'makeup': makeup(value); break;
        case 'resolveReward': resolveReward(value); break;
        case 'relief': {
          const info = reliefInfo();
          if (info.pending) { refresh(); ctx.notify('请查看救济到账状态'); break; }
          if (!info.eligible) { s.message = reliefReason(info); refresh(); ctx.notify(s.message); break; }
          reward(`relief:${c.today}:${info.today + 1}`, 60, '金币救济', 'supportSupply', { kind: 'relief', date: c.today });
          s.message = '救济领取已受理，确认中不会重复领取。'; refresh(); break;
        }
        case 'returnClaim': {
          const date = value || c.today, id = 'return:' + date;
          if (!s.returnDates[date] || date < addDays(c.today, -1) || date > c.today) { ctx.notify('这份回访资格已过期或尚未取得'); break; }
          if (s.rewards[id]) { ctx.notify('这份回访奖励已受理，请查看到账状态'); refresh(); break; }
          reward(id, 10, '回访奖励', 'supportReturn', { kind: 'return', date }); refresh(); break;
        }
        case 'teaStart': {
          const tea = teaFlow().tea;
          if (tea.success >= 3 || tea.pending || tea.watching) { ctx.notify(tea.pending ? '本档确认中，请查看到账状态' : tea.watching ? '短片已在播放' : '今日3档奖励已完成'); break; }
          if (now() < tea.nextAt) { refresh(); ctx.notify('两次成功奖励间隔60秒，请稍候'); break; }
          tea.watching = true; tea.startedAt = now(); refresh(); break;
        }
        case 'teaCancel': { const tea = teaFlow().tea; tea.watching = false; refresh(); ctx.notify('已关闭短片，成功次数不变'); break; }
        case 'teaComplete': {
          const flow = teaFlow(), tea = flow.tea; if (!tea.watching) { ctx.notify('请先观看当前档短片'); break; }
          if (now() - tea.startedAt > 15 * 60000) { tea.watching = false; refresh(); ctx.notify('本次观看已超过15分钟，请重新观看'); break; }
          const slot = tea.success + 1, id = `tea:${flow.date}:${slot}`; tea.watching = false; tea.pending = id;
          reward(id, TEA[slot - 1], '茶歇奖励', 'supportTea', { kind: 'tea', date: flow.date, slot }); refresh(); break;
        }
        case 'flipDate': s.flipDate = value; refresh(); break;
        case 'flipCard': {
          syncProgress(); const date = selectedFlipDate(), id = 'flip:' + date, card = Number(value);
          if (!s.flipDates[date] || date < addDays(c.today, -1) || date > c.today) { ctx.notify('完成有效对局后获得翻牌机会'); break; }
          if (s.rewards[id]) { ctx.notify('本次翻牌已完成，请查看奖励'); refresh(); break; }
          if (!Number.isInteger(card) || card < 0 || card > 3) break;
          /* 演示使用现行奖面3金币的已确定样例，不运行客户端随机开奖。 */
          reward(id, 3, '翻牌奖励', 'supportFlip', { kind: 'flip', date, card }); refresh(); break;
        }
        case 'category': s.category = ['全部', '表情', '头像框', '牌背', '主题'].includes(value) ? value : '全部'; refresh(); break;
        case 'product': if (!product(value)) { ctx.notify('商品不存在'); break; } s.product = value; s.error = ''; open('supportProduct'); break;
        case 'buyConfirm': {
          const p = product(value || s.product); if (!p) break;
          if (s.owned[p.id]) { open('supportWardrobe'); break; }
          if (s.orders.some(o => o.product === p.id)) { open('supportOrders'); break; }
          if (session().available < p.price) { purchase(p.id); break; }
          ctx.showModal('确认购买', `<div class="modal-kv"><span>商品 / 数量</span><b>${p.name} / 1</b></div><div class="modal-kv"><span>价格 / 有效期</span><b>${p.price}金币 / 永久</b></div><p class="modal-copy">使用可用金币购买。永久商品只能拥有一份，购买后在我的装扮中装备。</p>`, ctx.b('返回商品', 'closeModal', 'blue-button') + B('确认购买', 'purchase', 'gold-button', p.id)); break;
        }
        case 'purchase': purchase(value || s.product); break;
        case 'deliver': {
          const order = s.orders.find(o => o.id === value); if (!order) { ctx.notify('未找到原订单'); break; }
          if (order.status !== 'delivered') { order.status = 'delivered'; s.owned[order.product] = { order: order.id, permanent: true }; }
          refresh(); ctx.notify('商品已交付，金币不会重复扣除'); break;
        }
        case 'equip': { const p = product(value); if (!p || !s.owned[value]) { ctx.notify('请先拥有该装扮'); break; } if (s.equipped[p.type] === p.id) delete s.equipped[p.type]; else s.equipped[p.type] = p.id; refresh(); ctx.notify(s.equipped[p.type] ? '已装备' : '已恢复默认'); break; }
        case 'defaultEquip': s.equipped = {}; refresh(); ctx.notify('已恢复默认外观'); break;
        case 'chestClaim': {
          const chest = s.chests[value]; if (!chest) { ctx.notify('暂未获得这个礼包'); break; }
          if (chest.status === 'paid' || chest.packaging === 'direct') { ctx.notify('宝箱金币已到账，查看不会重复发奖'); break; }
          const id = 'chest:' + chest.id; reward(id, chest.amount, '宝箱礼包', 'supportChest', { kind: 'chest', chest: chest.id }); chest.status = 'confirming'; refresh(); break;
        }
        case 'scenario': scenario(value); break;
        default: return false;
      }
      return true;
    }
    const labels = { supportSupply: '金币 · 补给', supportActivity: '配套 · 活动中心', supportSignin: '活动 · 七日茶约', supportTea: '活动 · 茶歇好礼', supportReturn: '活动 · 回访有礼', supportFlip: '活动 · 好运翻牌', supportInvite: '活动 · 和朋友一起玩', supportShop: '配套 · 商城', supportProduct: '商城 · 商品预览', supportOrders: '商城 · 我的订单', supportWardrobe: '商城 · 我的装扮', supportChest: '奖励 · 宝箱与礼包' };
    return { pages, labels, dispatch, supplyView(){const r=reliefInfo();return {r,s:state(),reason:reliefReason(r)};} };
  }
  return { create, SIGNIN, PRODUCTS, signinAmount: signupAmount, supplyStatus, escape };
});
