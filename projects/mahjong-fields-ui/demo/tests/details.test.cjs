const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const details = fs.existsSync(__dirname + '/../details.js') ? require('../details.js') : {};

test('结算资产快照区分开局余额、服务费、牌局净额和局中其他收支', () => {
  assert.equal(typeof details.recordBalance, 'function');
  const result=details.recordBalance({principal:780,fee:20,actual:-780,balance:100});
  assert.deepEqual(result,{before:800,fee:-20,actual:-780,other:100,after:100});
  assert.equal(result.before+result.fee+result.actual+result.other,result.after);
  assert.equal(details.recordBalance({principal:780,fee:20,actual:1500}).after,null);
});

test('未单列的快照收支可核对，关联奖励和结算后退款不产生反向补账',()=>{
  const r={principal:780,fee:20,actual:-780,net:-1500,shortfall:720,balance:100};
  const total=rows=>rows.reduce((sum,row)=>sum+row.change,0);
  assert.equal(total(details.recordLedger(r)),-700);
  const named=details.recordLedger({...r,rewards:[{name:'独立奖励',amount:100}]});
  assert.equal(total(named),-700);assert.equal(named.filter(row=>row.kind==='other').length,0);
  const refunded=details.recordLedger({principal:780,fee:20,actual:1500,balance:2280,refund:20});
  assert.equal(total(refunded),1500);assert.equal(refunded.filter(row=>row.kind==='other').length,0);
});

test('指定旧战绩时读取原索引，不替换为最新结果，非法索引不落入其他记录', () => {
  assert.equal(typeof details.resolveRecord, 'function');
  const history = [{id:'old',actual:-780,fee:20},{id:'new',actual:1500,fee:20}];
  assert.equal(details.resolveRecord(history,0).id,'old');
  assert.equal(details.resolveRecord(history,1).actual,1500);
  assert.equal(details.resolveRecord(history,-1),null);
  assert.equal(details.resolveRecord(history,2),null);
});

test('费用流水不把本金冻结释放或系统补差再次算进资产变动', () => {
  assert.equal(typeof details.recordLedger, 'function');
  const rows=details.recordLedger({id:'loss',actual:-780,net:-1500,principal:780,shortfall:720,fee:20});
  assert.equal(rows.reduce((sum,row)=>sum+row.change,0),-800);
  assert.equal(rows.find(row=>row.kind==='shortfall').change,0);
  assert.equal(rows.find(row=>row.kind==='principal').change,0);
});

test('成绩明细只展示实际完成轮，不把未开轮或作废轮累计入阶段', () => {
  assert.equal(typeof details.roundRows,'function');
  const rows=details.roundRows({roundRecords:[
    {stage:0,round:1,raw:72,points:8,cumulative:8,confirmed:true},
    {stage:0,round:2,raw:20,points:5,void:true},
    {stage:0,round:2,raw:16,points:6.5,cumulative:14.5,confirmed:true}
  ]});
  assert.equal(rows.length,3);
  assert.equal(rows[1].counted,false);
  assert.equal(rows[2].points,6.5);
  assert.equal(rows[2].cumulative,14.5);
});

test('申诉截止前可新建，截止后只能查原单，正式结果不会因计时自动重开窗口', () => {
  assert.equal(typeof details.appealEligibility,'function');
  assert.equal(details.appealEligibility({status:'finalTemp',reviewDeadline:1000},[],999).canCreate,true);
  assert.equal(details.appealEligibility({status:'finalTemp',reviewDeadline:1000},[],1000).canCreate,false);
  assert.equal(details.appealEligibility({status:'final'},[],500).canCreate,false);
  const prior=[{kind:'appeal',status:'processing',scope:'event-1'}];
  assert.equal(details.appealEligibility({status:'finalTemp',reviewDeadline:1000},prior,1200).canQuery,true);
});

test('同一次表单重复提交保留原处理单和原内容，不新增记录', () => {
  assert.equal(typeof details.submitLocalRequest,'function');
  const first=details.submitLocalRequest([],{key:'draft-1',kind:'help',scope:'coin-1',reason:'原局费用待确认'},123);
  const second=details.submitLocalRequest(first.list,{key:'draft-1',kind:'help',scope:'coin-1',reason:'再次点击'},124);
  assert.equal(second.list.length,1);
  assert.equal(second.record.id,first.record.id);
  assert.equal(second.record.reason,'原局费用待确认');
  assert.equal(second.reused,true);
});

