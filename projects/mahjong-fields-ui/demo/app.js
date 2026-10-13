/* 本地交互参考；业务来源和示例数值见 README.md。 */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const stage = $('#stage'), modal = $('#modal'), modalBody = $('#modal-body');
  const sheet = $('#sheet'), sheetBody = $('#sheet-body');
  let focusBeforeSheet;
  const primaryScreens = new Set(['home','coinLobby','coinMatch','coinReady','coinPlay','eventCenter','eventTable']);
  const fmt = n => new Intl.NumberFormat('zh-CN').format(n);
  const signed = n => (n > 0 ? '+' : '') + fmt(n);
  const demoNow=()=>data.pauseAuto?(data.pausedAt||Date.now()):Date.now();
  const remaining=deadline=>FieldNavigation.remaining(deadline,demoNow());
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
  function dayKey(stamp=Date.now()){return new Date(stamp+8*3600000).toISOString().slice(0,10);}
  const freshTournament = () => ({ status:'none', round:1, hand:1, stage:0, checked:false, awarded:false, ticketUsed:false, noviceEntryUsed:false, error:false, auto:false, points:0, roundRecords:[] });
  const defaults = () => ({ screen:'home', field:2, game:0, region:'郑州', detailTab:0, coinTab:0, ready:false,
    matchCount:1, selectedTile:-1, discard:'二万', history:[], event:0, filter:0,
    tournament:freshTournament(), previewEvent:0, eventArchives:[], noviceEntryDays:[], navStack:[], settings:{sound:true,music:false}, favourites:[], reminders:[], myEventsTab:0,
    lossDemo:false, offline:false, ticket:1, pauseAuto:false });
  let data = defaults(), session = new FieldCore.Session(), generation = 0, timers = [], focusBeforeModal, toastTimer;
  function restoreSaved(saved) {
    const candidate={...defaults(),...saved.data}, restored=FieldCore.Session.restore(JSON.stringify(saved.session));
    FieldNavigation.validate(candidate,restored.status);
    if(!Number.isInteger(candidate.event)||candidate.event<0||candidate.event>=events.length)throw Error('赛事记录无效');
    candidate.previewEvent=Number.isInteger(candidate.previewEvent)&&events[candidate.previewEvent]?candidate.previewEvent:candidate.event;
    candidate.navStack=Array.isArray(candidate.navStack)?candidate.navStack.filter(x=>typeof x==='string').slice(-16):[];
    candidate.eventArchives=Array.isArray(candidate.eventArchives)?candidate.eventArchives:[];
    if(candidate.eventArchives.some(a=>!a||typeof a.id!=='string'||!events[a.event]||!Number.isFinite(a.amount)||!Number.isFinite(a.seasonPoints)||!a.tournament))throw Error('历史赛事存档无效');
    candidate.favourites=Array.isArray(candidate.favourites)?candidate.favourites.filter(i=>Number.isInteger(i)&&events[i]):[];
    candidate.reminders=Array.isArray(candidate.reminders)?candidate.reminders.filter(i=>Number.isInteger(i)&&events[i]):[];
    candidate.settings={sound:true,music:false,...candidate.settings};
    candidate.noviceEntryDays=[...new Set((Array.isArray(candidate.noviceEntryDays)?candidate.noviceEntryDays:[]).filter(x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)))];
    for(const record of candidate.eventArchives){
      const stamp=Number(record.id.replace('event-',''));
      if(record.event===0&&record.tournament.status==='final'&&Number.isFinite(stamp))candidate.noviceEntryDays.push(record.tournament.entryDay||dayKey(stamp));
    }
    const current=candidate.tournament;
    if(typeof current.noviceEntryUsed!=='boolean')current.noviceEntryUsed=candidate.event===0&&['published','table','smallResult','roundWait','finalTemp','final'].includes(current.status);
    if(candidate.event===0&&current.noviceEntryUsed){
      const stamp=Number((current.archiveId||'').replace('event-',''));
      current.entryDay=current.entryDay||dayKey(current.archiveId&&Number.isFinite(stamp)?stamp:Date.now());
      candidate.noviceEntryDays.push(current.entryDay);
    }
    candidate.noviceEntryDays=[...new Set(candidate.noviceEntryDays)];
    if(typeof candidate.tournament.ticketUsed!=='boolean'){
      const old=candidate.tournament;
      candidate.tournament.ticketUsed=candidate.event===2&&(['published','table','smallResult','roundWait','finalTemp','final'].includes(old.status)||old.round>1||old.stage>0);
    }
    if(candidate.tournament.status==='final'&&!candidate.tournament.archiveId){
      const old=candidate.tournament;old.archiveId='event-'+Date.now();old.rank=old.rank||1;old.seasonPoints=old.seasonPoints||135;
      candidate.eventArchives.push({id:old.archiveId,event:candidate.event,time:'此前已确认赛事',rank:old.rank,amount:events[candidate.event].award,seasonPoints:old.seasonPoints,tournament:JSON.parse(JSON.stringify(old))});
    }
    data=candidate;session=restored;
  }
  try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved) restoreSaved(saved); } catch { /* 原子恢复，损坏存档不污染当前状态。 */ }
  const t = () => data.tournament;
  const e = () => events[data.event];
  const regionGames={郑州:['郑州麻将','红中麻将','跑得快'],武汉:['武汉麻将','红中麻将','跑得快'],陕北:['陕北麻将','红中麻将','跑得快']};
  const gameName = () => (regionGames[data.region]||regionGames.郑州)[data.game];
  const noviceLeft = (day=dayKey()) => data.noviceEntryDays.includes(day)?0:1;
  const b = (label,action,cls='gold-button',extra='') => `<button type="button" onclick="FieldUI.handle(event)" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
  const badge = (label,cls='') => `<span class="badge ${cls}">${label}</span>`;
  const trophy = `<span class="hero-trophy" aria-hidden="true"></span>`;
  const kv = (label,value,compact=false) => `<div class="kv ${compact?'compact':''}"><dt>${label}</dt><dd>${value}</dd></div>`;
  const tabs = (labels,action,active,cls='tabs-row') => `<div class="${cls}">${labels.map((label,i)=>b(label,action,i===active?'active':'',`data-value="${i}" aria-pressed="${i===active}"`)).join('')}</div>`;
  const sideTabs = active => `<div class="side-tabs flow-status" aria-label="金币场进度">${['真人匹配','准备开局','本局结果'].map((x,i)=>`<div class="${i===(active===1?0:active===0?1:2)?'active':''}">${x}</div>`).join('')}</div>`;
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
    if(!modal.open) focusBeforeModal = document.activeElement;
    modalBody.innerHTML=`<h2 id="modal-title" class="modal-title">${title}</h2>${body}${actions?`<div class="modal-actions">${actions}</div>`:''}`;
    if(!modal.open) modal.showModal();
    resize();
    (modal.querySelector('.modal-actions .blue-button') || modal.querySelector('.modal-close')).focus();
  }
  modal.addEventListener('close',()=>{ if(focusBeforeModal?.isConnected) focusBeforeModal.focus(); else document.querySelector('.workbench button')?.focus(); });
  function dismissOnBlank(dialog,close) {
    let startedOutside=false;
    const outside=event=>{
      const r=dialog.getBoundingClientRect();
      return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);
    };
    dialog.addEventListener('pointerdown',event=>{startedOutside=outside(event);});
    dialog.addEventListener('pointerup',event=>{if(startedOutside&&outside(event))close();startedOutside=false;});
  }
  dismissOnBlank(modal,closeModal);
  function dismissSheet(){if(!modal.open)dispatch(sheetBody.querySelector('.back')?.dataset.action||'back');}
  dismissOnBlank(sheet,dismissSheet);
  sheet.addEventListener('cancel',event=>{event.preventDefault();dismissSheet();});
  sheet.addEventListener('close',()=>{
    const action=focusBeforeSheet?.dataset?.action,value=focusBeforeSheet?.dataset?.value;
    const target=focusBeforeSheet?.isConnected?focusBeforeSheet:[...stage.querySelectorAll('button[data-action]')].find(x=>x.dataset.action===action&&x.dataset.value===value);
    (target||stage.querySelector('button'))?.focus();
  });
  function blockActive(destination) {
    const browse=destination.startsWith('support')||destination.startsWith('details')||['eventCenter','eventDetail','season','rewards','myEvents','seasonDetails','seasonWeek','seasonHistory'].includes(destination);
    if(session.status==='playing' && !browse && !['coinPlay','supply','history'].includes(destination)) {
      showModal('本局还在进行',`<p class="modal-copy">${gameName()} · ${fields[data.field].name}尚未结束。你可以开启托管或返回原牌桌，本局结束后再参与其他对局。</p>`,b('返回牌桌','returnTable')); return true;
    }
    if(['table','smallResult','roundWait','allocating','published','eliminated'].includes(t().status) && !browse && !destination.startsWith('event') && !['season','rewards','myEvents'].includes(destination)) {
      showModal('赛事正在进行',`<p class="modal-copy">${e().name}正在进行，请从“我的赛事”返回当前进度。赛事未结束前不能进入其他实时对局。</p>`,b('返回比赛','eventResume')); return true;
    }
    return false;
  }
  function go(screen,options={}) {
    if(blockActive(screen)) return;
    if(!options.replace)FieldNavigation.push(data,screen);
    closeModal(); clearTimeout(toastTimer); $('#toast').classList.remove('visible'); data.screen=screen; save(); render();
  }
  function flowGo(screen){if(data.screen.startsWith('support')||data.screen.startsWith('details')){save();render();}else go(screen,{replace:true});}
  function activeCoinScreen() { return session.status==='playing'?'coinPlay':session.status==='seated'?'coinReady':session.status==='matching'?'coinMatch':'coinLobby'; }
  function home() {
    return `<img class="home-photo" src="assets/home.png" alt="麻溜儿大厅效果图，金币场和比赛场入口">${b('','coin','home-hit','style="left:780px;top:350px;width:275px;height:465px" aria-label="进入金币场"')}${b('','tournament','home-hit','style="left:1068px;top:350px;width:275px;height:465px" aria-label="进入比赛场"')}${b('','tournament','home-hit','style="left:1645px;top:351px;width:210px;height:269px" aria-label="比赛场快捷入口"')}
      ${b(fmt(session.coins),'supply','home-balance coins',`aria-label="金币余额${session.coins}，查看补给"`)}${b('433','wallet','home-balance cards','aria-label="房卡余额433"')}${b('0','wallet','home-balance diamonds','aria-label="钻石余额0"')}
      ${b('','shop','home-hit','style="left:15px;top:885px;width:300px;height:190px" aria-label="进入商城"')}${b('','activity','home-hit','style="left:331px;top:946px;width:87px;height:129px" aria-label="查看活动"')}${b('','help','home-hit','style="left:765px;top:946px;width:86px;height:129px" aria-label="帮助反馈"')}${b('','history','home-hit','style="left:898px;top:944px;width:89px;height:130px" aria-label="查看战绩"')}
      ${session.status!=='idle'?`<button type="button" onclick="FieldUI.handle(event)" class="resume-banner" data-action="resumeCoin">${session.status==='playing'?'本局进行中':'匹配流程进行中'} · 返回原流程 ›</button>`:''}`;
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
    const seconds=Math.ceil(remaining(data.ready?data.dealDeadline:data.personalReadyDeadline)/1000);
    return header('金币场')+sideTabs(0)+`<div class="ready-art-board" role="img" aria-label="四人准备桌效果图"></div>${seats.map(([name,x,y],i)=>`<div class="ready-name" style="left:${x}px;top:${y}px"><strong>${name}</strong><span>${i===3?(data.ready?'已准备':'待准备'):'已准备'}</span></div>`).join('')}<div class="avatar ready-new-avatar"></div><div class="ready-countdown">${data.ready?`全员已准备 · ${seconds} 秒后发牌`:`请准备 · 剩余 ${seconds} 秒`}</div>`+aside('本局信息',kv('玩法',gameName(),true)+kv('场档',fields[data.field].name,true)+kv('底分',fmt(fields[data.field].base),true)+kv('开局方式','单局开赛',true)+`<p class="aside-note">个人准备60秒，总候场120秒。<br>全员准备后3秒发牌；成功发牌才扣服务费。</p>`)+footer(b('退出准备','cancelCoin','blue-button')+b(data.ready?'已准备 · 等待发牌':'准备开局',data.ready?'':'deal','gold-button',data.ready?'disabled':''));
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
    const index=data.previewEvent, x=events[index], nextDay=index===0&&t().status==='final'&&t().entryDay!==dayKey(), status=index===data.event&&!nextDay?t().status:'none';
    const schedule=index===2?`<div class="timeline"><strong class="time">周六 18:25</strong><p>停止报名</p><strong class="time">18:30—18:50</strong><p>检录开放</p><strong class="time">18:50 / 18:55</strong><p>选择64/32人方案 / 锁名单</p><strong class="time">19:00</strong><p>资格赛开赛</p><strong class="time">周日 14:00</strong><p>十六强开赛，结束20分钟后决赛</p></div>`:`<div class="timeline"><strong class="time">${x.time}</strong><p>正式开赛<br><small>${x.duration}，另留缓冲时间</small></p><strong class="time">赛前 10 分</strong><p>停止报名，开放检录</p><strong class="time">赛前 5 分</strong><p>原名单检录截止</p><strong class="time">赛前 3 分</strong><p>满员锁定名单，发布赛程</p></div>`;
    const info=[schedule,
      `<div class="rewards">${(index===0?[['冠军','100 金币'],['第 2—4 名','每人 60 金币'],['第 5—16 名','每人 20 金币']]:index===1?[['冠军','7 天称号'],['前三名','7 天主题头像框'],['正常完赛','赛季积分']]:[['冠军','500 金币'],['第 2—4 名','每人 300 金币'],['第 5—16 名','每人 120 金币'],['其他正常完赛','每人 40 金币']]).map(([a,c])=>`<div class="reward-line"><span>${a}</span><strong>${c}</strong></div>`).join('')}<p class="subcopy">固定奖励在正式确认后自动到账。</p></div>`,
      `<ul class="rule-list"><li>${index===2?'64人资格赛 → 16强 → 4人决赛。人数不足时按正式方案处理。':`${x.rounds}轮瑞士制，每轮4小局，按轮次桌积分累计排名。`}</li><li>赛事牌局只记比赛成绩，不使用金币场输赢结算。</li><li>检录后由赛事统一分桌，名单锁定后不补新玩家。</li><li>结果先展示临时排名，经24小时申诉复核后确认；未结案件继续复核。</li></ul>`][data.detailTab];
    const main=status==='none'?(index===0&&!noviceLeft()?b('今日免费次数已用完','','neutral-button','disabled'):b('报名参赛','register')):status==='registered'?b('尚未开放检录','', 'neutral-button','disabled'):status==='checkin'?b('立即检录','checkin'):b(status==='final'?'查看赛果':status==='standby'?'查看候补':'返回当前进度','eventResume');
    return header('赛事详情')+`<section class="panel body-panel"><div class="detail-layout"><div class="detail-hero">${badge(x.badge)}<h2 class="event-name">${x.name}</h2>${trophy}<strong class="prize">${x.prize}</strong><p>${x.count} 人参赛<br>${x.entry}${index===0?`<br>今日免费次数剩余 ${noviceLeft()} / 1`:''}</p>${badge(status==='none'?(index===0&&!noviceLeft()?'今日资格已使用':'报名开放'):eventStatus(),'blue')}<div class="detail-shortcuts">${b(data.favourites.includes(index)?'★ 已收藏':'☆ 收藏','eventFavourite','blue-button small')}${b(data.reminders.includes(index)?'已提醒':'开赛提醒','eventReminder','blue-button small')}</div></div><div class="detail-information">${tabs(['赛程','奖励','规则'],'detailTab',data.detailTab)}<div class="detail-scroll">${info}</div></div></div></section>`+footer(b('我的赛事','myEvents','blue-button')+main,'tournament');
  }
  function eventRegistered() {
    const status=t().status, check=status==='checkin';
    return header('报名状态','eventCenter')+panel(e().name,steps(check?1:0)+`<div class="registration-status"><div class="seal">✓</div><h2 class="heading">${check?'检录已开放':'报名成功'}</h2><p>开赛时间：${e().time}<br>${check?'请在检录截止前确认到场。':'检录窗口尚未开放，请留意赛事提醒。'}</p>${badge('已获得正式席位','green')}<p class="subcopy">${data.event===2?'赛事券已锁定，锁名单后实扣一次。':data.event===0?'满员锁定名单时消耗本日1次免费资格，此前取消不消耗。':'免费赛事，报名不扣金币。'}</p></div>`)+footer(b('取消报名','cancelRegistration','blue-button')+b('查看详情','currentDetail','blue-button')+b(check?'立即检录':'等待检录',check?'checkin':'','gold-button',check?'':'disabled'),'tournament');
  }
  function eventStandby() {
    return header('候补状态','eventCenter')+panel(e().name,steps(0)+`<div class="central-state"><div class="countdown">3<small>候补顺位</small></div><h2 class="heading">正式席位已满</h2><p class="subcopy">候补不占正式席位、不锁定报名资源。<br>收到转正通知后，在有效时间内确认参赛。</p>${badge('候补人数 8 / 16','blue')}</div>`)+footer(b('查看详情','currentDetail','blue-button')+b('取消候补','cancelStandby','gold-button'),'tournament');
  }
  function eventAllocating() {
    const published=t().status==='published';
    return header('候场分桌','eventCenter')+panel(e().name,steps(2)+`<div class="central-state">${t().error?`<h2 class="heading">牌桌连接未完成</h2><p class="subcopy">分桌已经生效，重试将返回第${t().round}轮原桌。</p>${b('重试原桌','retryTable','gold-button')}`:published?`<h2 class="heading">第${t().round}轮分桌已发布</h2><table class="assign-table"><thead><tr><th>桌号</th><th>本人座位</th><th>同桌玩家</th></tr></thead><tbody><tr><td>${t().round+1}号桌</td><td>东</td><td>茶山客 / 清风 / 听雨</td></tr></tbody></table><p class="subcopy">3 秒后自动进入牌桌</p>`:`<div class="spinner" aria-label="分桌中"><i></i><i></i><i></i><i></i></div><h2 class="heading">检录完成，等待赛事分桌</h2><p class="subcopy">已检录 ${data.event===2?[64,16,4][t().stage]:e().count} / ${data.event===2?[64,16,4][t().stage]:e().count} 人<br>分桌尚未发布，请稍候。</p><div class="progress-track"><span style="width:100%"></span></div>`}</div>`)+footer(b('赛程详情','eventSchedule','blue-button'),'tournament');
  }
  function eventTable() {
    return header('赛事牌桌','eventLeave')+`<nav class="side-tabs">${b('赛程','eventSchedule','active')}${b('成绩','eventScore','')}${b('规则','eventRules','')}</nav>`+board(true,true)+aside(e().name,kv('阶段',data.event===2?['资格赛','十六强','决赛'][t().stage]:'瑞士制',true)+kv('轮次',`${t().round} / ${eventRounds()}`,true)+kv('本轮小局',`${t().hand} / 4`,true)+kv('累计桌积分',fmt(t().points),true)+(data.event===2?kv('报名赛事券',`${t().ticketUsed?'本场已扣1张':'待锁名单'} · 剩余${data.ticket}张`,true):'')+`<p class="aside-note">${data.event===2?'后续轮次及晋级不重复扣券。<br>':''}本轮四小局结束后汇总桌积分。赛事结束后确认总排名。</p>`)+footer(b('设置','settings','blue-button')+b(t().auto?'取消托管':'开启托管','eventTrust','gold-button'),'tournament');
  }
  function eventSmallResult() {
    return header('小局结果','eventLeave')+panel(`${e().name} · 第${t().round}轮 第${t().hand}小局`,`<h2 class="heading sm">本小局 + 18 分</h2><table class="result-table"><thead><tr><th>玩家</th><th>本局原始分</th><th>本轮累计</th></tr></thead><tbody>${[['Pain',18],['茶山客',-4],['清风',-6],['听雨',-8]].map(([n,s],i)=>`<tr class="${i===0?'me':''}"><td>${n}</td><td>${signed(s)}</td><td>${signed(s*t().hand)}</td></tr>`).join('')}</tbody></table><p class="subcopy">10 秒后自动继续同轮下一小局，不重新准备和收费。</p>`)+footer(b('成绩明细','eventScore','blue-button')+b('继续比赛','nextHand','gold-button'),'tournament');
  }
  function eventRoundWait() {
    return header('轮次结果','eventLeave')+panel(`${e().name} · 第${t().round}轮`,`<div class="waiting-message">成绩确认中 · 已完成 ${data.event===2?['12 / 16','3 / 4','1 / 1'][t().stage]:'3 / 4'} 桌，等待统一发布赛程</div><div class="stat-cards"><div class="stat-card">本轮原始分<strong>+ 72</strong></div><div class="stat-card">本轮桌积分<strong>8.00</strong></div><div class="stat-card">累计桌积分<strong>${t().points.toFixed(2)}</strong></div></div><table class="result-table small"><thead><tr><th>本桌排名</th><th>玩家</th><th>四小局原始分</th><th>桌积分</th></tr></thead><tbody>${[['Pain',72,8],['茶山客',-16,5],['清风',-24,2],['听雨',-32,0]].map(([n,s,p],i)=>`<tr class="${i===0?'me':''}"><td>${i+1}</td><td>${n}</td><td>${signed(s)}</td><td>${p.toFixed(2)}</td></tr>`).join('')}</tbody></table>` ,'body-panel round-wait-panel')+footer(b('查看成绩','eventScore','blue-button'),'tournament');
  }
  function eventFinal() {
    const final=t().status==='final', x=e(), eliminated=t().eliminated, amount=eventAward();
    return header('总赛果','eventCenter')+panel(x.name,`<div class="result-hero"><div class="winner-banner">${final&&!eliminated?trophy:'<div class="provisional-mark">'+(eliminated?'✓':'…')+'</div>'}<h2>${eliminated?(final?'本人赛事结束':'本人已完赛'):final?'冠军':'暂列第 1 名'}</h2><p>Pain<br>累计桌积分 ${t().points.toFixed(2)}</p>${badge(final?'正式结果':eliminated?'等待全赛结束 · 待复核':'临时排名 · 待复核',final?'green':'')}</div><div class="rewards"><h2 class="heading sm">${final?'赛事结果已确认':'结果复核中'}</h2><div class="reward-line"><span>赛季积分</span><strong>${final?`+ ${t().seasonPoints||135}`:'待确认'}</strong></div>${amount?`<div class="reward-line"><span>固定金币奖励</span><strong>${amount} 金币</strong>${badge(final?'已自动到账':'待复核',final?'green':'gray')}</div>`:''}${data.event!==2&&!eliminated?`<div class="reward-line"><span>称号奖励</span>${badge(final?'已发放':'待确认',final?'green':'gray')}</div>`:''}<p class="subcopy">${final?'固定奖已自动发放，可在我的奖励查看记录。':'全赛结束并完成复核后确认排名与奖励；申诉窗口24小时，未结案件继续复核。'}</p>${b('成绩明细 / 申诉','eventScore','blue-button small')}</div></div>`)+footer(b('我的奖励','rewards','blue-button')+b('返回赛事中心','eventCenter','gold-button'),'tournament');
  }
  function myEvents() {
    const archives=data.eventArchives.slice().reverse();
    const current=t().status==='none'?`<div class="empty-state"><div class="icon">♜</div><h2>还没有报名赛事</h2><p>先查看赛事详情，再确认报名。</p>${b('查看比赛','eventCenter','gold-button')}</div>`:`<div class="my-event-card">${trophy}<div><h2 class="heading">${e().name}</h2><p class="subcopy">${e().time} · ${eventStatus()}</p>${badge(e().entry,'blue')}</div>${b('查看进度','eventResume','gold-button')}</div>`;
    return header('我的赛事')+panel('我的赛事',tabs(['当前赛事','历史赛事','收藏与提醒'],'myEventsTab',data.myEventsTab)+`<div class="navigation-scroll">${data.myEventsTab===0?current:data.myEventsTab===1?(archives.length?archives.map(a=>`<article class="archive-row"><div><h3>${events[a.event].name}</h3><p>${FieldNavigation.escape(a.time)} · 第${a.rank}名 · 固定奖${a.amount}金币</p></div>${badge('正式完赛','green')}${b('查看记录','archiveDetail','blue-button small',`data-value="${a.id}"`)}</article>`).join(''):'<div class="empty-state"><h2>暂无历史赛事</h2><p>正式确认后归入历史记录。</p></div>'):[...new Set([...data.favourites,...data.reminders])].map(i=>`<article class="archive-row"><div><h3>${events[i].name}</h3><p>${data.favourites.includes(i)?'已收藏':''} ${data.reminders.includes(i)?'· 页面内开赛提醒':''}</p></div>${b('查看详情','eventDetail','blue-button small',`data-value="${i}"`)}</article>`).join('')||'<div class="empty-state"><h2>暂无收藏与提醒</h2><p>可在赛事详情中设置。</p></div>'}</div>`)+footer(b('赛事中心','eventCenter','blue-button'),'tournament');
  }
  function rewards() {
    const rows=data.eventArchives.slice().reverse().map(a=>`<div class="reward-line"><span>${events[a.event].name} · 第${a.rank}名</span><strong>${a.amount?`${a.amount} 金币`:'称号 / 赛季积分'}</strong>${badge('已自动到账','green')}</div>`).join('');
    const pending=t().status==='finalTemp'?`<div class="reward-line"><span>${e().name} · 临时赛果</span><strong>${eventAward()} 金币</strong>${badge('待全赛确认','gray')}</div>`:'';
    return header('我的奖励')+panel('赛事奖励',`<div class="rewards">${pending}${rows||(!pending?'<div class="empty-state"><div class="icon">♢</div><h2>暂无赛事奖励</h2><p>正式确认后固定奖自动发放。</p></div>':'')}<p class="subcopy">固定奖励无需领取；活动宝箱按独立条件领取。</p>${b('活动宝箱','support:chest','gold-button small')}</div>`)+footer(b('我的赛事','myEvents','blue-button'),'tournament');
  }
  function season() {
    const count=archiveList().length,total=seasonTotal();
    return header('赛季排行')+panel('金秋赛季',`<div class="account-strip">4 个完整自然周 · 最佳 12 场成绩计入 · 至少 5 场正式赛事上榜</div><div class="stat-cards"><div class="stat-card">我的赛季分<strong>${total}</strong></div><div class="stat-card">有效场数<strong>${count} / 5</strong></div><div class="stat-card">上榜状态<strong style="font-size:30px">${count>=5?'已满足资格':`还差 ${5-count} 场`}</strong></div></div><table class="result-table small"><thead><tr><th>名次</th><th>玩家</th><th>赛季积分</th><th>有效场数</th></tr></thead><tbody>${[['青竹',1260,12],['听风',1188,11],['茶山客',1125,10]].map(([n,s,c],i)=>`<tr><td>${i+1}</td><td>${n}</td><td>${s}</td><td>${c}</td></tr>`).join('')}</tbody></table><div class="season-links">${b('最佳12场','seasonDetails','blue-button small')}${b('每周成就','seasonWeek','blue-button small')}${b('历史赛季','seasonHistory','blue-button small')}</div><div class="ranking-self" style="margin-top:15px">Pain · ${total} 分 · ${count>=5?'正式排名随赛季榜更新':'有效赛事不足，暂未上榜'}</div>`)+footer(b('我的赛事','myEvents','blue-button'),'tournament');
  }
  const labels={home:'大厅',coinLobby:'金币 · 选场',coinMatch:'金币 · 真人匹配',coinReady:'金币 · 准备',coinPlay:'金币 · 单局牌桌',coinResult:'金币 · 净额结算',supply:'金币补给',history:'金币战绩',eventCenter:'比赛 · 中心',eventDetail:'比赛 · 详情',eventRegistered:'比赛 · 报名与检录',eventStandby:'比赛 · 候补',eventAllocating:'比赛 · 分桌',eventTable:'比赛 · 牌桌',eventSmallResult:'比赛 · 小局结果',eventRoundWait:'比赛 · 轮次等待',eventFinal:'比赛 · 赛果',myEvents:'我的赛事',rewards:'赛事奖励',season:'赛季排行'};
  const pages={home,coinLobby,coinMatch,coinReady,coinPlay,coinResult,supply,history,eventCenter,eventDetail,eventRegistered,eventStandby,eventAllocating,eventTable,eventSmallResult,eventRoundWait,eventFinal,myEvents,rewards,season};
  const archiveList=()=>data.eventArchives.filter(a=>a.tournament?.status==='final');
  const weekKey=(stamp=Date.now())=>{const date=new Date(stamp+8*3600000),day=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-day);return date.toISOString().slice(0,10);};
  const weeklyArchives=()=>archiveList().filter(a=>weekKey(Number(a.id.replace('event-','')))===weekKey());
  const weekBonus=rows=>(rows.length>=3?30:0)+(rows.some(a=>a.rank<=2)?30:0)+(rows.length>=5?60:0);
  const seasonTotal=()=>{const groups={};for(const row of archiveList()){const key=weekKey(Number(row.id.replace('event-','')));(groups[key]??=[]).push(row);}return archiveList().map(a=>a.seasonPoints).sort((a,b)=>b-a).slice(0,12).reduce((sum,n)=>sum+n,0)+Object.values(groups).reduce((sum,rows)=>sum+weekBonus(rows),0);};
  function seasonDetails(){return header('赛季成绩')+panel('最佳12场',`<div class="account-strip">正式赛事记录 · 按单场赛季分排序，取最佳12场</div><div class="navigation-scroll">${archiveList().length?archiveList().slice().sort((a,b)=>b.seasonPoints-a.seasonPoints).map((a,i)=>`<article class="archive-row"><div><h3>${events[a.event].name}</h3><p>${FieldNavigation.escape(a.time)}</p></div><strong>${a.seasonPoints} 分</strong>${badge(i<12?'计入最佳12场':'候选成绩',i<12?'green':'gray')}${b('赛事记录','archiveDetail','blue-button small',`data-value="${a.id}"`)}</article>`).join(''):'<div class="empty-state"><h2>暂无正式成绩</h2><p>临时赛果不计入赛季。</p></div>'}</div>`)+footer(b('返回赛季','season','blue-button'),'tournament');}
  function seasonWeek(){const rows=weeklyArchives(),count=rows.length;return header('每周成就')+panel('本周赛事',`<div class="stat-cards"><div class="stat-card">有效赛事<strong>${count}</strong></div><div class="stat-card">周成就加分<strong>+${weekBonus(rows)}</strong></div></div>${[[`完成3场 · ${Math.min(count,3)}/3`,30,count>=3],[`获得1次前二`,30,rows.some(a=>a.rank<=2)],[`完成5场 · ${Math.min(count,5)}/5`,60,count>=5]].map(([label,points,done])=>`<div class="reward-line"><span>${label}</span><strong>+${points} 赛季分</strong>${badge(done?'已计入':'进行中',done?'green':'gray')}</div>`).join('')}<p class="subcopy">每项每周计入一次，共最高120分。只计算正式确认的有效赛事，本周3场任务赛事券另行领取。</p>${b('查看赛事任务','eventTasks','gold-button small')}`)+footer(b('赛季成绩','seasonDetails','blue-button'),'tournament');}
  function seasonHistory(){return header('历史赛季')+panel('历史赛季','<div class="empty-state"><div class="icon">★</div><h2>暂无已结束赛季</h2><p>当前为金秋赛季。结束后在此查看最终排名、有效场数和奖励记录。</p></div>')+footer(b('当前赛季','season','blue-button'),'tournament');}
  function eventTasks(){const count=weeklyArchives().length,claimed=data.weekTicketWeek===weekKey();return header('赛事任务')+panel('当周赛事券',`<div class="central-state"><div class="countdown">${Math.min(count,3)}<small> / 3场有效赛事</small></div><h2 class="heading">完成3场有效赛事</h2><p class="subcopy">有效赛事以正式确认记录为准。达到条件后领取当周赛事券，周末报名时锁定，锁名单后实扣。</p>${badge(claimed?'本周已领取':count>=3?'已达成':'进行中',count>=3?'green':'blue')}</div>`)+footer(b('查看赛事','eventCenter','blue-button')+b(claimed?'已领取':count>=3?'领取赛事券':'尚未达成',count>=3&&!claimed?'claimEventTicket':'','gold-button',count>=3&&!claimed?'':'disabled'),'tournament');}
  Object.assign(pages,{seasonDetails,seasonWeek,seasonHistory,eventTasks});Object.assign(labels,{seasonDetails:'最佳12场',seasonWeek:'每周成就',seasonHistory:'历史赛季',eventTasks:'赛事任务'});
  const ctx={b,badge,kv,header,footer,panel,aside,go,showModal,notify,fmt,signed,refresh:()=>render(),getData:()=>data,getSession:()=>session,getTournament:t,getEvent:()=>({...e(),award:eventAward()}),
    get data(){return data;},get session(){return session;},get t(){return t();},get e(){return e();},get gameName(){return gameName();},fields,events};
  const support=FieldSupport.create(ctx), details=FieldDetails.create(ctx);
  Object.assign(pages,support.pages,details.pages);Object.assign(labels,support.labels,details.labels);
  function render() {
    const focusedAction=document.activeElement?.dataset?.action,focusedValue=document.activeElement?.dataset?.value;
    const screen=pages[data.screen]?data.screen:'home'; data.screen=screen;
    const windowed=!primaryScreens.has(screen);
    const base=windowed?sheetBase():screen;
    if(windowed&&!sheet.open)focusBeforeSheet=document.activeElement;
    stage.className=`stage ${base==='coinLobby'?'photo-lobby':base==='coinMatch'?'photo-match':base==='coinReady'?'photo-ready':base==='home'?'':'soft'}`;
    stage.innerHTML=pages[base]();
    if(windowed){
      const changed=sheetBody.dataset.screen!==screen;
      sheetBody.innerHTML=pages[screen]()+`<div class="sheet-demo-controls" aria-label="演示工具"><span>演示</span>${b('推进时间','advance','')}${b('演示面板','tools','')}</div>`;sheetBody.dataset.screen=screen;
      sheet.setAttribute('aria-label',labels[screen]||'游戏弹板');
      if(!sheet.open){sheet.showModal();sheetBody.querySelector('.back')?.focus();}
      else if(changed)sheetBody.querySelector('.back')?.focus();
      else if(focusedAction)[...sheetBody.querySelectorAll('button[data-action]')].find(x=>x.dataset.action===focusedAction&&x.dataset.value===focusedValue)?.focus();
    }else if(sheet.open)sheet.close();
    document.title=`${labels[screen]} · 麻溜儿交互参考`;
    $('#screen-label').textContent=labels[screen];
    $('#flow-hint').textContent=screen.startsWith('support')?'活动奖励和商城订单保留原次状态，返回后继续原进度':screen.startsWith('details')?'按原记录查看规则、费用、回放或成绩，返回键保留来源':screen==='coinPlay'||screen==='eventTable'?'点击手牌选牌与出牌；画面外推进可模拟本局结束':screen.startsWith('coin')?'选场 → 确认 → 匹配 → 准备 → 单局 → 结算清房':screen==='home'?'从金币场或比赛场入口开始体验':'详情 → 报名 → 检录 → 分桌 → 多轮比赛 → 复核 → 奖励到账';
    const sectionOf=page=>page==='home'?'home':page.startsWith('coin')||['supportSupply','detailsHistory','detailsRecord','detailsLedger','detailsReplay'].includes(page)?'coin':page.startsWith('event')||page.startsWith('season')||['myEvents','rewards','detailsSchedule','detailsScore','detailsAppeal'].includes(page)?'tournament':null;
    const section=sectionOf(screen)||(data.navStack||[]).slice().reverse().map(sectionOf).find(Boolean)||'home';
    document.querySelectorAll('.workbench nav button').forEach(btn=>btn.classList.toggle('active',btn.dataset.action===section));
    const text=session.status==='matching'?'模拟匹配完成':session.status==='seated'?(data.ready?'模拟成功发牌':'模拟本人准备'):session.status==='playing'?'结束演示本局':({registered:'模拟开放检录',allocating:'模拟发布分桌',published:'模拟进入牌桌',table:'结束演示小局',smallResult:'模拟继续小局',roundWait:'模拟全桌完成',finalTemp:'模拟复核通过'})[t().status]||'推进流程';
    $('#advance').textContent=text; save(); resize();
    const pause=document.querySelector('[data-action="pause"]');pause.textContent=data.pauseAuto?'恢复自动推进':'停留当前页';pause.setAttribute('aria-pressed',String(data.pauseAuto));
  }
  function sheetBase(){
    if(session.status!=='idle')return activeCoinScreen();
    if(['table','smallResult','roundWait'].includes(t().status))return 'eventTable';
    if(data.screen==='coinResult')return 'coinLobby';
    const base=(data.navStack||[]).slice().reverse().find(x=>primaryScreens.has(x));
    return base||((data.screen.startsWith('event')||['myEvents','season','rewards'].includes(data.screen))?'eventCenter':'home');
  }
  function resize() {
    const frame=$('#frame'), full=document.fullscreenElement===frame;
    const scale=full?Math.min(frame.clientWidth/1920,frame.clientHeight/1080):frame.clientWidth/1920;
    stage.style.transform=`scale(${scale})`; stage.style.left=full?`${(frame.clientWidth-1920*scale)/2}px`:'0'; stage.style.top=full?`${(frame.clientHeight-1080*scale)/2}px`:'0';
    const r=frame.getBoundingClientRect();
    for(const [dialog,width,height] of [[sheet,1660,900],[modal,1100,modal.offsetHeight||600]]){
      dialog.style.transform=`scale(${scale})`;
      dialog.style.left=`${r.left+(r.width-width*scale)/2}px`;
      dialog.style.top=`${r.top+(r.height-Math.min(height,900)*scale)/2}px`;
    }
  }
  function largeView(enabled) {
    document.body.classList.toggle('theater',enabled);
    const control=document.querySelector('.workbench [data-action="fullscreen"]');
    control.textContent=enabled?'⤡ 收起画面':'⛶ 放大';control.setAttribute('aria-label',enabled?'收起画面':'放大查看');resize();
  }
  new ResizeObserver(resize).observe($('#frame'));
  function startCoin() {
    if(session.status!=='idle') return go(activeCoinScreen());
    if(t().eliminated&&t().status!=='final')return showModal('赛事进度尚未关闭','<p class="modal-copy">本人已完赛，等待全赛结果确认。可查看记录与活动，正式确认后再参与新对局。</p>',b('查看赛事','eventResume'));
    if(t().status!=='none'&&!['final','finalTemp','registered','standby'].includes(t().status)) return showModal('先处理当前赛事',`<p class="modal-copy">请先完成检录或当前赛事，本次不发起金币匹配。</p>`,b('返回赛事','eventResume'));
    const f=fields[data.field], valid=session.available>=f.min&&session.available<f.max;
    if(!valid) return showModal('当前金币不符合场档',`<p class="modal-copy">${f.name}准入：${fmt(f.min)}${Number.isFinite(f.max)?` ≤ 金币 < ${fmt(f.max)}`:'金币及以上'}。当前可用金币 ${fmt(session.available)}。</p>`,b('重新选场','coin','blue-button')+b('金币补给','supply'));
    if(data.game===2) return showModal('跑得快场次',`<p class="modal-copy">该页签演示地区配置与入口切换。跑得快人数和单局结算按对应玩法适配，完整交互请先选择四人麻将。</p>`,b('切回郑州麻将','chooseMahjong'));
    if(data.region==='陕北'&&data.game===0) return showModal('单局适配待确认',`<p class="modal-copy">陕北玩法包含跨局目标，金币单局适配确认后再开放。本次可切换郑州或红中麻将体验完整流程。</p>`,b('切回郑州麻将','chooseMahjong'));
    showModal('确认进入',`<div class="modal-kv"><span>玩法 / 场档</span><b>${gameName()} · ${f.name}</b></div><div class="modal-kv"><span>单局服务费</span><b>${FEE} 金币 · 演示值</b></div><p class="modal-copy">先预留服务费；四人就位、成功发牌后实扣一次并锁定剩余本金。开局后不能离桌，可托管；本局结束后结算清房。</p>`,b('返回选场','closeModal','blue-button')+b('确认匹配','queueCoin'));
  }
  function queueCoin() {
    if(session.status!=='idle') return;
    const f=fields[data.field];if(session.coins<f.min||session.coins>=f.max)return startCoin();
    session.queue(FEE); data.matchCount=1; data.ready=false; data.lossDemo=false; data.matchDeadline=demoNow()+7800; data.matchExpiry=demoNow()+120000; closeModal(); cancelTimers(); go('coinMatch');
    [2,3,4].forEach((n,i)=>later(()=>{if(session.status!=='matching')return;data.matchCount=n;save();if(data.screen==='coinMatch')render();},2200*(i+1)));
    later(seatCoin,7800);
  }
  function seatCoin() {
    if(session.status!=='matching') return; cancelTimers(); session.seat(); data.matchCount=4; data.ready=false;
    data.personalReadyDeadline=demoNow()+60000;data.roomReadyDeadline=demoNow()+120000;data.dealDeadline=0;
    flowGo('coinReady');resumeTimers(); notify('真人匹配完成，已进入准备桌');
  }
  function readyCoin() {
    if(session.status!=='seated'||data.ready)return;
    if(remaining(data.personalReadyDeadline)===0||remaining(data.roomReadyDeadline)===0)return readyTimeout();
    data.ready=true;data.dealDeadline=demoNow()+3000;cancelTimers();render();resumeTimers();
  }
  function dealCoin() {
    if(session.status!=='seated'||!data.ready)return;
    const f=fields[data.field];
    if(session.coins<f.min||session.coins>=f.max){session.cancel();data.ready=false;cancelTimers();go('coinLobby',{replace:true});return notify('发牌前余额已变化，请重新选择场档');}
    cancelTimers();session.deal();data.selectedTile=-1;flowGo('coinPlay');
  }
  function readyTimeout() {
    if(session.status!=='seated')return;
    cancelTimers();session.cancel();data.ready=false;flowGo('coinLobby');
    showModal('准备时间已结束','<p class="modal-copy">已移出候场桌，本次预留全部释放；重新开始会进入新匹配，不延长原桌总候场时间。</p>',b('重新选场','coin'));
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
  function eventScreen() { return FieldNavigation.eventMap[t().status]||'eventCenter'; }
  function eventAward(){return data.event===2&&t().eliminated?(t().rank<=16?120:40):e().award;}
  function beginReview(){t().status='finalTemp';t().reviewStarted=Date.now();t().reviewDeadline=Date.now()+86400000;go('eventFinal',{replace:true});}
  function confirmResult(){
    if(t().pendingAppeal)return showModal('还有申诉待处理','<p class="modal-copy">请查看原申诉记录，受理案件处理完成后再确认正式赛果。</p>',b('查看原记录','details:requests'));
    t().status='final';t().rank=t().rank||1;const rank=t().rank;t().seasonPoints=5+Math.floor(100*(e().count-rank)/(e().count-1))+(rank===1?30:rank===2?20:rank===3?10:0);
    if(!t().awarded){session.reward(eventAward());t().awarded=true;}
    if(!t().archiveId){t().archiveId='event-'+Date.now();data.eventArchives.push({id:t().archiveId,event:data.event,time:new Date().toLocaleString('zh-CN'),rank:t().rank,amount:eventAward(),seasonPoints:t().seasonPoints,tournament:JSON.parse(JSON.stringify(t()))});}
    go('eventFinal',{replace:true});notify('演示复核已通过，固定奖励自动到账');
  }
  function register(standby=false) {
    if(!['none','final'].includes(t().status)) return showModal('已有未结束的赛事',`<p class="modal-copy">${e().name}的进度仍保留。可查看其他赛事详情，当前流程结束后再报名。</p>`,b('返回当前赛事','eventResume'));
    if(session.status!=='idle') return showModal('金币场流程尚未结束',`<p class="modal-copy">请先完成当前金币场流程。牌局中不能进入赛事实时对局，未来赛事预约限制仍待确认。</p>`,b('返回金币场','resumeCoin'));
    const x=events[data.previewEvent];
    if(data.previewEvent===0&&!noviceLeft())return showModal('今日免费次数已用完','<p class="modal-copy">新手杯每日1次免费，本日已在锁定名单时消耗。可以查看原赛果或选择其他赛事；取消与后续轮次不会再次计算。</p>',b('查看其他赛事','eventCenter','blue-button'));
    if(data.previewEvent===2&&!data.ticket) return showModal('缺少赛事券',`<p class="modal-copy">当周完成3场有效赛事可获得赛事券。可从赛事任务查看进度。</p>`,b('赛事任务','eventTasks','blue-button'));
    showModal(standby?'确认候补':'报名确认',`<div class="modal-kv"><span>赛事</span><b>${x.name}</b></div><div class="modal-kv"><span>开赛</span><b>${x.time}</b></div><div class="modal-kv"><span>报名资源</span><b>${standby?'候补不锁资源':x.entry}</b></div><p class="modal-copy">${standby?'获得席位后需要本人确认并重新检查资格和报名资源。':'报名成功后需要按时检录；锁名单后由赛事统一分桌，不进入金币真人匹配。'}</p>`,b('取消','closeModal','blue-button')+b(standby?'加入候补':'确认报名',standby?'confirmStandby':'confirmRegister'));
  }
  function publishTable() {
    if(t().status!=='allocating') return;
    if(data.event===0&&!t().noviceEntryUsed){
      const day=dayKey();
      if(!noviceLeft(day))return showModal('本日免费资格已使用','<p class="modal-copy">本次没有锁定名单或进入牌桌，请返回赛事中心查看原进度。</p>',b('赛事中心','eventCenter','blue-button'));
      data.noviceEntryDays.push(day);t().entryDay=day;t().noviceEntryUsed=true;
    }
    if(data.event===2&&!t().ticketUsed){
      if(data.ticket<1)return showModal('赛事券不足','<p class="modal-copy">本次尚未锁定名单或扣券，请核对报名资源后重试。</p>',b('赛事任务','eventTasks','blue-button'));
      data.ticket--;t().ticketUsed=true;
    }
    cancelTimers(); t().status='published'; t().error=false;t().entryDeadline=demoNow()+3000; closeModal(); go('eventAllocating',{replace:true}); later(enterEventTable,3000);
  }
  function enterEventTable() {
    if(t().status!=='published'||t().error) return;
    if(session.status!=='idle') return showModal('当前金币场流程未结束',`<p class="modal-copy">请先完成或取消金币匹配，已发牌则等待本局正式结束，再返回赛事原桌。</p>`,b('返回金币场','resumeCoin'));
    cancelTimers(); t().status='table'; data.selectedTile=-1; flowGo('eventTable');
  }
  function finishHand() {
    if(t().status!=='table')return; cancelTimers(); closeModal(); data.selectedTile=-1;
    if(t().hand<4) { t().status='smallResult';t().nextHandDeadline=demoNow()+10000; go('eventSmallResult',{replace:true}); later(nextHand,10000); }
    else { t().points+=8;t().roundRecords=t().roundRecords||[];t().roundRecords.push({stage:t().stage,round:t().round,raw:72,points:8,cumulative:t().points,confirmed:true,hands:[18,18,18,18]});t().status='roundWait'; go('eventRoundWait',{replace:true}); }
  }
  function nextHand() { if(t().status!=='smallResult')return; cancelTimers(); t().hand++; t().status='table'; flowGo('eventTable'); }
  function nextRound() {
    if(t().status!=='roundWait')return;
    if(t().round<eventRounds()) { t().round++; t().hand=1; t().status='allocating'; go('eventAllocating',{replace:true}); }
    else if(data.event===2&&t().stage<2) showModal('阶段结果',`<p class="modal-copy">按已确认排名决定晋级；未晋级者查看本人完赛进度，等待全赛结果和复核。以下两条分支用于演示。</p>`,b('演示未晋级','eliminateEvent','blue-button')+b('演示晋级下一阶段','nextStage'));
    else beginReview();
  }
  function advance() {
    closeModal();
    if(session.status==='matching') return seatCoin();
    if(session.status==='seated') return data.ready?dealCoin():readyCoin();
    if(session.status==='playing') return finishCoin();
    switch(t().status) {
      case 'registered': t().status='checkin'; go('eventRegistered'); notify('演示时间已推进至检录窗口'); break;
      case 'standby': t().offerDeadline=Date.now()+120000;showModal('获得正式席位',`<p class="modal-copy">请在 2 分钟有效窗口内确认参赛；转正成功后才能进入检录。</p>`,b('稍后处理','closeModal','blue-button')+b('确认参赛','convertStandby')); break;
      case 'allocating': publishTable(); break;
      case 'published': if(t().error)dispatch('retryTable');else enterEventTable(); break;
      case 'table': finishHand(); break;
      case 'smallResult': nextHand(); break;
      case 'roundWait': nextRound(); break;
      case 'finalTemp': confirmResult(); break;
      default: notify('先从金币场开始匹配，或从比赛场报名赛事');
    }
  }
  function tools() {
    showModal('演示面板',`<p class="modal-copy">以下只切换本地参考状态，不操作正式账户。推进流程模拟到达业务时间，不代表真实计时。</p><div class="tools-grid"><div class="scenario-buttons"><h3>金币场</h3>${b('本金耗尽与系统补差','lossScenario','')}${b('低余额与补给入口','lowScenario','')}${b('救济后仍不足入场','reliefScenario','')}${b('局中新到账 +100 金币','newReward','')}${b('模拟离线代打 / 重连','offlineScenario','')}${b('模拟匹配失败','matchFailure','')}${b('模拟准备超时','readyTimeoutScenario','')}</div><div class="scenario-buttons"><h3>比赛场</h3>${b('新手杯候补流程','standbyScenario','')}${b('分桌后连接失败','tableFailure','')}${b('快速查看轮末等待','roundScenario','')}${b('周末晋级 / 未晋级','weekendScenario','')}${b('快速查看临时赛果','finalScenario','')}${b('恢复演示赛事券','ticketScenario','')}${b('模拟申诉处理中','details:demoProcessRequest','')}${b('模拟原申诉已处理','details:demoResolveRequest','')}</div><div class="scenario-buttons"><h3>活动与奖励</h3>${[['VIP资格切换','vip'],['补签示例','makeup'],['昨日回访机会','returnYesterday'],['昨日翻牌机会','flipYesterday'],['茶歇冷却结束','teaReady'],['待领宝箱','chestPending'],['金币直发样例','chestDirect']].map(([label,value])=>b(label,'support:scenario','',`data-value="${value}"`)).join('')}</div></div><p class="modal-copy">费用、换算与封顶仍待正式核定；未确认退赛权益不作定案。</p>`);
  }
  function directory() {
    showModal('流程目录',`<div class="directory"><div><h3>金币场</h3>${[['选场','coin'],['真人匹配 / 准备 / 牌桌','resumeCoin'],['战绩 / 明细 / 回放','history'],['金币补给','supply'],['规则','rules'],['帮助反馈','help']].map(([x,a])=>b(x,a,'')).join('')}<p class="modal-copy">确认 → 匹配 → 准备 → 单局 → 结算。</p></div><div><h3>比赛场</h3>${[['赛事中心','tournament'],['我的赛事 / 当前进度','myEvents'],['我的奖励','rewards'],['赛季排行','season'],['赛程与成绩','eventSchedule'],['赛事任务','eventTasks']].map(([x,a])=>b(x,a,'')).join('')}<p class="modal-copy">报名 → 检录 → 分桌 → 比赛 → 复核。</p></div><div><h3>活动与商城</h3>${[['四活动','support:activities'],['商城 / 订单 / 装扮','support:shop'],['宝箱与礼包','support:chest']].map(([x,a])=>b(x,a,'')).join('')}</div></div>`);
  }
  function scenario(name) {
    if(name==='newReward'){if(session.status!=='playing')return notify('请先进入金币牌桌');session.reward(100);closeModal();render();return notify('演示到账100金币，本局本金保持不变');}
    if(name==='ticketScenario'){data.ticket=1;closeModal();render();return notify('本地演示赛事券已恢复');}
    if(name==='offlineScenario'&&session.status!=='playing')return notify('请先进入金币牌桌');
    if(name==='matchFailure'&&!['matching','seated'].includes(session.status))return notify('请先发起金币匹配');
    closeModal(); cancelTimers();
    if(['lossScenario','lowScenario','reliefScenario','standbyScenario','roundScenario','finalScenario','weekendScenario','readyTimeoutScenario'].includes(name)||(name==='tableFailure'&&session.status!=='idle')) { session=new FieldCore.Session(); data=defaults(); }
    if(name==='lossScenario'){session=new FieldCore.Session(800);data.field=0;session.queue(FEE);session.seat();session.deal();session.reward(100);data.lossDemo=true;data.screen='coinPlay';}
    if(name==='lowScenario'){session=new FieldCore.Session(120);data.field=0;data.screen='coinLobby';}
    if(name==='reliefScenario'){session=new FieldCore.Session(15);data.field=0;data.screen='supportSupply';}
    if(name==='standbyScenario'){t().status='standby';data.screen='eventStandby';}
    if(name==='roundScenario'){t().status='roundWait';t().entryDay=dayKey();t().noviceEntryUsed=true;data.noviceEntryDays=[t().entryDay];t().hand=4;t().points=8;data.screen='eventRoundWait';}
    if(name==='finalScenario'){t().status='finalTemp';t().entryDay=dayKey();t().noviceEntryUsed=true;data.noviceEntryDays=[t().entryDay];t().round=3;t().hand=4;t().points=24;t().reviewStarted=Date.now();t().reviewDeadline=Date.now()+86400000;data.screen='eventFinal';}
    if(name==='weekendScenario'){data.event=2;data.previewEvent=2;t().status='roundWait';t().ticketUsed=true;t().round=4;t().hand=4;t().points=32;data.screen='eventRoundWait';}
    if(name==='readyTimeoutScenario'){data.field=2;session.queue(FEE);session.seat();data.personalReadyDeadline=Date.now();data.roomReadyDeadline=Date.now()+120000;return readyTimeout();}
    if(name==='tableFailure'){t().status='published';data.screen='eventAllocating';t().error=true;}
    if(name==='offlineScenario'){if(session.status!=='playing')return notify('请先进入金币牌桌');data.offline=!data.offline;session.trust(data.offline);data.screen='coinPlay';}
    if(name==='newReward'){session.reward(100);notify('演示到账100金币，本局本金保持不变');}
    if(name==='ticketScenario'){data.ticket=1;notify('本地演示赛事券已恢复');}
    if(name==='matchFailure'){if(['matching','seated'].includes(session.status)){session.cancel();data.screen='coinLobby';render();return showModal('匹配未完成',`<p class="modal-copy">本次预留已释放，没有实扣服务费。可重新匹配。</p>`,b('重新匹配','startCoin'));}return notify('请先发起金币匹配');}
    render();
  }
  function dispatch(action,value) {
    if(action.startsWith('support:'))return support.dispatch(action,value);
    if(action.startsWith('details:'))return details.dispatch(action,value);
    const aliases={history:'details:history',rules:'details:rules',help:'details:help',eventRules:'details:eventRules',eventSchedule:'details:schedule',eventScore:'details:score',appeal:'details:appeal',coinInfo:'details:coinInfo',supply:'support:supply',activity:'support:activities',shop:'support:shop'};
    if(aliases[action])return dispatch(aliases[action],value);
    switch(action) {
      case 'home':return go('home');
      case 'coin':
        if(session.status==='idle')data.field=Math.max(0,FieldCore.recommend(session.available));
        if(data.screen==='coinResult'){
          data.navStack=(data.navStack||[]).filter(x=>!x.startsWith('coin'));
          return go('coinLobby',{replace:true});
        }
        return go('coinLobby');
      case 'resumeCoin':return go(activeCoinScreen()); case 'returnTable':return go('coinPlay');
      case 'tournament':case 'eventCenter':return go('eventCenter'); case 'directory':return directory(); case 'tools':return tools(); case 'advance':return advance(); case 'closeModal':return closeModal();
      case 'pause':data.pauseAuto=!data.pauseAuto;cancelTimers();if(data.pauseAuto)data.pausedAt=Date.now();else{const shift=data.pausedAt?Date.now()-data.pausedAt:0;for(const key of ['matchDeadline','matchExpiry','personalReadyDeadline','roomReadyDeadline','dealDeadline'])if(data[key])data[key]+=shift;for(const key of ['entryDeadline','nextHandDeadline'])if(t()[key])t()[key]+=shift;data.pausedAt=0;resumeTimers();}render();return notify(data.pauseAuto?'已暂停演示的自动计时，可手动推进或恢复':'已恢复演示自动推进');
      case 'selectField':if(session.status!=='idle')return notify('当前入场流程结束后再切换场档');data.field=Number(value);return render(); case 'game':if(session.status!=='idle')return notify('当前匹配流程结束后再切换玩法');data.game=Number(value);return render();
      case 'startCoin':return startCoin(); case 'queueCoin':return queueCoin(); case 'cancelCoin':return cancelCoin();
      case 'confirmCancel':cancelTimers();session.cancel();data.ready=false;return go('coinLobby',{replace:true}); case 'matchHome':return go('home');
      case 'deal':return readyCoin();
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
      case 'eventDetail':if(!events[Number(value)])return;data.previewEvent=Number(value);data.detailTab=0;return go('eventDetail');
      case 'currentDetail':data.previewEvent=data.event;return go('eventDetail');case 'detailTab':data.detailTab=Number(value);return render();
      case 'register':return register();case 'confirmRegister':if(!['none','final'].includes(t().status)||session.status!=='idle')return;if(data.previewEvent===0&&!noviceLeft())return register();data.event=data.previewEvent;data.tournament=freshTournament();t().entryDay=dayKey();t().status='registered';return go('eventRegistered');
      case 'confirmStandby':if(!['none','final'].includes(t().status))return;data.event=data.previewEvent;data.tournament=freshTournament();t().status='standby';return go('eventStandby');
      case 'convertStandby':if(t().status!=='standby')return;if(FieldNavigation.remaining(t().offerDeadline)===0)return notify('转正通知已失效，请等待下一次席位通知');if(session.status!=='idle')return showModal('当前对局尚未结束','<p class="modal-copy">请先完成当前对局，再在通知有效期内确认。</p>',b('返回原流程','resumeCoin'));if(data.event===2&&!data.ticket)return notify('赛事券不足，未转为正式席位');t().status='checkin';return go('eventRegistered',{replace:true});
      case 'cancelStandby':t().status='none';return go('eventCenter',{replace:true});
      case 'cancelRegistration':if(!['registered','checkin'].includes(t().status))return notify('名单已进入分桌，不能使用报名取消');return showModal('取消报名','<p class="modal-copy">名单锁定前取消会释放正式席位及预留资源，赛事券没有实扣。本次不会进入分桌。</p>',b('保留报名','closeModal','blue-button')+b('确认取消','confirmCancelRegistration'));
      case 'confirmCancelRegistration':if(!['registered','checkin'].includes(t().status))return;t().status='none';t().checked=false;return go('eventCenter',{replace:true});
      case 'checkin':if(t().status!=='checkin')return;if(session.status!=='idle')return showModal('金币场流程尚未结束',`<p class="modal-copy">请先完成或取消当前金币场流程，再检录进入赛事。</p>`,b('返回金币场','resumeCoin'));t().checked=true;t().status='allocating';return go('eventAllocating');
      case 'eventResume':return go(eventScreen());case 'retryTable':t().error=false;t().status='published';return enterEventTable();
      case 'nextHand':return nextHand();case 'nextStage':if(data.event!==2||t().status!=='roundWait'||t().stage>=2)return;t().stage++;t().round=1;t().hand=1;t().points=0;t().status='allocating';return go('eventAllocating',{replace:true});
      case 'eliminateEvent':if(data.event!==2||t().status!=='roundWait'||t().stage>=2)return;t().eliminated=true;t().rank=t().stage===0?20:8;return beginReview();
      case 'eventFavourite':case 'eventReminder':{const key=action==='eventFavourite'?'favourites':'reminders',i=data.previewEvent;data[key]=data[key].includes(i)?data[key].filter(n=>n!==i):data[key].concat(i);render();return notify(action==='eventReminder'?'已更新页面内提醒设置':'已更新收藏');}
      case 'myEventsTab':data.myEventsTab=Number(value);return render();
      case 'archiveDetail':{const index=data.eventArchives.findIndex(a=>a.id===value);if(index<0)return notify('未找到赛事记录');return dispatch('details:scoreHistory',String(index));}
      case 'seasonDetails':case 'seasonWeek':case 'seasonHistory':case 'eventTasks':return go(action);
      case 'claimEventTicket':if(weeklyArchives().length<3||data.weekTicketWeek===weekKey())return;data.ticket++;data.weekTicketWeek=weekKey();render();return notify('当周赛事券已到账');
      case 'eventTrust':t().auto=!t().auto;return render();case 'eventLeave':return showModal('当前赛事',`<p class="modal-copy">赛事按统一赛程进行。短暂离开可托管，重连回原桌；普通退赛后的评奖和费用处理仍需最终确认，本演示保留在赛状态。</p>`,b('继续比赛','closeModal','blue-button')+b('开启托管','enableEventTrust'));
      case 'enableEventTrust':t().auto=true;closeModal();return render();
      case 'eventRules':return showModal('赛事规则',`<p class="modal-copy">每轮4小局，汇总原始分排序，桌积分依次为8／5／2／0。并列均分占用名次积分，累计按实际精度排名。赛事分不进行金币输赢划转。</p><p class="modal-copy">报名 → 检录 → 统一分桌。小局10秒继续，本轮结束等待其他桌，新轮发布后3秒进入。正式结果确认后固定奖励自动发放。</p>`);
      case 'eventSchedule':return showModal('赛事进度',`<div class="modal-kv"><span>当前赛事</span><b>${e().name}</b></div><div class="modal-kv"><span>轮次 / 小局</span><b>第${t().round}轮 · ${t().hand} / 4</b></div><p class="modal-copy">每轮4小局。尚未完成本轮则继续原桌；完成后等待全部桌，再发布下一轮。比赛时间由画外“推进流程”模拟。</p>`);
      case 'eventScore':return showModal('成绩明细',`<div class="modal-kv"><span>当前累计桌积分</span><b>${t().points.toFixed(2)}</b></div><p class="modal-copy">每轮成绩及正式同分判定按赛事规则展示。临时赛果可在有效复核窗口申诉；本地演示不提交真实申诉。</p>`,b('查看申诉说明','appeal','blue-button'));
      case 'appeal':return showModal('申诉说明',`<p class="modal-copy">赛果发布后24小时内说明对应轮次、牌局及原因，提交后等待复核。未结案件继续复核，已正式确认的结果以最新决定为准。本地演示不发送数据。</p>`);
      case 'myEvents':return go('myEvents');case 'season':return go('season');case 'rewards':return go('rewards');
      case 'settings':return showModal('牌桌设置',`${[['sound','音效'],['music','背景音乐']].map(([key,label])=>`<div class="setting-row"><span>${label}</span>${b(data.settings[key]?'开启':'关闭','toggleSetting','switch',`data-value="${key}" aria-pressed="${data.settings[key]}"`)}</div>`).join('')}<p class="modal-copy">音效与背景音乐可分别开关，设置自动保存。</p>`);
      case 'toggleSetting':if(!['sound','music'].includes(value))return;data.settings[value]=!data.settings[value];return dispatch('settings');
      case 'back':return go(FieldNavigation.returnTarget(data,session.status),{replace:true});
      case 'reset':return showModal('重置演示',`<p class="modal-copy">恢复金币128,600及未报名状态，只清除这份网页的本地演示进度。</p>`,b('保留进度','closeModal','blue-button')+b('重置演示','confirmReset'));
      case 'confirmReset':cancelTimers();clearTimeout(toastTimer);$('#toast').classList.remove('visible');session=new FieldCore.Session();data=defaults();closeModal();return render();
      case 'fullscreen':if(document.fullscreenElement)return document.exitFullscreen?.();if(document.body.classList.contains('theater'))return largeView(false);if(!$('#frame').requestFullscreen)return largeView(true);return $('#frame').requestFullscreen().catch(()=>largeView(true));
      default:if(action.endsWith('Scenario')||['tableFailure','matchFailure','newReward'].includes(action))return scenario(action);
    }
  }
  window.FieldUI={handle(event){
    const button=event.target.closest('button[data-action]');if(!button||button.disabled)return;
    try{dispatch(button.dataset.action,button.dataset.value);}catch(error){showModal('当前操作未完成',`<p class="modal-copy">${error.message.replace(/[<>]/g,'')}。请返回当前流程重试。</p>`,b('返回当前流程','closeModal','blue-button'));}save();
  }};
  function resumeTimers() {
    if(session.status==='matching'){data.matchDeadline=data.matchDeadline||demoNow()+7800;later(seatCoin,remaining(data.matchDeadline));}
    if(session.status==='seated'){
      data.personalReadyDeadline=data.personalReadyDeadline||demoNow()+60000;data.roomReadyDeadline=data.roomReadyDeadline||demoNow()+120000;
      if(data.ready){data.dealDeadline=data.dealDeadline||demoNow()+3000;later(dealCoin,remaining(data.dealDeadline));}
      else later(readyTimeout,Math.min(remaining(data.personalReadyDeadline),remaining(data.roomReadyDeadline)));
    }
    if(t().status==='published'&&!t().error){t().entryDeadline=t().entryDeadline||demoNow()+3000;later(enterEventTable,remaining(t().entryDeadline));}
    if(t().status==='smallResult'){t().nextHandDeadline=t().nextHandDeadline||demoNow()+10000;later(nextHand,remaining(t().nextHandDeadline));}
  }
  window.addEventListener('storage',event=>{if(event.key===KEY&&event.newValue){try{restoreSaved(JSON.parse(event.newValue));cancelTimers();resumeTimers();closeModal();render();notify('已恢复另一标签页的最新演示进度');}catch{/* 忽略损坏存档，保留当前状态。 */}}});
  window.addEventListener('resize',resize);
  document.addEventListener('fullscreenchange',resize);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.open&&document.body.classList.contains('theater'))largeView(false);});
  if(!data.screen.startsWith('support')&&!data.screen.startsWith('details')){
    if(session.status==='playing') data.screen='coinPlay';
    if(session.status==='seated') data.screen='coinReady';
    if(session.status==='matching') data.screen='coinMatch';
  }
  resumeTimers();
  setInterval(()=>{if(!data.pauseAuto&&['coinReady','eventAllocating','eventSmallResult'].includes(data.screen))render();},1000);
  render();
})();
