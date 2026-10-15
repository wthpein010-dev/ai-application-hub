const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the browser entrypoints with VM-only access to internal test callbacks.
// No test callbacks or controls are exposed in the player build. The DOM supplies
// layout/dialog/storage/timing APIs; all page generation and actions stay real.
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scriptNames = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)].map(m => m[1].split(/[?#]/)[0]);
const scripts = scriptNames.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]);
const epoch = Date.parse('2026-10-13T02:00:00Z');
const plain = value => String(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&(?:lt|gt|amp|quot);/g, x => ({'&lt;':'<','&gt;':'>','&amp;':'&','&quot;':'"'}[x])).replace(/\s+/g, ' ').trim();

function boot(options = {}) {
  let now = options.now ?? epoch, timerId = 0, storageWrites = 0;
  const scheduled = new Map(), store = new Map(Object.entries(options.storage || {}));
  const events = new Map();
  function classList(initial = '') {
    const values = new Set(initial.split(/\s+/).filter(Boolean));
    return { add: (...xs) => xs.forEach(x => values.add(x)), remove: (...xs) => xs.forEach(x => values.delete(x)), contains: x => values.has(x), toggle(x, force) { const on = force ?? !values.has(x); on ? values.add(x) : values.delete(x); return on; } };
  }
  function node(name) {
    const listeners = new Map();
    return {
      name, innerHTML:'', textContent:'', style:{}, classList:classList(), className:'', dataset:{}, attributes:{}, disabled:false, isConnected:true,
      clientWidth:1920, clientHeight:1080, open:false,
      addEventListener(kind, fn) { listeners.set(kind, fn); },
      emit(kind, event = {}) { listeners.get(kind)?.({target:this, ...event}); },
      getBoundingClientRect() { return {left:0,top:0,right:1920,bottom:1080,width:1920,height:1080}; },
      getAttribute(key) { return this.attributes[key] ?? null; },
      setAttribute(key, value) { this.attributes[key] = String(value); },
      focus() { document.activeElement = this; },
      showModal() { this.open = true; },
      close() { this.open = false; listeners.get('close')?.({target:this}); },
      closest(selector) { return selector === 'button[data-action]' && this.dataset.action ? this : null; },
      querySelector(selector) { return selectButton(buttons(this.innerHTML), selector); },
      querySelectorAll(selector) { return selectButtons(buttons(this.innerHTML), selector); }
    };
  }
  function buttons(source) {
    return [...String(source).matchAll(/<button\b([^>]*?)>([\s\S]*?)<\/button>/g)].map(match => {
      const out = node('button'); out.textContent = plain(match[2]);
      for (const attr of match[1].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        const name = attr[1], value = attr[2] ?? attr[3] ?? attr[4] ?? '';
        out.attributes[name] = value;
        if (name.startsWith('data-')) out.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
        if (name === 'disabled') out.disabled = true;
        if (name === 'class') out.classList = classList(value);
      }
      return out;
    });
  }
  function selectButtons(list, selector) {
    const action = selector.match(/\[data-action=["']([^"']+)["']\]/)?.[1];
    const cls = [...selector.matchAll(/\.([\w-]+)/g)].at(-1)?.[1];
    return list.filter(x => (!action || x.dataset.action === action) && (!cls || x.classList.contains(cls)));
  }
  const selectButton = (list, selector) => selectButtons(list, selector)[0] || null;
  const nodes = Object.fromEntries(['stage','modal','modal-body','sheet','sheet-body','frame','advance','screen-label','flow-hint','toast','viewport','lobby-chooser'].map(id => [id, node(id)]));
  const staticButtons = buttons(html.slice(html.indexOf('<body>'), html.indexOf('<main')));
  const modalClose = buttons(html.slice(html.indexOf('<dialog'), html.indexOf('<div id="modal-body"')))[0];
  nodes.modal.querySelector = selector => selector.includes('modal-close') ? modalClose : selectButton(buttons(nodes['modal-body'].innerHTML), selector);
  const document = {
    body:node('body'), activeElement:null, fullscreenElement:null, title:'',
    addEventListener(kind, fn) { const key='document:' + kind; events.set(key,[...(events.get(key)||[]),fn]); },
    querySelector(selector) {
      if (/^#[\w-]+$/.test(selector)) return nodes[selector.slice(1)] || null;
      if (selector.includes('workbench') || selector.includes('[data-action="pause"]')) return selectButton(staticButtons, selector.replace(/\.workbench/g, ''));
      return selectButton([...buttons(nodes.stage.innerHTML), ...buttons(nodes['modal-body'].innerHTML), ...staticButtons], selector);
    },
    querySelectorAll(selector) {
      if (selector === '.workbench nav button') return staticButtons.filter(x => ['home','coin','tournament','directory'].includes(x.dataset.action));
      return selectButtons([...buttons(nodes.stage.innerHTML), ...buttons(nodes['modal-body'].innerHTML)], selector);
    }
  };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  function schedule(fn, ms = 0, interval = 0) { const id = ++timerId; scheduled.set(id, {fn, due:now + Math.max(0, Number(ms) || 0), interval}); return id; }
  const context = vm.createContext({
    document, Date:ClockDate, console, Intl, ResizeObserver:class { observe() {} },
    localStorage:{ getItem:key => store.get(key) ?? null, setItem:(key,value) => {storageWrites++;store.set(key,String(value));}, removeItem:key => store.delete(key) },
    setTimeout:(fn,ms) => schedule(fn,ms), clearTimeout:id => scheduled.delete(id),
    setInterval:(fn,ms) => schedule(fn,ms,Math.max(1,Number(ms)||1)), clearInterval:id => scheduled.delete(id),
    addEventListener:(kind,fn) => events.set(kind,fn)
  });
  context.window = context;
  for (const [name, source] of scripts) vm.runInContext(name==='app.js'?source.replace('  window.FieldUI={handle(event){','  window.__testActions={dispatch,advance,scenario};\n  window.FieldUI={handle(event){'):source, context, {filename:name});
  function state() {
    const key = [...store.keys()].find(x => x.startsWith('maluer-fields-'));
    assert.ok(key, 'the real app should save its current state');
    return JSON.parse(store.get(key));
  }
  function visibleButtons() { return [...(nodes.modal.open ? [...buttons(nodes['modal-body'].innerHTML), modalClose] : buttons(nodes.sheet.open ? nodes['sheet-body'].innerHTML : nodes.stage.innerHTML)), ...(!nodes['lobby-chooser'].hidden?buttons(nodes['lobby-chooser'].innerHTML):[]), ...staticButtons]; }
  let testNavigation=false;
  function click(action, value) {
    if(action==='tools')return;
    if(action==='directory'){testNavigation=true;return;}
    if(testNavigation){testNavigation=false;context.__testActions.dispatch(action,value);return;}
    if(action==='setRegion'){
      const source=nodes.stage.innerHTML;
      assert.match(source,/<select\b[^>]*aria-label="切换地区"/);
      assert.ok(source.includes(`value="${value}"`),'region option must exist');
      context.FieldUI.setRegion(value);return;
    }
    if(action==='advance'){context.__testActions.advance();return;}
    if(/Scenario$/.test(action)||['tableFailure','matchFailure','newReward'].includes(action)){context.__testActions.scenario(action);return;}
    if(['pause','nextStage','eliminateEvent'].includes(action)||action.startsWith('details:demo')||action==='support:scenario'){context.__testActions.dispatch(action,value);return;}
    const button = visibleButtons().find(x => x.dataset.action === action && (value === undefined || x.dataset.value === String(value)) && !x.disabled);
    assert.ok(button, `visible enabled action ${action}${value === undefined ? '' : ':' + value} missing on ${state().data.screen}; modal=${plain(nodes['modal-body'].innerHTML)}`);
    context.FieldUI.handle({target:button});
  }
  function clickText(pattern) {
    const button = visibleButtons().find(x => pattern.test(x.textContent) && !x.disabled && x.dataset.action);
    assert.ok(button, `visible enabled button ${pattern} missing on ${state().data.screen}`);
    context.FieldUI.handle({target:button});
  }
  function clickAny(actions) {
    const button = visibleButtons().find(x => actions.includes(x.dataset.action) && !x.disabled);
    assert.ok(button, `visible enabled action from ${actions.join(', ')} missing on ${state().data.screen}`);
    context.FieldUI.handle({target:button});
  }
  function input(name,value) {
    const source=nodes.modal.open?nodes['modal-body'].innerHTML:nodes.sheet.open?nodes['sheet-body'].innerHTML:nodes.stage.innerHTML;
    assert.ok(source.includes(`data-details-input="${name}"`),`visible input ${name} missing`);
    const target=node('input');target.dataset.detailsInput=name;target.value=String(value);
    for(const listener of events.get('document:input')||[])listener({target});
  }
  function tick(ms) {
    const end = now + ms; let iterations = 0;
    while (true) {
      const next = [...scheduled.entries()].filter(([,t]) => t.due <= end).sort((a,b) => a[1].due - b[1].due || a[0] - b[0])[0];
      if (!next) break;
      assert.ok(++iterations < 10000, 'fake clock timer loop must converge');
      const [id,timer] = next; now = timer.due; scheduled.delete(id);
      if (timer.interval) scheduled.set(id,{...timer,due:now + timer.interval});
      timer.fn();
    }
    now = end;
  }
  return {click,clickText,clickAny,input,tick,state,now:() => now,storage:() => Object.fromEntries(store),storageWrites:()=>storageWrites,receive:raw=>events.get('storage')?.({key:[...store.keys()].find(x=>x.startsWith('maluer-fields-')),newValue:JSON.stringify(raw)}),html:() => nodes.sheet.open ? nodes['sheet-body'].innerHTML : nodes.stage.innerHTML,underlay:() => nodes.stage.innerHTML,stageClass:() => nodes.stage.className,sheetOpen:() => nodes.sheet.open,sheetSize:() => [nodes.sheet.style.width,nodes.sheet.style.height],modalSize:() => [nodes.modal.style.width,nodes.modal.style.height],emit:(id,kind,event) => nodes[id].emit(kind,event),modal:() => nodes.modal.open ? nodes['modal-body'].innerHTML : '',key:() => [...store.keys()].find(x => x.startsWith('maluer-fields-'))};
}

test('准备桌以完整桌面和中央准备操作呈现，发牌前不显示牌墙或手牌',()=>{
  const app=boot();matchToReady(app);
  assert.match(app.stageClass(),/gameplay/);assert.match(app.html(),/table-ready-stage/);
  assert.doesNotMatch(app.html(),/aside-panel|本局信息|class="tilebacks|class="hand"|class="footerbar"/);
  assert.match(plain(app.html()),/底分 200/);assert.match(plain(app.html()),/成功发牌扣/);
  app.click('deal');assert.equal(app.state().session.status,'seated');
  assert.match(plain(app.html()),/全员已准备/);app.tick(3000);
  assert.equal(app.state().session.status,'playing');assert.match(app.html(),/class="hand"/);
});

test('对局工具按需从牌桌菜单打开，配套页保持新的牌桌背景和原本金',()=>{
  const app=boot();matchToReady(app);app.click('deal');app.tick(3000);
  assert.doesNotMatch(app.html(),/aside-panel|side-tabs|本局信息/);
  const principal=app.state().session.principal;
  app.click('tableMenu');assert.match(plain(app.modal()),/牌桌菜单/);app.click('help');
  assert.equal(app.state().data.screen,'detailsHelp');assert.match(app.stageClass(),/gameplay/);
  assert.match(app.underlay(),/table-topbar/);assert.equal(app.state().session.principal,principal);
  app.click('back');app.click('trust');assert.equal(app.state().session.auto,true);
  assert.match(app.html(),/trust-overlay/);
});

test('赛事桌沿用同一桌面，轮末弹板背景不可操作手牌且不恢复侧栏',()=>{
  const app=boot();enterFirstEvent(app);assert.match(app.stageClass(),/gameplay/);
  assert.doesNotMatch(app.html(),/aside-panel|side-tabs/);assert.match(plain(app.html()),/第1轮/);
  app.tick(30000);assert.equal(app.state().data.tournament.status,'smallResult');
  assert.match(app.stageClass(),/gameplay/);assert.doesNotMatch(app.underlay(),/aside-panel/);
  assert.match(app.underlay(),/aria-label="选择一万第1张"[^>]*disabled/);
});

test('直接开始匹配：选场已明示扣费与离桌限制，点击后不再确认',()=>{
  const app=boot();app.click('coin');
  assert.match(plain(app.html()),/成功发牌扣费/);
  assert.match(plain(app.html()),/开局后不可离桌/);
  app.click('startCoin');
  assert.equal(app.modal(),'');assert.equal(app.state().data.screen,'coinMatch');
  assert.equal(app.state().session.status,'matching');assert.equal(app.state().session.coins,128600);
  assert.equal(app.state().session.reserved,20);
});

test('直接取消匹配或准备：释放预留、不扣金币，不再增加确认',()=>{
  for(const seated of [false,true]){
    const app=boot();app.click('coin');app.click('startCoin');if(seated)app.tick(8000);
    assert.equal(app.state().session.status,seated?'seated':'matching');
    app.click('cancelCoin');assert.equal(app.modal(),'');
    assert.equal(app.state().data.screen,'coinLobby');assert.equal(app.state().session.status,'idle');
    assert.equal(app.state().session.reserved,0);assert.equal(app.state().session.coins,128600);
    app.tick(130000);assert.equal(app.state().session.status,'idle');
  }
});

test('取消的过期操作不能在发牌后离桌或停止本局结算计时',()=>{
  const app=boot();app.click('coin');app.click('startCoin');app.tick(8000);app.click('deal');app.tick(3000);
  assert.equal(app.state().session.status,'playing');
  app.click('directory');app.click('confirmCancel');
  assert.equal(app.state().session.status,'playing');assert.ok(app.state().session.principal>0);
  app.tick(30000);assert.equal(app.state().session.status,'idle');assert.ok(app.state().session.result);
});

test('不同功能和赛事状态页使用同一功能窗口，提示与设置使用同一提示窗口',()=>{
  const app=boot();app.click('coin');
  for(const action of ['supply','history','rules']){
    app.click(action);assert.deepEqual(app.sheetSize(),['1280px','860px'],action);app.click('back');
  }
  app.click('home');app.click('activity');assert.deepEqual(app.sheetSize(),['1280px','860px']);app.click('back');app.click('settings');const size=app.modalSize();
  assert.deepEqual(size,['800px','600px']);app.click('closeModal');
  app.click('tournament');app.click('eventDetail','0');app.click('register');
  assert.deepEqual(app.modalSize(),size);assert.match(plain(app.modal()),/报名确认/);
  app.click('confirmRegister');assert.deepEqual(app.sheetSize(),['1280px','860px']);
});

test('大厅十方案保存选择并共用实际入口，切换不动账户与玩法；失效风格只恢复默认外观',()=>{
  let app=boot();const original=app.state();
  for(const id of ['jade','wood','ink','night','corner','rail','festival','poster','shelf','classic']){
    app.click('lobbyStyle',id);assert.equal(app.state().data.lobbyStyle,id);
    assert.deepEqual(app.state().session,original.session);
    assert.equal(app.state().data.region,original.data.region);
    app=boot({storage:app.storage()});assert.equal(app.state().data.lobbyStyle,id);
    app.click('coin');assert.equal(app.state().data.screen,'coinLobby');
    app.click('home');app.click('tournament');assert.equal(app.state().data.screen,'eventCenter');app.click('home');
  }
  const saved=app.state();saved.data.lobbyStyle='<invalid>';saved.session.coins=7654;
  app=boot({storage:{[app.key()]:JSON.stringify(saved)}});
  assert.equal(app.state().data.lobbyStyle,'classic');assert.equal(app.state().session.coins,7654);
});

test('新增大厅活动位打开实际四活动与总入口，关闭回原方案且不自动领金币',()=>{
  const app=boot();const coins=app.state().session.coins;
  for(const [style,action,screen] of [['corner','activity','supportActivity'],['rail','support:teaPage','supportTea'],['festival','support:flipPage','supportFlip'],['poster','support:signinPage','supportSignin'],['shelf','support:returnPage','supportReturn']]){
    app.click('lobbyStyle',style);app.click(action);assert.equal(app.state().data.screen,screen);
    assert.deepEqual(app.sheetSize(),['1280px','860px']);assert.equal(app.state().session.coins,coins);
    app.click('back');assert.equal(app.state().data.screen,'home');assert.equal(app.state().data.lobbyStyle,style);
  }
});

test('金币选场使用顶部横向玩法，当前场档角标与快速开始副标题同步',()=>{
  let app=boot();app.click('coin');
  assert.match(app.html(),/<nav class="coin-game-tabs" aria-label="金币场玩法"/);
  assert.doesNotMatch(app.html(),/catalogue-nav|region-game-nav/);
  const startText=()=>plain([...app.html().matchAll(/<button\b([^>]+)>([\s\S]*?)<\/button>/g)].find(m=>m[1].includes('data-action="startCoin"'))[2]);
  assert.match(startText(),/快速开始.*郑州麻将 · 高手场/);
  app.click('selectField','1');
  assert.match(startText(),/快速开始.*郑州麻将 · 进阶场/);
  assert.equal((app.html().match(/class="field-selection-flag"/g)||[]).length,1);
  assert.match(app.html(),/data-action="selectField"[^>]*data-value="1"[^>]*aria-pressed="true"/);
  app=boot({storage:app.storage()});assert.match(startText(),/郑州麻将 · 进阶场/);
  app.click('profile','ddz-classic');assert.match(startText(),/斗地主 · 精英场/);
  assert.match(app.html(),/coin-fields four/);
});

test('每页四张场档保持原配置，第五档可翻页选择和刷新，切回麻将恢复第一页',()=>{
  let app=boot();app.click('coin');app.click('profile','ddz-classic');
  const visible=()=>[...app.html().matchAll(/data-action="selectField"[^>]*data-value="(\d+)"/g)].map(m=>Number(m[1]));
  assert.deepEqual(visible(),[0,1,2,3]);
  app.click('fieldWindow','1');assert.deepEqual(visible(),[1,2,3,4]);
  app.click('selectField','4');assert.equal(app.state().data.field,4);
  assert.match(app.html(),/斗地主 · 大师场/);
  app=boot({storage:app.storage()});assert.deepEqual(visible(),[1,2,3,4]);
  assert.equal(app.state().data.field,4);
  app.click('profile','');assert.deepEqual(visible(),[0,1,2,3]);
  assert.doesNotMatch(app.html(),/data-action="fieldWindow"/);
  assert.equal(app.state().session.coins,128600);
});

test('地区下拉切换直接更新四项金币玩法，名称顺序和刷新状态保持一致',()=>{
  let app=boot();app.click('coin');
  assert.match(app.html(),/<select\b[^>]*aria-label="切换地区"/);
  app.click('setRegion','信阳');
  assert.equal(app.modal(),'');assert.equal(app.state().data.region,'信阳');
  assert.equal(app.state().data.profile,'gushi');
  const names=[...app.html().matchAll(/data-action="profile"[^>]*>([\s\S]*?)<\/button>/g)].map(m=>plain(m[1]));
  assert.deepEqual(names,['固始麻将','老五嘴麻将','斗地主','跑的快']);
  assert.doesNotMatch(app.html(),/>够级<|>掼蛋<|>升级<|免洗斗地主/);
  app.click('profile','laowuzui');app=boot({storage:app.storage()});
  assert.equal(app.state().data.profile,'laowuzui');assert.match(app.html(),/老五嘴麻将/);assert.match(app.html(),/4人对局/);
  app.click('setRegion','云南昭通');assert.equal(app.state().data.profile,'guangchuntian');
  assert.match(app.html(),/光春天/);assert.match(app.html(),/4人对局/);
});

test('未开放玩法与匹配中地区变更不会改动原局，旧六人匹配存档仍可恢复',()=>{
  const app=boot();app.click('coin');app.click('directory');app.click('profile','gushi');
  assert.equal(app.state().data.profile,'');
  app.click('startCoin');
  app.click('matchHome');app.click('coin');assert.match(app.html(),/<select\b[^>]*disabled/);
  const original=app.state();app.click('directory');app.click('setRegion','洛阳');
  assert.equal(app.state().data.region,'郑州');assert.equal(app.state().session.reserved,original.session.reserved);
  const old=app.state();old.data.profile='gouji-dragon';old.data.region='武汉';
  const restored=boot({storage:{[app.key()]:JSON.stringify(old)}});restored.tick(8000);
  assert.equal(restored.state().session.status,'seated');assert.equal(restored.state().data.region,'武汉');
  assert.equal(restored.state().data.profile,'gouji-dragon');assert.match(restored.html(),/6 人/);
});

test('home loads the priority hall image without downloading the hidden secondary background',()=>{
  const app=boot();
  const home=app.html();
  assert.match(home,/<img\b[^>]*src="assets\/home-hub\.webp"[^>]*fetchpriority="high"/);
  assert.match(home,/<img\b[^>]*width="1671"[^>]*height="941"/);
  const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  const base=css.match(/\.stage\{([^}]+)\}/)[1];
  assert.doesNotMatch(base,/url\(/,'hall must not download the covered courtyard');
  assert.match(css,/\.stage\.soft\{[^}]*url\(['"]?assets\/courtyard\.webp/);
  app.click('coin');
  assert.match(app.html(),/selection-body/);
});

test('cross-version storage events render remote state without republishing it into an endless echo',()=>{
  const app=boot();app.click('coin');const incoming=app.state();incoming.data.field=1;
  const {profile,...rest}=incoming.data;incoming.data={...rest,profile};
  const before=app.storageWrites();app.receive(incoming);
  assert.equal(app.storageWrites(),before,'receiving another tab update must not write storage again');
  assert.match(app.html(),/data-action="selectField"[^>]*data-value="1"[^>]*aria-label="[^"]+" aria-pressed="true"/);assert.match(app.html(),/郑州麻将 · 进阶场/);
  app.click('selectField',2);assert.equal(app.state().data.field,2);assert.ok(app.storageWrites()>before);
});

test('ending a live coin round behind accessories replaces the old table backdrop with the current selection',()=>{
  const app=boot();app.click('coin');app.click('profile','ddz-classic');app.click('startCoin');app.tick(8000);app.click('deal');app.tick(3000);
  app.click('supply');app.click('support:activities');app.tick(30000);
  assert.equal(app.state().session.status,'idle');
  assert.match(app.underlay(),/selection-body/);
  assert.doesNotMatch(app.underlay(),/poker-table|本局进行中不能离桌/);
  app.click('back');app.click('back');assert.equal(app.state().data.screen,'coinLobby');
});

test('visible entry amounts and three-person poker follow the selected mode through settlement',()=>{
  const app=boot();app.click('coin');
  assert.match(app.html(),/准入金币/);assert.match(app.html(),/entry-corner/);
  app.click('profile','ddz-classic');
  assert.equal(app.state().data.profile,'ddz-classic');
  app.click('selectField','2');app.click('startCoin');app.tick(8000);
  assert.match(app.html(),/3 人/);app.click('deal');app.tick(3000);
  assert.match(app.html(),/poker-hand/);assert.doesNotMatch(app.html(),/剩余牌 72/);
  app.tick(30000);assert.equal(app.state().data.screen,'coinResult');
  assert.equal((app.html().match(/<tr class=/g)||[]).length,3);
});

test('shortage preserves the selected high field through supply and close, without queuing',()=>{
  const app=boot();app.click('coin');app.click('selectField','3');app.click('startCoin');
  assert.equal(app.state().data.screen,'supportSupply');assert.match(app.html(),/金币不足/);
  assert.match(app.html(),/371,400/);assert.match(app.html(),/金币礼包/);
  app.click('back');assert.equal(app.state().data.screen,'coinLobby');assert.equal(app.state().data.field,3);
  assert.equal(app.state().session.status,'idle');
});

test('新地区三人扑克匹配及玩法存档恢复不回退为四人麻将',()=>{
  let app=boot();app.click('coin');app.click('setRegion','云南昭通');app.click('profile','pdk');app.click('selectField','2');
  app.click('startCoin');app.tick(3000);
  app=boot({now:app.now(),storage:app.storage()});app.tick(8000);
  assert.equal(app.state().data.profile,'pdk');assert.equal(app.state().data.region,'云南昭通');assert.match(app.html(),/3 人/);
  app.click('deal');app.tick(3000);assert.match(app.html(),/跑的快/);assert.match(app.html(),/poker-hand/);
});

test('poker bidding and doubles precede playing, while wallet orders credit once and preserve the source field',()=>{
  let app=boot();app.click('coin');app.click('profile','ddz-classic');app.click('startCoin');app.tick(8000);app.click('deal');app.tick(3000);
  assert.match(app.html(),/叫地主/);app.click('pokerBid','3');assert.match(app.html(),/加倍/);app.click('pokerDouble','1');
  app.click('hint');assert.equal(app.state().data.selectedTile,0);app.click('discard');
  app.tick(30000);app.click('coin');app.click('selectField','3');app.click('startCoin');app.click('coinPackages');app.click('packOrder','5');
  const before=app.state().session.coins;app.click('payPack');assert.equal(app.state().session.coins,before+518400);
  app=boot({now:app.now(),storage:app.storage()});assert.match(app.html(),/购买成功/);
  app.click('returnSelection');assert.equal(app.state().data.field,3);assert.equal(app.state().session.status,'idle');
  app.click('startCoin');assert.equal(app.modal(),'');assert.equal(app.state().session.status,'matching');
});

test('activity tabs retain one window size through switching and reload', () => {
  let app=boot(); app.click('activity');
  const size=app.sheetSize();
  for(const [action,screen] of [['signinPage','supportSignin'],['teaPage','supportTea'],['returnPage','supportReturn'],['flipPage','supportFlip'],['activities','supportActivity']]) {
    app.click('support:'+action);
    assert.equal(app.state().data.screen,screen);
    assert.deepEqual(app.sheetSize(),size,screen);
    app=boot({storage:app.storage()});
    assert.deepEqual(app.sheetSize(),size,screen+' reload');
  }
});

test('activity tabs close once to their opener after switching and reloading', () => {
  let app=boot();app.click('activity');
  for(const action of ['signinPage','teaPage','returnPage','flipPage','activities'])app.click('support:'+action);
  app=boot({storage:app.storage()});app.click('back');
  assert.equal(app.sheetOpen(),false);
  assert.equal(app.state().data.screen,'home');
});

test('activity dismissal skips tab history in older saves and resumes the live queue', () => {
  let app=boot();app.click('coin');app.click('startCoin');app.click('supply');app.click('support:activities');
  app.click('support:teaPage');
  const storage=app.storage(), saved=JSON.parse(storage[app.key()]);
  saved.data.navStack.push('supportActivity','supportSignin','supportReturn');
  storage[app.key()]=JSON.stringify(saved);app=boot({storage});app.tick(8000);
  app.emit('sheet','cancel',{preventDefault(){}});
  assert.equal(app.state().data.screen,'supportSupply');
  app.emit('sheet','cancel',{preventDefault(){}});
  assert.equal(app.sheetOpen(),false);
  assert.equal(app.state().data.screen,'coinReady');
  assert.equal(app.state().session.status,'seated');
});

test('home actions sit only on visible original artwork, without duplicate entry panels', () => {
  const app = boot();
  assert.doesNotMatch(app.html(), /home-entries|game-header/);
  assert.equal([...app.html().matchAll(/data-action="coin"/g)].length, 1);
  assert.equal([...app.html().matchAll(/data-action="tournament"/g)].length, 1);
  assert.doesNotMatch(html.slice(0, html.indexOf('<main')), /data-action="(?:coin|tournament)"/);
});

test('outside explanation click dismisses without reserving coins or starting a queue', () => {
  const app=boot(); app.click('coin'); app.click('wallet');
  app.emit('modal','pointerdown',{clientX:-1,clientY:-1});
  app.emit('modal','pointerup',{clientX:-1,clientY:-1});
  assert.equal(app.modal(),''); assert.equal(app.state().session.status,'idle');
  assert.equal(app.state().session.coins,128600);
});

test('secondary pages close over the live queue and cannot discard its progress', () => {
  const app=boot(); app.click('coin'); app.click('startCoin');
  app.click('supply');
  assert.equal(app.sheetOpen(),true); assert.match(app.underlay(),/真人匹配/);
  app.tick(8000);
  app.emit('sheet','cancel',{preventDefault(){}});
  assert.equal(app.sheetOpen(),false); assert.equal(app.state().data.screen,'coinReady');
  assert.equal(app.state().session.status,'seated');
});

test('accessory windows have no synthetic return-flow button and close to the active table', () => {
  const app=boot();app.click('coin');app.click('startCoin');
  app.click('supply');
  assert.doesNotMatch(plain(app.html()),/返回(?:原|当前)?流程/);
  app.tick(8000);app.emit('sheet','cancel',{preventDefault(){}});
  app.click('deal');app.tick(3100);app.click('tableMenu');app.click('history');
  assert.doesNotMatch(plain(app.html()),/返回(?:原|当前)?流程/);
  app.emit('sheet','cancel',{preventDefault(){}});
  assert.equal(app.state().data.screen,'coinPlay');
  assert.equal(app.state().session.status,'playing');
});

test('event center returns to the lobby after closing registration status without cancelling entry', () => {
  const app=boot();registerFirst(app);
  app.click('eventCenter');app.click('home');
  assert.equal(app.state().data.screen,'home');
  assert.equal(app.state().data.tournament.status,'registered');
});

test('closing a small-result window keeps the continuation deadline and does not ask to leave', () => {
  const app=boot();enterFirstEvent(app);app.click('advance');
  const deadline=app.state().data.tournament.nextHandDeadline;
  app.emit('sheet','cancel',{preventDefault(){}});
  assert.equal(app.sheetOpen(),false);
  assert.equal(app.modal(),'');
  assert.equal(app.state().data.screen,'eventTable');
  assert.equal(app.state().data.tournament.status,'smallResult');
  assert.equal(app.state().data.tournament.nextHandDeadline,deadline);
  assert.throws(()=>app.click('tile',0),/missing/);
  app.tick(10000);
  assert.equal(app.state().data.tournament.hand,2);
  assert.equal(app.state().data.tournament.status,'table');
});

test('closing blank around event details returns to center without signing up', () => {
  const app=boot(); app.click('tournament'); app.click('eventDetail',0);
  assert.equal(app.sheetOpen(),true); assert.match(app.underlay(),/全部赛事/);
  app.emit('sheet','pointerdown',{clientX:-1,clientY:-1});
  app.emit('sheet','pointerup',{clientX:-1,clientY:-1});
  assert.equal(app.state().data.screen,'eventCenter');
  assert.equal(app.state().data.tournament.status,'none');
});

test('waiting windows expose only player actions without a time advancement control', () => {
  const app=boot();registerFirst(app);
  assert.doesNotMatch(app.html(),/sheet-demo-controls/);
  app.click('advance');
  assert.equal(app.state().data.tournament.status,'checkin');
  assert.equal(app.sheetOpen(),true);
});

test('returning to selection after settlement cannot reopen a cleared table or old result', () => {
  const app=boot();matchToReady(app);app.click('deal');app.click('advance');app.click('advance');
  app.click('coin');assert.equal(app.state().data.screen,'coinLobby');
  app.click('home');assert.equal(app.state().data.screen,'home');
  assert.equal(app.state().session.status,'idle');
});

function matchToReady(app) {
  app.click('coin'); app.click('startCoin');  app.click('advance');
  assert.equal(app.state().session.status, 'seated');
}
function registerFirst(app) {
  app.click('directory'); app.click('tournament'); app.click('eventDetail',0); app.click('register'); app.click('confirmRegister');
}
function enterFirstEvent(app) {
  registerFirst(app); app.click('advance'); app.click('checkin'); app.click('advance'); app.click('advance');
  assert.equal(app.state().data.tournament.status,'table');
}

test('invalid page or account storage restores a usable fresh entry atomically', () => {
  const baseline = boot(), saved = baseline.storage(), key = baseline.key();
  for (const damage of [s => { s.data.tournament = null; s.data.screen = 'eventCenter'; }, s => { s.session.coins = -1; s.data.screen = 'eventCenter'; }]) {
    const raw = JSON.parse(saved[key]); damage(raw);
    const app = boot({storage:{...saved,[key]:JSON.stringify(raw)}});
    assert.equal(app.state().session.coins,128600);
    assert.equal(app.state().data.tournament.status,'none');
    assert.equal(app.state().data.screen,'home','a rejected account must not partially adopt the candidate page');
    app.click('tournament');
    assert.match(app.html(),/赛事/);
    app.click('eventDetail',0); app.click('register');
    assert.match(plain(app.modal()),/报名/);
  }
});

test('cancelling before the roster locks releases registration without changing coins', () => {
  const app = boot(), coins = app.state().session.coins;
  registerFirst(app); app.clickText(/^取消报名$/); app.clickText(/^确认取消$/);
  assert.equal(app.state().data.screen,'eventCenter');
  assert.equal(app.state().data.tournament.status,'none');
  assert.equal(app.state().session.coins,coins);
  app.click('eventDetail',1); app.click('register'); app.click('confirmRegister');
  assert.equal(app.state().data.event,1);
  assert.equal(app.state().data.tournament.status,'registered');
});

test('a formally finished event can be followed by a different event without duplicating its prize', () => {
  const app = boot(); app.click('tools'); app.click('finalScenario'); app.click('advance');
  assert.equal(app.state().data.tournament.status,'final');
  const coins = app.state().session.coins;
  assert.equal(coins,128700);
  app.click('eventCenter'); app.click('eventDetail',1); app.click('register'); app.click('confirmRegister');
  assert.equal(app.state().data.event,1);
  assert.equal(app.state().data.tournament.status,'registered');
  assert.equal(app.state().session.coins,coins);
  assert.equal(app.state().data.eventArchives.length,1);
});

test('provisional ranking does not announce a confirmed champion or pay its prize', () => {
  const app = boot(); app.click('tools'); app.click('finalScenario');
  assert.equal(app.state().data.tournament.status,'finalTemp');
  assert.match(plain(app.html()),/临时|待复核/);
  assert.doesNotMatch(app.html(),/<h2(?:\s[^>]*)?>\s*冠军\s*<\/h2>/);
  assert.equal(app.state().session.coins,128600);
  assert.equal(app.state().data.tournament.awarded,false);
});

test('ready players wait three seconds before the one service fee is charged', () => {
  const app = boot(); matchToReady(app); app.click('deal');
  assert.notEqual(app.state().session.status,'playing');
  assert.equal(app.state().session.coins,128600);
  app.tick(2999);
  assert.notEqual(app.state().session.status,'playing');
  assert.equal(app.state().session.coins,128600);
  app.tick(1);
  assert.equal(app.state().session.status,'playing');
  assert.equal(app.state().session.coins,128580);
  assert.equal(app.state().session.principal,128580);
  app.tick(5000);
  assert.equal(app.state().session.coins,128580);
});

test('an internal test clock shortcut never charges the ready countdown twice', () => {
  const app = boot(); matchToReady(app); app.click('deal'); app.click('advance');
  assert.equal(app.state().session.status,'playing');
  assert.equal(app.state().session.coins,128580);
  app.tick(3000);
  assert.equal(app.state().session.status,'playing');
  assert.equal(app.state().session.coins,128580);
});

test('reload preserves the original next-hand deadline instead of restarting ten seconds', () => {
  const original = boot(); enterFirstEvent(original); original.click('advance');
  assert.equal(original.state().data.tournament.status,'smallResult');
  original.tick(9000);
  const restored = boot({storage:original.storage(),now:original.now()});
  restored.tick(999);
  assert.equal(restored.state().data.tournament.status,'smallResult');
  restored.tick(1);
  assert.equal(restored.state().data.tournament.status,'table');
  assert.equal(restored.state().data.tournament.hand,2);
});

test('help and shop return to the original active table while another live entry remains blocked', () => {
  const app = boot(); matchToReady(app); app.click('deal'); app.click('advance');
  const started = app.state().session.started, principal = app.state().session.principal, coins = app.state().session.coins;
  app.click('tableMenu');app.click('help');
  if (app.modal()) app.click('closeModal'); else app.click('back');
  assert.equal(app.state().data.screen,'coinPlay');
  app.click('supply');
  const supplyScreen = app.state().data.screen;
  // Depending on the integrated support page, the same visible shop entry is a
  // modal or its own page. Both must return to the original active table.
  app.clickAny(['support:shop','shop']);
  if (app.modal()) app.click('closeModal');
  else { app.click('back'); assert.equal(app.state().data.screen,supplyScreen); }
  app.click('back');
  assert.equal(app.state().data.screen,'coinPlay');
  app.click('directory'); app.click('coin');
  assert.equal(app.state().session.status,'playing');
  if (app.modal()) app.click('closeModal');
  app.click('directory'); app.click('tournament'); app.click('eventDetail',0); app.click('register');
  assert.match(plain(app.modal()),/未结束|先完成|不能/);
  assert.notEqual(app.state().data.tournament.status,'registered');
  assert.equal(app.state().session.status,'playing');
  assert.equal(app.state().session.started,started);
  assert.equal(app.state().session.principal,principal);
  assert.equal(app.state().session.coins,coins);
});

test('a ready countdown created while paused resumes with only its own three seconds', () => {
  const app=boot();app.click('coin');app.click('startCoin');app.click('pause');
  app.tick(30000);app.click('advance');
  assert.equal(app.state().session.status,'seated');
  app.tick(10000);app.click('deal');app.tick(20000);app.click('pause');
  app.tick(2999);assert.equal(app.state().session.status,'seated');
  app.tick(1);assert.equal(app.state().session.status,'playing');
  assert.equal(app.state().session.coins,128580);
});

test('an already running ready countdown preserves the unelapsed part across pause', () => {
  const app=boot();matchToReady(app);app.click('deal');app.tick(1000);app.click('pause');
  app.tick(120000);assert.equal(app.state().session.status,'seated');app.click('pause');
  app.tick(1999);assert.equal(app.state().session.status,'seated');
  app.tick(1);assert.equal(app.state().session.status,'playing');
  assert.equal(app.state().session.coins,128580);
});

test('weekend elimination archives rank twenty with forty coins and seventy-four season points', () => {
  const app=boot();app.click('tools');app.click('weekendScenario');app.click('eliminateEvent');
  assert.equal(app.state().data.tournament.rank,20);
  assert.equal(app.state().data.tournament.status,'finalTemp');
  assert.equal(app.state().session.coins,128600);
  app.click('advance');
  const current=app.state();
  assert.equal(current.data.tournament.status,'final');
  assert.equal(current.data.tournament.seasonPoints,74);
  assert.equal(current.session.coins,128640);
  assert.equal(current.data.eventArchives[0].amount,40);
  assert.equal(current.data.eventArchives[0].rank,20);
  assert.equal(current.data.eventArchives[0].seasonPoints,74);
  app.click('rewards');app.click('support:chest');
  const reward=app.html().match(/<article class="support-chest-record">([\s\S]*?)<\/article>/)?.[1];
  assert.ok(reward,'the fixed event award should be displayed');
  assert.match(plain(reward),/40 金币/);
  assert.doesNotMatch(plain(reward),/500 金币/);
});

test('an actual unresolved appeal blocks official prize payment until its original case is resolved', () => {
  const app=boot();app.click('tools');app.click('finalScenario');app.click('eventScore');app.click('details:appeal');
  app.input('appealDraft.reason','请核对第一轮的成绩');app.click('details:submitAppeal');
  assert.equal(app.state().data.tournament.pendingAppeal,true);
  assert.equal(app.state().data.details.requests.length,1);
  app.click('advance');
  assert.equal(app.state().data.tournament.status,'finalTemp');
  assert.equal(app.state().session.coins,128600);
  assert.equal(app.state().data.eventArchives.length,0);
  assert.match(plain(app.modal()),/申诉待处理/);
  app.click('closeModal');app.click('details:demoResolveRequest');app.click('advance');
  assert.equal(app.state().data.tournament.status,'final');
  assert.equal(app.state().session.coins,128700);
  assert.equal(app.state().data.eventArchives.length,1);
  assert.equal(app.state().data.details.requests.length,1);
  assert.equal(app.state().data.details.requests[0].status,'resolved');
});

test('automatic matching and continuation keep the queried page and return to the updated source', () => {
  const coin=boot();coin.click('coin');coin.click('startCoin');coin.click('help');
  assert.equal(coin.state().data.screen,'detailsHelp');coin.tick(7800);
  assert.equal(coin.state().session.status,'seated');
  assert.equal(coin.state().data.screen,'detailsHelp');coin.click('back');
  assert.equal(coin.state().data.screen,'coinReady');
  const event=boot();enterFirstEvent(event);event.click('advance');event.click('eventScore');
  const query=event.state().data.screen;event.tick(10000);
  assert.equal(event.state().data.tournament.status,'table');
  assert.equal(event.state().data.tournament.hand,2);
  assert.equal(event.state().data.screen,query);event.click('back');
  assert.equal(event.state().data.screen,'eventTable');
});

test('old coin records remain selected after newer results and reload', () => {
  const app=boot();matchToReady(app);app.click('deal');app.click('advance');app.click('advance');
  const first=app.state().data.history[0];app.tick(1);
  matchToReady(app);app.click('deal');app.click('advance');app.click('advance');
  assert.equal(app.state().data.history.length,2);
  const restored=boot({storage:app.storage(),now:app.now()});restored.click('history');restored.click('details:record',0);
  assert.equal(restored.state().data.details.recordIndex,0);
  assert.deepEqual(restored.state().data.history[0],first);
  assert.ok(restored.html().includes(first.id));
  assert.match(plain(restored.html()),/128,580/);
  assert.equal(restored.state().session.coins,131560);
});

test('a formally archived event still counts toward weekly activity progress after another registration', () => {
  const app=boot();app.click('tools');app.click('finalScenario');app.click('advance');
  app.click('eventCenter');app.click('eventDetail',1);app.click('register');app.click('confirmRegister');
  assert.equal(app.state().data.eventArchives.length,1);
  app.click('supply');app.click('support:activities');app.click('support:signinPage');
  assert.match(plain(app.html()),/本周有效对局 1 \/ 3/);
  assert.equal(app.state().session.coins,128700);
});

test('one weekend entry consumes one ticket and preserves other tickets through later rounds and reload', () => {
  const base=boot(), storage=base.storage(), key=base.key(), saved=JSON.parse(storage[key]);
  saved.data.ticket=2;
  const app=boot({storage:{...storage,[key]:JSON.stringify(saved)}});
  app.click('tournament');app.click('eventDetail',2);app.click('register');app.click('confirmRegister');
  assert.equal(app.state().data.ticket,2,'registration only reserves one ticket');
  app.click('advance');app.click('checkin');app.click('advance');
  assert.equal(app.state().data.ticket,1,'first roster publication consumes exactly one ticket');
  app.click('advance');
  for(let hand=1;hand<=4;hand++){app.click('advance');if(hand<4)app.click('advance');}
  app.click('advance');
  assert.equal(app.state().data.tournament.round,2);
  const restored=boot({storage:app.storage(),now:app.now()});restored.click('advance');restored.click('advance');
  assert.equal(restored.state().data.ticket,1,'the second round must not consume another ticket');
  assert.equal(restored.state().session.coins,128600,'competition rounds do not charge coin fees');
});

test('a weekend advancement does not charge its ticket again in the next stage', () => {
  const base=boot();base.click('tools');base.click('weekendScenario');
  const storage=base.storage(),key=base.key(),saved=JSON.parse(storage[key]);saved.data.ticket=1;
  const app=boot({storage:{...storage,[key]:JSON.stringify(saved)},now:base.now()});
  app.click('advance');app.click('nextStage');app.click('advance');app.click('advance');
  assert.equal(app.state().data.tournament.stage,1);
  assert.equal(app.state().data.ticket,1,'the original entry already covers the next stage');
});

test('personal ready timeout keeps the open help page and returns to a fresh lobby without extending the old room', () => {
  const app=boot();matchToReady(app);app.tick(59000);app.click('tableMenu');app.click('help');app.input('helpDraft.reason','准备过程中查看帮助');app.tick(1000);
  assert.equal(app.state().session.status,'idle');
  assert.equal(app.state().session.reserved,0);
  assert.equal(app.state().session.coins,128600);
  assert.equal(app.state().data.screen,'detailsHelp','timeout must preserve the queried page');
  assert.match(plain(app.html()),/准备过程中查看帮助/,'the written draft must survive timeout');
  assert.equal(app.modal(),'');app.click('back');
  assert.equal(app.state().data.screen,'coinLobby');
  app.click('startCoin');app.click('advance');
  assert.equal(app.state().session.status,'seated');
  assert.equal(app.state().data.personalReadyDeadline,app.now()+60000);
});

test('an older weekend save already in a later round resumes without spending its remaining ticket', () => {
  const base=boot();base.click('tools');base.click('weekendScenario');
  const storage=base.storage(),key=base.key(),saved=JSON.parse(storage[key]);
  delete saved.data.tournament.ticketUsed;
  const app=boot({storage:{...storage,[key]:JSON.stringify(saved)},now:base.now()});
  app.click('advance');app.click('nextStage');app.click('advance');app.click('advance');
  assert.equal(app.state().data.ticket,1);
  assert.equal(app.state().data.tournament.stage,1);
});

test('cancelling a weekend registration leaves all tickets available for a new confirmed registration', () => {
  const app=boot();app.click('tournament');app.click('eventDetail',2);app.click('register');app.click('confirmRegister');
  app.click('cancelRegistration');app.click('confirmCancelRegistration');
  assert.equal(app.state().data.ticket,1);
  assert.equal(app.state().data.tournament.status,'none');
  app.click('eventDetail',2);app.click('register');app.click('confirmRegister');app.click('advance');app.click('checkin');app.click('advance');
  assert.equal(app.state().data.ticket,0);
  app.click('advance');assert.equal(app.state().data.tournament.status,'table');
});

test('newcomer free entry is consumed at roster lock, not registration or cancellation, and only once across rounds', () => {
  const app=boot();registerFirst(app);
  assert.deepEqual(app.state().data.noviceEntryDays,[]);
  app.click('cancelRegistration');app.click('confirmCancelRegistration');
  assert.deepEqual(app.state().data.noviceEntryDays,[]);
  enterFirstEvent(app);
  assert.deepEqual(app.state().data.noviceEntryDays,['2026-10-13']);
  for(let hand=1;hand<=4;hand++){app.click('advance');if(hand<4)app.click('advance');}
  app.click('advance');app.click('advance');app.click('advance');
  assert.deepEqual(app.state().data.noviceEntryDays,['2026-10-13']);
  assert.equal(app.state().session.coins,128600);
});

function finishNewcomer(app) {
  enterFirstEvent(app);
  for(let round=1;round<=3;round++){
    for(let hand=1;hand<=4;hand++){app.click('advance');if(hand<4)app.click('advance');}
    app.click('advance');
    if(round<3){app.click('advance');app.click('advance');}
  }
  app.click('advance');
  assert.equal(app.state().data.tournament.status,'final');
}

test('player UI contains no presentation toolbar or developer controls', () => {
  assert.doesNotMatch(html, /workbench|statusbar|data-action="(?:advance|tools|directory|reset|pause|fullscreen)"/);
  const app=boot();app.click('coin');app.click('startCoin');
  assert.doesNotMatch(plain(app.modal()), /演示|示例|参考|模拟|待确认/);
  assert.equal(app.modal(),'');app.click('supply');
  assert.doesNotMatch(app.html(), /sheet-demo-controls|data-action="(?:advance|tools|directory)"/);
  app.click('support:activities');app.click('support:signinPage');
  assert.doesNotMatch(plain(app.html()), /演示|模拟|参考配置|原次/);
});

test('coin settlement is reached automatically without any artificial player button', () => {
  const app=boot();app.click('coin');app.click('startCoin');
  app.tick(7800);app.click('deal');app.tick(3000);
  assert.equal(app.state().session.status,'playing');
  app.tick(30000);
  assert.equal(app.state().data.screen,'coinResult');
  assert.equal(app.state().session.status,'idle');
  assert.equal(app.state().data.history.length,1);
  app.tick(30000);assert.equal(app.state().data.history.length,1);
});

test('registration, allocation and next round need no manual time advancement', () => {
  const app=boot();app.click('tournament');app.click('eventDetail',0);app.click('register');app.click('confirmRegister');
  app.tick(8000);assert.equal(app.state().data.tournament.status,'checkin');app.click('checkin');
  app.tick(5000);assert.equal(app.state().data.tournament.status,'published');app.tick(3000);
  assert.equal(app.state().data.tournament.status,'table');
  app.tick(30000);assert.equal(app.state().data.tournament.status,'smallResult');
  assert.doesNotMatch(app.html(),/data-action="nextHand"/);
  for(let i=0;i<3;i++){app.tick(10000);app.tick(30000);}
  assert.equal(app.state().data.tournament.status,'roundWait');
  app.tick(8000);assert.equal(app.state().data.tournament.round,2);
  app.tick(8000);assert.equal(app.state().data.tournament.status,'table');
});

test('all newcomer rounds finish naturally and the twenty-four-hour review pays once', () => {
  const app=boot();app.click('tournament');app.click('eventDetail',0);app.click('register');app.click('confirmRegister');
  app.tick(8000);app.click('checkin');app.tick(8000);
  for(let round=1;round<=3;round++){
    for(let hand=1;hand<=4;hand++){app.tick(30000);if(hand<4)app.tick(10000);}
    app.tick(8000);if(round<3)app.tick(8000);
  }
  assert.equal(app.state().data.tournament.status,'finalTemp');
  assert.equal(app.state().session.coins,128600);
  assert.equal(app.state().data.tournament.roundRecords.length,3);
  const deadline=app.state().data.tournament.reviewDeadline;
  const restored=boot({storage:app.storage(),now:deadline-1});
  assert.equal(restored.state().data.tournament.status,'finalTemp');restored.tick(1);
  assert.equal(restored.state().data.tournament.status,'final');
  assert.equal(restored.state().session.coins,128700);
  restored.tick(60000);assert.equal(restored.state().session.coins,128700);
  assert.equal(restored.state().data.eventArchives.length,1);
});

test('automated settlement preserves an open support page and returns to fresh selection', () => {
  const app=boot();app.click('coin');app.click('startCoin');app.tick(7800);
  app.click('deal');app.tick(3000);app.click('supply');app.tick(30000);
  assert.equal(app.state().session.status,'idle');assert.equal(app.state().data.screen,'supportSupply');
  app.click('back');assert.equal(app.state().data.screen,'coinLobby');
});

test('automatic roster publication preserves an open rule page and returns to the assigned table', () => {
  const app=boot();app.click('tournament');app.click('eventDetail',0);app.click('register');app.click('confirmRegister');
  app.tick(8000);app.click('checkin');app.click('eventRules');
  assert.equal(app.state().data.screen,'detailsRules');app.tick(8000);
  assert.equal(app.state().data.tournament.status,'table');
  assert.equal(app.state().data.screen,'detailsRules');app.click('back');
  assert.equal(app.state().data.screen,'eventTable');
});

test('a consumed newcomer day remains unavailable after reload and does not restrict another event', () => {
  const app=boot();finishNewcomer(app);
  const restored=boot({storage:app.storage(),now:app.now()});
  restored.click('eventCenter');restored.click('eventDetail',1);restored.click('register');restored.click('confirmRegister');
  assert.equal(restored.state().data.event,1);
  restored.click('eventCenter');restored.click('eventDetail',0);
  assert.match(plain(restored.html()),/免费次数.*0.*1|免费次数.*用完/);
  assert.throws(()=>restored.click('register'),/missing/,'today must have no enabled newcomer registration');
});

test('the next Beijing calendar day offers a new newcomer entry without consuming it early', () => {
  const app=boot();finishNewcomer(app);
  const restored=boot({storage:app.storage(),now:epoch+86400000});
  restored.click('eventCenter');restored.click('eventDetail',0);restored.click('register');restored.click('confirmRegister');
  assert.deepEqual(restored.state().data.noviceEntryDays,['2026-10-13']);
  restored.click('advance');restored.click('checkin');restored.click('advance');
  assert.deepEqual(restored.state().data.noviceEntryDays,['2026-10-13','2026-10-14']);
});

test('a newcomer event finishing after midnight consumes only the date of roster lock, not the archive date', () => {
  const first=boot();enterFirstEvent(first);
  const app=boot({storage:first.storage(),now:epoch+86400000});
  for(let round=1;round<=3;round++){
    for(let hand=1;hand<=4;hand++){app.click('advance');if(hand<4)app.click('advance');}
    app.click('advance');if(round<3){app.click('advance');app.click('advance');}
  }
  app.click('advance');
  const restored=boot({storage:app.storage(),now:app.now()});
  assert.deepEqual(restored.state().data.noviceEntryDays,['2026-10-13']);
  restored.click('eventCenter');restored.click('eventDetail',0);restored.click('register');restored.click('confirmRegister');
  assert.equal(restored.state().data.tournament.status,'registered');
});

test('registered event cards and details both lead to the same pre-checkin state', () => {
  const app=boot();app.click('tournament');app.click('eventDetail',0);app.click('register');app.click('confirmRegister');
  app.click('eventCenter');
  assert.match(plain(app.html()),/已报名.*待检录/);
  app.clickText(/查看报名/);
  assert.equal(app.state().data.screen,'eventRegistered');
  app.click('currentDetail');app.clickText(/查看报名/);
  assert.equal(app.state().data.screen,'eventRegistered');
  assert.equal(app.state().data.tournament.status,'registered');
});
