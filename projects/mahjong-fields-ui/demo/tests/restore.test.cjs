const test = require('node:test');
const assert = require('node:assert/strict');
const {Session} = require('../state.js');

test('restore rejects invalid account amounts without changing an existing session', () => {
  const current = new Session(800); current.queue(20); current.seat();
  const baseline = JSON.stringify(current);
  for (const [key,value] of [['coins',-1],['coins','800'],['coins',null],['reserved',801],['principal',801],['fee',-1],['started',-1]]) {
    const raw = {...JSON.parse(baseline),[key]:value};
    assert.throws(() => Session.restore(JSON.stringify(raw)), undefined, `${key}=${value} must be rejected`);
    assert.equal(JSON.stringify(current),baseline,'failed restore must not alter the current account');
  }
});

test('extra storage properties cannot replace queue, settle or reward behavior', () => {
  const raw = {...JSON.parse(JSON.stringify(new Session(800))),queue:null,settle:'overwritten',reward:0,available:999999,canStart:false};
  const restored = Session.restore(JSON.stringify(raw));
  restored.queue(20); restored.seat(); restored.deal(); restored.reward(100);
  assert.equal(restored.available,100);
  const result = restored.settle(-1500,'restored-round');
  assert.equal(result.actual,-780);
  assert.equal(result.shortfall,720);
  assert.equal(restored.coins,100);
  assert.equal(restored.canStart(),true);
});

test('restore rejects principal and reservation states that cannot be produced by a valid flow', () => {
  const base = JSON.parse(JSON.stringify(new Session(800)));
  const cases = [
    {...base,status:'idle',principal:20},
    {...base,status:'idle',reserved:20},
    {...base,status:'matching',fee:20,reserved:20,principal:20},
    {...base,status:'seated',fee:20,reserved:10},
    {...base,status:'playing',fee:20,reserved:20,principal:780},
    {...base,status:'playing',fee:20,principal:801}
  ];
  for (const raw of cases) assert.throws(() => Session.restore(JSON.stringify(raw)), undefined, JSON.stringify(raw));
});

test('restore rejects malformed settlement amounts instead of rendering unsafe ledger values', () => {
  const settled = new Session(800); settled.queue(20); settled.seat(); settled.deal(); settled.settle(-1500,'old-round');
  const valid = JSON.parse(JSON.stringify(settled));
  assert.equal(Session.restore(JSON.stringify(valid)).result.shortfall,720);
  for (const [key,value] of [['net',null],['actual','-780'],['shortfall',-1],['principal',-1],['fee',-1],['balance',-1]]) {
    const raw = {...valid,result:{...valid.result,[key]:value}};
    assert.throws(() => Session.restore(JSON.stringify(raw)), undefined, `result.${key}=${value} must be rejected`);
  }
});