test('反馈或申诉空白内容不生成处理单，成功提交不修改旧记录集合', () => {
  assert.equal(typeof details.submitLocalRequest,'function');
  assert.throws(()=>details.submitLocalRequest([],{key:'a',kind:'appeal',reason:'  '},1));
  const original=[];
  const result=details.submitLocalRequest(original,{key:'a',kind:'appeal',scope:'r1',reason:'本轮分数有疑问'},1);
  assert.equal(original.length,0);
  assert.equal(result.list.length,1);
  assert.equal(result.record.status,'accepted');
});

test('回放进度不能越过原录像范围，坏输入回到开始', () => {
  assert.equal(typeof details.replayPosition,'function');
  assert.equal(details.replayPosition(-10,60),0);
  assert.equal(details.replayPosition(90,60),60);
  assert.equal(details.replayPosition(NaN,60),0);
  assert.equal(details.replayPosition(18,60),18);
});

test('历史详情渲染旧局结果，当前会话的新结果不会覆盖旧记录', () => {
  assert.equal(typeof details.create,'function');
  const data={screen:'coinLobby',history:[{id:'OLD-1',actual:-780,net:-1500,principal:780,shortfall:720,fee:20,balance:100,game:'红中麻将',field:'休闲场'}],tournament:{status:'none',points:0}};
  const button=(label,action,cls,extra)=>`<button data-action="${action}" ${extra||''}>${label}</button>`;
  const ctx={data,session:{result:{id:'NEW-2',actual:1500},coins:99999},t:data.tournament,e:{name:'新手杯'},gameName:'郑州麻将',fields:[],events:[],b:button,badge:x=>`<span>${x}</span>`,kv:(a,b)=>`${a} ${b}`,header:x=>`<h1>${x}</h1>`,footer:x=>x||'',panel:(a,b)=>`<section>${a}${b}</section>`,go:x=>{data.screen=x;},refresh(){},notify(){},showModal(){}};
  const ui=details.create(ctx);
  assert.equal(ui.dispatch('details:record','0'),true);
  const html=ui.pages.detailsRecord();
  assert.match(html,/OLD-1/);
  assert.match(html,/-780/);
  assert.match(html,/100/);
  assert.doesNotMatch(html,/NEW-2/);
  assert.equal(data.screen,'detailsRecord');
});

test('过期申诉动作保留原页面，不创建表单或处理单', () => {
  assert.equal(typeof details.create,'function');
  const data={screen:'eventFinal',history:[],tournament:{status:'finalTemp',reviewDeadline:1,points:24}};
  let feedback='';
  const ctx={data,session:{},t:data.tournament,e:{name:'新手杯'},gameName:'郑州麻将',go:x=>{data.screen=x;},notify:x=>{feedback=x;},refresh(){}};
  const ui=details.create(ctx);
  ui.dispatch('details:appeal');
  assert.equal(data.screen,'eventFinal');
  assert.equal(data.details.requests.length,0);
  assert.ok(feedback);
});

function moduleContext(data) {
  const button=(label,action,cls,extra)=>`<button data-action="${action}" ${extra||''}>${label}</button>`;
  return {data,t:data.tournament,e:{name:'当前赛事',rounds:3},session:{},gameName:'郑州麻将',events:[{name:'旧新手杯',rounds:3}],b:button,badge:x=>`<span>${x}</span>`,header:x=>`<h1>${x}</h1>`,footer:x=>x||'',go:x=>{data.screen=x;},refresh(){},notify(){},showModal(){}};
}

test('尚未确认的战绩金额不能显示成零金币，确认的零保留零', () => {
  const data={screen:'detailsHistory',history:[{id:'PENDING',actual:null,game:'红中麻将'},{id:'ZERO',actual:0,game:'红中麻将'}],tournament:{status:'none'}};
  const ui=details.create(moduleContext(data));
  const rendered=ui.pages.detailsHistory();
  assert.match(rendered,/待确认/);
  assert.equal((rendered.match(/>0 金币</g)||[]).length,1);
});

