/* 本地交互参考；业务来源和示例数值见 README.md。 */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const stage = $('#stage'), modal = $('#modal'), modalBody = $('#modal-body');
  const fmt = n => new Intl.NumberFormat('zh-CN').format(n);
  const signed = n => (n > 0 ? '+' : '') + fmt(n);
  const FEE = 20, KEY = 'maluer-fields-20261013-v1';
  const fields = [
    { name:'休闲场', min:500, max:5000, base:10 }, { name:'进阶场', min:5000, max:50000, base:50 },
    { name:'高手场', min:50000, max:500000, base:200 }, { name:'大师场', min:500000, max:Infinity, base:1000 }
  ];
  const events = [
    { name:'新手杯', badge:'每日免费', prize:'冠军 100 金币', count:16, rounds:3, time:'今日 12:30', duration:'约 120 分钟', entry:'每日 1 次免费', award:100 },
    { name:'日常排位', badge:'实力排位', prize:'限定称号 · 头像框', count:16, rounds:4, time:'今日 20:00', duration:'约 160 分钟', entry:'微信小游戏免费', award:0 },
    { name:'周末锦标赛', badge:'任务券参赛', prize:'冠军 500 金币', count:64, rounds:4, time:'周六 19:00', duration:'周六资格赛 / 周日决赛', entry:'当周赛事券 ×1', award:500 }
  ];
  const defaults = () => ({ screen:'home', field:2, game:0, region:'郑州', detailTab:0, coinTab:0, ready:false,
    matchCount:1, selectedTile:-1, discard:'二万', history:[], event:0, filter:0,
    tournament:{ status:'none', round:1, hand:1, stage:0, checked:false, awarded:false, error:false, auto:false, points:0 },
    lossDemo:false, offline:false, ticket:1, pauseAuto:false });
  let data = defaults(), session = new FieldCore.Session(), generation = 0, timers = [], focusBeforeModal, toastTimer;
  try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved) { data = {...data,...saved.data}; session = FieldCore.Session.restore(JSON.stringify(saved.session)); } } catch { /* 不可用的存档恢复初始演示。 */ }
  const t = () => data.tournament;
  const e = () => events[data.event];
  const regionGames={郑州:['郑州麻将','红中麻将','跑得快'],武汉:['武汉麻将','红中麻将','跑得快'],陕北:['陕北麻将','红中麻将','跑得快']};
  const gameName = () => (regionGames[data.region]||regionGames.郑州)[data.game];
  const b = (label,action,cls='gold-button',extra='') => `<button type="button" onclick="FieldUI.handle(event)" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
  const badge = (label,cls='') => `<span class="badge ${cls}">${label}</span>`;
  const trophy = `<svg class="hero-trophy" viewBox="0 0 100 100" aria-hidden="true"><path d="M25 10h50v15h18v14c0 15-13 25-27 26l-8 8v10h16v9H26v-9h16V73l-8-8C20 64 7 54 7 39V25h18V10zm0 24H16v5c0 8 5 13 12 15-2-6-3-13-3-20zm50 0c0 7-1 14-3 20 7-2 12-7 12-15v-5h-9z"/></svg>`;
  const kv = (label,value,compact=false) => `<div class="kv ${compact?'compact':''}"><dt>${label}</dt><dd>${value}</dd></div>`;
  const tabs = (labels,action,active,cls='tabs-row') => `<div class="${cls}">${labels.map((label,i)=>b(label,action,i===active?'active':'',`data-value="${i}" aria-pressed="${i===active}"`)).join('')}</div>`;
  const sideTabs = active => `<nav class="side-tabs" aria-label="金币场页面">${['准备分桌','真人匹配','本局结果'].map((x,i)=>`<button type="button" onclick="FieldUI.handle(event)" class="${i===active?'active':''}" data-action="coinFlowTab" data-value="${i}" aria-pressed="${i===active}">${x}</button>`).join('')}</nav>`;
  function header(title,back='back',region=false) {
    return `<header class="game-header">${b('‹',back,'back','aria-label="返回"')}<h1 class="game-title">${title}</h1>${region?`<button type="button" onclick="FieldUI.handle(event)" class="region-chip" data-action="region">${data.region} ▾</button>`:''}<div class="assetbar">${b('<span>房</span><b>433</b>','wallet','currency','aria-label="房卡余额433"')}${b(`<span>🪙</span><b>${fmt(session.coins)}</b>`,'supply','currency',`aria-label="金币余额${session.coins}"`)}${b('<span>💎</span><b>0</b>','wallet','currency','aria-label="钻石余额0"')}</div></header>`;
  }
  function footer(actions='',kind='coin') {
    const tools=kind==='tournament'?[['☷','赛事规则','eventRules'],['♜','我的赛事','myEvents'],['★','赛季排行','season'],['♢','我的奖励','rewards']]:[['☷','玩法规则','rules'],['?','帮助反馈','help'],['♜','战绩','history'],['▤','金币说明','coinInfo']];
    return `<footer class="footerbar">${tools.map(([icon,label,action])=>b(`<span class="round-icon">${icon}</span>${label}`,action,'tool')).join('')}<div class="footer-actions">${actions}</div></footer>`;
  }
  const panel = (title,body,cls='body-panel') => `<section class="panel ${cls}"><div class="panel-title">${title}</div><div class="panel-content">${body}</div></section>`;
  const aside = (title,body) => panel(title,body,'aside-panel');
  const steps = (active,labels=['报名','检录','分桌','比赛','赛果']) => `<div class="steps">${labels.map((label,i)=>`<div class="step ${i===active?'active':''}">${i+1} · ${label}</div>`).join('')}</div>`;
  function save() { try { localStorage.setItem(KEY,JSON.stringify({data,session})); } catch { /* file/隐私浏览模式保持当前内存状态。 */ } }
  function later(fn,ms) { if(data.pauseAuto)return;const token=generation; timers.push(setTimeout(()=>{ if(token===generation) fn(); },ms)); }
  function cancelTimers() { generation++; timers.forEach(clearTimeout); timers=[]; }
  function notify(message) { clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').classList.add('visible'); toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200); }
  function closeModal() { if(modal.open) modal.close(); }
  function showModal(title,body,actions='') {
    focusBeforeModal = document.activeElement;
    modalBody.innerHTML=`<h2 id="modal-title" class="modal-title">${title}</h2>${body}${actions?`<div class="modal-actions">${actions}</div>`:''}`;
    if(!modal.open) modal.showModal();
    (modal.querySelector('.modal-actions .blue-button') || modal.querySelector('.modal-close')).focus();
  }
  modal.addEventListener('close',()=>{ if(focusBeforeModal?.isConnected) focusBeforeModal.focus(); else document.querySelector('.workbench button')?.focus(); });
  function blockActive(destination) {
    if(session.status==='playing' && !['coinPlay','supply','history'].includes(destination)) {
      showModal('本局还在进行',`<p class="modal-copy">${gameName()} · ${fields[data.field].name}尚未结束。你可以开启托管或返回原牌桌，本局结束后再参与其他对局。</p>`,b('返回牌桌','returnTable')); return true;
    }
    if(['table','smallResult','roundWait','allocating','published'].includes(t().status) && !destination.startsWith('event') && !['season','rewards','myEvents'].includes(destination)) {
      showModal('赛事正在进行',`<p class="modal-copy">${e().name}正在进行，请从“我的赛事”返回当前进度。赛事未结束前不能进入其他实时对局。</p>`,b('返回比赛','eventResume')); return true;
    }
    return false;
  }
  function go(screen) {
    if(blockActive(screen)) return;
    closeModal(); clearTimeout(toastTimer); $('#toast').classList.remove('visible'); data.screen=screen; save(); render();
  }
  function activeCoinScreen() { return session.status==='playing'?'coinPlay':session.status==='seated'?'coinReady':session.status==='matching'?'coinMatch':'coinLobby'; }
  function home() {
    return `<img class="home-photo" src="assets/home.png" alt="麻溜儿大厅效果图，金币场和比赛场入口">${header('麻溜儿','home')}${b('','coin','home-hit','style="left:800px;top:362px;width:280px;height:350px" aria-label="进入金币场"')}${b('','tournament','home-hit','style="left:1095px;top:362px;width:280px;height:350px" aria-label="进入比赛场"')}
      <div class="home-entries">${b('金币场 <small>单局竞技 · 金币结算</small>','coin','gold-button')}${b('比赛场 <small>报名参赛 · 赛季排名</small>','tournament','blue-button')}</div>${session.status!=='idle'?`<button type="button" onclick="FieldUI.handle(event)" class="resume-banner" data-action="resumeCoin">${session.status==='playing'?'本局进行中':'匹配流程进行中'} · 返回原流程 ›</button>`:''}`;
  }
  function coinLobby() {
    const allowed=FieldCore.recommend(session.available), status=session.status!=='idle';
    return header('金币场','back',true)+tabs(regionGames[data.region]||regionGames.郑州,'game',data.game,'lobby-tabs')+
      `<div class="old-selection-cover"></div>${fields.map((f,i)=>b(`<span class="sr-only">${f.name}，底分${f.base}，${i===allowed?'可进入':'当前余额不符'}</span>${data.field===i?'<span class="selected-label">当前选择</span>':''}`,'selectField',`card-hit ${data.field===i?'active':''}`,`style="left:${[507,852,1205,1548][i]}px" data-value="${i}" aria-pressed="${data.field===i}"`)).join('')}
      ${status?`<button type="button" onclick="FieldUI.handle(event)" class="queue-banner" data-action="resumeCoin">${session.status==='playing'?'本局进行中':'真人匹配进行中'} · 返回${session.status==='playing'?'牌桌':'流程'} ›</button>`:''}`+
      footer(b(`${status?'返回流程':'快速开始'} ›<small>${gameName()} · ${fields[data.field].name}</small>`,status?'resumeCoin':'startCoin','gold-button quick'));
  }
  function coinMatch() {
    const names=['Pain','茶山客','清风','听雨'];
    return header('金币场')+sideTabs(1)+`<div class="match-clean"></div><div class="match-state">真人匹配</div><span class="match-count">${data.matchCount} / 4 人</span>
      ${names.map((name,i)=>`<div class="match-avatar ${i?'alt':''} ${i>=data.matchCount?'waiting':''}" style="left:${[500,850,1200,1550][i]}px">${i>=data.matchCount?'<span>?</span>':''}</div><div class="match-chip" style="left:${[462,811,1160,1509][i]}px">${i<data.matchCount?`${name} · 已就位`:'等待玩家…'}</div>`).join('')}
      <div class="match-meta"><h3>${gameName()} · ${fields[data.field].name} · 单局</h3><p>预留服务费 ${FEE} 金币，成功发牌时扣除。取消后释放预留。</p></div>`+
      footer(b('返回大厅','matchHome','blue-button')+b('取消匹配','cancelCoin','gold-button'));
  }
  function coinReady() {
    const seats=[['茶山客',790,259],['听雨',355,472],['清风',1160,472],['Pain',790,650]];
    return header('金币场')+sideTabs(0)+`<div class="ready-art-board" role="img" aria-label="四人准备桌效果图，其他三人已准备，自己待确认"></div>${seats.map(([name,x,y],i)=>`<div class="ready-name" style="left:${x}px;top:${y}px"><strong>${name}</strong><span>${i===3?'待确认':'已准备'}</span></div>`).join('')}<div class="avatar ready-new-avatar"></div>`+aside('本局信息',kv('玩法',gameName(),true)+kv('场档',fields[data.field].name,true)+kv('底分',fmt(fields[data.field].base),true)+kv('开局方式','单局开赛',true)+`<p class="aside-note">四人就位后发牌。<br>服务费仅在成功发牌时扣一次。</p>`)+footer(b('退出准备','cancelCoin','blue-button')+b('准备开局','deal','gold-button'));
  }
  const hand=['一万','一万','二万','三万','四万','五万','六万','七万','八万','●●','●●','發','中','中'];
  function board(playing,tournament=false) {
    const auto=tournament?t().auto:session.auto;
    return `<div class="table-canvas"><div class="table-glow"></div><div class="board-state"><span>${tournament?`${e().name} · 第${t().round}轮`:`${gameName()} · 单局`}</span><span>${playing?(tournament?`小局 ${t().hand} / 4`:'剩余牌 72'):'四人就位 · 等待准备'}</span></div>
      <div class="seat top"><div class="avatar"></div><div class="seat-label"><strong>茶山客</strong><span>${playing?'思考中':'已准备'}</span></div></div><div class="seat left"><div class="avatar"></div><div class="seat-label"><strong>听雨</strong><span>${playing?'进行中':'已准备'}</span></div></div><div class="seat right"><div class="avatar"></div><div class="seat-label"><strong>清风</strong><span>${playing?'进行中':'已准备'}</span></div></div><div class="seat me"><div class="avatar"></div><div class="seat-label"><strong>Pain</strong><span>${playing?(auto?'托管中':'你的回合'):'待准备'}</span></div></div>
      <div class="tilebacks">${'<i></i>'.repeat(13)}</div><div class="tilebacks vertical">${'<i></i>'.repeat(13)}</div><div class="tilebacks vertical right">${'<i></i>'.repeat(13)}</div><div class="wind">東</div>
      ${playing?`<div class="discard-pile"><span class="tile">${data.discard}</span><span class="tile bamboo">二条</span><span class="tile circle">●</span></div><div class="hand">${hand.map((x,i)=>b(x,'tile',`tile ${i===data.selectedTile?'chosen':''} ${i===9||i===10?'circle':''}`,`data-value="${i}" aria-label="选择${x}第${i+1}张" ${auto?'disabled':''}`)).join('')}</div>${data.selectedTile>=0&&!auto?`<div class="floating-actions">${b('出牌','discard','gold-button')}</div>`:''}`:`<div class="ready-control">其他玩家已准备</div>`}
      ${playing&&auto?`<div class="trust-overlay"><div><h2 class="heading">${data.offline?'离线代打中':'正在托管'}</h2><p>原座位与手牌保留</p>${b(data.offline?'重新连接':'取消托管',tournament?'eventTrust':data.offline?'reconnect':'trust','blue-button small')}</div></div>`:''}</div>`;
  }
  function coinPlay() {
    return header('金币场','leaveCoin')+sideTabs(0)+board(true)+aside('本局信息',kv('本局本金',fmt(session.principal),true)+kv('已扣服务费',`${FEE} 金币`,true)+kv('本局状态',data.offline?'离线代打':session.auto?'托管中':'游戏中',true)+`<p class="aside-note">本局进行中不能离桌。<br>结束后结算金币并清房，下局重新选场。</p>`)+footer(b('设置','settings','blue-button')+b(session.auto?'取消托管':'开启托管','trust','gold-button'));
  }
  function coinResult() {
    const r=session.result; if(!r) return emptyPage('本局结果','暂无结算结果','完成一局后在这里查看金币明细。','coin');
    const rows=r.net>=0?[['Pain',r.net,r.actual,0],['茶山客',-700,-700,0],['清风',-500,-500,0],['听雨',-300,-300,0]]:[['Pain',r.net,r.actual,r.shortfall],['茶山客',-500,-500,0],['清风',500,500,0],['听雨',1500,1500,0]];
    return header('金币场')+sideTabs(2)+panel('单局结算',`<div class="result-lead">${r.net>=0?'本局获胜':'本局结束'} <span class="${r.net>=0?'positive':'negative'}">${signed(r.actual)} 金币</span></div><table class="result-table"><thead><tr><th>玩家</th><th>规则净输赢</th><th>实际金币</th><th>系统补差</th></tr></thead><tbody>${rows.map(([name,net,actual,gap],i)=>`<tr class="${i===0?'me':''}"><td>${name}</td><td class="${net>=0?'positive':'negative'}">${signed(net)}</td><td>${signed(actual)}</td><td>${fmt(gap)}</td></tr>`).join('')}</tbody></table><div class="result-foot"><span>已移出房间 · 赢家足额，补差不重复加发</span>${b('结算明细','settlement','blue-button small')}</div>`,'main-panel')+aside('我的结算',kv('本局本金',fmt(r.principal),true)+kv('服务费',`${r.fee} 金币`,true)+kv('余额',fmt(session.coins),true)+`<p class="aside-note">再来一局会重新验资、确认和匹配。</p>`)+footer(b('返回选场','coin','blue-button')+b('再来一局','againCoin','gold-button'));
  }
  function emptyPage(title,heading,copy,action='back') { return header(title)+panel(title,`<div class="empty-state"><div class="icon">♧</div><h2>${heading}</h2><p>${copy}</p>${b('返回',action,'blue-button')}</div>`)+footer(); }
  function supply() {
    return header('金币补给')+panel('获取金币',`<div class="account-strip">可用金币 ${fmt(session.available)} ${session.principal?`／ 本局锁定 ${fmt(session.principal)}`:''}</div><div class="supply-grid" style="margin-top:25px">${[['☀','七日茶约','每日签到，VIP加成按活动配置','activity'],['☕','茶歇好礼','完成活动要求后获得奖励','activity'],['🪙','金币商城','查看金币礼包与到账记录','shop']].map(([icon,name,copy,action])=>`<div class="supply-card"><div class="icon">${icon}</div><h3>${name}</h3><p>${copy}</p>${b('查看',action,'gold-button small')}</div>`).join('')}</div>`)+footer(b('返回原流程','back','blue-button'));
  }
  function history() {
    return header('金币战绩')+panel('单局记录',data.history.length?`<div class="history-list">${data.history.slice().reverse().map(r=>`<div class="history-row"><div>${r.game} · ${r.field}<br><span>${r.time} · 服务费 ${r.fee}</span></div><strong>${signed(r.actual)} 金币</strong></div>`).join('')}</div>`:`<div class="empty-state"><div class="icon">♜</div><h2>还没有单局记录</h2><p>完成金币牌局后，结算明细会保存在这里。</p>${b('返回金币场','coin','gold-button')}</div>`)+footer(b('返回原流程','back','blue-button'));
  }
  function eventCenter() {
    const list=data.filter===1?[0,1]:data.filter===2?[2]:[0,1,2];
    return header('比赛场','back',true)+`<div class="competition-content"><div class="competition-filters">${['全部赛事','每日赛事','周末赛事'].map((x,i)=>b(x,'eventFilter',i===data.filter?'active':'',`data-value="${i}" aria-pressed="${i===data.filter}"`)).join('')}<span class="region">${data.region} · 四人麻将</span></div>${t().status!=='none'?`<button type="button" onclick="FieldUI.handle(event)" class="event-resume" data-action="eventResume">${e().name} · ${eventStatus()}　查看当前进度 ›</button>`:''}<div class="event-grid">${list.map(i=>{const x=events[i];return `<article class="event-card">${badge(x.badge)}<h2 class="event-name">${x.name}</h2>${trophy}<strong class="prize">${x.prize}</strong><p class="event-summary">${x.count} 人 · ${i===2?'分阶段晋级':`${x.rounds}轮瑞士制`}<br>${x.time} · ${i===2?'任务券报名':'免费报名'}</p>${b('查看赛事 ›','eventDetail','gold-button',`data-value="${i}"`)}</article>`;}).join('')}</div></div>`+footer('', 'tournament');
  }
  function eventStatus() { return ({none:'尚未报名',registered:'已报名 · 待检录',standby:'候补第 3 位',checkin:'可检录',allocating:'候场分桌',published:'分桌已发布',table:'比赛进行中',smallResult:'小局结束',roundWait:'轮次结束 · 等待汇总',finalTemp:'临时赛果 · 待复核',final:'正式赛果'})[t().status] || '已报名'; }
  function eventDetail() {
    const x=e(), status=t().status;
    const schedule=data.event===2?`<div class="timeline"><strong class="time">周六 18:25</strong><p>停止报名</p><strong class="time">18:30—18:50</strong><p>检录开放</p><strong class="time">18:50 / 18:55</strong><p>选择64/32人方案 / 锁名单</p><strong class="time">19:00</strong><p>资格赛开赛</p><strong class="time">周日 14:00</strong><p>十六强开赛，结束20分钟后决赛</p></div>`:`<div class="timeline"><strong class="time">${x.time}</strong><p>正式开赛<br><small>${x.duration}，另留缓冲时间</small></p><strong class="time">赛前 10 分</strong><p>停止报名，开放检录</p><strong class="time">赛前 5 分</strong><p>原名单检录截止</p><strong class="time">赛前 3 分</strong><p>满员锁定名单，发布赛程</p></div>`;
    const info=[schedule,
      `<div class="rewards">${(data.event===0?[['冠军','100 金币'],['第 2—4 名','每人 60 金币'],['第 5—16 名','每人 20 金币']]:data.event===1?[['冠军','7 天称号'],['前三名','7 天主题头像框'],['正常完赛','赛季积分']]:[['冠军','500 金币'],['第 2—4 名','每人 300 金币'],['第 5—16 名','每人 120 金币'],['其他正常完赛','每人 40 金币']]).map(([a,c])=>`<div class="reward-line"><span>${a}</span><strong>${c}</strong></div>`).join('')}<p class="subcopy">固定奖励在正式确认后自动到账。</p></div>`,
      `<ul class="rule-list"><li>${data.event===2?'64人资格赛 → 16强 → 4人决赛。人数不足时按正式方案处理。':`${x.rounds}轮瑞士制，每轮4小局，按轮次桌积分累计排名。`}</li><li>赛事牌局只记比赛成绩，不使用金币场输赢结算。</li><li>检录后由赛事统一分桌，名单锁定后不补新玩家。</li><li>结果先展示临时排名，经24小时申诉复核后确认；未结案件继续复核。</li></ul>`][data.detailTab];
    const main=status==='none'?b('报名参赛','register'):status==='registered'?b('尚未开放检录','', 'neutral-button','disabled'):status==='checkin'?b('立即检录','checkin'):b(status==='final'?'查看赛果':status==='standby'?'查看候补':'返回当前进度','eventResume');
    return header('赛事详情','eventCenter')+`<section class="panel body-panel"><div class="detail-layout"><div class="detail-hero">${badge(x.badge)}<h2 class="event-name">${x.name}</h2>${trophy}<strong class="prize">${x.prize}</strong><p>${x.count} 人参赛<br>${x.entry}</p>${badge(eventStatus(),'blue')}</div><div class="detail-information">${tabs(['赛程','奖励','规则'],'detailTab',data.detailTab)}<div class="detail-scroll">${info}</div></div></div></section>`+footer(b('我的赛事','myEvents','blue-button')+main,'tournament');
  }
  function eventRegistered() {
    const status=t().status, check=status==='checkin';
    return header('报名状态','eventCenter')+panel(e().name,steps(check?1:0)+`<div class="registration-status"><div class="seal">✓</div><h2 class="heading">${check?'检录已开放':'报名成功'}</h2><p>开赛时间：${e().time}<br>${check?'请在检录截止前确认到场。':'检录窗口尚未开放，请留意赛事提醒。'}</p>${badge('已获得正式席位','green')}<p class="subcopy">${data.event===2?'赛事券已锁定，锁名单后实扣一次。':'免费赛事，报名不扣金币。'}</p></div>`)+footer(b('查看详情','currentDetail','blue-button')+b(check?'立即检录':'等待检录',check?'checkin':'','gold-button',check?'':'disabled'),'tournament');
  }
  function eventStandby() {
    return header('候补状态','eventCenter')+panel(e().name,steps(0)+`<div class="central-state"><div class="countdown">3<small>候补顺位</small></div><h2 class="heading">正式席位已满</h2><p class="subcopy">候补不占正式席位、不锁定报名资源。<br>收到转正通知后，在有效时间内确认参赛。</p>${badge('候补人数 8 / 16','blue')}</div>`)+footer(b('查看详情','currentDetail','blue-button')+b('取消候补','cancelStandby','gold-button'),'tournament');
  }
  function eventAllocating() {
    const published=t().status==='published';
    return header('候场分桌','eventCenter')+panel(e().name,steps(2)+`<div class="central-state">${t().error?`<h2 class="heading">牌桌连接未完成</h2><p class="subcopy">分桌已经生效，重试将返回第${t().round}轮原桌。</p>${b('重试原桌','retryTable','gold-button')}`:published?`<h2 class="heading">第${t().round}轮分桌已发布</h2><table class="assign-table"><thead><tr><th>桌号</th><th>本人座位</th><th>同桌玩家</th></tr></thead><tbody><tr><td>${t().round+1}号桌</td><td>东</td><td>茶山客 / 清风 / 听雨</td></tr></tbody></table><p class="subcopy">3 秒后自动进入牌桌</p>`:`<div class="spinner" aria-label="分桌中"><i></i><i></i><i></i><i></i></div><h2 class="heading">检录完成，等待赛事分桌</h2><p class="subcopy">已检录 ${data.event===2?[64,16,4][t().stage]:e().count} / ${data.event===2?[64,16,4][t().stage]:e().count} 人<br>分桌尚未发布，请稍候。</p><div class="progress-track"><span style="width:100%"></span></div>`}</div>`)+footer(b('赛程详情','eventSchedule','blue-button'),'tournament');
  }
  function eventTable() {
    return header('赛事牌桌','eventLeave')+`<nav class="side-tabs">${b('赛程','eventSchedule','active')}${b('成绩','eventScore','')}${b('规则','eventRules','')}</nav>`+board(true,true)+aside(e().name,kv('阶段',data.event===2?['资格赛','十六强','决赛'][t().stage]:'瑞士制',true)+kv('轮次',`${t().round} / ${eventRounds()}`,true)+kv('本轮小局',`${t().hand} / 4`,true)+kv('累计桌积分',fmt(t().points),true)+`<p class="aside-note">本轮四小局结束后汇总桌积分。赛事结束后确认总排名。</p>`)+footer(b('设置','settings','blue-button')+b(t().auto?'取消托管':'开启托管','eventTrust','gold-button'),'tournament');
  }
  function eventSmallResult() {
    return header('小局结果','eventLeave')+panel(`${e().name} · 第${t().round}轮 第${t().hand}小局`,`<h2 class="heading sm">本小局 + 18 分</h2><table class="result-table"><thead><tr><th>玩家</th><th>本局原始分</th><th>本轮累计</th></tr></thead><tbody>${[['Pain',18],['茶山客',-4],['清风',-6],['听雨',-8]].map(([n,s],i)=>`<tr class="${i===0?'me':''}"><td>${n}</td><td>${signed(s)}</td><td>${signed(s*t().hand)}</td></tr>`).join('')}</tbody></table><p class="subcopy">10 秒后自动继续同轮下一小局，不重新准备和收费。</p>`)+footer(b('成绩明细','eventScore','blue-button')+b('继续比赛','nextHand','gold-button'),'tournament');
  }
  function eventRoundWait() {
    return header('轮次结果','eventLeave')+panel(`${e().name} · 第${t().round}轮`,`<div class="waiting-message">成绩确认中 · 已完成 ${data.event===2?['12 / 16','3 / 4','1 / 1'][t().stage]:'3 / 4'} 桌，等待统一发布赛程</div><div class="stat-cards"><div class="stat-card">本轮原始分<strong>+ 72</strong></div><div class="stat-card">本轮桌积分<strong>8.00</strong></div><div class="stat-card">累计桌积分<strong>${t().points.toFixed(2)}</strong></div></div><table class="result-table small"><thead><tr><th>本桌排名</th><th>玩家</th><th>四小局原始分</th><th>桌积分</th></tr></thead><tbody>${[['Pain',72,8],['茶山客',-16,5],['清风',-24,2],['听雨',-32,0]].map(([n,s,p],i)=>`<tr class="${i===0?'me':''}"><td>${i+1}</td><td>${n}</td><td>${signed(s)}</td><td>${p.toFixed(2)}</td></tr>`).join('')}</tbody></table>` ,'body-panel round-wait-panel')+footer(b('查看成绩','eventScore','blue-button'),'tournament');
  }
  function eventFinal() {
    const final=t().status==='final', x=e();
    return header('总赛果','eventCenter')+panel(x.name,`<div class="result-hero"><div class="winner-banner">${trophy}<h2>冠军</h2><p>Pain<br>累计桌积分 ${t().points.toFixed(2)}</p>${badge(final?'正式结果':'临时排名',final?'green':'')}</div><div class="rewards"><h2 class="heading sm">${final?'赛事结果已确认':'结果复核中'}</h2><div class="reward-line"><span>赛季积分</span><strong>${final?'+ 135':'待确认'}</strong></div>${x.award?`<div class="reward-line"><span>固定金币奖励</span><strong>${x.award} 金币</strong>${badge(final?'已自动到账':'待复核',final?'green':'gray')}</div>`:''}<div class="reward-line"><span>冠军称号</span>${badge(final?'已发放':'待确认',final?'green':'gray')}</div><p class="subcopy">${final?'固定奖自动发放，可在我的奖励查看记录。':'申诉复核期24小时；未结案件继续复核，结束时间不替代确认。'}</p>${b('成绩明细 / 申诉','eventScore','blue-button small')}</div></div>`)+footer(b('我的奖励','rewards','blue-button')+b('返回赛事中心','eventCenter','gold-button'),'tournament');
  }
  function myEvents() {
    return header('我的赛事','eventCenter')+panel('当前赛事',t().status==='none'?`<div class="empty-state"><div class="icon">♜</div><h2>还没有报名赛事</h2><p>先查看赛事详情，再确认报名。</p>${b('查看比赛','eventCenter','gold-button')}</div>`:`<div class="my-event-card">${trophy}<div><h2 class="heading">${e().name}</h2><p class="subcopy">${e().time} · ${eventStatus()}</p>${badge(e().entry,'blue')}</div>${b('查看进度','eventResume','gold-button')}</div>`)+footer(b('赛事中心','eventCenter','blue-button'),'tournament');
  }
  function rewards() {
    return header('我的奖励','eventCenter')+panel('赛事奖励',t().status==='final'||t().status==='finalTemp'?`<div class="rewards"><div class="reward-line"><span>${e().name} · 冠军</span>${badge(t().status==='final'?'正式结果':'待复核','blue')}</div>${e().award?`<div class="reward-line"><span>固定金币</span><strong>${e().award} 金币</strong>${badge(t().awarded?'已自动到账':'待确认',t().awarded?'green':'gray')}</div>`:''}<div class="reward-line"><span>冠军称号 / 赛季积分</span>${badge(t().status==='final'?'已发放':'待确认','green')}</div><p class="subcopy">固定奖励无需领取；宝箱奖励按独立活动要求领取。</p></div>`:`<div class="empty-state"><div class="icon">♢</div><h2>暂无赛事奖励</h2><p>赛事正式确认后，自动发放的奖励在此显示。</p>${b('查看赛事','myEvents','gold-button')}</div>`)+footer(b('我的赛事','myEvents','blue-button'),'tournament');
  }
  function season() {
    const final=t().status==='final';
    return header('赛季排行','eventCenter')+panel('金秋赛季',`<div class="account-strip">4 个完整自然周 · 最佳 12 场成绩计入 · 至少 5 场正式赛事上榜</div><div class="stat-cards"><div class="stat-card">我的赛季分<strong>${final?'135':'0'}</strong></div><div class="stat-card">有效场数<strong>${final?'1':'0'} / 5</strong></div><div class="stat-card">上榜状态<strong style="font-size:30px">还差 ${final?'4':'5'} 场</strong></div></div><table class="result-table small"><thead><tr><th>名次</th><th>玩家</th><th>赛季积分</th><th>有效场数</th></tr></thead><tbody>${[['青竹',1260,12],['听风',1188,11],['茶山客',1125,10]].map(([n,s,c],i)=>`<tr><td>${i+1}</td><td>${n}</td><td>${s}</td><td>${c}</td></tr>`).join('')}</tbody></table><div class="ranking-self" style="margin-top:22px">Pain · ${final?'135':'0'} 分 · 有效赛事不足，暂未上榜</div>`)+footer(b('我的赛事','myEvents','blue-button'),'tournament');
  }
  const labels={home:'大厅',coinLobby:'金币 · 选场',coinMatch:'金币 · 真人匹配',coinReady:'金币 · 准备',coinPlay:'金币 · 单局牌桌',coinResult:'金币 · 净额结算',supply:'金币补给',history:'金币战绩',eventCenter:'比赛 · 中心',eventDetail:'比赛 · 详情',eventRegistered:'比赛 · 报名与检录',eventStandby:'比赛 · 候补',eventAllocating:'比赛 · 分桌',eventTable:'比赛 · 牌桌',eventSmallResult:'比赛 · 小局结果',eventRoundWait:'比赛 · 轮次等待',eventFinal:'比赛 · 赛果',myEvents:'我的赛事',rewards:'赛事奖励',season:'赛季排行'};
  const pages={home,coinLobby,coinMatch,coinReady,coinPlay,coinResult,supply,history,eventCenter,eventDetail,eventRegistered,eventStandby,eventAllocating,eventTable,eventSmallResult,eventRoundWait,eventFinal,myEvents,rewards,season};
  function render() {
    const screen=pages[data.screen]?data.screen:'home'; data.screen=screen;
    stage.className=`stage ${screen==='coinLobby'?'photo-lobby':screen==='coinMatch'?'photo-match':screen==='coinReady'?'photo-ready':screen==='home'?'':'soft'}`;
    stage.innerHTML=pages[screen](); document.title=`${labels[screen]} · 麻溜儿交互参考`;
    $('#screen-label').textContent=labels[screen];
    $('#flow-hint').textContent=screen==='coinPlay'||screen==='eventTable'?'点击手牌选牌与出牌；画面外推进可模拟本局结束':screen.startsWith('coin')?'选场 → 确认 → 匹配 → 准备 → 单局 → 结算清房':screen==='home'?'从金币场或比赛场入口开始体验':'详情 → 报名 → 检录 → 分桌 → 多轮比赛 → 复核 → 奖励到账';
    document.querySelectorAll('.workbench nav button').forEach(btn=>btn.classList.toggle('active',btn.dataset.action===(screen==='home'?'home':screen.startsWith('coin')?'coin':'tournament')));
    const text=session.status==='matching'?'模拟匹配完成':session.status==='seated'?'模拟成功发牌':session.status==='playing'?'结束演示本局':({registered:'模拟开放检录',allocating:'模拟发布分桌',published:'模拟进入牌桌',table:'结束演示小局',smallResult:'模拟继续小局',roundWait:'模拟全桌完成',finalTemp:'模拟复核通过'})[t().status]||'推进流程';
    $('#advance').textContent=text; save(); resize();
    const pause=document.querySelector('[data-action="pause"]');pause.textContent=data.pauseAuto?'恢复自动推进':'停留当前页';pause.setAttribute('aria-pressed',String(data.pauseAuto));
  }
  function resize() {
    const frame=$('#frame'), full=document.fullscreenElement===frame;
    const scale=full?Math.min(frame.clientWidth/1920,frame.clientHeight/1080):frame.clientWidth/1920;
    stage.style.transform=`scale(${scale})`; stage.style.left=full?`${(frame.clientWidth-1920*scale)/2}px`:'0'; stage.style.top=full?`${(frame.clientHeight-1080*scale)/2}px`:'0';
  }
  function largeView(enabled) {
    document.body.classList.toggle('theater',enabled);
    const control=document.querySelector('.workbench [data-action="fullscreen"]');
    control.textContent=enabled?'⤡ 收起画面':'⛶ 放大';control.setAttribute('aria-label',enabled?'收起画面':'放大查看');resize();
  }
  new ResizeObserver(resize).observe($('#frame'));
  function startCoin() {
    if(session.status!=='idle') return go(activeCoinScreen());
    if(t().status!=='none'&&!['final','finalTemp','registered','standby'].includes(t().status)) return showModal('先处理当前赛事',`<p class="modal-copy">请先完成检录或当前赛事，本次不发起金币匹配。</p>`,b('返回赛事','eventResume'));
    const f=fields[data.field], valid=session.available>=f.min&&session.available<f.max;
    if(!valid) return showModal('当前金币不符合场档',`<p class="modal-copy">${f.name}准入：${fmt(f.min)}${Number.isFinite(f.max)?` ≤ 金币 < ${fmt(f.max)}`:'金币及以上'}。当前可用金币 ${fmt(session.available)}。</p>`,b('重新选场','coin','blue-button')+b('金币补给','supply'));
    if(data.game===2) return showModal('跑得快场次',`<p class="modal-copy">该页签演示地区配置与入口切换。跑得快人数和单局结算按对应玩法适配，完整交互请先选择四人麻将。</p>`,b('切回郑州麻将','chooseMahjong'));
    if(data.region==='陕北'&&data.game===0) return showModal('单局适配待确认',`<p class="modal-copy">陕北玩法包含跨局目标，金币单局适配确认后再开放。本次可切换郑州或红中麻将体验完整流程。</p>`,b('切回郑州麻将','chooseMahjong'));
    showModal('确认进入',`<div class="modal-kv"><span>玩法 / 场档</span><b>${gameName()} · ${f.name}</b></div><div class="modal-kv"><span>单局服务费</span><b>${FEE} 金币 · 演示值</b></div><p class="modal-copy">先预留服务费；四人就位、成功发牌后实扣一次并锁定剩余本金。开局后不能离桌，可托管；本局结束后结算清房。</p>`,b('返回选场','closeModal','blue-button')+b('确认匹配','queueCoin'));
  }
  function queueCoin() {
    if(session.status!=='idle') return;
    session.queue(FEE); data.matchCount=1; data.ready=false; data.lossDemo=false; closeModal(); cancelTimers(); go('coinMatch');
    [2,3,4].forEach((n,i)=>later(()=>{if(session.status!=='matching')return;data.matchCount=n;save();if(data.screen==='coinMatch')render();},2200*(i+1)));
    later(seatCoin,7800);
  }
  function seatCoin() {
    if(session.status!=='matching') return; cancelTimers(); session.seat(); data.matchCount=4; closeModal(); go('coinReady'); notify('真人匹配完成，已进入准备桌');
  }
  function cancelCoin() {
    if(session.status==='playing') return dispatch('leaveCoin');
    showModal('取消本次入场',`<p class="modal-copy">取消后退出匹配或准备桌，预留的 ${session.reserved} 金币恢复可用。尚未成功发牌，不扣服务费。</p>`,b('继续等待','closeModal','blue-button')+b('取消入场','confirmCancel'));
  }
  function finishCoin() {
    if(session.status!=='playing') return;
    cancelTimers(); const r=session.settle(data.lossDemo?-1500:1500,`demo-${session.started}`);
    data.history.push({...r,game:gameName(),field:fields[data.field].name,time:new Date().toLocaleString('zh-CN',{hour12:false})}); data.offline=false; data.screen='coinResult'; closeModal(); render(); notify('本局已结算，全员移出房间');
  }
  function eventRounds() { return data.event===2?[4,3,4][t().stage]:e().rounds; }
  function eventScreen() { return ({none:'eventDetail',registered:'eventRegistered',checkin:'eventRegistered',standby:'eventStandby',allocating:'eventAllocating',published:'eventAllocating',table:'eventTable',smallResult:'eventSmallResult',roundWait:'eventRoundWait',finalTemp:'eventFinal',final:'eventFinal'})[t().status]; }
  function register(standby=false) {
    if(t().status!=='none') return go(eventScreen());
    if(session.status!=='idle') return showModal('金币场流程尚未结束',`<p class="modal-copy">请先完成当前金币场流程。牌局中不能进入赛事实时对局，未来赛事预约限制仍待确认。</p>`,b('返回金币场','resumeCoin'));
    if(data.event===2&&!data.ticket) return showModal('缺少赛事券',`<p class="modal-copy">完成当周活动可获得任务赛事券。本地演示可在演示面板恢复赛事券。</p>`,b('关闭','closeModal','blue-button'));
    showModal(standby?'确认候补':'报名确认',`<div class="modal-kv"><span>赛事</span><b>${e().name}</b></div><div class="modal-kv"><span>开赛</span><b>${e().time}</b></div><div class="modal-kv"><span>报名资源</span><b>${standby?'候补不锁资源':e().entry}</b></div><p class="modal-copy">${standby?'获得席位后需要本人确认并重新检查资格和报名资源。':'报名成功后需要按时检录；锁名单后由赛事统一分桌，不进入金币真人匹配。'}</p>`,b('取消','closeModal','blue-button')+b(standby?'加入候补':'确认报名',standby?'confirmStandby':'confirmRegister'));
  }
  function publishTable() {
    if(t().status!=='allocating') return;
    cancelTimers(); t().status='published'; t().error=false; if(data.event===2)data.ticket=0; closeModal(); go('eventAllocating'); later(enterEventTable,3000);
  }
  function enterEventTable() {
    if(t().status!=='published'||t().error) return;
    if(session.status!=='idle') return showModal('当前金币场流程未结束',`<p class="modal-copy">请先完成或取消金币匹配，已发牌则等待本局正式结束，再返回赛事原桌。</p>`,b('返回金币场','resumeCoin'));
    cancelTimers(); t().status='table'; data.selectedTile=-1; closeModal(); go('eventTable');
  }
  function finishHand() {
    if(t().status!=='table')return; cancelTimers(); closeModal(); data.selectedTile=-1;
    if(t().hand<4) { t().status='smallResult'; go('eventSmallResult'); later(nextHand,10000); }
    else { t().points+=8; t().status='roundWait'; go('eventRoundWait'); }
  }
  function nextHand() { if(t().status!=='smallResult')return; cancelTimers(); t().hand++; t().status='table'; closeModal(); go('eventTable'); }
  function nextRound() {
    if(t().status!=='roundWait')return;
    if(t().round<eventRounds()) { t().round++; t().hand=1; t().status='allocating'; go('eventAllocating'); }
    else if(data.event===2&&t().stage<2) showModal('阶段结果已确认',`<p class="modal-copy">你已晋级${t().stage===0?'十六强':'决赛'}。下一阶段成绩重新累计，待新赛程发布后统一入桌。</p>`,b('演示进入下一阶段','nextStage'));
    else { t().status='finalTemp'; go('eventFinal'); }
  }
  function advance() {
    closeModal();
    if(session.status==='matching') return seatCoin();
    if(session.status==='seated') return dispatch('deal');
    if(session.status==='playing') return finishCoin();
    switch(t().status) {
      case 'registered': t().status='checkin'; go('eventRegistered'); notify('演示时间已推进至检录窗口'); break;
      case 'standby': showModal('获得正式席位',`<p class="modal-copy">请在 2 分钟有效窗口内确认参赛；转正成功后才能进入检录。</p>`,b('稍后处理','closeModal','blue-button')+b('确认参赛','convertStandby')); break;
      case 'allocating': publishTable(); break;
      case 'published': if(t().error)dispatch('retryTable');else enterEventTable(); break;
      case 'table': finishHand(); break;
      case 'smallResult': nextHand(); break;
      case 'roundWait': nextRound(); break;
      case 'finalTemp': t().status='final'; if(!t().awarded){session.reward(e().award);t().awarded=true;} go('eventFinal'); notify('演示复核已通过，固定奖励自动到账'); break;
      default: notify('先从金币场开始匹配，或从比赛场报名赛事');
    }
  }
  function tools() {
    showModal('演示面板',`<p class="modal-copy">以下只切换本地参考状态，不操作正式账户。推进流程模拟到达业务时间，不代表真实计时。</p><div class="tools-grid"><div class="scenario-buttons"><h3>金币场</h3>${b('本金耗尽与系统补差','lossScenario','')}${b('低余额与补给入口','lowScenario','')}${b('局中新到账 +100 金币','newReward','')}${b('模拟离线代打 / 重连','offlineScenario','')}${b('模拟匹配失败','matchFailure','')}</div><div class="scenario-buttons"><h3>比赛场</h3>${b('新手杯候补流程','standbyScenario','')}${b('分桌后连接失败','tableFailure','')}${b('快速查看轮末等待','roundScenario','')}${b('快速查看临时赛果','finalScenario','')}${b('恢复演示赛事券','ticketScenario','')}</div></div><p class="modal-copy">数值与虚构昵称用于演示；金币服务费、转换与封顶仍待正式核定。图内未确认退赛权益不作定案。</p>`);
  }
  function directory() {
    showModal('流程目录',`<div class="directory"><div><h3>金币场</h3>${[['选场','coin'],['真人匹配 / 准备 / 牌桌','resumeCoin'],['战绩','history'],['金币补给','supply']].map(([x,a])=>b(x,a,'')).join('')}<p class="modal-copy">完整链路：确认 → 匹配 → 准备 → 单局 → 金币结果。</p></div><div><h3>比赛场</h3>${[['赛事中心','tournament'],['我的赛事 / 当前进度','myEvents'],['我的奖励','rewards'],['赛季排行','season']].map(([x,a])=>b(x,a,'')).join('')}<p class="modal-copy">完整链路：报名 → 检录 → 分桌 → 小局结果 → 轮末 → 赛果。</p></div></div>`);
  }
  function scenario(name) {
    if(name==='newReward'){if(session.status!=='playing')return notify('请先进入金币牌桌');session.reward(100);closeModal();render();return notify('演示到账100金币，本局本金保持不变');}
    if(name==='ticketScenario'){data.ticket=1;closeModal();render();return notify('本地演示赛事券已恢复');}
    if(name==='offlineScenario'&&session.status!=='playing')return notify('请先进入金币牌桌');
    if(name==='matchFailure'&&!['matching','seated'].includes(session.status))return notify('请先发起金币匹配');
    closeModal(); cancelTimers();
    if(['lossScenario','lowScenario','standbyScenario','roundScenario','finalScenario'].includes(name)||(name==='tableFailure'&&session.status!=='idle')) { session=new FieldCore.Session(); data=defaults(); }
    if(name==='lossScenario'){session=new FieldCore.Session(800);data.field=0;session.queue(FEE);session.seat();session.deal();session.reward(100);data.lossDemo=true;data.screen='coinPlay';}
    if(name==='lowScenario'){session=new FieldCore.Session(120);data.field=0;data.screen='coinLobby';}
    if(name==='standbyScenario'){t().status='standby';data.screen='eventStandby';}
    if(name==='roundScenario'){t().status='roundWait';t().hand=4;t().points=8;data.screen='eventRoundWait';}
    if(name==='finalScenario'){t().status='finalTemp';t().round=3;t().hand=4;t().points=24;data.screen='eventFinal';}
    if(name==='tableFailure'){t().status='published';data.screen='eventAllocating';t().error=true;}
    if(name==='offlineScenario'){if(session.status!=='playing')return notify('请先进入金币牌桌');data.offline=!data.offline;session.trust(data.offline);data.screen='coinPlay';}
    if(name==='newReward'){session.reward(100);notify('演示到账100金币，本局本金保持不变');}
    if(name==='ticketScenario'){data.ticket=1;notify('本地演示赛事券已恢复');}
    if(name==='matchFailure'){if(['matching','seated'].includes(session.status)){session.cancel();data.screen='coinLobby';render();return showModal('匹配未完成',`<p class="modal-copy">本次预留已释放，没有实扣服务费。可重新匹配。</p>`,b('重新匹配','startCoin'));}return notify('请先发起金币匹配');}
    render();
  }
  function dispatch(action,value) {
    switch(action) {
      case 'home':return go('home'); case 'coin': if(session.status==='idle')data.field=Math.max(0,FieldCore.recommend(session.available));return go('coinLobby');
      case 'resumeCoin':return go(activeCoinScreen()); case 'returnTable':return go('coinPlay');
      case 'tournament':case 'eventCenter':return go('eventCenter'); case 'directory':return directory(); case 'tools':return tools(); case 'advance':return advance(); case 'closeModal':return closeModal();
      case 'pause':data.pauseAuto=!data.pauseAuto;cancelTimers();if(!data.pauseAuto)resumeTimers();render();return notify(data.pauseAuto?'已暂停演示的自动计时，可手动推进或恢复':'已恢复演示自动推进');
      case 'selectField':if(session.status!=='idle')return notify('当前入场流程结束后再切换场档');data.field=Number(value);return render(); case 'game':if(session.status!=='idle')return notify('当前匹配流程结束后再切换玩法');data.game=Number(value);return render();
      case 'startCoin':return startCoin(); case 'queueCoin':return queueCoin(); case 'cancelCoin':return cancelCoin();
      case 'confirmCancel':cancelTimers();session.cancel();return go('coinLobby'); case 'matchHome':return go('home');
      case 'deal':if(session.status!=='seated')return;cancelTimers();session.deal();data.ready=true;data.selectedTile=-1;return go('coinPlay');
      case 'leaveCoin':return showModal('本局进行中',`<p class="modal-copy">本局正式结束前不能离桌、不能进入其他实时对局。暂时离开屏幕可开启托管；离线后自动接管原座位。</p>`,b('继续游戏','closeModal','blue-button')+b('开启托管','enableTrust'));
      case 'enableTrust':session.trust(true);closeModal();return render();case 'trust':if(session.status!=='playing')return;session.trust(!session.auto);data.offline=false;return render();
      case 'reconnect':data.offline=false;session.trust(false);render();return notify('已恢复原牌桌，演示在合法操作点接回');
      case 'tile':data.selectedTile=Number(value);return render();case 'discard':if(data.selectedTile<0)return;data.discard=hand[data.selectedTile];data.selectedTile=-1;render();return notify('已出牌；完整判牌逻辑由正式游戏执行');
      case 'coinFlowTab':if(Number(value)===2&&session.status!=='idle')return notify('本局尚未结束，结算后显示结果');if(Number(value)===2)return go('coinResult');if(session.status==='playing')return go('coinPlay');if(Number(value)===0&&session.status!=='seated')return notify('真人匹配完成后进入准备桌');if(Number(value)===1&&session.status!=='matching')return notify('当前没有进行中的匹配');return go(activeCoinScreen());
      case 'againCoin':data.field=Math.max(0,FieldCore.recommend(session.available));data.screen='coinLobby';render();return startCoin();
      case 'settlement':{const r=session.result;return showModal('我的结算明细',`<div class="modal-kv"><span>服务费</span><b>${r.fee} 金币</b></div><div class="modal-kv"><span>锁定本金</span><b>${fmt(r.principal)} 金币</b></div><div class="modal-kv"><span>规则净输赢</span><b>${signed(r.net)}</b></div><div class="modal-kv"><span>实际结算</span><b>${signed(r.actual)}</b></div><div class="modal-kv"><span>本人亏损补差</span><b>${fmt(r.shortfall)}</b></div><p class="modal-copy">净亏最多扣本局本金，超过部分由系统承担。净赢按规则足额到账，补差已含在赢家所得中，不额外再加一次。</p>`);}
      case 'history':return go('history');case 'supply':if(data.screen!=='supply')data.returnScreen=data.screen;return go('supply');
      case 'wallet':return showModal('资产说明',`<p class="modal-copy">当前页面演示金币场与比赛场。房卡433、钻石0为效果图参考数值；点击金币余额可查看补给入口。</p>`);
      case 'coinInfo':return showModal('金币说明',`<p class="modal-copy">匹配只预留服务费；成功发牌实扣后锁定剩余可用金币。本局净输赢一次结算，净亏最多扣本金，系统承担超额亏损；赢家足额获得金币。局中新到账不并入本金，不能消费锁定金币。</p>`);
      case 'rules':return showModal('玩法规则',`<p class="modal-copy">${gameName()}规则与房间配置按对应玩法文档读取。本演示仅表达流程，手牌和出牌为交互示意，不实现完整麻将判牌。</p><div class="modal-kv"><span>金币场组织</span><b>一局一场，结束清房</b></div><p class="modal-copy">不同地区配置不同玩法页签、文本与跳转。返回选场后可切换地区与玩法。</p>`);
      case 'help':return showModal('帮助反馈',`<p class="modal-copy">匹配中可取消，预留会释放。已发牌只能托管，断线后返回原牌桌。结算有疑问可查看战绩明细；本地演示不发送真实反馈。</p>`);
      case 'activity':case 'shop':return showModal(action==='shop'?'金币商城':'活动补给',`<p class="modal-copy">这里保留对应系统入口。活动奖励与商城礼包按现行配置读取；演示到账请使用画面外“演示面板”，不会发起真实领取或支付。</p>`);
      case 'region':return showModal('切换地区',`<p class="modal-copy">地区会改变可用玩法、页签文案和跳转入口。</p><div class="scenario-buttons">${['郑州','武汉','陕北'].map(x=>b(x,'setRegion','',`data-value="${x}"`)).join('')}</div>`);
      case 'setRegion':if(session.status!=='idle'||!['none','final','finalTemp'].includes(t().status))return notify('当前场次流程结束后再切换地区');data.region=value;data.game=0;closeModal();render();return notify('已按地区配置切换玩法页签与入口');
      case 'chooseMahjong':data.region='郑州';data.game=0;closeModal();render();return startCoin();
      case 'eventFilter':data.filter=Number(value);return render();
      case 'eventDetail':if(t().status!=='none'&&data.event!==Number(value))return showModal('已有赛事进度',`<p class="modal-copy">本地演示保留一条赛事流程。请先完成当前赛事，或从演示面板重置后查看另一项。</p>`,b('返回当前赛事','eventResume'));data.event=Number(value);data.detailTab=0;return go('eventDetail');
      case 'currentDetail':return go('eventDetail');case 'detailTab':data.detailTab=Number(value);return render();
      case 'register':return register();case 'confirmRegister':if(t().status!=='none')return;t().status='registered';return go('eventRegistered');
      case 'confirmStandby':t().status='standby';return go('eventStandby');case 'convertStandby':if(t().status!=='standby')return;t().status='checkin';return go('eventRegistered');
      case 'cancelStandby':t().status='none';return go('eventCenter');
      case 'checkin':if(t().status!=='checkin')return;if(session.status!=='idle')return showModal('金币场流程尚未结束',`<p class="modal-copy">请先完成或取消当前金币场流程，再检录进入赛事。</p>`,b('返回金币场','resumeCoin'));t().checked=true;t().status='allocating';return go('eventAllocating');
      case 'eventResume':return go(eventScreen());case 'retryTable':t().error=false;t().status='published';return enterEventTable();
      case 'nextHand':return nextHand();case 'nextStage':t().stage++;t().round=1;t().hand=1;t().points=0;t().status='allocating';return go('eventAllocating');
      case 'eventTrust':t().auto=!t().auto;return render();case 'eventLeave':return showModal('当前赛事',`<p class="modal-copy">赛事按统一赛程进行。短暂离开可托管，重连回原桌；普通退赛后的评奖和费用处理仍需最终确认，本演示保留在赛状态。</p>`,b('继续比赛','closeModal','blue-button')+b('开启托管','enableEventTrust'));
      case 'enableEventTrust':t().auto=true;closeModal();return render();
      case 'eventRules':return showModal('赛事规则',`<p class="modal-copy">每轮4小局，汇总原始分排序，桌积分依次为8／5／2／0。并列均分占用名次积分，累计按实际精度排名。赛事分不进行金币输赢划转。</p><p class="modal-copy">报名 → 检录 → 统一分桌。小局10秒继续，本轮结束等待其他桌，新轮发布后3秒进入。正式结果确认后固定奖励自动发放。</p>`);
      case 'eventSchedule':return showModal('赛事进度',`<div class="modal-kv"><span>当前赛事</span><b>${e().name}</b></div><div class="modal-kv"><span>轮次 / 小局</span><b>第${t().round}轮 · ${t().hand} / 4</b></div><p class="modal-copy">每轮4小局。尚未完成本轮则继续原桌；完成后等待全部桌，再发布下一轮。比赛时间由画外“推进流程”模拟。</p>`);
      case 'eventScore':return showModal('成绩明细',`<div class="modal-kv"><span>当前累计桌积分</span><b>${t().points.toFixed(2)}</b></div><p class="modal-copy">每轮成绩及正式同分判定按赛事规则展示。临时赛果可在有效复核窗口申诉；本地演示不提交真实申诉。</p>`,b('查看申诉说明','appeal','blue-button'));
      case 'appeal':return showModal('申诉说明',`<p class="modal-copy">赛果发布后24小时内说明对应轮次、牌局及原因，提交后等待复核。未结案件继续复核，已正式确认的结果以最新决定为准。本地演示不发送数据。</p>`);
      case 'myEvents':return go('myEvents');case 'season':return go('season');case 'rewards':return go('rewards');
      case 'settings':return showModal('牌桌设置',`<div class="setting-row"><span>音效</span><button type="button" onclick="FieldUI.handle(event)" class="switch" data-action="toggleSetting" aria-pressed="true">开启</button></div><div class="setting-row"><span>背景音乐</span><button type="button" onclick="FieldUI.handle(event)" class="switch" data-action="toggleSetting" aria-pressed="false">关闭</button></div><p class="modal-copy">麻将、扑克使用同一套设置弹层。此处为参考样式，音效开关不播放素材。</p>`);
      case 'back':if(data.screen==='supply')return go(data.returnScreen||activeCoinScreen());if(data.screen==='history')return go(activeCoinScreen());return go('home');
      case 'reset':return showModal('重置演示',`<p class="modal-copy">恢复金币128,600及未报名状态，只清除这份网页的本地演示进度。</p>`,b('保留进度','closeModal','blue-button')+b('重置演示','confirmReset'));
      case 'confirmReset':cancelTimers();clearTimeout(toastTimer);$('#toast').classList.remove('visible');session=new FieldCore.Session();data=defaults();closeModal();return render();
      case 'fullscreen':if(document.fullscreenElement)return document.exitFullscreen?.();if(document.body.classList.contains('theater'))return largeView(false);if(!$('#frame').requestFullscreen)return largeView(true);return $('#frame').requestFullscreen().catch(()=>largeView(true));
      default:if(action.endsWith('Scenario')||['tableFailure','matchFailure','newReward'].includes(action))return scenario(action);
    }
  }
  window.FieldUI={handle(event){
    const button=event.target.closest('button[data-action]');if(!button||button.disabled)return;
    if(button.dataset.action==='toggleSetting'){const on=button.getAttribute('aria-pressed')==='true';button.setAttribute('aria-pressed',String(!on));button.textContent=on?'关闭':'开启';return;}
    try{dispatch(button.dataset.action,button.dataset.value);}catch(error){showModal('当前操作未完成',`<p class="modal-copy">${error.message.replace(/[<>]/g,'')}。请返回当前流程重试。</p>`,b('返回当前流程','closeModal','blue-button'));}save();
  }};
  function resumeTimers() {
    if(session.status==='matching') later(seatCoin,5000);
    if(t().status==='published'&&!t().error) later(enterEventTable,3000);
    if(t().status==='smallResult') later(nextHand,10000);
  }
  window.addEventListener('storage',event=>{if(event.key===KEY&&event.newValue){try{const s=JSON.parse(event.newValue);data={...defaults(),...s.data};session=FieldCore.Session.restore(JSON.stringify(s.session));cancelTimers();resumeTimers();closeModal();render();notify('已恢复另一标签页的最新演示进度');}catch{/* 忽略损坏存档。 */}}});
  window.addEventListener('resize',resize);
  document.addEventListener('fullscreenchange',resize);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.open&&document.body.classList.contains('theater'))largeView(false);});
  if(session.status==='playing') data.screen='coinPlay';
  if(session.status==='seated') data.screen='coinReady';
  if(session.status==='matching') { data.screen='coinMatch'; later(seatCoin,5000); }
  if(t().status==='published'&&!t().error) later(enterEventTable,3000);
  if(t().status==='smallResult') later(nextHand,10000);
  render();
})();
