(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.FieldDetails = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const esc = value => root.FieldNavigation?.escape ? root.FieldNavigation.escape(value) : String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const signed = value => (number(value) > 0 ? '+' : '') + number(value).toLocaleString('zh-CN');
  const resolveRecord = (history, index) => {
    const i = typeof index === 'string' && index.trim() !== '' ? Number(index) : index;
    return Array.isArray(history) && Number.isInteger(i) && i >= 0 && i < history.length ? history[i] : null;
  };
  function recordBalance(record) {
    const value = key => record && record[key] !== null && record[key] !== undefined && String(record[key]).trim() !== '' && Number.isFinite(Number(record[key])) ? Number(record[key]) : null;
    const principal=value('principal'), fee=value('fee'), actual=value('actual'), after=value('balance');
    return {before:principal!==null&&fee!==null?principal+fee:null,fee:fee!==null?-fee:null,actual,other:after!==null&&principal!==null&&actual!==null?after-principal-actual:null,after};
  }
  function recordLedger(record) {
    if (!record) return [];
    const rows = [
      { kind:'fee', title:'成功发牌 · 服务费', change:-number(record.fee), note:'仅本局扣除一次。' },
      { kind:'principal', title:'开局锁定本金', change:0, amount:number(record.principal), note:'冻结可用额度，不计金币收付。' },
      { kind:'settlement', title:'本局实际净输赢', change:number(record.actual), note:'按本局正式净额一次结算。' },
      { kind:'shortfall', title:'系统承担不足差额', change:0, amount:number(record.shortfall), note:'赢家所得已包含规则应收，不重复加发给本账号。' },
      { kind:'release', title:'结算后释放剩余本金', change:0, note:'解除冻结，不产生额外金币。' }
    ];
    if (number(record.refund)) rows.push({kind:'refund',title:'原费用退款',change:number(record.refund),note:'按原退款记录展示。'});
    if (Array.isArray(record.rewards)) record.rewards.forEach(reward => rows.push({kind:'reward',title:reward.name || '活动奖励',change:number(reward.amount),note:'独立到账，不增加本局本金。'}));
    else if (number(record.reward)) rows.push({kind:'reward',title:'局中独立奖励',change:number(record.reward),note:'独立到账，不增加本局本金。'});
    const balance=recordBalance(record);
    if(balance.before!==null&&balance.after!==null&&!['refund','reward','rewards'].some(key=>Object.hasOwn(record,key))){
      const remainder=balance.after-balance.before-rows.reduce((sum,row)=>sum+row.change,0);
      if(remainder)rows.push({kind:'other',title:'结算前其他收支',change:remainder,note:'仅核对结算时快照；已单列的关联奖励和退款另按原记录展示。'});
    }
    return rows;
  }
  function roundRows(tournament) {
    return (Array.isArray(tournament?.roundRecords) ? tournament.roundRecords : []).map((row, index) => ({...row,index,counted:!row.void && row.confirmed !== false}));
  }
  function appealEligibility(tournament, requests, now = Date.now()) {
    const deadline = number(tournament?.reviewDeadline);
    const canCreate = tournament?.status === 'finalTemp' && deadline > 0 && now < deadline;
    return {canCreate,canQuery:Array.isArray(requests) && requests.some(r => r.kind === 'appeal'),deadline,
      reason:canCreate ? '' : tournament?.status === 'final' ? '结果已正式确认，不能新建本次赛果申诉。' : deadline > 0 ? '本次申诉窗口已截止，已提交的反馈记录仍可查询。' : '尚未进入有效赛果复核窗口。'};
  }
  function submitLocalRequest(list, input, now = Date.now()) {
    if (!String(input.reason ?? '').trim()) throw Error('请填写问题说明');
    if (!String(input.key ?? '').trim()) throw Error('缺少原提交标记');
    const prior = (Array.isArray(list) ? list : []).find(record => record.key === input.key);
    if (prior) return {list,record:prior,reused:true};
    const record = {...input,reason:String(input.reason).trim(),evidence:String(input.evidence ?? '').trim(),id:'REQ-'+now+'-'+(list.length+1),created:now,status:'accepted',conclusion:''};
    return {list:[...list,record],record,reused:false};
  }
  function replayPosition(position, duration) { return Math.max(0,Math.min(number(duration),number(position))); }
  const recordTime = record => number(record?.created) || number(record?.endedAt) || Date.parse(record?.time||'') || 0;
  function filterHistory(history, options = {}) {
    const period=[7,30,180].includes(number(options.period))?number(options.period):30,now=options.now??Date.now();
    return (Array.isArray(history)?history:[]).map((r,i)=>({r,i})).reverse().filter(({r})=>(!options.game||options.game==='all'||r.game===options.game)&&(!recordTime(r)||now-recordTime(r)<=period*86400000)).slice(0,100);
  }

  function create(ctx) {
    const read = (name, getter) => typeof ctx[getter] === 'function' ? ctx[getter]() : typeof ctx[name] === 'function' ? ctx[name]() : ctx[name];
    const data = () => read('data','getData');
    if(data()?.details?.replay)data().details.replay.playing=false;
    if(data()?.details?.historyQuery?.status==='loading')data().details.historyQuery.status='stale';
    const currentT = () => read('t','getTournament') || {};
    const currentE = () => read('e','getEvent') || {};
    const gameName = () => read('gameName','getGameName') || '四人麻将';
    const st = () => {
      const d = data();
      d.details = d.details || {};
      const s = d.details;
      if (!Array.isArray(s.requests)) s.requests=[];
      if (!Number.isInteger(s.rulesTab)) s.rulesTab=0;
      if (![0,1,2].includes(s.rulesMode)) s.rulesMode=0;
      if (![0,1,2,3].includes(s.guidePage)) s.guidePage=0;
      if (!Number.isInteger(s.historyTab)) s.historyTab=0;
      if (!Number.isInteger(s.scoreTab)) s.scoreTab=0;
      s.historyFilter=s.historyFilter||{period:30,game:'all'};
      s.historyQuery=s.historyQuery||{status:'ready'};
      s.helpDraft=s.helpDraft||{};s.appealDraft=s.appealDraft||{};
      return s;
    };
    const b = (label,action,cls='blue-button small',extra='') => ctx.b(label,action,cls,extra);
    const btn = (label,action,value,cls='blue-button small',disabled=false) => b(label,action,cls,`${value === undefined ? '' : `data-value="${esc(value)}"`} ${disabled?'disabled':''}`);
    const badge = (text,cls='blue') => ctx.badge(esc(text),cls);
    const foot = (body='',kind='coin') => ctx.footer(body,kind);
    const page = (title,body,actions='',kind='coin') => ctx.header(title)+`<section class="details-shell" aria-label="${esc(title)}">${body}</section>`+foot(actions,kind);
    const card = (title,body,cls='') => `<section class="details-card ${cls}"><h2>${title}</h2>${body}</section>`;
    const note = text => `<p class="details-note">${text}</p>`;
    const empty = (title,text) => `<div class="details-empty"><span>♜</span><h2>${title}</h2><p>${text}</p></div>`;
    const tabs = (labels,active,action) => `<div class="details-tabs" role="group">${labels.map((label,i)=>b(label,action,i===active?'details-tab active':'details-tab',`data-value="${i}" aria-pressed="${i===active}"`)).join('')}</div>`;
    const rec = () => resolveRecord(data().history,st().recordIndex);
    const recId = r => r?.id || '记录 '+(st().recordIndex+1);
    const known = value => value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value));
    const amount = value => known(value)?signed(value)+' 金币':'待确认';
    let historyRequest=0;
    function queryHistory() {
      const request=++historyRequest,s=st();s.historyQuery.status='loading';ctx.refresh();
      let operation;
      try {
        if(root.navigator?.onLine===false)throw Error('offline');
        operation=ctx.readHistory?ctx.readHistory():new Promise(resolve=>root.setTimeout(resolve,450));
      } catch(error) {operation=Promise.reject(error);}
      Promise.resolve(operation).then(()=>{
        if(request!==historyRequest)return;
        st().historyQuery={status:'ready',updated:Date.now()};ctx.refresh();
      },()=>{
        if(request!==historyRequest)return;
        st().historyQuery.status='error';ctx.refresh();
      });
    }
    const recordName = r => `${r.game || '四人麻将'} · ${r.field || '金币场'}`;
    const requestStatus = value => ({accepted:'已记录',processing:'处理中',resolved:'已有结论'})[value] || '查询中';
    const when = value => new Date(value).toLocaleString('zh-CN',{hour12:false});
    const selectedRequest = () => st().requests.find(r=>r.id===st().selectedRequest);
    const scoreTarget = () => {
      const s=st();
      if (s.scoreArchiveIndex !== null && s.scoreArchiveIndex !== undefined) {
        const archive=resolveRecord(data().eventArchives,s.scoreArchiveIndex);
        return archive ? {t:archive.tournament||{},e:ctx.events?.[archive.event]||{name:'历史赛事'},archive,historical:true} : {t:{},e:{name:'历史赛事'},historical:true,missing:true};
      }
      return {t:currentT(),e:currentE(),historical:false};
    };
    const scope = () => {
      const t=currentT();
      if(!t.localScope)t.localScope='event:'+data().event+':'+(t.reviewStarted||Date.now());
      return t.localScope;
    };
    const eventRequests = () => st().requests.filter(r=>r.kind==='appeal'&&r.scope===(currentT().localScope || currentT().archiveId));
    const ensureDraft = (kind,reference='') => {
      const s=st(),key=kind==='appeal'?'appealDraft':'helpDraft';
      const target=kind==='appeal'?scope():reference||s[key].scopeKey||'general';
      if(!s[key].key || s[key].submitted || s[key].scopeKey!==target)s[key]={key:kind+'-'+Date.now()+'-'+s.requests.length,scopeKey:target,category:kind==='appeal'?'成绩核对':'费用与金币',reference:reference||s[key].reference||'',reason:'',evidence:'',round:1,hand:1,errors:{}};
      s[key].errors=s[key].errors||{};
      if(reference)s[key].reference=reference;
      return s[key];
    };
    const errorId=name=>'details-'+name.replace('.','-')+'-error';
    const fieldError=name=>{const [kind,key]=name.split('.');return st()[kind]?.errors?.[key]||'';};
    const fieldAttrs=name=>`id="details-${name.replace('.','-')}" aria-invalid="${Boolean(fieldError(name))}"${fieldError(name)?` aria-describedby="${errorId(name)}"`:''}`;
    const fieldHint=name=>`<span class="details-field-error" id="${errorId(name)}" role="alert" ${fieldError(name)?'':'hidden'}>${esc(fieldError(name))}</span>`;
    const formField = (name,value,type='text',extra='') => `<input class="details-input" type="${type}" data-details-input="${name}" ${fieldAttrs(name)} value="${esc(value)}" ${extra}>${fieldHint(name)}`;
    const validateDraft=(draft,kind)=>{
      const errors={};
      if(kind==='appeal'){
        const r=Number(draft.round),h=Number(draft.hand),max=Math.max(1,number(currentT().round));
        if(!Number.isInteger(r)||r<1||r>max)errors.round=`请选择已进行的轮次（1至${max}轮）`;
        if(!Number.isInteger(h)||h<1||h>4)errors.hand='请选择1至4小局';
      }
      if(!String(draft.reason??'').trim())errors.reason=kind==='appeal'?'请填写申诉原因':'请填写问题说明';
      return errors;
    };
    const showDraftErrors=(draft,kind)=>{
      draft.errors=validateDraft(draft,kind);
      const first=Object.keys(draft.errors)[0];if(!first)return false;
      ctx.refresh();
      root.document?.querySelector?.(`[data-details-input="${kind==='appeal'?'appealDraft':'helpDraft'}.${first}"]`)?.focus?.();
      return true;
    };
    const inputHandler = event => {
      const name=event.target?.dataset?.detailsInput;
      if(!name)return;
      const [kind,key]=name.split('.');
      if(!['helpDraft','appealDraft'].includes(kind)||!['category','reference','reason','evidence','round','hand'].includes(key))return;
      const draft=st()[kind];draft[key]=event.target.value;
      if(event.isComposing||!draft.errors?.[key])return;
      if(!validateDraft(draft,kind==='appealDraft'?'appeal':'help')[key]){
        delete draft.errors[key];event.target.setAttribute?.('aria-invalid','false');event.target.removeAttribute?.('aria-describedby');
        const hint=root.document?.getElementById?.(errorId(name));if(hint){hint.hidden=true;hint.textContent='';}
      }
    };
    if(root.document)root.document.addEventListener('input',inputHandler);
    if(root.document)root.document.addEventListener('compositionend',inputHandler);

    const rules = [
      {name:'金币参局',title:'一局结束，结算清房',body:`<h3>进入金币场</h3><p>选择地区、玩法和场档，确认当前门槛与费用后开始真人匹配。匹配是进房前的过程。进入准备桌后，成功发牌才实扣一次服务费；发牌前取消，释放原预留。</p><h3>游戏中</h3><p>本局开始后不能离桌，也不能同时开始其他实时对局。短暂离开可开启托管；离线代打承接原座位和手牌，不换新人、不重新发牌。</p><h3>游戏结束</h3><p>本局正式结果确认后一次结算金币，所有玩家移出房间。再来一局需重新验资、匹配，金币不足时先补给。</p>`},
      {name:'金币结算',title:'锁定本金，按净额结算',body:`<h3>本金与奖励</h3><p>成功发牌后，将扣除服务费后的可用金币锁为本局本金。局中新增活动奖励另行到账，不扩大本局本金；锁定部分不能用于商城消费。</p><h3>实际收付</h3><p>净赢按规则足额获得金币。净亏最多扣除本局本金，超出部分由系统承担。金币余额不会因本局扣成负数。</p><h3>账目核对</h3><p>服务费、实际输赢、退款和独立奖励分别记录。本金锁定及释放不是支出或新增金币，系统补差也不会再次加到赢家所得。</p><p>输赢规则和服务费请查看当前玩法与场档说明。</p>`},
      {name:'托管与恢复',title:'恢复原桌，保持单一操作端',body:`<h3>主动托管</h3><p>托管后原局继续，不能用托管状态另开金币或赛事牌桌。取消托管在合法操作点接回，不补发手牌。</p><h3>断线恢复</h3><p>重新登录、切区和换设备先查询原有效对局。只有当前操作端可操作，其他端不取得第二份操作权。恢复失败需重试原桌，不能重新匹配和重复扣费。</p><h3>赛事掉线</h3><p>普通掉线30秒后托管。180秒内在下一合法操作点接回；超时则本小局继续托管，下一小局发牌前接回。普通掉线不直接等同恶意退出。</p>`},
      {name:'赛事流程',title:'报名、检录、统一分桌',body:`<h3>报名与检录</h3><p>查看赛事后本人确认报名。候补按原顺序等待，不锁资源；收到转正通知后，在有效期限内再次确认资格和资源。报名不等于检录。</p><h3>轮次比赛</h3><p>检录成功后等统一分桌。发布有效桌号后3秒自动入桌，不使用金币真人匹配或自由准备。每轮4小局，未完成本轮时10秒续原桌；本轮完成后等待全部桌确认，再发布新轮。</p><h3>赛果与奖励</h3><p>先展示临时排名并开放24小时申诉复核。未结申诉继续复核。正式确认后固定奖励自动发放；赛事成绩不使用金币场本金或输赢结算。</p>`},
      {name:'计分与排名',title:'原始分、桌积分、赛季分',body:`<h3>每轮计分</h3><p>四小局原始分汇总排序，桌积分依次8、5、2、0。并列时平均分配占用名次的桌积分：并列第一各6.50分，全桌并列各3.75分。</p><h3>阶段与更正</h3><p>阶段内累计桌积分，新阶段重新累计。完整精度参与排名，显示两位小数不代替排序。作废轮保留原记录，以正式重赛成绩替代，不重复累计。</p><h3>赛季</h3><p>正式有效赛事累计赛季分；至少5场才上榜，取最佳12场加已确认周成就，再扣已确认处罚，最低为0。金币收支与赛事积分分别查询。</p>`},
      {name:'记录与客服',title:'查看原局，查询处理记录',body:`<h3>战绩与回放</h3><p>本人战绩默认近30日，最多100场；录像保存30日，摘要保留180日供本人及有权限的服务核查。回放只读，不改变原结果或费用。</p><h3>查询边界</h3><p>录像失效、过期或无权时不展示他人隐私。费用等待确认、退款处理中和正式结算分别显示，刷新或重试不能重复到账。</p><h3>反馈与申诉</h3><p>问题说明关联原局或原赛事。重复提交查看反馈，补充材料保留同一处理单。申诉截止后不能新建本次赛果申诉，但处理记录仍可查询。</p>`}
    ];
    function detailsRules() {
      const s=st(),tab=Math.max(0,Math.min(rules.length-1,s.rulesTab)),item=rules[tab];
      const guides=[
        [['选场','选择地区与玩法','先看准入金币，再选择场档。'],['匹配','确认本局费用','开始真人匹配，发牌前取消释放预留。'],['开局','原桌开始游戏','全员准备后发牌，只扣本局一次服务费。'],['结算','本局结束清房','查看净输赢，再来一局重新验资、匹配。']],
        [['费用','成功发牌实扣','服务费先扣除，不重复收取。'],['本金','锁定剩余可用金币','锁定部分不能在商城消费。'],['奖励','活动奖励单独到账','局中新获得的金币不扩大本局本金。'],['收付','按净额一次结算','净赢足额到账，净亏最多扣本金，超出由系统承担。']],
        [['托管','原座位继续游戏','托管不会替换手牌，也不能另开实时对局。'],['断线','代打承接原桌','掉线期间原牌局继续，不补新人。'],['恢复','返回原有效对局','在合法操作点接回，不重复匹配或扣费。'],['结束','使用原局结果','托管与重连不改变原有结算方式。']],
        [['报名','获取正式席位','周末赛锁名单时实扣一次赛事券。'],['轮次','每轮四小局','小局结束10秒继续原桌。'],['汇总','等待所有桌完成','本轮结束后统一汇总、发布下一轮。'],['复核','确认正式结果','24小时申诉复核后确认，未结案件继续复核。']],
        [['原分','汇总四小局原始分','按本轮各玩家总分排序。'],['桌分','按名次计桌积分','依次8、5、2、0；并列均分占用名次积分。'],['阶段','累计本阶段桌积分','新阶段重新累计，作废轮不重复计入。'],['赛季','使用正式有效成绩','金币收支与赛事积分分别查询。']],
        [['战绩','筛选本人原局','摘要保留180日，默认查询近30日。'],['账目','核对原局费用','服务费、净输赢、退款、奖励分别列出。'],['回放','只读查看原牌局','录像保存30日，不改变原结算。'],['反馈','关联原记录说明问题','重试查询不产生新账目或重复发奖。']]
      ][tab];
      const guide=guides[Math.min(3,Math.max(0,s.guidePage))];
      const illustration=`<div class="rule-guide"><div class="rule-guide-path">${guides.map((g,i)=>btn(g[0],'details:guidePage',i,i===s.guidePage?'rule-guide-stop active':'rule-guide-stop')).join('<span aria-hidden="true">›</span>')}</div><div class="rule-guide-scene" aria-hidden="true"><span class="rule-guide-tile">${guide[0]}</span><span class="rule-guide-arrow">›</span><span class="reward-art ${tab===3||tab===4?'reward-trophy':'reward-coins'}"></span></div><h2>${guide[1]}</h2><p>${guide[2]}</p><div class="rule-guide-paging">${btn('上一页','details:guidePage',s.guidePage-1,'blue-button small',s.guidePage===0)}<span>${s.guidePage+1} / 4</span>${btn('下一页','details:guidePage',s.guidePage+1,'gold-button small',s.guidePage===3)}</div></div>`;
      const calculation=tab===0||tab===1?`<h2>金币净额结算</h2><p>服务费已扣，锁定本金为1,000金币。</p><table class="details-table"><thead><tr><th>本局结果</th><th>实际收付</th><th>不足差额</th></tr></thead><tbody><tr><td>净赢1,500</td><td class="positive">+1,500金币</td><td>不另加发</td></tr><tr><td>净亏1,500</td><td class="negative">−1,000金币</td><td>系统承担500金币</td></tr></tbody></table><p>局中奖励另行到账，不用于追加本局扣款。</p>`:`<h2>本轮桌积分</h2><table class="details-table"><thead><tr><th>名次</th><th>桌积分</th></tr></thead><tbody><tr><td>第1 / 2 / 3 / 4名</td><td>8 / 5 / 2 / 0</td></tr><tr><td>两人并列第1名</td><td>各6.50</td></tr><tr><td>四人同分</td><td>各3.75</td></tr></tbody></table><p>桌积分只用于赛事排名，不换算为本局金币输赢。正式赛事固定奖另行自动到账。</p>`;
      const settlement=tab===2?`<h2>原局继续结算</h2><p>托管或重连只改变当前操作者，沿用原牌局、原费用和结算记录。</p><p>金币局按本局正式净输赢结算；赛事局仍只计比赛成绩，固定奖励等正式赛果确认后自动到账。</p>`:tab===5?`<h2>核对原局账目</h2><table class="details-table"><thead><tr><th>项目</th><th>收付口径</th></tr></thead><tbody><tr><td>服务费</td><td>成功发牌扣一次</td></tr><tr><td>锁定本金</td><td>冻结额度，不记为支出</td></tr><tr><td>净输赢</td><td>本局正式结果一次结算</td></tr><tr><td>退款与独立奖励</td><td>按各自原记录核对</td></tr></tbody></table><p>查询或回放不会重新扣款、结算或发奖。</p>`:calculation;
      const content=s.rulesMode===1?illustration:s.rulesMode===2?settlement:`<h2>${item.title}</h2><div class="details-longtext">${tab===0&&ctx.profile?`<h3>${esc(gameName())}</h3><ul>${ctx.profile.rules.map(rule=>`<li>${esc(rule)}</li>`).join('')}</ul>`:''}${item.body}</div>`;
      return page('规则说明',`<nav class="details-rule-nav" aria-label="规则主题">${rules.map((r,i)=>btn(r.name,'details:rulesTab',i,i===tab?'details-rule-tab active':'details-rule-tab')).join('')}</nav><article class="details-rule-body" tabindex="0" aria-label="规则正文"><div class="details-kicker">${esc(gameName())} · 场类型规则</div>${tabs(['文字说明','图文流程','结算说明'],s.rulesMode,'details:rulesMode')}${content}</article>`,btn('帮助反馈','details:help',undefined,'gold-button'));
    }
    function detailsHelp() {
      const draft=ensureDraft('help'),options=['费用与金币','对局恢复','活动与奖励','赛事进度','其他问题'];
      return page('帮助反馈',`<div class="details-two-col">${card('说明问题',`<form class="details-form" novalidate onsubmit="return false"><label>问题类型<select class="details-input" data-details-input="helpDraft.category">${options.map(x=>`<option ${draft.category===x?'selected':''}>${x}</option>`).join('')}</select></label><label>关联原局 / 原事项${formField('helpDraft.reference',draft.reference,'text','placeholder="可填写记录编号，或从战绩详情进入"')}</label><label>问题说明<textarea class="details-input details-textarea resize-none" data-details-input="helpDraft.reason" ${fieldAttrs('helpDraft.reason')} maxlength="1000" placeholder="描述发生时间、所处界面和问题">${esc(draft.reason)}</textarea>${fieldHint('helpDraft.reason')}</label><label>补充材料${formField('helpDraft.evidence',draft.evidence,'text','placeholder="可填写截图文件名或补充说明"')}</label></form>`)}${card('我的记录',`<div class="details-help-emblem">?</div><h3>先核对原记录</h3><p>金币费用可查看本局流水，赛事成绩可查看轮次明细。</p>${btn('金币战绩','details:history')}${btn('反馈记录','details:requests','help')}`,'details-side-card')}</div>`,btn('提交说明','details:submitHelp',undefined,'gold-button'));
    }
    function detailsRequests() {
      const s=st(),kind=s.requestFilter||'all',list=s.requests.filter(r=>kind==='all'||r.kind===kind).slice().reverse();
      return page('处理记录',`${tabs(['全部','反馈','申诉'],['all','help','appeal'].indexOf(kind),'details:requestTab')}<div class="details-list">${list.length?list.map(r=>`<article class="details-list-row"><div><h3>${r.kind==='appeal'?'赛事申诉':'帮助反馈'} · ${esc(r.category||'问题说明')}</h3><p>${esc(r.reference||r.scope||'未关联事项')} · ${when(r.created)}</p><p>${esc(r.reason)}</p></div>${badge(requestStatus(r.status),r.status==='resolved'?'green':'blue')}${btn('查看反馈记录','details:request',r.id)}</article>`).join(''):empty('暂无处理记录','提交的反馈与申诉会保存在这里，可继续查询同一反馈记录。')}</div>`,btn('填写反馈','details:help',undefined,'gold-button'),kind==='appeal'?'tournament':'coin');
    }
    function detailsRequest() {
      const r=selectedRequest();
      if(!r)return page('处理记录',empty('反馈记录不存在','请从处理记录重新选择。'),btn('处理记录','details:requests',st().requestFilter),st().requestFilter==='appeal'?'tournament':'coin');
      return page('反馈详情',`<div class="details-two-col">${card(`${r.kind==='appeal'?'赛事申诉':'帮助反馈'} · ${esc(r.id)}`,`<dl class="details-dl"><dt>记录时间</dt><dd>${when(r.created)}</dd><dt>关联事项</dt><dd>${esc(r.reference||r.scope||'未关联')}</dd>${r.kind==='appeal'?`<dt>轮次 / 小局</dt><dd>第 ${esc(r.round)} 轮 · 第 ${esc(r.hand)} 小局</dd>`:''}<dt>问题说明</dt><dd>${esc(r.reason)}</dd><dt>补充材料</dt><dd>${esc(r.evidence||'暂无')}</dd></dl>`)}${card('处理进度',`<div class="details-progress"><div class="done">1 · 已记录</div><div class="${['processing','resolved'].includes(r.status)?'done':''}">2 · 处理中</div><div class="${r.status==='resolved'?'done':''}">3 · 已有结论</div></div>${badge(requestStatus(r.status))}<p>${r.status==='resolved'?esc(r.conclusion||'处理已完成。'):'正在处理。窗口截止不会自动形成处理结论。'}</p>`,'details-side-card')}</div>`,btn('处理记录','details:requests',r.kind)+btn('补充材料','details:supplement',r.id,'gold-button'),r.kind==='appeal'?'tournament':'coin');
    }
    function historyRows(type) {
      if(type===1) return (data().eventArchives||[]).map((r,i)=>({r,i})).reverse().map(({r,i})=>`<article class="details-list-row"><div><h3>${esc(ctx.events?.[r.event]?.name||'历史赛事')}</h3><p>${esc(r.time||'')} · 第 ${esc(r.rank||'—')} 名</p></div><strong>${number(r.seasonPoints)} 赛季分</strong>${btn('成绩明细','details:scoreHistory',i)}</article>`).join('');
      return filterHistory(data().history,st().historyFilter).map(({r,i})=>`<article class="details-list-row"><div><h3>${esc(recordName(r))}</h3><p>${esc(r.time||recId(r))} · 服务费 ${known(r.fee)?number(r.fee)+' 金币':'待确认'}</p></div><strong class="${known(r.actual)?number(r.actual)>=0?'positive':'negative':'details-pending'}">${amount(r.actual)}</strong>${known(r.actual)?btn(type===2?'费用流水':type===3?'查看回放':'本局详情',type===2?'details:ledgerRecord':type===3?'details:replayRecord':'details:record',i):badge('结算同步中')}</article>`).join('');
    }
    function detailsHistory() {
      const s=st(),rows=historyRows(s.historyTab);
      const games=[...new Set((data().history||[]).map(r=>r.game).filter(Boolean))];
      const filters=s.historyTab===1?'':`<div class="details-history-filters"><label>日期<select class="details-input" data-details-filter="period">${[[7,'近7日'],[30,'近30日'],[180,'180日摘要']].map(([n,text])=>`<option value="${n}" ${s.historyFilter.period===n?'selected':''}>${text}</option>`).join('')}</select></label><label>玩法<select class="details-input" data-details-filter="game"><option value="all">全部玩法</option>${games.map(name=>`<option value="${esc(name)}" ${s.historyFilter.game===name?'selected':''}>${esc(name)}</option>`).join('')}</select></label></div>`;
      const query=s.historyQuery.status,pending=query==='loading';
      const status=pending?'查询中…':query==='error'?'查询未完成，请重试。':query==='stale'?'上次查询尚未完成。':'记录已更新';
      const hint=query==='error'||query==='stale'?'已显示的记录继续保留，当前结果可能尚未更新。':'';
      const blank= pending?`<div class="history-placeholder" role="status"><span class="history-spinner" aria-hidden="true"></span><h2>正在查询记录</h2><p>按所选日期与玩法查询。</p></div>`:query==='error'||query==='stale'?`<div class="history-placeholder"><span class="history-empty-art" aria-hidden="true">…</span><h2>记录暂时无法加载</h2><p>恢复连接后重试，不会重复结算或发奖。</p></div>`:`<div class="history-placeholder"><span class="history-empty-art" aria-hidden="true">♜</span><h2>暂无记录</h2><p>${s.historyTab===1?'正式赛事结束后可查看原成绩。':(data().history||[]).length?'当前筛选内暂无记录，可调整日期或玩法。':'完成金币牌局后，可在这里核对原局结果。'}</p></div>`;
      return page('战绩与账目',`${tabs(['金币战绩','赛事记录','费用流水','回放'],s.historyTab,'details:historyTab')}<div class="details-history-heading"><span>${['单局金币收支','已结束赛事成绩','本局费用与实际收付','原局只读回放'][s.historyTab]}</span>${badge(s.historyTab===1?'赛事积分单独查询':`近${s.historyFilter.period}日 · 最多100场`)}</div>${filters}<div class="history-query-bar ${query}" role="status"><span>${status}${hint?`<small>${hint}</small>`:''}</span>${btn(pending?'查询中':query==='error'||query==='stale'?'重新查询':'刷新记录','details:historyRefresh',undefined,'blue-button small',pending)}</div><div class="details-list history-results" aria-busy="${pending}">${rows||blank}</div>${note('战绩摘要保留180日，回放保存30日。刚结束的对局可能稍后显示。')}`,'');
    }
    function detailsRecord() {
      const r=rec();if(!r)return page('本局详情',empty('找不到指定记录','不会使用最新牌局替换原记录，请重新选择。'),btn('金币战绩','details:history'));
      if(!known(r.actual))return page('本局详情',empty('结算同步中','原局结果尚未确认，请稍后在战绩中重新查询。'),btn('金币战绩','details:history'));
      return page('本局详情',`<div class="details-two-col">${card(esc(recordName(r)),`<div class="details-record-id">${esc(recId(r))} · ${esc(r.time||'历史记录')}</div><div class="details-result-amount ${number(r.actual)>=0?'positive':'negative'}">${signed(r.actual)} <small>金币</small></div><dl class="details-dl"><dt>理论净输赢</dt><dd>${signed(r.net)} 金币</dd><dt>本局本金</dt><dd>${number(r.principal).toLocaleString('zh-CN')} 金币</dd><dt>系统补差</dt><dd>${number(r.shortfall)} 金币</dd><dt>服务费</dt><dd>${number(r.fee)} 金币</dd><dt>结算时余额</dt><dd>${number(r.balance).toLocaleString('zh-CN')} 金币</dd><dt>结束状态</dt><dd>${esc(r.endReason||'正常结束 · 已结算清房')}</dd></dl>`)}${card('原局记录',`<div class="details-help-emblem">♜</div><h3>成绩、费用与回放</h3><p>这里展示所选原局，余额为本局结算时快照。重新查看不会再次扣费或结算。</p>${btn('费用流水','details:ledger')}${btn('查看回放','details:replay')}${btn('反馈此记录','details:helpRecord')}`,'details-side-card')}</div>`,btn('返回战绩','details:history'));
    }
    function detailsLedger() {
      const r=rec();if(!r)return page('费用流水',empty('指定记录不存在','请重新选择原局。'),btn('战绩与账目','details:history'));
      if(!known(r.actual))return page('费用流水',empty('结算同步中','原账目尚未确认，请稍后重新查询。'),btn('战绩与账目','details:history'));
      const rows=recordLedger(r),total=rows.reduce((n,x)=>n+x.change,0);
      return page('费用流水',`${card(`${esc(recId(r))} · ${esc(recordName(r))}`,`<div class="details-ledger-summary"><span>本局关联的实际资产变动</span><strong>${signed(total)} 金币</strong></div><table class="details-table"><thead><tr><th>项目</th><th>实际变动</th><th>说明</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.title)}${row.amount!==undefined?`<small>涉及额度 ${number(row.amount)} 金币</small>`:''}</td><td class="${row.change>=0?'positive':'negative'}">${signed(row.change)}</td><td>${esc(row.note)}</td></tr>`).join('')}</tbody></table>${note('“0”表示本行不产生额外金币收付；锁定额度和系统补差金额仅用于核对。')}`)}`,btn('返回本局详情','details:record',st().recordIndex)+btn('反馈此记录','details:helpRecord',undefined,'gold-button'));
    }
    const replayExpired = r => r?.replayStatus==='expired'||r?.replayStatus==='denied'||r?.replayStatus==='unavailable'||(recordTime(r)>0&&Date.now()-recordTime(r)>30*86400000);
    const startReplay = () => {
      const r=rec();if(!r){ctx.notify('原局不存在，请重新选择');return;}
      const s=st();
      if(!s.replay||s.replay.recordId!==recId(r))s.replay={recordId:recId(r),duration:number(r.replayDuration)||60,position:0,speed:1,playing:false};
      ctx.go('detailsReplay');
    };
    function detailsReplay() {
      const r=rec();if(!r)return page('原局回放',empty('找不到录像记录','请返回原战绩。'),btn('战绩','details:history'));
      if(!known(r.actual))return page('原局回放',empty('结算同步中','原局尚未确认，回放暂未就绪。'),btn('战绩','details:history'));
      if(replayExpired(r))return page('原局回放',empty('该录像无法查看',r.replayStatus==='denied'?'当前账号无查看权限。':'录像已过保存期或尚未就绪，原结算记录仍可查看。'),btn('返回本局详情','details:record',st().recordIndex));
      const rp=st().replay||{position:0,duration:60,speed:1,playing:false};
      if(rp.playing&&replayTimer===null)rp.playing=false;
      const progress=Math.round(rp.position/rp.duration*100),tiles=['二万','五筒','七条','中','三万','九筒','東','二条'];
      return page('原局回放',`<div class="details-replay-layout"><section class="details-replay-board"><div class="details-replay-title">${esc(recordName(r))} · ${esc(recId(r))}</div><div class="details-replay-seat top">对家 · 暗手隐藏</div><div class="details-replay-seat left">左家</div><div class="details-replay-seat right">右家</div><div class="details-replay-seat bottom">本人 · 只读回放</div><div class="details-replay-wind">東</div><div class="details-replay-discards">${tiles.slice(0,Math.floor(progress/13)).map(x=>`<span>${x}</span>`).join('')}</div></section>${card('播放控制',`<div class="details-replay-time">${Math.floor(rp.position)} <small>/ ${rp.duration} 秒</small></div><label class="details-range-label">播放进度<input type="range" min="0" max="${rp.duration}" value="${rp.position}" aria-label="回放播放进度" data-details-replay="position"></label><div class="details-replay-buttons">${btn(rp.playing?'暂停':'播放','details:replayToggle',undefined,'gold-button small')}${btn('回到开头','details:replaySeek',0)}</div><div class="details-speed">${[1,2,4].map(x=>btn(x+' 倍','details:replaySpeed',x,rp.speed===x?'details-tab active':'details-tab')).join('')}</div>${note('回放不产生操作权，不展示对手暗手或牌墙，不影响原结果与费用。')}`,'details-side-card')}</div>`,btn('返回本局详情','details:record',st().recordIndex)+btn('费用流水','details:ledger'));
    }
    function detailsSchedule() {
      const target=scoreTarget(),t=target.t,e=target.e,index=target.archive?.event??data().event,weekend=index===2;
      const schedule=weekend?[['周六 18:25','停止报名'],['18:30—18:50','检录'],['18:50 / 18:55','选择64或32人方案 / 锁名单'],['19:00','资格赛 · 4轮，每轮4小局'],['周日 13:30 / 14:00','到场确认 / 十六强 · 3轮'],['十六强结束20分钟后','四人决赛 · 4轮']]:[[e.time||'赛事开赛时点','正式开赛'],['赛前10分钟','停止报名，开放检录'],['赛前5分钟','原名单检录截止'],['赛前3分钟','满员锁名单，统一分桌'],[`${e.rounds||3}轮 · 每轮4小局`,'轮末汇总后发布新轮']];
      return page('赛事赛程',`<div class="details-two-col">${card(esc(e.name||'赛事'),`<div class="details-timeline">${schedule.map(([time,text])=>`<div><strong>${esc(time)}</strong><p>${esc(text)}</p></div>`).join('')}</div>`)}${card(target.historical?'历史完成进度':'当前进度',`<div class="details-current-round">${weekend?['资格赛','十六强','决赛'][t.stage||0]:'瑞士制'}<strong>第 ${number(t.round)||1} 轮</strong><span>小局 ${number(t.hand)||1} / 4</span></div>${badge(target.historical?'历史记录':({none:'未报名',table:'比赛进行中',roundWait:'轮末等待',finalTemp:'临时赛果',final:'正式赛果'})[t.status]||'等待赛事更新')}<p>同轮小局结束后10秒续原桌。轮末等待全部桌确认；新轮发布后3秒自动进入有效原桌。</p>${btn('轮次成绩','details:scoreKeep')}`,'details-side-card')}</div>`,'','tournament');
    }
    function detailsScore() {
      const target=scoreTarget(),s=st(),t=target.t,rows=roundRows(t),kind=target.historical?'历史正式成绩':t.status==='final'?'正式成绩':'当前已完成成绩';
      let body='';
      if(s.scoreTab===0)body=rows.length?`<table class="details-table"><thead><tr><th>阶段 / 轮次</th><th>原始分</th><th>桌积分</th><th>阶段累计</th><th>状态</th></tr></thead><tbody>${rows.map(r=>`<tr class="${r.counted?'':'details-void'}"><td>${(target.archive?.event??data().event)===2?['资格赛','十六强','决赛'][r.stage||0]:'瑞士制'} · 第 ${esc(r.round)} 轮${Array.isArray(r.hands)?`<small>小局分：${r.hands.map(number).join(' / ')}</small>`:''}</td><td>${signed(r.raw)}</td><td>${number(r.points).toFixed(2)}</td><td>${r.cumulative===undefined?'—':number(r.cumulative).toFixed(2)}</td><td>${badge(r.void?'已作废':r.confirmed===false?'待确认':'有效',r.counted?'green':'gray')}</td></tr>`).join('')}</tbody></table>`:empty('尚无完整轮次成绩','仅展示实际完成的轮次，尚未开赛的轮次暂不显示成绩。');
      if(s.scoreTab===1)body=`<div class="details-longtext"><h3>每轮4小局</h3><p>按本轮累计原始分排序，桌积分为8、5、2、0。并列均分对应名次积分：并列第一各6.50分，四人并列各3.75分。</p><h3>累计与同分</h3><p>阶段内累计实际桌积分，新阶段清零。保留计算精度后排序，页面显示两位小数。同分需依赛事公布的有效对手、直接交手、原始分及托管情况等完整依据复核。</p><h3>更正</h3><p>作废轮不计累计，重赛正式值只累计一次。原成绩、替代值与原因保留关联，已确认处罚与普通掉线分别处理。</p></div>`;
      if(s.scoreTab===2)body=rows.some(r=>r.void||r.correction)?`<div class="details-list">${rows.filter(r=>r.void||r.correction).map(r=>`<article class="details-list-row"><div><h3>第 ${esc(r.round)} 轮 · ${r.void?'原成绩作废':'成绩更正'}</h3><p>${esc(r.reason||r.correction?.reason||'按已确认更正记录展示')}</p><p>原始分 ${signed(r.raw)} · 桌积分 ${number(r.points).toFixed(2)}${r.replacedBy?` · 替代记录 ${esc(r.replacedBy)}`:''}</p></div>${badge(r.void?'不计累计':'已更正','gray')}</article>`).join('')}</div>`:empty('暂无更正记录','有效原成绩保留，当前没有已确认的作废或更正。');
      const eligible=appealEligibility(t,st().requests),open=!target.historical&&eligible.canCreate;
      return page('赛事成绩',`${target.missing?empty('找不到历史赛事','请从我的赛事重新选择。'):`<div class="details-score-heading"><div><h2>${esc(target.e.name||'赛事')}</h2><p>${kind} · 第 ${number(t.round)||1} 轮${target.archive?` · ${esc(target.archive.time||'')}`:''}</p></div><strong>${number(t.points).toFixed(2)} <small>阶段桌积分</small></strong>${badge(target.historical?'历史记录':t.status==='finalTemp'?'临时 · 待复核':t.status==='final'?'正式':'进行中')}</div>${tabs(['轮次成绩','计分与同分','更正记录'],s.scoreTab,'details:scoreTab')}<div class="details-score-content">${body}</div>${note(target.historical?'历史成绩只读；原申诉可在处理记录中继续查询。':eligible.canCreate?`本次复核截止：${when(eligible.deadline)}。未结申诉继续复核，不自动转为正式。`:eligible.reason)}`}`,btn('赛事赛程','details:scheduleKeep')+btn('处理记录','details:requests','appeal')+btn('成绩申诉','details:appeal',undefined,'gold-button',!open),'tournament');
    }
    function detailsAppeal() {
      const t=currentT(),s=st(),draft=ensureDraft('appeal',currentE().name||'赛事'),eligible=appealEligibility(t,eventRequests());
      return page('成绩申诉',`<div class="details-two-col">${card(esc(currentE().name||'赛事'),`<form class="details-form" novalidate onsubmit="return false"><div class="details-form-inline"><label>对应轮次${formField('appealDraft.round',draft.round,'number',`min="1" max="${Math.max(1,number(t.round))}"`)}</label><label>对应小局${formField('appealDraft.hand',draft.hand,'number','min="1" max="4"')}</label></div><label>申诉原因<textarea class="details-input details-textarea resize-none" data-details-input="appealDraft.reason" ${fieldAttrs('appealDraft.reason')} maxlength="1000" placeholder="写清轮次、疑问和需要核对的内容">${esc(draft.reason)}</textarea>${fieldHint('appealDraft.reason')}</label><label>补充材料${formField('appealDraft.evidence',draft.evidence,'text','placeholder="可填写截图文件名或证据说明"')}</label></form>`)}${card('复核说明',`<h3>${eligible.canCreate?'窗口内可提交':'窗口已截止'}</h3><p>${eligible.canCreate?`截止 ${when(eligible.deadline)}`:esc(eligible.reason)}</p><p>提交后保留反馈记录，申诉处理期间，赛果仍为待复核。</p>${btn('查看反馈','details:requests','appeal')}`,'details-side-card')}</div>`,btn('返回成绩','details:scoreKeep')+btn('提交申诉','details:submitAppeal',undefined,'gold-button',!eligible.canCreate),'tournament');
    }

    function submit(kind) {
      const s=st(),draft=s[kind==='appeal'?'appealDraft':'helpDraft'];
      if(kind==='appeal') {
        if(scoreTarget().historical){ctx.notify('历史正式成绩只读，请查看反馈');return;}
        const eligible=appealEligibility(currentT(),eventRequests());
        if(!eligible.canCreate){ctx.notify(eligible.reason);return;}
      }
      if(showDraftErrors(draft,kind))return;
      try {
        const result=submitLocalRequest(s.requests,{...draft,kind,scope:kind==='appeal'?scope():draft.reference||'general'},Date.now());
        s.requests=result.list;s.selectedRequest=result.record.id;draft.submitted=true;
        if(kind==='appeal')currentT().pendingAppeal=true;
        ctx.go('detailsRequest');ctx.notify(result.reused?'已打开原提交记录':'已提交，请留意处理进度');
      } catch(error){ctx.notify(error.message);}
    }
    function demoRequest(action,value) {
      const s=st(),key=currentT().localScope;
      const r=value?s.requests.find(x=>x.id===value):s.requests.find(x=>x.kind==='appeal'&&x.scope===key&&x.status!=='resolved')||s.requests.find(x=>x.status!=='resolved');
      if(!r){ctx.notify('暂无可推进的本地处理单');return;}
      if(r.status==='resolved'){ctx.notify('反馈记录已有结论');return;}
      r.status=action==='details:demoResolveRequest'?'resolved':'processing';
      if(r.status==='resolved'){r.conclusion='演示处理完成，仅表示反馈记录状态流转，不代表真实审核结论。';r.resolved=Date.now();}
      currentT().pendingAppeal=s.requests.some(x=>x.kind==='appeal'&&x.scope===key&&x.status!=='resolved');
      ctx.refresh();ctx.notify('已推进本地反馈记录：'+requestStatus(r.status));
    }
    let replayTimer=null;
    function stopReplay(){if(replayTimer!==null){clearInterval(replayTimer);replayTimer=null;}}
    function playReplay(){
      stopReplay();const playingState=st().replay;replayTimer=setInterval(()=>{
        const s=st(),rp=s.replay;
        if(data().screen!=='detailsReplay'||rp!==playingState||!rp?.playing||!rec()||recId(rec())!==rp.recordId){if(rp)rp.playing=false;stopReplay();return;}
        rp.position=replayPosition(rp.position+0.5*rp.speed,rp.duration);
        if(rp.position>=rp.duration){rp.playing=false;stopReplay();}
        ctx.refresh();
      },500);
    }
    if(root.document)root.document.addEventListener('input',event=>{
      if(event.target?.dataset?.detailsReplay!=='position'||!st().replay)return;
      const rp=st().replay;rp.position=replayPosition(Number(event.target.value),rp.duration);rp.playing=false;stopReplay();
      const label=root.document.querySelector('.details-replay-time');if(label)label.innerHTML=`${Math.floor(rp.position)} <small>/ ${rp.duration} 秒</small>`;
    });
    if(root.document)root.document.addEventListener('change',event=>{
      if(event.target?.dataset?.detailsReplay==='position'){ctx.refresh();return;}
      const key=event.target?.dataset?.detailsFilter;
      if(key==='period'){st().historyFilter.period=[7,30,180].includes(Number(event.target.value))?Number(event.target.value):30;queryHistory();}
      if(key==='game'){st().historyFilter.game=event.target.value;queryHistory();}
    });
    function dispatch(action,value) {
      if(!action.startsWith('details:'))return false;
      const s=st();
      switch(action) {
        case 'details:rules':s.rulesTab=0;ctx.go('detailsRules');break;
        case 'details:coinInfo':s.rulesTab=1;ctx.go('detailsRules');break;
        case 'details:eventRules':s.rulesTab=3;ctx.go('detailsRules');break;
        case 'details:rulesTab':if(rules[Number(value)])s.rulesTab=Number(value);ctx.refresh();break;
        case 'details:rulesMode':if([0,1,2].includes(Number(value)))s.rulesMode=Number(value);ctx.refresh();break;
        case 'details:guidePage':if([0,1,2,3].includes(Number(value)))s.guidePage=Number(value);ctx.refresh();break;
        case 'details:help':ensureDraft('help');ctx.go('detailsHelp');break;
        case 'details:helpRecord':if(!rec()){ctx.notify('请先选择原局');break;}ensureDraft('help',recId(rec()));ctx.go('detailsHelp');break;
        case 'details:submitHelp':submit('help');break;
        case 'details:requests':s.requestFilter=['help','appeal'].includes(value)?value:'all';ctx.go('detailsRequests');break;
        case 'details:requestTab':s.requestFilter=['all','help','appeal'][Number(value)]||'all';ctx.refresh();break;
        case 'details:request':if(!s.requests.some(r=>r.id===value)){ctx.notify('反馈记录不存在');break;}s.selectedRequest=value;ctx.go('detailsRequest');break;
        case 'details:supplement':{
          const r=s.requests.find(x=>x.id===(value||s.selectedRequest));if(!r){ctx.notify('反馈记录不存在');break;}
          ctx.showModal('补充反馈记录材料',`<p class="modal-copy">材料附加在同一反馈记录，不另建申诉。</p>${formField('helpDraft.evidence',s.helpDraft.evidence||'','text','placeholder="输入补充说明或截图文件名"')}`,btn('保存到反馈记录','details:saveSupplement',r.id,'gold-button small'));break;
        }
        case 'details:saveSupplement':{
          const r=s.requests.find(x=>x.id===value),text=String(s.helpDraft.evidence||'').trim();if(!r||!text){ctx.notify('请填写补充材料');break;}
          r.evidence=[r.evidence,text].filter(Boolean).join('\n');s.helpDraft.evidence='';s.selectedRequest=r.id;ctx.go('detailsRequest',{replace:true});break;
        }
        case 'details:history':ctx.go('detailsHistory');queryHistory();break;
        case 'details:historyRefresh':queryHistory();break;
        case 'details:historyTab':if([0,1,2,3].includes(Number(value)))s.historyTab=Number(value);queryHistory();break;
        case 'details:record':case 'details:ledgerRecord':case 'details:replayRecord':{
          if(!resolveRecord(data().history,value)){ctx.notify('指定记录不存在，请重新选择');break;}s.recordIndex=Number(value);
          if(action==='details:replayRecord')startReplay();else ctx.go(action==='details:ledgerRecord'?'detailsLedger':'detailsRecord');break;
        }
        case 'details:ledger':if(rec())ctx.go('detailsLedger');else ctx.notify('请先选择原记录');break;
        case 'details:replay':startReplay();break;
        case 'details:replayToggle':if(!s.replay)break;s.replay.playing=!s.replay.playing;if(s.replay.playing){if(s.replay.position>=s.replay.duration)s.replay.position=0;playReplay();}else stopReplay();ctx.refresh();break;
        case 'details:replaySeek':if(s.replay)s.replay.position=replayPosition(Number(value),s.replay.duration);ctx.refresh();break;
        case 'details:replaySpeed':if(s.replay&&[1,2,4].includes(Number(value)))s.replay.speed=Number(value);ctx.refresh();break;
        case 'details:schedule':s.scoreArchiveIndex=null;ctx.go('detailsSchedule');break;
        case 'details:scheduleKeep':ctx.go('detailsSchedule');break;
        case 'details:score':s.scoreArchiveIndex=null;ctx.go('detailsScore');break;
        case 'details:scoreKeep':ctx.go('detailsScore');break;
        case 'details:scoreHistory':if(!resolveRecord(data().eventArchives,value)){ctx.notify('历史赛事不存在');break;}s.scoreArchiveIndex=Number(value);s.scoreTab=0;ctx.go('detailsScore');break;
        case 'details:scoreTab':if([0,1,2].includes(Number(value)))s.scoreTab=Number(value);ctx.refresh();break;
        case 'details:appeal':{
          if(scoreTarget().historical && ['detailsScore','detailsSchedule','detailsAppeal'].includes(data().screen)){ctx.notify('历史正式成绩只读，已提交反馈记录可继续查询');break;}
          s.scoreArchiveIndex=null;
          const eligible=appealEligibility(currentT(),eventRequests());if(!eligible.canCreate){ctx.notify(eligible.reason);break;}
          ensureDraft('appeal',currentE().name||'赛事');ctx.go('detailsAppeal');break;
        }
        case 'details:submitAppeal':submit('appeal');break;
        case 'details:demoProcessRequest':case 'details:demoResolveRequest':demoRequest(action,value);break;
        default:return false;
      }
      return true;
    }
    const pages={detailsRules,detailsHelp,detailsRequests,detailsRequest,detailsHistory,detailsRecord,detailsLedger,detailsReplay,detailsSchedule,detailsScore,detailsAppeal};
    const labels={detailsRules:'规则说明',detailsHelp:'帮助反馈',detailsRequests:'处理记录',detailsRequest:'反馈详情',detailsHistory:'战绩与账目',detailsRecord:'本局详情',detailsLedger:'费用流水',detailsReplay:'原局回放',detailsSchedule:'赛事赛程',detailsScore:'赛事成绩',detailsAppeal:'成绩申诉'};
    return {pages,labels,dispatch};
  }
  return {resolveRecord,recordBalance,recordLedger,roundRows,appealEligibility,submitLocalRequest,replayPosition,filterHistory,create};
});