test('战绩查询失败保留原记录和筛选，重试成功不重复生成记录', async () => {
  const data={screen:'coinLobby',history:[{id:'ORIGINAL',actual:72,game:'红中麻将'}],tournament:{status:'none'},details:{historyFilter:{period:7,game:'红中麻将'}}};
  const ctx=moduleContext(data);let fail=true;
  ctx.readHistory=()=>fail?Promise.reject(Error('unavailable')):Promise.resolve();
  const ui=details.create(ctx);ui.dispatch('details:history');
  assert.match(ui.pages.detailsHistory(),/查询中/);
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(ui.pages.detailsHistory(),/查询未完成/);
  assert.match(ui.pages.detailsHistory(),/72 金币/);
  fail=false;ui.dispatch('details:historyRefresh');
  await new Promise(resolve=>setImmediate(resolve));
  assert.doesNotMatch(ui.pages.detailsHistory(),/查询未完成/);
  assert.equal(data.history.length,1);
  assert.equal(data.history[0].id,'ORIGINAL');
  assert.deepEqual(data.details.historyFilter,{period:7,game:'红中麻将'});
});

test('较早的失败查询不能覆盖新一次成功结果', async () => {
  const data={screen:'coinLobby',history:[],tournament:{status:'none'}};
  const ctx=moduleContext(data);let rejectOld,queries=0;
  ctx.readHistory=()=>++queries===1?new Promise((_,reject)=>{rejectOld=reject;}):Promise.resolve();
  const ui=details.create(ctx);ui.dispatch('details:history');ui.dispatch('details:historyRefresh');
  await new Promise(resolve=>setImmediate(resolve));rejectOld(Error('late failure'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(data.details.historyQuery.status,'ready');
  assert.match(ui.pages.detailsHistory(),/暂无记录/);
});

test('刷新恢复中断的战绩查询不会永久显示加载或冒充最新数据', () => {
  const data={screen:'detailsHistory',history:[],tournament:{status:'none'},details:{historyQuery:{status:'loading'}}};
  const ui=details.create(moduleContext(data));
  assert.match(ui.pages.detailsHistory(),/查询尚未完成/);
  assert.match(ui.pages.detailsHistory(),/historyRefresh/);
});

test('图文流程恢复非法页码回第一页，末页不能继续跳到空白教学', () => {
  const data={screen:'detailsRules',history:[],tournament:{status:'none'},details:{rulesMode:1,guidePage:999}};
  const ui=details.create(moduleContext(data));
  assert.match(ui.pages.detailsRules(),/1 \/ 4/);
  ui.dispatch('details:guidePage','3');
  assert.match(ui.pages.detailsRules(),/4 \/ 4/);
  ui.dispatch('details:guidePage','4');
  assert.match(ui.pages.detailsRules(),/4 \/ 4/);
});

test('未确认战绩详情不生成零额账目或允许未完成的回放', () => {
  const data={screen:'detailsRecord',history:[{id:'PENDING',actual:null,game:'红中麻将'}],tournament:{status:'none'},details:{recordIndex:0}};
  const ui=details.create(moduleContext(data));
  assert.match(ui.pages.detailsRecord(),/结算同步中/);
  assert.doesNotMatch(ui.pages.detailsRecord(),/0 <small>金币|data-action="details:ledger"|data-action="details:replay"/);
  assert.match(ui.pages.detailsLedger(),/结算同步中/);
  assert.match(ui.pages.detailsReplay(),/结算同步中/);
});

test('历史赛事只展示原轮次及精度，历史申诉动作不能改当前赛事', () => {
  const data={screen:'myEvents',event:0,history:[],tournament:{status:'finalTemp',round:3,points:99,reviewDeadline:Date.now()+60000},eventArchives:[{id:'old-event',event:0,rank:2,time:'昨天',tournament:{status:'final',round:2,points:6.5,roundRecords:[{stage:0,round:2,raw:123,points:6.5,cumulative:6.5,confirmed:true}]}}]};
  const ui=details.create(moduleContext(data));
  ui.dispatch('details:scoreHistory','0');
  const html=ui.pages.detailsScore();
  assert.match(html,/旧新手杯/);
  assert.match(html,/6\.50/);
  assert.match(html,/123/);
  assert.doesNotMatch(html,/99\.00/);
  ui.dispatch('details:appeal');
  assert.equal(data.screen,'detailsScore');
  assert.equal(data.tournament.points,99);
  assert.equal(data.details.requests.length,0);
});

test('当前赛果的申诉原单保持占用，查询不解锁，结论演示后才清除待复核标记', () => {
  const data={screen:'eventFinal',event:0,history:[],tournament:{status:'finalTemp',round:3,points:24,reviewStarted:10,reviewDeadline:Date.now()+60000}};
  const ui=details.create(moduleContext(data));
  ui.dispatch('details:score');
  ui.dispatch('details:appeal');
  data.details.appealDraft.reason='第2轮统计有疑问';data.details.appealDraft.round=2;
  ui.dispatch('details:submitAppeal');
  assert.equal(data.tournament.pendingAppeal,true);
  assert.equal(data.details.requests.length,1);
  const id=data.details.requests[0].id;
  ui.dispatch('details:request',id);
  assert.equal(data.tournament.pendingAppeal,true);
  ui.dispatch('details:demoProcessRequest',id);
  assert.equal(data.tournament.pendingAppeal,true);
  assert.equal(data.details.requests[0].status,'processing');
  ui.dispatch('details:demoResolveRequest',id);
  assert.equal(data.tournament.pendingAppeal,false);
  assert.equal(data.details.requests[0].status,'resolved');
});

test('反馈正文和证据按文本显示，不把用户输入执行为界面标记', () => {
  const data={screen:'home',history:[],tournament:{status:'none'}};
  const ui=details.create(moduleContext(data));
  ui.dispatch('details:help');
  data.details.helpDraft.reason='<img src=x onerror=alert(1)>';
  data.details.helpDraft.evidence='<script>bad()</script>';
  ui.dispatch('details:submitHelp');
  const html=ui.pages.detailsRequest();
  assert.match(html,/&lt;img src=x/);
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
});

test('历史成绩查看结束后从当前赛果新建申诉会恢复当前目标', () => {
  const data={screen:'myEvents',event:0,history:[],tournament:{status:'finalTemp',round:3,points:99,reviewDeadline:Date.now()+60000},eventArchives:[{id:'old-event',event:0,tournament:{status:'final',round:1,points:8}}]};
  const ui=details.create(moduleContext(data));
  ui.dispatch('details:scoreHistory','0');
  data.screen='eventFinal';
  ui.dispatch('details:appeal');
  assert.equal(data.screen,'detailsAppeal');
});

test('战绩日期与玩法筛选保留原数组索引，旧记录不会选到最新局', () => {
  assert.equal(typeof details.filterHistory,'function');
  const now=200*86400000;
  const history=[{id:'old',game:'红中麻将',created:now-40*86400000},{id:'target',game:'红中麻将',created:now-5*86400000},{id:'new',game:'郑州麻将',created:now-86400000}];
  const rows=details.filterHistory(history,{period:30,game:'红中麻将',now});
  assert.deepEqual(rows.map(x=>x.i),[1]);
  assert.equal(rows[0].r.id,'target');
  assert.equal(details.filterHistory(history,{period:180,game:'all',now}).length,3);
  assert.equal(details.filterHistory(Array.from({length:110},(_,i)=>({id:i})),{now}).length,100);
});

test('重新打开网页时回放保留原进度但恢复暂停，不显示没有播放时钟的假播放', () => {
  const data={screen:'detailsReplay',history:[{id:'replay-1',actual:5}],tournament:{status:'none'},details:{recordIndex:0,requests:[],replay:{recordId:'replay-1',position:23,duration:60,speed:2,playing:true}}};
  const ui=details.create(moduleContext(data));
  const html=ui.pages.detailsReplay();
  assert.equal(data.details.replay.position,23);
  assert.equal(data.details.replay.playing,false);
  assert.match(html,/data-action="details:replayToggle"[^>]*>播放/);
});

test('空白反馈显示关联到说明字段的内联错误，并保留已填写的关联和材料', () => {
  const data={screen:'home',history:[],tournament:{status:'none'}};
  const ui=details.create(moduleContext(data));ui.dispatch('details:help');
  Object.assign(data.details.helpDraft,{reference:'OLD-1',evidence:'材料.png',reason:'  '});
  ui.dispatch('details:submitHelp');
  const html=ui.pages.detailsHelp();
  assert.match(html,/<form[^>]*novalidate/);
  assert.match(html,/data-details-input="helpDraft.reason"[^>]*aria-invalid="true"[^>]*aria-describedby="details-helpDraft-reason-error"/);
  assert.match(html,/id="details-helpDraft-reason-error"[^>]*>请填写问题说明/);
  assert.match(html,/材料\.png/);
  assert.match(html,/OLD-1/);
  assert.equal(data.details.requests.length,0);
  assert.equal(data.details.helpDraft.reason,'  ');
});

test('轮次和小局错误分别关联原字段，纠正后提交只保留一张原单', () => {
  const data={screen:'eventFinal',event:0,history:[],tournament:{status:'finalTemp',round:3,reviewDeadline:Date.now()+60000}};
  const ui=details.create(moduleContext(data));ui.dispatch('details:appeal');
  Object.assign(data.details.appealDraft,{round:5,hand:0,reason:'核对第2轮'});
  ui.dispatch('details:submitAppeal');
  const html=ui.pages.detailsAppeal();
  assert.match(html,/data-details-input="appealDraft.round"[^>]*aria-invalid="true"/);
  assert.match(html,/data-details-input="appealDraft.hand"[^>]*aria-invalid="true"/);
  assert.match(html,/核对第2轮/);
  assert.equal(data.details.requests.length,0);
  Object.assign(data.details.appealDraft,{round:2,hand:3});
  ui.dispatch('details:submitAppeal');ui.dispatch('details:submitAppeal');
  assert.equal(data.details.requests.length,1);
  assert.equal(data.details.requests[0].round,2);
  assert.equal(data.details.requests[0].hand,3);
});

test('首个错误获得焦点，中文组合输入保留草稿，完成纠正后原地清错不重绘', () => {
  const originalDocument=global.document,listeners={},attrs={};let focused=0,refreshes=0;
  const input={dataset:{detailsInput:'helpDraft.reason'},value:'',focus(){focused++;},setAttribute(k,v){attrs[k]=v;},removeAttribute(k){delete attrs[k];}};
  const errorNode={hidden:false,textContent:''};
  global.document={addEventListener(type,fn){(listeners[type]||(listeners[type]=[])).push(fn);},querySelector(selector){return selector.includes('helpDraft.reason')?input:null;},getElementById(){return errorNode;}};
  try {
    const data={screen:'home',history:[],tournament:{status:'none'}},ctx=moduleContext(data);ctx.refresh=()=>{refreshes++;};
    const ui=details.create(ctx);ui.dispatch('details:help');ui.dispatch('details:submitHelp');
    assert.equal(focused,1);
    input.value='核对原局';listeners.input.forEach(fn=>fn({target:input,isComposing:true}));
    assert.equal(data.details.helpDraft.reason,'核对原局');
    assert.ok(data.details.helpDraft.errors.reason);
    const before=refreshes;listeners.compositionend.forEach(fn=>fn({target:input,isComposing:false}));
    assert.equal(data.details.helpDraft.errors.reason,undefined);
    assert.equal(attrs['aria-invalid'],'false');
    assert.equal(errorNode.hidden,true);
    assert.equal(refreshes,before);
  } finally { if(originalDocument===undefined)delete global.document;else global.document=originalDocument; }
});

test('赛事申诉提交与原单重查都保持赛事工具栏，金币反馈保持金币工具栏', () => {
  const data={screen:'eventFinal',event:0,history:[],tournament:{status:'finalTemp',round:3,reviewDeadline:Date.now()+60000}};
  const ctx=moduleContext(data);ctx.footer=(_,kind)=>`<footer data-kind="${kind}"></footer>`;
  const ui=details.create(ctx);ui.dispatch('details:appeal');data.details.appealDraft.reason='核对成绩';ui.dispatch('details:submitAppeal');
  const appealId=data.details.selectedRequest;
  assert.match(ui.pages.detailsRequest(),/data-kind="tournament"/);
  data.screen='coinLobby';ui.dispatch('details:help');data.details.helpDraft.reason='核对金币';ui.dispatch('details:submitHelp');
  assert.match(ui.pages.detailsRequest(),/data-kind="coin"/);
  ui.dispatch('details:request',appealId);
  assert.match(ui.pages.detailsRequest(),/data-kind="tournament"/);
});

test('申诉筛选记录页及其空态使用赛事工具栏，反馈筛选页保留金币工具栏', () => {
  const data={screen:'detailsScore',event:0,history:[],tournament:{status:'final'}};
  const ctx=moduleContext(data);ctx.footer=(_,kind)=>`<footer data-kind="${kind}"></footer>`;
  const ui=details.create(ctx);ui.dispatch('details:requests','appeal');
  assert.match(ui.pages.detailsRequests(),/data-kind="tournament"/);
  ui.dispatch('details:requestTab','1');
  assert.match(ui.pages.detailsRequests(),/data-kind="coin"/);
  ui.dispatch('details:requestTab','2');
  assert.match(ui.pages.detailsRequests(),/data-kind="tournament"/);
});
