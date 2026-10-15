/* 本地交互参考；业务来源和示例数值见 README.md。 */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const stage = $('#stage'), modal = $('#modal'), modalBody = $('#modal-body');
  const sheet = $('#sheet'), sheetBody = $('#sheet-body');
  let focusBeforeSheet, receivingStorage=false;
  const primaryScreens = new Set(['home','coinLobby','coinMatch','coinReady','coinPlay','eventCenter','eventTable']);
  const fmt = n => new Intl.NumberFormat('zh-CN').format(n);
  const signed = n => (n > 0 ? '+' : '') + fmt(n);
  const demoNow=()=>data.pauseAuto?(data.pausedAt||Date.now()):Date.now();
  const remaining=deadline=>FieldNavigation.remaining(deadline,demoNow());
  const FEE = 20, KEY = 'maluer-fields-20261013-v1';
  let fields = FieldCatalogue.fieldsFor('');
  const events = [
    { name:'新手杯', badge:'每日免费', prize:'冠军 100 金币', count:16, rounds:3, time:'今日 12:30', duration:'约 120 分钟', entry:'每日 1 次免费', award:100 },
    { name:'日常排位', badge:'实力排位', prize:'限定称号 · 头像框', count:16, rounds:4, time:'今日 20:00', duration:'约 160 分钟', entry:'微信小游戏免费', award:0 },
    { name:'周末锦标赛', badge:'任务券参赛', prize:'冠军 500 金币', count:64, rounds:4, time:'周六 19:00', duration:'周六资格赛 / 周日决赛', entry:'当周赛事券 ×1', award:500 }
  ];
  function dayKey(stamp=Date.now()){return new Date(stamp+8*3600000).toISOString().slice(0,10);}
  const freshTournament = () => ({ status:'none', round:1, hand:1, stage:0, checked:false, awarded:false, ticketUsed:false, noviceEntryUsed:false, error:false, auto:false, points:0, roundRecords:[] });
  const defaults = () => ({ screen:'home', lobbyStyle:'classic', field:2, game:0, profile:'', region:'郑州', detailTab:0, coinTab:0, ready:false,
    matchCount:1, selectedTile:-1, discard:'二万', history:[], event:0, filter:0,
    tournament:freshTournament(), previewEvent:0, eventArchives:[], noviceEntryDays:[], navStack:[], settings:{sound:true,music:false}, favourites:[], reminders:[], myEventsTab:0,
    lossDemo:false, offline:false, ticket:1, pauseAuto:false });
  let data = defaults(), session = new FieldCore.Session(), generation = 0, timers = [], focusBeforeModal, toastTimer;
  function restoreSaved(saved) {
    const candidate={...defaults(),...saved.data}, restored=FieldCore.Session.restore(JSON.stringify(saved.session));
    candidate.profile=saved.data.profile ?? (candidate.game===1?'red':candidate.game===2?'pdk':'');
    candidate.lobbyStyle=FieldLobby.get(candidate.lobbyStyle).id;
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
    data=candidate;session=restored;fields=FieldCatalogue.fieldsFor(data.profile);
  }
  try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved) restoreSaved(saved); } catch { /* 原子恢复，损坏存档不污染当前状态。 */ }
  const t = () => data.tournament;
  const e = () => events[data.event];
  const currentProfile=()=>FieldCatalogue.gamesFor(data.region).find(x=>x.id===data.profile)||FieldCatalogue.getProfile(data.profile)||FieldCatalogue.getProfile('');
  const gameName = () => (FieldCatalogue.groupFor(data.profile).id==='gouji'?'够级 · ':'')+(currentProfile().id===''&&data.region!=='郑州'?data.region+'麻将':currentProfile().name);
  function ensureCoinSelection(){
    if(session.status!=='idle'||data.screen!=='coinLobby')return;
    if(!FieldCatalogue.REGIONS.includes(data.region))data.region='郑州';
    if(!FieldCatalogue.isAvailable(data.region,data.profile)){
      data.profile=FieldCatalogue.gamesFor(data.region)[0].id;data.game=0;
      fields=FieldCatalogue.fieldsFor(data.profile);data.field=Math.max(0,FieldCatalogue.recommend(data.profile,session.available));data.fieldWindowStart=Math.max(0,data.field-3);
    }
  }
  function regionPicker(){
    const locked=session.status!=='idle'||!['none','final','finalTemp'].includes(t().status);
    const choices=FieldCatalogue.REGIONS.includes(data.region)?FieldCatalogue.REGIONS:[data.region,...FieldCatalogue.REGIONS];
    return `<label class="region-picker"><span>地区</span><select aria-label="切换地区" onchange="FieldUI.setRegion(this.value)" ${locked?'disabled':''}>${choices.map(x=>`<option value="${x}" ${x===data.region?'selected':''}>${x}</option>`).join('')}</select></label>`;
  }
  const playerCount=()=>currentProfile().players;
  const players=()=>['Pain','茶山客','清风','听雨','青竹','松间月'].slice(0,playerCount());
  const art=(index,cls='')=>`<span class="game-art art-${index} ${cls}" aria-hidden="true"></span>`;
  const richArt=(index,cls='')=>`<span class="rich-art rich-${index} ${cls}" aria-hidden="true"></span>`;
  const profileArt=g=>richArt(g.id==='red'?1:g.id==='pdk'?3:g.art===1?2:0,'mode-art');
  const fieldArt=index=>richArt((currentProfile().art===1?8:4)+Math.min(index,3),'field-illustration');
  const eventArt=index=>richArt(12+index,'hero-trophy event-art');
  function toolArt(action) {
    const shapes={
      rules:'<path d="M16 16h19c5 0 7 3 7 6v32c-2-4-5-5-9-5H16zM68 16H49c-5 0-7 3-7 6v32c2-4 5-5 9-5h17z"/><path d="M23 26h10m-10 8h10m18-8h10m-10 8h10"/>',
      eventRules:'<path d="M16 16h19c5 0 7 3 7 6v32c-2-4-5-5-9-5H16zM68 16H49c-5 0-7 3-7 6v32c2-4 5-5 9-5h17z"/><path d="M23 26h10m-10 8h10m18-8h10m-10 8h10"/>',
      help:'<path d="M19 42v-9a23 23 0 0 1 46 0v9"/><rect x="13" y="34" width="13" height="21" rx="6"/><rect x="58" y="34" width="13" height="21" rx="6"/><path d="M64 55q0 9-19 9"/><rect x="37" y="60" width="13" height="7" rx="3"/>',
      history:'<path d="M28 14h35v48H24V19h4z"/><path d="M31 28h24M31 37h24M31 46h16M24 62q-12 2-12-9v-7h12"/><path d="M39 14V9h13v5"/>',
      coinInfo:'<circle cx="42" cy="38" r="27"/><circle cx="42" cy="38" r="21"/><path d="M36 32h12v12H36zM20 63h44"/>',
      myEvents:'<path d="M27 15h30v21q0 16-15 16T27 36zM27 21H14v8q0 13 16 13M57 21h13v8q0 13-16 13M42 52v9M28 64h28"/><path d="m42 22 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z"/>',
      season:'<path d="m42 12 8 16 19 3-14 13 4 19-17-9-17 9 4-19-14-13 19-3z"/><path d="M42 22v26M32 37h20"/>',
      rewards:'<path d="M17 32h50v12H17zM21 44h42v21H21zM38 32v33h8V32M41 30q-25-4-19-16 10-10 19 16M43 30q25-4 19-16-10-10-19 16"/>'
    };
    return `<svg class="utility-art" viewBox="0 0 84 78" aria-hidden="true" focusable="false"><g fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${shapes[action]||shapes.rules}</g></svg>`;
  }

  const noviceLeft = (day=dayKey()) => data.noviceEntryDays.includes(day)?0:1;
  const b = (label,action,cls='gold-button',extra='') => `<button type="button" onclick="FieldUI.handle(event)" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
  const badge = (label,cls='') => `<span class="badge ${cls}">${label}</span>`;
  const trophy = `<span class="hero-trophy reward-art reward-trophy" aria-hidden="true"></span>`;
  const prizeUI = x => x.award ? `<small>冠军 </small><b>${fmt(x.award)} </b><span>金币</span>` : `<b class="prize-title">限定称号</b><span>主题头像框</span>`;
  const kv = (label,value,compact=false) => `<div class="kv ${compact?'compact':''}"><dt>${label}</dt><dd>${value}</dd></div>`;
  const tabs = (labels,action,active,cls='tabs-row') => `<div class="${cls}">${labels.map((label,i)=>b(label,action,i===active?'active':'',`data-value="${i}" aria-pressed="${i===active}"`)).join('')}</div>`;
  const sideTabs = active => `<div class="side-tabs flow-status" aria-label="金币场进度">${['真人匹配',session.status==='playing'?'牌局进行中':'准备开局','本局结果'].map((x,i)=>`<div class="${i===(active===1?0:active===0?1:2)?'active':''}">${x}</div>`).join('')}</div>`;
  function header(title,back='back',region=false) {
    return `<header class="game-header">${b('‹',back,'back','aria-label="返回"')}<h1 class="game-title">${title}</h1>${region?regionPicker():''}<div class="assetbar">${b('<span>房</span><b>433</b>','wallet','currency','aria-label="房卡余额433"')}${b(`<span>🪙</span><b>${fmt(session.coins)}</b>`,'supply','currency',`aria-label="金币余额${session.coins}"`)}${b('<span>💎</span><b>0</b>','wallet','currency','aria-label="钻石余额0"')}</div></header>`;
  }
  function footer(actions='',kind='coin') {
    const tools=kind==='tournament'?[['☷','赛事规则','eventRules'],['♜','我的赛事','myEvents'],['★','赛季排行','season'],['♢','我的奖励','rewards']]:[['☷','玩法规则','rules'],['?','帮助反馈','help'],['♜','战绩','history'],['▤','金币说明','coinInfo']];
    return `<footer class="footerbar">${tools.map(([icon,label,action])=>b(`<span class="round-icon">${toolArt(action)}</span>${label}`,action,'tool')).join('')}<div class="footer-actions">${actions}</div></footer>`;
  }
  const panel = (title,body,cls='body-panel') => `<section class="panel ${cls}"><div class="panel-title">${title}</div><div class="panel-content">${body}</div></section>`;
  const aside = (title,body) => panel(title,body,'aside-panel');
  const steps = (active,labels=['报名','检录','分桌','比赛','赛果']) => `<div class="steps">${labels.map((label,i)=>`<div class="step ${i===active?'active':''}">${i+1} · ${label}</div>`).join('')}</div>`;
  function save() { if(receivingStorage)return;try { localStorage.setItem(KEY,JSON.stringify({data,session})); } catch { /* file/隐私浏览模式保持当前内存状态。 */ } }
  function later(fn,ms) { if(data.pauseAuto)return;const token=generation; timers.push(setTimeout(()=>{ if(token===generation) fn(); },ms)); }
  function cancelTimers() { generation++; timers.forEach(clearTimeout); timers=[]; }
  function notify(message) { clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').classList.add('visible'); toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200); }
  function closeModal() { if(modal.open) modal.close(); }
  function showModal(title,body,actions='') {
    if(!modal.open) focusBeforeModal = document.activeElement;
    modal.style.width = '800px';
    modal.style.height = '600px';
    modalBody.innerHTML=`<h2 id="modal-title" class="modal-title">${title}</h2><div class="modal-content">${body}</div><div class="modal-actions">${actions}</div>`;
    if(!modal.open) modal.showModal();
    resize();
    (modal.querySelector('.modal-actions .blue-button') || modal.querySelector('.modal-close')).focus();
  }
  modal.addEventListener('close',()=>{ if(focusBeforeModal?.isConnected) focusBeforeModal.focus(); else stage.querySelector('button')?.focus(); });
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
    const floor=FieldCatalogue.fieldsFor(data.profile)[0].min;
    return FieldLobby.home({id:data.lobbyStyle,coins:session.coins,floor,region:regionPicker(),b,fmt,
      resume:session.status!=='idle'?`<button type="button" onclick="FieldUI.handle(event)" class="resume-banner home-resume" data-action="resumeCoin">${session.status==='playing'?'返回牌桌':'查看匹配'} ›</button>`:''});
  }
  function coinLobby() {
    ensureCoinSelection();
    const games=FieldCatalogue.gamesFor(data.region), status=session.status!=='idle';
    const layout='four';
    const lastStart=Math.max(0,fields.length-4);
    const start=Math.max(0,Math.min(lastStart,Number.isInteger(data.fieldWindowStart)?data.fieldWindowStart:Math.max(0,data.field-3)));
    data.fieldWindowStart=start;
    const paging=lastStart?`<nav class="field-pager" aria-label="场档翻页">${b('‹','fieldWindow','field-page-button',`data-value="0" aria-label="上一页场档" ${start===0||status?'disabled':''}`)}<span>${start===0?'1':'2'} / 2</span>${b('›','fieldWindow','field-page-button',`data-value="${lastStart}" aria-label="下一页场档" ${start===lastStart||status?'disabled':''}`)}</nav>`:'';
    const action=status?'resumeCoin':'startCoin';
    const label=status?(session.status==='playing'?'返回牌桌':session.status==='seated'?'进入准备桌':'查看匹配'):'快速开始';
    return header('金币场','home',true)+`<nav class="coin-game-tabs" aria-label="金币场玩法">${games.map(g=>b(`${profileArt(g)}<span>${g.name}</span>`,'profile',g.id===data.profile?'active':'',`data-value="${g.id}" aria-pressed="${g.id===data.profile}" ${status?'disabled':''}`)).join('')}</nav><section class="selection-body coin-select-content" aria-label="${gameName()} · ${playerCount()}人对局"><div class="coin-fields ${layout}">${fields.slice(start,start+4).map((f,j)=>{const i=start+j;return b(`${data.field===i?'<span class="field-selection-flag">当前选择</span>':''}<span class="entry-corner"><i class="gold-coin" aria-hidden="true"></i>${fmt(f.min)}<small>准入金币</small></span><span class="field-name">${f.name}</span><span class="field-base"><small>底分</small><strong>${fmt(f.base)}</strong></span>${fieldArt(i)}<span class="field-range">准入 ${fmt(f.min)}${Number.isFinite(f.max)?'～'+fmt(f.max-1):'以上'}</span><span class="field-population">在线 ${fmt([1286,932,468,128,96,32][i])}</span>`,'selectField',`field-card skin-${i%4} ${data.field===i?'active':''}`,`data-value="${i}" aria-label="${f.name}，准入金币${f.min}，底分${f.base}${data.field===i?'，当前选择':''}" aria-pressed="${data.field===i}"`);}).join('')}</div></section>${paging}`+footer(`<div class="coin-fee-note"><small>服务费</small><span>${FEE} 金币 / 局</span><small>成功发牌扣费</small></div><p class="coin-entry-note">开局后不可离桌<br>可开启托管</p>`+b(`<span class="coin-start-title">${label}</span><span class="coin-start-choice">${gameName()} · ${fields[data.field].name}</span><span class="coin-start-arrow" aria-hidden="true">›</span>`,action,'gold-button coin-start'));
  }
  function coinMatch() {
    return header('金币场')+`<section class="queue-scene"><div class="queue-heading"><span>真人匹配</span><strong>${gameName()} · ${fields[data.field].name}</strong><p>${data.matchCount} / ${playerCount()} 人已就位</p></div><div class="queue-seats count-${playerCount()}">${players().map((name,i)=>`<div class="queue-person ${i>=data.matchCount?'waiting':''}"><div class="avatar">${i>=data.matchCount?'<span class="queue-pulse" aria-hidden="true">···</span>':''}</div><strong>${i<data.matchCount?name:'等待玩家'}</strong><small>${i<data.matchCount?'已就位':'匹配中…'}</small></div>`).join('')}</div><div class="queue-info"><div><h3>底分 ${fmt(fields[data.field].base)} · 单局开赛</h3><p>预留服务费 ${FEE} 金币，发牌时扣除；发牌前取消全额释放。</p></div></div></section>`+footer(b('返回大厅','matchHome','blue-button')+b('取消匹配','cancelCoin','gold-button'));
  }
  function coinReady() {
    const seconds=Math.ceil(remaining(data.ready?data.dealDeadline:data.personalReadyDeadline)/1000);
    return tableHeader(false,true)+board(false)+`<section class="table-ready-stage" aria-label="准备开局"><p class="table-ready-count">${data.ready?playerCount():playerCount()-1} / ${playerCount()} 人已准备</p>${b(data.ready?'已准备 · 等待发牌':'准备开局',data.ready?'':'deal','gold-button table-ready-button',data.ready?'disabled':'')}<p class="table-ready-time">${data.ready?`全员已准备 · ${seconds} 秒后发牌`:`请准备 · 剩余 ${seconds} 秒`}</p><p class="table-fee-hint">成功发牌扣 ${FEE} 金币服务费</p></section>`;
  }
  function tableHeader(tournament=false,ready=false) {
    const auto=tournament?t().auto:session.auto;
    const room=tournament?e().name:gameName();
    const info=tournament?`第${t().round}轮 · 小局 ${t().hand} / 4 · 桌积分 ${t().points.toFixed(2)}`:`${fields[data.field].name} · 底分 ${fmt(fields[data.field].base)} · ${playerCount()}人`;
    return `<header class="table-topbar"><div class="table-room">${b('‹',ready?'cancelCoin':tournament?'eventLeave':'leaveCoin','table-back',`aria-label="${ready?'退出准备':'离开牌桌'}"`)}<div><h1>${room}</h1><p>${info}</p></div></div><nav class="table-header-tools" aria-label="牌桌操作">${b(`<i class="gold-coin" aria-hidden="true"></i>${fmt(session.coins)}`,'supply','table-wallet',`aria-label="金币余额${session.coins}"`)}${ready?'':b(auto?'取消托管':'开启托管',tournament?'eventTrust':'trust','table-trust-toggle',`aria-pressed="${auto}"`)}${b('⚙','settings','table-tool','aria-label="设置"')}${b('☰','tableMenu','table-tool','aria-label="牌桌菜单"')}</nav></header>`;
  }
  function tableMenu() {
    const tournament=['table','smallResult','roundWait'].includes(t().status);
    const items=tournament?[['赛程','eventSchedule'],['成绩','eventScore'],['赛事规则','eventRules'],['帮助反馈','help']]:[['玩法规则','rules'],['战绩','history'],['帮助反馈','help'],['金币说明','coinInfo']];
    const ready=session.status==='seated';
    return showModal('牌桌菜单',`<nav class="table-menu-grid" aria-label="牌桌工具">${items.map(([label,action])=>b(label,action,'blue-button')).join('')}</nav>`,b('继续游戏','closeModal','blue-button')+b(ready?'退出准备':'离开牌桌',ready?'cancelCoin':tournament?'eventLeave':'leaveCoin','gold-button'));
  }
  function mahjongFace(value) {
    const wan=/^([一二三四五六七八九])万$/.exec(value);
    if(wan)return `<span class="tile-number">${wan[1]}</span><small class="tile-suit">萬</small>`;
    return `<span class="tile-symbol ${value==='中'?'red':value==='發'?'green':value.includes('●')?'dots':''}">${FieldNavigation.escape(value)}</span>`;
  }
  const hand=['一万','一万','二万','三万','四万','五万','六万','七万','八万','●●','●●','發','中','中'];
  function board(playing,tournament=false) {
    if(!tournament&&currentProfile().art!==0)return pokerBoard(playing);
    const auto=tournament?t().auto:session.auto;
    const canPlay=playing&&!auto&&(!tournament||t().status==='table');
    return `<div class="table-canvas" data-playing="${playing}"><div class="table-glow"></div><div class="board-state"><span>${tournament?`${e().name} · 第${t().round}轮`:`${gameName()} · 单局`}</span><span>${playing?(tournament?`小局 ${t().hand} / 4`:'剩余牌 72'):'四人就位 · 等待准备'}</span></div>
      <div class="seat top"><div class="avatar"></div><div class="seat-label"><strong>茶山客</strong><span>${playing?'思考中':'已准备'}</span></div></div><div class="seat left"><div class="avatar"></div><div class="seat-label"><strong>听雨</strong><span>${playing?'进行中':'已准备'}</span></div></div><div class="seat right"><div class="avatar"></div><div class="seat-label"><strong>清风</strong><span>${playing?'进行中':'已准备'}</span></div></div><div class="seat me"><div class="avatar"></div><div class="seat-label"><strong>Pain</strong><span>${playing?(auto?'托管中':canPlay?'你的回合':'等待续局'):data.ready?'已准备':'待准备'}</span></div></div>
      ${playing?`<div class="tilebacks">${'<i></i>'.repeat(13)}</div><div class="tilebacks vertical">${'<i></i>'.repeat(13)}</div><div class="tilebacks vertical right">${'<i></i>'.repeat(13)}</div><div class="wind">東</div><div class="discard-pile"><span class="tile">${mahjongFace(data.discard)}</span><span class="tile bamboo">二条</span><span class="tile circle">●</span></div><div class="hand">${hand.map((x,i)=>b(mahjongFace(x),'tile',`tile ${i===data.selectedTile?'chosen':''} ${i===9||i===10?'circle':''}`,`data-value="${i}" aria-label="选择${x}第${i+1}张" ${!canPlay?'disabled':''}`)).join('')}</div>${data.selectedTile>=0&&canPlay?`<div class="floating-actions">${b('出牌','discard','gold-button')}</div>`:''}`:''}
      ${tournament&&!['table'].includes(t().status)?`<div class="table-waiting-message">${t().status==='smallResult'?'等待下一小局':'本轮已结束，等待赛事更新'}</div>`:''}
      ${playing&&auto?`<div class="trust-overlay"><div><h2 class="heading">${data.offline?'离线代打中':'正在托管'}</h2><p>原座位与手牌保留</p>${b(data.offline?'重新连接':'取消托管',tournament?'eventTrust':data.offline?'reconnect':'trust','blue-button small')}</div></div>`:''}</div>`;
  }
  const pokerCards=['♠A','♥A','♣K','♦K','♠Q','♥J','♣10','♦9','♠8','♥7','♣6','♦5','♠4','♥3','♣3','♦2','♠2','♣A','♦A','♥Q'];
  const seatPoints={3:[[2.5,78],[3,22],[90,22]],4:[[2.5,78],[3,42],[47,10],[90,42]],6:[[2.5,78],[3,43],[24,11],[47,8],[72,11],[90,43]]};
  function pokerBoard(playing){
    const count=playerCount(),phase=data.pokerPhase||'play',canPlay=playing&&!session.auto&&phase==='play';
    const cards=Array.from({length:count===6?35:count===4?27:data.pokerLord?20:17},(_,i)=>pokerCards[i%pokerCards.length]);
    const phaseActions=phase==='bid'?b('不叫','pokerBid','blue-button','data-value="0"')+[1,2,3].map(n=>b(n+'分','pokerBid','gold-button',`data-value="${n}"`)).join(''):b('不加倍','pokerDouble','blue-button','data-value="0"')+b('加倍','pokerDouble','gold-button','data-value="1"');
    return `<div class="table-canvas poker-table" data-playing="${playing}"><div class="table-glow"></div><div class="board-state"><span>${gameName()} · ${fields[data.field].name}</span><span>${count}人 · ${playing?'本局进行中':'等待准备'}</span></div>${players().map((name,i)=>`<div class="poker-seat ${i===0?'self':''}" style="left:${seatPoints[count][i][0]}%;top:${seatPoints[count][i][1]}%"><div class="avatar"></div><strong>${name}</strong><small>${i===0?(playing?(session.auto?'托管中':'你的回合'):data.ready?'已准备':'待准备'):playing?`剩余 ${count===6?35:count===4?27:17}张`:'已准备'}</small></div>`).join('')}${playing?`${phase!=='play'?`<div class="poker-phase"><strong>${phase==='bid'?'叫地主':'选择加倍'}</strong><span>${phase==='bid'?'选择本局叫分':'地主已确定 · 加倍后开始出牌'}</span>${session.auto?'':`<div>${phaseActions}</div>`}</div>`:''}<div class="poker-discards ${phase!=='play'?'hidden':''}"><span>${data.pokerDiscard||'♠7'}</span><span>♥7</span></div><div class="poker-hand" style="--card-gap:${(1420-100)/(cards.length-1)-100}px">${cards.map((x,i)=>b(`<small>${x[1]}${x.slice(2)}</small><strong>${x[0]}</strong>`,'tile',`playing-card ${/[♥♦]/.test(x)?'red':''} ${data.selectedTile===i?'chosen':''}`,`data-value="${i}" aria-label="选择${x}" ${!canPlay?'disabled':''}`)).join('')}</div>${canPlay?`<div class="poker-actions">${b('不出','pass','blue-button')}${b('提示','hint','blue-button')}${b('出牌','discard','gold-button',data.selectedTile<0?'disabled':'')}</div>`:''}`:''}${playing&&session.auto?`<div class="trust-overlay"><div><h2 class="heading">正在托管</h2><p>原座位与手牌保留</p>${b('取消托管','trust','blue-button small')}</div></div>`:''}</div>`;
  }
  function coinPlay() {
    return tableHeader()+board(true);
  }
  function coinResult() {
    const r=session.result; if(!r) return emptyPage('本局结果','暂无结算结果','完成一局后在这里查看金币明细。','coin');
    const others=playerCount()-1,share=-r.net/others;
    const rows=players().map((name,i)=>i===0?[name,r.net,r.actual,r.shortfall]:[name,Math.trunc(share)+(i===others?-r.net-Math.trunc(share)*others:0),Math.trunc(share)+(i===others?-r.net-Math.trunc(share)*others:0),0]);
    return header('本局结果')+panel(`${gameName()} · ${fields[data.field].name}`,`<div class="coin-result-banner">${richArt(r.net>0?12:4)}<div><small>${r.net>0?'本局获胜':'本局结束'}</small><strong class="coin-result-value ${r.actual>=0?'positive':'negative'}">${signed(r.actual)} <small>金币</small></strong></div></div><div class="result-account-line"><span><small>本局本金</small><strong>${fmt(r.principal)}</strong></span><span><small>服务费</small><strong>${r.fee} 金币</strong></span><span><small>当前余额</small><strong>${fmt(session.coins)}</strong></span></div><table class="result-table coin-result-table"><thead><tr><th>玩家</th><th>规则净输赢</th><th>实际金币</th><th>系统补差</th></tr></thead><tbody>${rows.map(([name,net,actual,gap],i)=>`<tr class="${i===0?'me':''}"><td><span class="result-avatar avatar" aria-hidden="true"></span>${name}</td><td class="${net>=0?'positive':'negative'}">${signed(net)}</td><td class="${actual>=0?'positive':'negative'}">${signed(actual)}</td><td>${fmt(gap)}</td></tr>`).join('')}</tbody></table><div class="result-foot"><span>本局已结束，再来一局将重新验资匹配。</span>${b('结算明细','settlement','blue-button small')}</div>`,'body-panel coin-result-panel')+footer(b('返回选场','coin','blue-button')+b('再来一局','againCoin','gold-button'));
  }
  function emptyPage(title,heading,copy,action='back') { return header(title)+panel(title,`<div class="empty-state"><div class="icon">♧</div><h2>${heading}</h2><p>${copy}</p>${b('返回',action,'blue-button')}</div>`)+footer(); }
  function supply() {
    return header('金币补给')+panel('获取金币',`<div class="account-strip">可用金币 ${fmt(session.available)} ${session.principal?`／ 本局锁定 ${fmt(session.principal)}`:''}</div><div class="supply-grid" style="margin-top:25px">${[['☀','七日茶约','每日签到，VIP额外获得20%金币','activity'],['☕','茶歇好礼','完成活动要求后获得奖励','activity'],['🪙','金币商城','查看金币礼包与到账记录','shop']].map(([icon,name,copy,action])=>`<div class="supply-card"><div class="icon">${icon}</div><h3>${name}</h3><p>${copy}</p>${b('查看',action,'gold-button small')}</div>`).join('')}</div>`)+footer();
  }
  function history() {
    return header('金币战绩')+panel('单局记录',data.history.length?`<div class="history-list">${data.history.slice().reverse().map(r=>`<div class="history-row"><div>${r.game} · ${r.field}<br><span>${r.time} · 服务费 ${r.fee}</span></div><strong>${signed(r.actual)} 金币</strong></div>`).join('')}</div>`:`<div class="empty-state"><div class="icon">♜</div><h2>还没有单局记录</h2><p>完成金币牌局后，结算明细会保存在这里。</p>${b('返回金币场','coin','gold-button')}</div>`)+footer();
  }
  function eventCenter() {
    const list=data.filter===1?[0,1]:data.filter===2?[2]:[0,1,2];
    return header('比赛场','home',true)+`<div class="competition-content"><div class="competition-filters">${['全部赛事','每日赛事','周末赛事'].map((x,i)=>b(x,'eventFilter',i===data.filter?'active':'',`data-value="${i}" aria-pressed="${i===data.filter}"`)).join('')}<span class="region">${data.region} · 四人麻将</span></div>${t().status!=='none'?`<button type="button" onclick="FieldUI.handle(event)" class="event-resume" data-action="eventResume">${e().name} · ${eventStatus()}　查看当前进度 ›</button>`:''}<div class="event-grid">${list.map(i=>{const x=events[i],status=eventState(i),action=eventAction(status);return `<article class="event-card event-style-${i}">${badge(status==='none'?x.badge:eventStatus(status))}<h2 class="event-name">${x.name}</h2>${eventArt(i)}<strong class="prize tournament-prize">${prizeUI(x)}</strong><p class="event-summary"><strong>${x.time}</strong><span class="event-entry">${x.entry}</span><span>${x.count} 人 · ${i===2?'分阶段晋级':`${x.rounds}轮瑞士制`}</span></p>${b((status==='none'?'查看赛事':action.label)+' ›',status==='none'?'eventDetail':action.action,'gold-button',`data-value="${i}"`)}</article>`;}).join('')}</div></div>`+footer('', 'tournament');
  }
  function eventStatus(status=t().status) { return ({none:'尚未报名',registered:'已报名 · 待检录',standby:'候补第 3 位',checkin:'可检录',allocating:'候场分桌',published:'分桌已发布',table:'比赛进行中',smallResult:'小局结束',roundWait:'轮次结束 · 等待汇总',finalTemp:'临时赛果 · 待复核',final:'正式赛果',eliminated:'已结束参赛'})[status] || '状态查询中'; }
  function eventState(index) {return index===data.event&&!(index===0&&t().status==='final'&&t().entryDay!==dayKey())?t().status:'none';}
  function eventAction(status) {
    if(status==='none')return {label:'报名参赛',action:'register'};
    if(status==='checkin')return {label:'立即检录',action:'checkin'};
    const label=({registered:'查看报名',standby:'查看候补',allocating:'查看分桌',published:'查看分桌',table:'返回比赛',smallResult:'查看本局结果',roundWait:'查看轮次进度',finalTemp:'查看赛果',final:'查看赛果',eliminated:'查看赛果'})[status]||'查看当前进度';
    return {label,action:'eventResume'};
  }

  function eventOverview(index,status,shortcuts=false) {
    const x=events[index];
    return `<div class="event-overview detail-hero">${badge(x.badge)}<h2 class="event-name">${x.name}</h2>${eventArt(index)}<strong class="prize tournament-prize">${prizeUI(x)}</strong><p class="event-start-time">${x.time}</p><p>${x.count} 人参赛 · ${x.entry}${index===0?`<br>今日免费次数剩余 ${noviceLeft()} / 1`:''}</p>${badge(status==='none'?(index===0&&!noviceLeft()?'今日资格已使用':'报名开放'):eventStatus(status),'blue')}${shortcuts?`<div class="detail-shortcuts">${b(data.favourites.includes(index)?'★ 已收藏':'☆ 收藏','eventFavourite','blue-button small')}${b(data.reminders.includes(index)?'已提醒':'开赛提醒','eventReminder','blue-button small')}</div>`:''}</div>`;
  }

  function eventDetail() {
    const index=data.previewEvent, x=events[index], status=eventState(index);
    const schedule=index===2?`<div class="timeline"><strong class="time">周六 18:25</strong><p>停止报名</p><strong class="time">18:30—18:50</strong><p>检录开放</p><strong class="time">18:50 / 18:55</strong><p>选择64/32人方案 / 锁名单</p><strong class="time">19:00</strong><p>资格赛开赛</p><strong class="time">周日 14:00</strong><p>十六强开赛，结束20分钟后决赛</p></div>`:`<div class="timeline"><strong class="time">${x.time}</strong><p>正式开赛<br><small>${x.duration}，另留缓冲时间</small></p><strong class="time">赛前 10 分</strong><p>停止报名，开放检录</p><strong class="time">赛前 5 分</strong><p>原名单检录截止</p><strong class="time">赛前 3 分</strong><p>满员锁定名单，发布赛程</p></div>`;
    const info=[schedule,
      `<div class="rewards"><table class="event-prize-table"><thead><tr><th>名次 / 条件</th><th>每位玩家奖励</th></tr></thead><tbody>${(index===0?[['冠军','100 金币'],['第 2—4 名','60 金币'],['第 5—16 名','20 金币']]:index===1?[['冠军','7 天称号'],['前三名','7 天主题头像框'],['正常完赛','赛季积分']]:[['冠军','500 金币'],['第 2—4 名','300 金币'],['第 5—16 名','120 金币'],['其他正常完赛','40 金币']]).map(([a,c])=>`<tr><td>${a}</td><td><strong>${c}</strong></td></tr>`).join('')}</tbody></table><p class="subcopy">正式赛果确认后，固定奖励自动到账。临时排名不提前发奖。</p></div>`,
      `<ul class="rule-list"><li>${index===2?'64人资格赛 → 16强 → 4人决赛。人数不足时按正式方案处理。':`${x.rounds}轮瑞士制，每轮4小局，按轮次桌积分累计排名。`}</li><li>赛事牌局只记比赛成绩，不使用金币场输赢结算。</li><li>检录后由赛事统一分桌，名单锁定后不补新玩家。</li><li>结果先展示临时排名，经24小时申诉复核后确认；未结案件继续复核。</li></ul>`][data.detailTab];
    const action=eventAction(status),main=status==='none'&&index===0&&!noviceLeft()?b('今日免费次数已用完','','neutral-button','disabled'):b(action.label,action.action);
    return header('赛事详情')+`<section class="panel body-panel"><div class="detail-layout">${eventOverview(index,status,true)}<div class="detail-information">${tabs(['赛程','奖励','规则'],'detailTab',data.detailTab)}<div class="detail-scroll">${info}</div></div></div></section>`+footer(b('我的赛事','myEvents','blue-button')+main,'tournament');
  }
  function eventRegistered() {
    const status=t().status, check=status==='checkin';
    return header('赛事报名','eventCenter')+`<section class="event-status-layout">${eventOverview(data.event,status)}<div class="event-status-card"><div class="event-state-symbol" aria-hidden="true">✓</div><h2 class="heading">${check?'检录已开放':'报名成功'}</h2><p class="subcopy">${check?'请在检录截止前确认到场。':'检录开放后，在此确认到场。'}</p><div class="event-status-facts"><div><span>参赛席位</span><strong>正式席位</strong></div><div><span>开赛时间</span><strong>${e().time}</strong></div><div><span>当前进度</span><strong>${check?'等待本人检录':'等待检录开放'}</strong></div></div><p class="event-state-note">${data.event===2?'赛事券已锁定，锁名单后实扣一次。':data.event===0?'满员锁定名单时消耗本日1次免费资格，此前取消不消耗。':'免费赛事，报名不扣金币。'}</p></div></section>`+footer(b('取消报名','cancelRegistration','blue-button')+b('查看详情','currentDetail','blue-button')+b(check?'立即检录':'等待检录',check?'checkin':'','gold-button',check?'':'disabled'),'tournament');
  }
  function eventStandby() {
    return header('赛事候补','eventCenter')+`<section class="event-status-layout">${eventOverview(data.event,t().status)}<div class="event-status-card"><div class="event-state-symbol" aria-hidden="true">3</div><h2 class="heading">候补第 3 位</h2><p class="subcopy">正式席位已满，正在等候空余席位。</p><div class="event-status-facts"><div><span>候补人数</span><strong>8 / 16 人</strong></div><div><span>转正方式</span><strong>收到通知后确认参赛</strong></div></div><p class="event-state-note">候补不占正式席位、不锁定报名资源。转正需在通知有效期内确认。</p></div></section>`+footer(b('查看详情','currentDetail','blue-button')+b('取消候补','cancelStandby','gold-button'),'tournament');
  }
  function eventAllocating() {
    const published=t().status==='published',count=data.event===2?[64,16,4][t().stage]:e().count;
    const seconds=Math.ceil(remaining(t().entryDeadline)/1000);
    const state=t().error?`<div class="event-state-symbol" aria-hidden="true">!</div><h2 class="heading">牌桌连接未完成</h2><p class="subcopy">分桌已生效，重试将返回第${t().round}轮原桌。</p>${b('重试原桌','retryTable','gold-button')}`:published?`<h2 class="heading">第${t().round}轮分桌已发布</h2><div class="assigned-table"><small>本人牌桌</small><strong>${t().round+1}<small>号桌 · 东位</small></strong></div><div class="assigned-players">${players().slice(0,4).map(n=>`<div><span class="avatar" aria-hidden="true"></span><strong>${n}</strong></div>`).join('')}</div><p class="subcopy">${seconds} 秒后自动进入牌桌</p>`:`<div class="spinner" aria-label="分桌中"><i></i><i></i><i></i><i></i></div><h2 class="heading">检录完成，正在分桌</h2><p class="subcopy">第${t().round}轮 · 已检录 ${count} / ${count} 人</p><p class="event-state-note">分桌发布后自动进入牌桌，请稍候。</p>`;
    return header('候场分桌','eventCenter')+`<section class="event-status-layout">${eventOverview(data.event,t().status)}<div class="event-status-card">${state}</div></section>`+footer(b('赛程详情','eventSchedule','blue-button'),'tournament');
  }
  function eventTable() {
    return tableHeader(true)+board(true,true);
  }
  function eventSmallResult() {
    const seconds=Math.ceil(remaining(t().nextHandDeadline)/1000);
    return header('小局结果','eventTable')+panel(`${e().name} · 第${t().round}轮 第${t().hand}小局`,`<div class="score-ribbon"><div><small>本小局原始分</small><strong class="positive">+18</strong></div><div><small>本轮累计原始分</small><strong>${signed(18*t().hand)}</strong></div><div><small>本轮进度</small><strong>${t().hand}<small> / 4 小局</small></strong></div></div><table class="result-table"><thead><tr><th>玩家</th><th>本局原始分</th><th>本轮累计</th></tr></thead><tbody>${[['Pain',18],['茶山客',-4],['清风',-6],['听雨',-8]].map(([n,v],i)=>`<tr class="${i===0?'me':''}"><td><span class="result-avatar avatar" aria-hidden="true"></span>${n}</td><td class="${v>=0?'positive':'negative'}">${signed(v)}</td><td>${signed(v*t().hand)}</td></tr>`).join('')}</tbody></table><p class="subcopy">${seconds} 秒后继续下一小局。</p>`,'body-panel event-result-panel')+footer(b('成绩明细','eventScore','blue-button'),'tournament');
  }
  function eventRoundWait() {
    return header('轮次结果','eventTable')+panel(`${e().name} · 第${t().round}轮`,`<div class="waiting-message">成绩确认中 · 已完成 ${data.event===2?['12 / 16','3 / 4','1 / 1'][t().stage]:'3 / 4'} 桌，等待统一发布赛程</div><div class="score-ribbon"><div><small>本轮原始分</small><strong>+72</strong></div><div><small>本轮桌积分</small><strong>8.00</strong></div><div><small>累计桌积分</small><strong>${t().points.toFixed(2)}</strong></div></div><table class="result-table small"><thead><tr><th>本桌排名</th><th>玩家</th><th>四小局原始分</th><th>桌积分</th></tr></thead><tbody>${[['Pain',72,8],['茶山客',-16,5],['清风',-24,2],['听雨',-32,0]].map(([n,v,points],i)=>`<tr class="${i===0?'me':''}"><td><span class="result-rank">${i+1}</span></td><td><span class="result-avatar avatar" aria-hidden="true"></span>${n}</td><td class="${v>=0?'positive':'negative'}">${signed(v)}</td><td>${points.toFixed(2)}</td></tr>`).join('')}</tbody></table>`,'body-panel event-result-panel round-wait-panel')+footer(b('查看成绩','eventScore','blue-button'),'tournament');
  }
  function eventFinal() {
    const final=t().status==='final', x=e(), eliminated=t().eliminated, amount=eventAward();
    return header('总赛果','eventCenter')+panel(x.name,`<div class="result-hero"><div class="winner-banner">${final&&!eliminated?trophy:'<div class="provisional-mark">'+(eliminated?'✓':'…')+'</div>'}<h2>${eliminated?(final?'本人赛事结束':'本人已完赛'):final?'冠军':'暂列第 1 名'}</h2><p>Pain<br>累计桌积分 ${t().points.toFixed(2)}</p>${badge(final?'正式结果':eliminated?'等待全赛结束 · 待复核':'临时排名 · 待复核',final?'green':'')}</div><div class="rewards"><h2 class="heading sm">${final?'赛事结果已确认':'结果复核中'}</h2><div class="reward-line"><span>赛季积分</span><strong>${final?`+ ${t().seasonPoints||135}`:'待确认'}</strong></div>${amount?`<div class="reward-line"><span>固定金币奖励</span><strong>${amount} 金币</strong>${badge(final?'已自动到账':'待复核',final?'green':'gray')}</div>`:''}${data.event===1&&!eliminated?`<div class="reward-line"><span>称号奖励</span>${badge(final?'已发放':'待确认',final?'green':'gray')}</div>`:''}<p class="subcopy">${final?'固定奖已自动发放，可在我的奖励查看记录。':'全赛结束并完成复核后确认排名与奖励；申诉窗口24小时，未结案件继续复核。'}</p>${b('成绩明细 / 申诉','eventScore','blue-button small')}</div></div>`)+footer(b('我的奖励','rewards','blue-button')+b('返回赛事中心','eventCenter','gold-button'),'tournament');
  }
  function myEvents() {
    const archives=data.eventArchives.slice().reverse();
    const current=t().status==='none'?`<div class="empty-state"><div class="icon">♜</div><h2>还没有报名赛事</h2><p>先查看赛事详情，再确认报名。</p>${b('查看比赛','eventCenter','gold-button')}</div>`:`<div class="my-event-card">${eventArt(data.event)}<div><h2 class="heading">${e().name}</h2><p class="subcopy">${e().time} · ${eventStatus()}</p>${badge(e().entry,'blue')}</div>${b('查看进度','eventResume','gold-button')}</div>`;
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
    get data(){return data;},get session(){return session;},get t(){return t();},get e(){return e();},get gameName(){return gameName();},get profile(){return currentProfile();},get fields(){return fields;},events};
  const support=FieldSupport.create(ctx), details=FieldDetails.create(ctx);
  Object.assign(pages,support.pages,details.pages);Object.assign(labels,support.labels,details.labels);
  function supportSupply(){
    const view=support.supplyView(),r=view.r,f=fields[data.field],entry=FieldCatalogue.entryStatus(session,f),locked=session.principal>0;
    const title=locked?'本局金币已锁定':entry.kind==='over'?'金币超过场档上限':entry.kind==='shortage'?'金币不足':'金币补给';
    const info=locked?`本局本金 ${fmt(session.principal)} 金币，结算后释放。`:entry.kind==='over'?`本场金币上限 ${fmt(f.max-1)}，请选择更高场档。`:`${gameName()} · ${f.name}最低准入 ${fmt(f.min)} 金币`;
    const packages=entry.kind!=='over'&&!locked;
    return header(title)+`<section class="supply-redesign"><p class="supply-target">${info}</p><div class="supply-metrics"><div><small>可用金币</small><strong><i class="gold-coin"></i>${fmt(session.available)}</strong></div><div><small>${locked?'锁定本金':entry.kind==='over'?'本场上限':'还差金币'}</small><strong>${fmt(locked?session.principal:entry.kind==='over'?f.max-1:entry.gap)}</strong></div></div><div class="refill-grid"><article>${art(5)}<h2>金币救济</h2><strong>60 <small>金币</small></strong><p>${view.reason}</p>${r.pending?b('查看到账状态','support:resolveReward','blue-button',`data-value="${r.pending.id}"`):b(r.eligible?'领取60金币':'暂不符合救济','support:relief','gold-button',r.eligible?'':'disabled')}</article><article>${richArt(15)}<h2>${packages?'金币礼包':'原场次'}</h2><strong>${packages?'3,000 起':'继续原进度'}</strong><p>${packages?'购买金币直接到账，赠币已计入总额。':locked?'托管期间原局继续，不能另开实时对局。':'金币已高于本场上限，无需继续补币。'}</p>${b(packages?'查看礼包':locked?'返回牌桌':'重新选场',packages?'coinPackages':locked?'resumeCoin':'returnSelection','gold-button')}</article><article><span class="reward-art reward-chest refill-gift" aria-hidden="true"></span><h2>每日好礼</h2><strong>签到领金币</strong><p>签到、茶歇、回访和翻牌各自领取。</p>${b('查看活动','support:activities','blue-button')}</article></div><p class="refill-status" role="status">${FieldNavigation.escape(view.s.message||'到账后保留原选择，不自动开始游戏。')}</p></section>`+footer(b('商城','support:shop','blue-button supply-shop-link')+b(locked?'返回牌桌':'返回选场',locked?'resumeCoin':'returnSelection','blue-button'));
  }
  function coinPackages(){return header('金币礼包')+`<section class="package-layout"><div class="package-caption">购买金币 · 赠币包含在到账总额内</div><div class="package-grid">${FieldCatalogue.PACKS.map((pack,i)=>`<article>${art(i>2?3:5)}<h2>${fmt(pack.coins)} <small>金币</small></h2><p>${pack.bonus?`含赠币 ${fmt(pack.bonus)}`:'基础金币，无额外赠送'}</p>${b(`¥ ${pack.price}`,'packOrder','gold-button',`data-value="${i}"`)}</article>`).join('')}</div></section>`+footer(b('返回补给','returnSupply','blue-button'));}
  function coinPurchase(){const order=(data.coinOrders||[]).find(o=>o.id===data.packOrder?.id),pack=FieldCatalogue.PACKS[order?.pack];if(!pack)return emptyPage('金币订单','未找到订单','请返回礼包重新选择。');const paid=order.status==='paid';return header(paid?'金币已到账':'确认购买')+`<section class="purchase-layout">${art(3)}<h2>${paid?'购买成功':'金币礼包'}</h2><strong>${fmt(pack.coins)} 金币</strong><p>${paid?`当前可用金币 ${fmt(session.available)} · ${session.principal?'本局本金不增加':'返回原选场重新验资'}`:`支付金额 ¥${pack.price} · 含赠币 ${fmt(pack.bonus)}金币`}</p><small>订单 ${order.id.replace('coin-order-','')}</small></section>`+footer(b('返回礼包','coinPackages','blue-button')+b(paid?'返回原选场':'确认支付',paid?'returnSelection':'payPack','gold-button'));}
  Object.assign(pages,{supportSupply,coinPackages,coinPurchase});Object.assign(labels,{coinPackages:'金币礼包',coinPurchase:'金币订单'});
  let renderedBaseMarkup='';
  function animateContent(root,screen) {
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const cards=screen==='coinLobby'?root.querySelectorAll('.field-card'):screen==='eventCenter'?root.querySelectorAll('.event-card'):[];
    const contents=cards.length?cards:root.querySelectorAll(':scope > :not(header):not(footer):not(nav):not(.flow-status):not(.aside-panel)');
    [...contents].forEach((node,index)=>node.animate?.([
      {opacity:0.25,translate:'0 12px'},{opacity:1,translate:'0 0'}
    ],{duration:200,delay:cards.length?index*28:0,easing:'cubic-bezier(.2,.7,.2,1)',fill:'backwards'}));
  }
  function render() {
    const focusedAction=document.activeElement?.dataset?.action,focusedValue=document.activeElement?.dataset?.value;
    const screen=pages[data.screen]?data.screen:'home'; data.screen=screen;
    const windowed=!primaryScreens.has(screen);
    const base=windowed?sheetBase():screen;
    if(windowed&&!sheet.open)focusBeforeSheet=document.activeElement;
    stage.className=`stage ${['coinReady','coinPlay','eventTable'].includes(base)?'gameplay':base==='home'?'lobby-'+FieldLobby.get(data.lobbyStyle).id:'soft'} ${base==='coinLobby'?'coin-select':''}`;
    const chooser=$('#lobby-chooser');
    if(chooser){chooser.hidden=screen!=='home';chooser.innerHTML=screen==='home'?FieldLobby.chooser(data.lobbyStyle,b):'';}
    $('#viewport').classList.toggle('with-lobby-chooser',screen==='home');
    const baseChanged=stage.dataset.screen!==base,baseMarkup=pages[base]();
    if(renderedBaseMarkup!==baseMarkup){stage.innerHTML=baseMarkup;renderedBaseMarkup=baseMarkup;}
    stage.dataset.screen=base;
    if(baseChanged&&!windowed)animateContent(stage,base);
    if(windowed){
      const changed=sheetBody.dataset.screen!==screen;
      sheetBody.innerHTML=pages[screen]();sheetBody.dataset.screen=screen;
      sheet.style.width='1280px';sheet.style.height='860px';
      sheetBody.classList.toggle('has-side',!!sheetBody.querySelector('nav.side-tabs'));
      sheetBody.classList.toggle('has-aside',!!sheetBody.querySelector('.aside-panel'));
      sheetBody.classList.toggle('no-actions',!sheetBody.querySelector('.footer-actions button'));
      sheetBody.querySelector('.back')?.setAttribute('aria-label','关闭弹板');
      sheet.setAttribute('aria-label',labels[screen]||'游戏弹板');
      if(!sheet.open){sheet.showModal();sheetBody.querySelector('.back')?.focus();}
      else if(changed)(sheetBody.querySelector('nav.side-tabs button.active')||sheetBody.querySelector('.back'))?.focus();
      else if(focusedAction)[...sheetBody.querySelectorAll('button[data-action]')].find(x=>x.dataset.action===focusedAction&&x.dataset.value===focusedValue)?.focus();
      if(changed)animateContent(sheetBody,screen);
    }else if(sheet.open)sheet.close();
    document.title=`${labels[screen]} · 麻溜儿麻将`;
    save(); resize();
  }
  function sheetBase(){
    if(session.status!=='idle')return activeCoinScreen();
    if(['table','smallResult','roundWait'].includes(t().status))return 'eventTable';
    if(data.screen==='coinResult')return 'coinLobby';
    const base=(data.navStack||[]).slice().reverse().find(x=>primaryScreens.has(x));
    if(['coinMatch','coinReady','coinPlay'].includes(base))return 'coinLobby';
    return base||((data.screen.startsWith('event')||['myEvents','season','rewards'].includes(data.screen))?'eventCenter':'home');
  }
  function resize() {
    const frame=$('#frame'), full=document.fullscreenElement===frame;
    const scale=full?Math.min(frame.clientWidth/1920,frame.clientHeight/1080):frame.clientWidth/1920;
    stage.style.transform=`scale(${scale})`; stage.style.left=full?`${(frame.clientWidth-1920*scale)/2}px`:'0'; stage.style.top=full?`${(frame.clientHeight-1080*scale)/2}px`:'0';
    const r=frame.getBoundingClientRect();
    for(const [dialog,width,height] of [[sheet,parseFloat(sheet.style.width)||1200,parseFloat(sheet.style.height)||820],[modal,parseFloat(modal.style.width)||800,modal.offsetHeight||600]]){
      dialog.style.transform=`scale(${scale})`;
      dialog.style.left=`${r.left+(r.width-width*scale)/2}px`;
      dialog.style.top=`${r.top+(r.height-Math.min(height,900)*scale)/2}px`;
    }
    if(data.screen==='home')$('#lobby-chooser')?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({block:'nearest',inline:'nearest'});
  }
  new ResizeObserver(resize).observe($('#frame'));
  function startCoin() {
    if(session.status!=='idle') return go(activeCoinScreen());
    if(t().eliminated&&t().status!=='final')return showModal('赛事进度尚未关闭','<p class="modal-copy">本人已完赛，等待全赛结果确认。可查看记录与活动，正式确认后再参与新对局。</p>',b('查看赛事','eventResume'));
    if(t().status!=='none'&&!['final','finalTemp','registered','standby'].includes(t().status)) return showModal('先处理当前赛事',`<p class="modal-copy">请先完成检录或当前赛事，本次不发起金币匹配。</p>`,b('返回赛事','eventResume'));
    const f=fields[data.field], entry=FieldCatalogue.entryStatus(session,f);
    if(entry.kind!=='eligible')return go('supportSupply');
    return queueCoin();
  }
  function queueCoin() {
    if(session.status!=='idle') return;
    const f=fields[data.field];if(session.coins<f.min||session.coins>=f.max)return startCoin();
    session.queue(FEE); data.matchCount=1; data.ready=false; data.lossDemo=false; data.matchDeadline=demoNow()+7800; data.matchExpiry=demoNow()+120000; closeModal(); cancelTimers(); go('coinMatch');
    Array.from({length:playerCount()-1},(_,i)=>i+2).forEach((n,i)=>later(()=>{if(session.status!=='matching')return;data.matchCount=n;save();if(data.screen==='coinMatch')render();},1100*(i+1)));
    later(seatCoin,7800);
  }
  function seatCoin() {
    if(session.status!=='matching') return; cancelTimers(); session.seat(); data.matchCount=playerCount(); data.ready=false;
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
    cancelTimers();session.deal();data.pokerLord=false;data.pokerPhase=FieldCatalogue.groupFor(data.profile).id==='ddz'?'bid':'play';data.pokerPhaseDeadline=demoNow()+5000;data.selectedTile=-1;data.playDeadline=demoNow()+30000;flowGo('coinPlay');resumeTimers();
  }
  function readyTimeout() {
    if(session.status!=='seated')return;
    cancelTimers();session.cancel();data.ready=false;flowGo('coinLobby');
    notify('准备超时，已退出候场并释放预留金币');
  }
  function cancelCoin() {
    if(session.status==='playing') return dispatch('leaveCoin');
    if(!['matching','seated'].includes(session.status))return;
    cancelTimers();session.cancel();data.ready=false;go('coinLobby',{replace:true});
    notify('已取消入场，预留金币已释放，本次未扣费');
  }
  function finishCoin() {
    if(session.status!=='playing') return;
    cancelTimers(); const r=session.settle(data.lossDemo?-1500:1500,`demo-${session.started}`);
    data.history.push({...r,game:gameName(),field:fields[data.field].name,time:new Date().toLocaleString('zh-CN',{hour12:false})}); data.offline=false;closeModal();flowGo('coinResult');notify('本局已结算');
  }
  function eventRounds() { return data.event===2?[4,3,4][t().stage]:e().rounds; }
  function eventScreen() { return FieldNavigation.eventMap[t().status]||'eventCenter'; }
  function eventAward(){return data.event===2&&t().eliminated?(t().rank<=16?120:40):e().award;}
  function beginReview(){t().status='finalTemp';t().reviewStarted=Date.now();t().reviewDeadline=Date.now()+86400000;flowGo('eventFinal');resumeTimers();}
  function confirmResult(){
    if(t().pendingAppeal)return showModal('还有申诉待处理','<p class="modal-copy">请查看原申诉记录，受理案件处理完成后再确认正式赛果。</p>',b('查看原记录','details:requests'));
    t().status='final';t().rank=t().rank||1;const rank=t().rank;t().seasonPoints=5+Math.floor(100*(e().count-rank)/(e().count-1))+(rank===1?30:rank===2?20:rank===3?10:0);
    if(!t().awarded){session.reward(eventAward());t().awarded=true;}
    if(!t().archiveId){t().archiveId='event-'+Date.now();data.eventArchives.push({id:t().archiveId,event:data.event,time:new Date().toLocaleString('zh-CN'),rank:t().rank,amount:eventAward(),seasonPoints:t().seasonPoints,tournament:JSON.parse(JSON.stringify(t()))});}
    flowGo('eventFinal');notify('赛果已确认，奖励已到账');
  }
  function register(standby=false) {
    if(!['none','final'].includes(t().status)) return showModal('已有未结束的赛事',`<p class="modal-copy">${e().name}的进度仍保留。可查看其他赛事详情，当前流程结束后再报名。</p>`,b('返回当前赛事','eventResume'));
    if(session.status!=='idle') return showModal('金币场流程尚未结束',`<p class="modal-copy">请先完成当前金币场流程。当前牌局结束后可以报名参赛。</p>`,b('返回金币场','resumeCoin'));
    const x=events[data.previewEvent];
    if(data.previewEvent===0&&!noviceLeft())return showModal('今日免费次数已用完','<p class="modal-copy">新手杯每日1次免费，本日已在锁定名单时消耗。可以查看原赛果或选择其他赛事；取消与后续轮次不会再次计算。</p>',b('查看其他赛事','eventCenter','blue-button'));
    if(data.previewEvent===2&&!data.ticket) return showModal('缺少赛事券',`<p class="modal-copy">当周完成3场有效赛事可获得赛事券。可从赛事任务查看进度。</p>`,b('赛事任务','eventTasks','blue-button'));
    showModal(standby?'确认候补':'报名确认',`<div class="modal-kv"><span>赛事</span><b>${x.name}</b></div><div class="modal-kv"><span>开赛</span><b>${x.time}</b></div><div class="modal-kv"><span>报名资源</span><b>${standby?'候补不锁资源':x.entry}</b></div><p class="modal-copy">${standby?'获得席位后需要本人确认并重新检查资格和报名资源。':'报名成功后请按时检录，随后由赛事统一分桌。'}</p>`,b('取消','closeModal','blue-button')+b(standby?'加入候补':'确认报名',standby?'confirmStandby':'confirmRegister'));
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
    cancelTimers();t().status='published';t().error=false;t().entryDeadline=demoNow()+3000;flowGo('eventAllocating');later(enterEventTable,3000);
  }
  function enterEventTable() {
    if(t().status!=='published'||t().error) return;
    if(session.status!=='idle') return showModal('当前金币场流程未结束',`<p class="modal-copy">请先完成或取消金币匹配，已发牌则等待本局正式结束，再返回赛事原桌。</p>`,b('返回金币场','resumeCoin'));
    cancelTimers(); t().status='table';t().handDeadline=demoNow()+30000;data.selectedTile=-1;flowGo('eventTable');resumeTimers();
  }
  function finishHand() {
    if(t().status!=='table')return; cancelTimers(); closeModal(); data.selectedTile=-1;
    if(t().hand<4) { t().status='smallResult';t().nextHandDeadline=demoNow()+10000; flowGo('eventSmallResult');resumeTimers(); }
    else { t().points+=8;t().roundRecords=t().roundRecords||[];t().roundRecords.push({stage:t().stage,round:t().round,raw:72,points:8,cumulative:t().points,confirmed:true,hands:[18,18,18,18]});t().status='roundWait';t().roundDeadline=demoNow()+8000;flowGo('eventRoundWait');resumeTimers(); }
  }
  function nextHand() { if(t().status!=='smallResult')return; cancelTimers(); t().hand++; t().status='table';t().handDeadline=demoNow()+30000;flowGo('eventTable');resumeTimers(); }
  function nextRound() {
    if(t().status!=='roundWait')return;
    if(t().round<eventRounds()) { t().round++; t().hand=1; t().status='allocating';t().allocationDeadline=demoNow()+5000;flowGo('eventAllocating');resumeTimers(); }
    else if(data.event===2&&t().stage<2) { t().stage++;t().round=1;t().hand=1;t().points=0;t().status='allocating';t().allocationDeadline=demoNow()+5000;flowGo('eventAllocating');resumeTimers();notify('已晋级，等待下一阶段分桌'); }
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
    if(action==='lobbyStyle'){
      if(data.screen!=='home'||!FieldLobby.layouts.some(l=>l.id===value))return;
      data.lobbyStyle=value;render();
      $('#lobby-chooser')?.querySelector(`[data-value="${value}"]`)?.focus();return;
    }
    if(action.startsWith('support:'))return support.dispatch(action,value);
    if(action.startsWith('details:'))return details.dispatch(action,value);
    const aliases={history:'details:history',rules:'details:rules',help:'details:help',eventRules:'details:eventRules',eventSchedule:'details:schedule',eventScore:'details:score',appeal:'details:appeal',coinInfo:'details:coinInfo',supply:'support:supply',activity:'support:activities',shop:'support:shop'};
    if(aliases[action])return dispatch(aliases[action],value);
    switch(action) {
      case 'home':return go('home');
      case 'coin':
        if(session.status==='idle'){data.field=Math.max(0,FieldCatalogue.recommend(data.profile,session.available));data.fieldWindowStart=Math.max(0,data.field-3);}
        if(data.screen==='coinResult'){
          data.navStack=(data.navStack||[]).filter(x=>!x.startsWith('coin'));
          return go('coinLobby',{replace:true});
        }
        return go('coinLobby');
      case 'resumeCoin':return go(activeCoinScreen()); case 'returnTable':return go('coinPlay');
      case 'tournament':case 'eventCenter':return go('eventCenter'); case 'closeModal':return closeModal();
      case 'pause':data.pauseAuto=!data.pauseAuto;cancelTimers();if(data.pauseAuto)data.pausedAt=Date.now();else{const shift=data.pausedAt?Date.now()-data.pausedAt:0;for(const key of ['matchDeadline','matchExpiry','personalReadyDeadline','roomReadyDeadline','dealDeadline'])if(data[key])data[key]+=shift;for(const key of ['entryDeadline','nextHandDeadline'])if(t()[key])t()[key]+=shift;data.pausedAt=0;resumeTimers();}render();return notify(data.pauseAuto?'已暂停演示的自动计时，可手动推进或恢复':'已恢复演示自动推进');
      case 'fieldWindow':{if(session.status!=='idle')return notify('当前入场流程结束后再翻页');const start=Number(value);if(!Number.isInteger(start)||start<0||start>Math.max(0,fields.length-4))return;data.fieldWindowStart=start;return render();}
      case 'selectField':if(session.status!=='idle')return notify('当前入场流程结束后再切换场档');data.field=Number(value);return render(); case 'game':if(session.status!=='idle')return notify('当前匹配流程结束后再切换玩法');{const id=['','red','pdk'][Number(value)];if(!FieldCatalogue.isAvailable(data.region,id))return;data.game=FieldCatalogue.gamesFor(data.region).findIndex(x=>x.id===id);data.profile=id;}fields=FieldCatalogue.fieldsFor(data.profile);data.field=Math.max(0,FieldCatalogue.recommend(data.profile,session.available));data.fieldWindowStart=Math.max(0,data.field-3);return render();
      case 'profile':{if(session.status!=='idle')return notify('当前场次结束后再切换玩法');const games=FieldCatalogue.gamesFor(data.region), chosen=games.find(x=>x.id===value);if(!chosen)return;data.profile=chosen.id;data.game=games.indexOf(chosen);fields=FieldCatalogue.fieldsFor(data.profile);data.field=Math.max(0,FieldCatalogue.recommend(data.profile,session.available));data.fieldWindowStart=Math.max(0,data.field-3);return render();}
      case 'coinPackages':return go('coinPackages');
      case 'packOrder':{const index=Number(value),pack=FieldCatalogue.PACKS[index];if(!pack)return;data.coinOrders=data.coinOrders||[];const pending=data.coinOrders.find(o=>o.pack===index&&o.status==='pending');data.packOrder=pending||{id:'coin-order-'+Date.now()+'-'+(data.coinOrders.length+1),pack:index,status:'pending'};if(!pending)data.coinOrders.push(data.packOrder);return go('coinPurchase');}
      case 'payPack':{const order=(data.coinOrders||[]).find(o=>o.id===data.packOrder?.id);if(!order)return;if(order.status==='pending'){session.reward(FieldCatalogue.PACKS[order.pack].coins);order.status='paid';order.paidAt=Date.now();}return go('coinPurchase',{replace:true});}
      case 'returnSupply':return go('supportSupply',{replace:true});
      case 'returnSelection':return go(session.status==='idle'?'coinLobby':activeCoinScreen(),{replace:true});
      case 'pokerBid':if(session.status!=='playing'||data.pokerPhase!=='bid')return;data.pokerLord=Number(value)>0;data.pokerPhase='double';data.pokerPhaseDeadline=demoNow()+5000;cancelTimers();render();return resumeTimers();
      case 'pokerDouble':if(session.status!=='playing'||data.pokerPhase!=='double')return;data.pokerDouble=Number(value);data.pokerPhase='play';cancelTimers();render();return resumeTimers();
      case 'hint':data.selectedTile=0;return render();case 'pass':data.selectedTile=-1;render();return notify('等待其他玩家出牌');
      case 'startCoin':return startCoin(); case 'queueCoin':return queueCoin(); case 'cancelCoin':return cancelCoin();
      case 'confirmCancel':return cancelCoin(); case 'matchHome':return go('home');
      case 'deal':return readyCoin();
      case 'leaveCoin':return showModal('本局进行中',`<p class="modal-copy">本局尚未结束，暂时无法离桌。可以开启托管，离线后会自动代打。</p>`,b('继续游戏','closeModal','blue-button')+b('开启托管','enableTrust'));
      case 'enableTrust':session.trust(true);closeModal();return render();case 'trust':if(session.status!=='playing')return;session.trust(!session.auto);data.offline=false;return render();
      case 'reconnect':data.offline=false;session.trust(false);render();return notify('已返回牌桌');
      case 'tile':data.selectedTile=Number(value);return render();case 'discard':if(data.selectedTile<0)return;if(currentProfile().art!==0)data.pokerDiscard=pokerCards[data.selectedTile%pokerCards.length];else data.discard=hand[data.selectedTile];data.selectedTile=-1;render();return notify('已出牌');
      case 'coinFlowTab':if(Number(value)===2&&session.status!=='idle')return notify('本局尚未结束，结算后显示结果');if(Number(value)===2)return go('coinResult');if(session.status==='playing')return go('coinPlay');if(Number(value)===0&&session.status!=='seated')return notify('真人匹配完成后进入准备桌');if(Number(value)===1&&session.status!=='matching')return notify('当前没有进行中的匹配');return go(activeCoinScreen());
      case 'againCoin':data.field=Math.max(0,FieldCatalogue.recommend(data.profile,session.available));data.fieldWindowStart=Math.max(0,data.field-3);data.screen='coinLobby';render();return startCoin();
      case 'settlement':{const r=session.result;return showModal('我的结算明细',`<div class="modal-kv"><span>服务费</span><b>${r.fee} 金币</b></div><div class="modal-kv"><span>锁定本金</span><b>${fmt(r.principal)} 金币</b></div><div class="modal-kv"><span>规则净输赢</span><b>${signed(r.net)}</b></div><div class="modal-kv"><span>实际结算</span><b>${signed(r.actual)}</b></div><div class="modal-kv"><span>本人亏损补差</span><b>${fmt(r.shortfall)}</b></div><p class="modal-copy">净亏最多扣本局本金，超过部分由系统承担。净赢按规则足额到账，补差已含在赢家所得中，不额外再加一次。</p>`);}
      case 'history':return go('history');case 'supply':if(data.screen!=='supply')data.returnScreen=data.screen;return go('supply');
      case 'wallet':return showModal('资产说明',`<p class="modal-copy">房卡用于创建房间，钻石用于兑换商品。金币用于金币场对局。</p>`);
      case 'coinInfo':return showModal('金币说明',`<p class="modal-copy">匹配只预留服务费；成功发牌实扣后锁定剩余可用金币。本局净输赢一次结算，净亏最多扣本金，系统承担超额亏损；赢家足额获得金币。局中新到账不并入本金，不能消费锁定金币。</p>`);
      case 'rules':return showModal('玩法规则',`<p class="modal-copy">${gameName()} · 当前场档底分 ${fields[data.field].base}。</p><div class="modal-kv"><span>金币场组织</span><b>一局一场，结束清房</b></div><p class="modal-copy">返回选场后可切换地区与玩法。</p>`);
      case 'help':return showModal('帮助反馈',`<p class="modal-copy">匹配中可取消，预留会释放。已发牌只能托管，断线后返回原牌桌。结算有疑问可查看战绩明细。</p>`);
      case 'activity':case 'shop':return showModal(action==='shop'?'金币商城':'活动补给',`<p class="modal-copy">活动奖励可在活动中心领取，购买的商品可在我的订单查看。</p>`);

      case 'setRegion':if(!FieldCatalogue.REGIONS.includes(value)||value===data.region)return;if(session.status!=='idle'||!['none','final','finalTemp'].includes(t().status)){render();return notify('当前场次流程结束后再切换地区');}data.region=value;data.game=0;data.profile=FieldCatalogue.gamesFor(value)[0].id;fields=FieldCatalogue.fieldsFor(data.profile);data.field=Math.max(0,FieldCatalogue.recommend(data.profile,session.available));data.fieldWindowStart=Math.max(0,data.field-3);render();return notify('已切换至'+value);
      case 'chooseMahjong':{if(session.status!=='idle')return;const chosen=FieldCatalogue.gamesFor(data.region).find(x=>x.art===0);if(!chosen)return;data.profile=chosen.id;data.game=FieldCatalogue.gamesFor(data.region).findIndex(x=>x.id===chosen.id);fields=FieldCatalogue.fieldsFor(data.profile);data.field=Math.max(0,FieldCatalogue.recommend(data.profile,session.available));data.fieldWindowStart=Math.max(0,data.field-3);closeModal();render();return startCoin();}
      case 'eventFilter':data.filter=Number(value);return render();
      case 'eventDetail':if(!events[Number(value)])return;data.previewEvent=Number(value);data.detailTab=0;return go('eventDetail');
      case 'currentDetail':data.previewEvent=data.event;return go('eventDetail');case 'detailTab':data.detailTab=Number(value);return render();
      case 'register':return register();case 'confirmRegister':if(!['none','final'].includes(t().status)||session.status!=='idle')return;if(data.previewEvent===0&&!noviceLeft())return register();data.event=data.previewEvent;data.tournament=freshTournament();t().entryDay=dayKey();t().status='registered';t().checkinDeadline=demoNow()+8000;cancelTimers();go('eventRegistered');return resumeTimers();
      case 'confirmStandby':if(!['none','final'].includes(t().status))return;data.event=data.previewEvent;data.tournament=freshTournament();t().status='standby';return go('eventStandby');
      case 'convertStandby':if(t().status!=='standby')return;if(FieldNavigation.remaining(t().offerDeadline)===0)return notify('转正通知已失效，请等待下一次席位通知');if(session.status!=='idle')return showModal('当前对局尚未结束','<p class="modal-copy">请先完成当前对局，再在通知有效期内确认。</p>',b('返回牌桌','resumeCoin'));if(data.event===2&&!data.ticket)return notify('赛事券不足，未转为正式席位');t().status='checkin';return go('eventRegistered',{replace:true});
      case 'cancelStandby':t().status='none';return go('eventCenter',{replace:true});
      case 'cancelRegistration':if(!['registered','checkin'].includes(t().status))return notify('名单已进入分桌，不能使用报名取消');return showModal('取消报名','<p class="modal-copy">名单锁定前取消会释放正式席位及预留资源，赛事券没有实扣。本次不会进入分桌。</p>',b('保留报名','closeModal','blue-button')+b('确认取消','confirmCancelRegistration'));
      case 'confirmCancelRegistration':if(!['registered','checkin'].includes(t().status))return;t().status='none';t().checked=false;return go('eventCenter',{replace:true});
      case 'checkin':if(t().status!=='checkin')return;if(session.status!=='idle')return showModal('金币场流程尚未结束',`<p class="modal-copy">请先完成或取消当前金币场流程，再检录进入赛事。</p>`,b('返回金币场','resumeCoin'));t().checked=true;t().status='allocating';t().allocationDeadline=demoNow()+5000;cancelTimers();go('eventAllocating');return resumeTimers();
      case 'eventTable':return go('eventTable',{replace:true});case 'eventResume':return go(eventScreen());case 'retryTable':t().error=false;t().status='published';return enterEventTable();
      case 'nextHand':return nextHand();case 'nextStage':if(data.event!==2||t().status!=='roundWait'||t().stage>=2)return;t().stage++;t().round=1;t().hand=1;t().points=0;t().status='allocating';return go('eventAllocating',{replace:true});
      case 'eliminateEvent':if(data.event!==2||t().status!=='roundWait'||t().stage>=2)return;t().eliminated=true;t().rank=t().stage===0?20:8;return beginReview();
      case 'eventFavourite':case 'eventReminder':{const key=action==='eventFavourite'?'favourites':'reminders',i=data.previewEvent;data[key]=data[key].includes(i)?data[key].filter(n=>n!==i):data[key].concat(i);render();return notify(action==='eventReminder'?'开赛提醒已更新':'已更新收藏');}
      case 'myEventsTab':data.myEventsTab=Number(value);return render();
      case 'archiveDetail':{const index=data.eventArchives.findIndex(a=>a.id===value);if(index<0)return notify('未找到赛事记录');return dispatch('details:scoreHistory',String(index));}
      case 'seasonDetails':case 'seasonWeek':case 'seasonHistory':case 'eventTasks':return go(action);
      case 'claimEventTicket':if(weeklyArchives().length<3||data.weekTicketWeek===weekKey())return;data.ticket++;data.weekTicketWeek=weekKey();render();return notify('当周赛事券已到账');
      case 'eventTrust':t().auto=!t().auto;return render();case 'eventLeave':return showModal('当前赛事',`<p class="modal-copy">赛事正在进行，暂时无法离桌。可以开启托管，重新连接后返回原牌桌。</p>`,b('继续比赛','closeModal','blue-button')+b('开启托管','enableEventTrust'));
      case 'enableEventTrust':t().auto=true;closeModal();return render();
      case 'eventRules':return showModal('赛事规则',`<p class="modal-copy">每轮4小局，汇总原始分排序，桌积分依次为8／5／2／0。并列均分占用名次积分，累计按实际精度排名。赛事分不进行金币输赢划转。</p><p class="modal-copy">报名 → 检录 → 统一分桌。小局10秒继续，本轮结束等待其他桌，新轮发布后3秒进入。正式结果确认后固定奖励自动发放。</p>`);
      case 'eventSchedule':return showModal('赛事进度',`<div class="modal-kv"><span>当前赛事</span><b>${e().name}</b></div><div class="modal-kv"><span>轮次 / 小局</span><b>第${t().round}轮 · ${t().hand} / 4</b></div><p class="modal-copy">每轮4小局。尚未完成本轮则继续原桌；完成后等待全部桌，再发布下一轮。</p>`);
      case 'eventScore':return showModal('成绩明细',`<div class="modal-kv"><span>当前累计桌积分</span><b>${t().points.toFixed(2)}</b></div><p class="modal-copy">每轮成绩及正式同分判定按赛事规则展示。临时赛果可在有效复核窗口申诉；</p>`,b('查看申诉说明','appeal','blue-button'));
      case 'appeal':return showModal('申诉说明',`<p class="modal-copy">赛果发布后24小时内说明对应轮次、牌局及原因，提交后等待复核。未结案件继续复核，已正式确认的结果以最新决定为准。</p>`);
      case 'tableMenu':return tableMenu();
      case 'myEvents':return go('myEvents');case 'season':return go('season');case 'rewards':return go('rewards');
      case 'settings':return showModal('牌桌设置',`${[['sound','音效'],['music','背景音乐']].map(([key,label])=>`<div class="setting-row"><span>${label}</span>${b(data.settings[key]?'开启':'关闭','toggleSetting','switch',`data-value="${key}" aria-pressed="${data.settings[key]}"`)}</div>`).join('')}<p class="modal-copy">音效与背景音乐可分别开关，设置自动保存。</p>`);
      case 'toggleSetting':if(!['sound','music'].includes(value))return;data.settings[value]=!data.settings[value];return dispatch('settings');
      case 'back':return go(FieldNavigation.returnTarget(data,session.status),{replace:true});
      default:if(action.endsWith('Scenario')||['tableFailure','matchFailure','newReward'].includes(action))return scenario(action);
    }
  }
  window.FieldUI={handle(event){
    const button=event.target.closest('button[data-action]');if(!button||button.disabled)return;
    const action=button.dataset.action;
    if(['advance','tools','directory','pause','reset','confirmReset','fullscreen','nextHand','nextStage','eliminateEvent'].includes(action)||/Scenario$/.test(action)||['tableFailure','matchFailure','newReward','support:scenario'].includes(action)||action.startsWith('details:demo'))return;
    try{dispatch(button.dataset.action,button.dataset.value);}catch(error){showModal('当前操作未完成',`<p class="modal-copy">${error.message.replace(/[<>]/g,'')}。请关闭提示后重试。</p>`,b('知道了','closeModal','blue-button'));}save();
  },setRegion(value){dispatch('setRegion',value);save();}};
  function resumeTimers() {
    if(session.status==='playing'){data.playDeadline=data.playDeadline||demoNow()+30000;if(['bid','double'].includes(data.pokerPhase))later(()=>dispatch(data.pokerPhase==='bid'?'pokerBid':'pokerDouble','0'),remaining(data.pokerPhaseDeadline));later(finishCoin,remaining(data.playDeadline));}
    if(t().status==='registered'){t().checkinDeadline=t().checkinDeadline||demoNow()+8000;later(()=>{if(t().status!=='registered')return;t().status='checkin';flowGo('eventRegistered');notify('检录已开放');},remaining(t().checkinDeadline));}
    if(t().status==='allocating'){t().allocationDeadline=t().allocationDeadline||demoNow()+5000;later(publishTable,remaining(t().allocationDeadline));}
    if(t().status==='table'){t().handDeadline=t().handDeadline||demoNow()+30000;later(finishHand,remaining(t().handDeadline));}
    if(t().status==='roundWait'){t().roundDeadline=t().roundDeadline||demoNow()+8000;later(nextRound,remaining(t().roundDeadline));}
    if(t().status==='finalTemp'&&!t().pendingAppeal){later(confirmResult,remaining(t().reviewDeadline));}
    if(session.status==='matching'){data.matchDeadline=data.matchDeadline||demoNow()+7800;later(seatCoin,remaining(data.matchDeadline));}
    if(session.status==='seated'){
      data.personalReadyDeadline=data.personalReadyDeadline||demoNow()+60000;data.roomReadyDeadline=data.roomReadyDeadline||demoNow()+120000;
      if(data.ready){data.dealDeadline=data.dealDeadline||demoNow()+3000;later(dealCoin,remaining(data.dealDeadline));}
      else later(readyTimeout,Math.min(remaining(data.personalReadyDeadline),remaining(data.roomReadyDeadline)));
    }
    if(t().status==='published'&&!t().error){t().entryDeadline=t().entryDeadline||demoNow()+3000;later(enterEventTable,remaining(t().entryDeadline));}
    if(t().status==='smallResult'){t().nextHandDeadline=t().nextHandDeadline||demoNow()+10000;later(nextHand,remaining(t().nextHandDeadline));}
  }
  window.addEventListener('storage',event=>{if(event.key===KEY&&event.newValue){try{receivingStorage=true;restoreSaved(JSON.parse(event.newValue));cancelTimers();resumeTimers();closeModal();render();notify('游戏进度已更新');}catch{/* 忽略损坏存档，保留当前状态。 */}finally{receivingStorage=false;}}});
  window.addEventListener('resize',resize);
  document.addEventListener('fullscreenchange',resize);
  if(!data.screen.startsWith('support')&&!data.screen.startsWith('details')){
    if(session.status==='playing') data.screen='coinPlay';
    if(session.status==='seated') data.screen='coinReady';
    if(session.status==='matching') data.screen='coinMatch';
  }
  data.pauseAuto=false;data.pausedAt=0;
  resumeTimers();
  setInterval(()=>{if(!data.pauseAuto&&['coinReady','eventAllocating','eventSmallResult'].includes(data.screen))render();},1000);
  render();
})();
