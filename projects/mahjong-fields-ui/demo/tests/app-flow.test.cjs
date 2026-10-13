const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the browser entrypoints unchanged. The DOM boundary below supplies only
// layout/dialog/storage/timing APIs; all page generation and actions stay real.
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scriptNames = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)].map(m => m[1].split(/[?#]/)[0]);
const scripts = scriptNames.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]);
const epoch = Date.parse('2026-10-13T02:00:00Z');
const plain = value => String(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&(?:lt|gt|amp|quot);/g, x => ({'&lt;':'<','&gt;':'>','&amp;':'&','&quot;':'"'}[x])).replace(/\s+/g, ' ').trim();

function boot(options = {}) {
  let now = options.now ?? epoch, timerId = 0;
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
  const nodes = Object.fromEntries(['stage','modal','modal-body','frame','advance','screen-label','flow-hint','toast','viewport'].map(id => [id, node(id)]));
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
    localStorage:{ getItem:key => store.get(key) ?? null, setItem:(key,value) => store.set(key,String(value)), removeItem:key => store.delete(key) },
    setTimeout:(fn,ms) => schedule(fn,ms), clearTimeout:id => scheduled.delete(id),
    setInterval:(fn,ms) => schedule(fn,ms,Math.max(1,Number(ms)||1)), clearInterval:id => scheduled.delete(id),
    addEventListener:(kind,fn) => events.set(kind,fn)
  });
  context.window = context;
  for (const [name, source] of scripts) vm.runInContext(source, context, {filename:name});
  function state() {
    const key = [...store.keys()].find(x => x.startsWith('maluer-fields-'));
    assert.ok(key, 'the real app should save its current state');
    return JSON.parse(store.get(key));
  }
  function visibleButtons() { return [...(nodes.modal.open ? [...buttons(nodes['modal-body'].innerHTML), modalClose] : buttons(nodes.stage.innerHTML)), ...staticButtons]; }
  function click(action, value) {
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
    const source=nodes.modal.open?nodes['modal-body'].innerHTML:nodes.stage.innerHTML;
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
  return {click,clickText,clickAny,input,tick,state,now:() => now,storage:() => Object.fromEntries(store),html:() => nodes.stage.innerHTML,modal:() => nodes.modal.open ? nodes['modal-body'].innerHTML : '',key:() => [...store.keys()].find(x => x.startsWith('maluer-fields-'))};
}

function matchToReady(app) {
  app.click('coin'); app.click('startCoin'); app.click('queueCoin'); app.click('advance');
  assert.equal(app.state().session.status, 'seated');
}
function registerFirst(app) {
  app.click('tournament'); app.click('eventDetail',0); app.click('register'); app.click('confirmRegister');
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

test('the explicit advance control may skip the ready countdown without double charging', () => {
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
  app.click('help');
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
  app.click('coin');
  assert.equal(app.state().session.status,'playing');
  if (app.modal()) app.click('closeModal');
  app.click('tournament'); app.click('eventDetail',0); app.click('register');
  assert.match(plain(app.modal()),/未结束|先完成|不能/);
  assert.notEqual(app.state().data.tournament.status,'registered');
  assert.equal(app.state().session.status,'playing');
  assert.equal(app.state().session.started,started);
  assert.equal(app.state().session.principal,principal);
  assert.equal(app.state().session.coins,coins);
});

test('a ready countdown created while paused resumes with only its own three seconds', () => {
  const app=boot();app.click('coin');app.click('startCoin');app.click('queueCoin');app.click('pause');
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
  const app=boot();app.click('tools');app.click('weekendScenario');app.click('advance');app.click('eliminateEvent');
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
  app.click('closeModal');app.click('tools');app.click('details:demoResolveRequest');app.click('closeModal');app.click('advance');
  assert.equal(app.state().data.tournament.status,'final');
  assert.equal(app.state().session.coins,128700);
  assert.equal(app.state().data.eventArchives.length,1);
  assert.equal(app.state().data.details.requests.length,1);
  assert.equal(app.state().data.details.requests[0].status,'resolved');
});

test('automatic matching and continuation keep the queried page and return to the updated source', () => {
  const coin=boot();coin.click('coin');coin.click('startCoin');coin.click('queueCoin');coin.click('help');
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
