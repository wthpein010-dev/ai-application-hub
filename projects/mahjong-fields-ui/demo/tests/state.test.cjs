const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const core = fs.existsSync(__dirname + '/../state.js') ? require('../state.js') : {};
test('金币档位准确处理三个上下边界', () => {
  assert.equal(typeof core.recommend, 'function');
  assert.deepEqual([499,500,4999,5000,49999,50000,499999,500000].map(core.recommend),[-1,0,0,1,1,2,2,3]);
});
test('匹配仅锁费，取消释放且重复匹配不会多扣', () => {
  assert.equal(typeof core.Session, 'function');
  const s = new core.Session(128600); s.queue(20);
  assert.equal(s.coins,128600); assert.equal(s.available,128580); assert.equal(s.principal,0);
  assert.throws(()=>s.queue(20)); s.cancel(); assert.equal(s.available,128600); assert.equal(s.fee,0);
});
test('成功发牌仅扣一次服务费并锁本金，局中奖励不能变成本金', () => {
  assert.equal(typeof core.Session, 'function');
  const s = new core.Session(800); s.queue(20); s.seat(); s.deal();
  assert.equal(s.coins,780); assert.equal(s.principal,780); assert.equal(s.available,0);
  assert.throws(()=>s.deal()); s.reward(100); assert.equal(s.principal,780); assert.equal(s.available,100);
  assert.throws(()=>s.spend(101)); s.spend(50); assert.equal(s.available,50);
});
test('开局不能离桌或并行，托管仍占原座位', () => {
  assert.equal(typeof core.Session, 'function');
  const s = new core.Session(800); s.queue(20); s.seat(); s.deal(); s.trust(true);
  assert.throws(()=>s.cancel()); assert.equal(s.canStart(),false); assert.equal(s.status,'playing');
  s.trust(false); assert.equal(s.auto,false);
});
test('净亏扣到本金，系统补差；局中奖励不用于追扣', () => {
  assert.equal(typeof core.Session, 'function');
  const s = new core.Session(800); s.queue(20); s.seat(); s.deal(); s.reward(100);
  const result = s.settle(-1500,'round-1');
  assert.equal(result.actual,-780); assert.equal(result.shortfall,720); assert.equal(s.coins,100);
  assert.equal(s.principal,0); assert.equal(s.canStart(),true);
  assert.deepEqual(s.settle(-1500,'round-1'),result); assert.equal(s.coins,100);
  assert.throws(()=>s.settle(100,'wrong-round'));
});
test('赢家净赢足额，加补差不是重复加钱', () => {
  assert.equal(typeof core.Session, 'function');
  const s = new core.Session(128600); s.queue(20); s.seat(); s.deal();
  const result = s.settle(1500,'winner'); assert.equal(result.actual,1500);
  assert.equal(s.coins,130080); assert.equal(s.available,130080);
});
test('已分桌未发牌可释放费用；重载保留原流程', () => {
  assert.equal(typeof core.Session, 'function');
  const s = new core.Session(800); s.queue(20); s.seat();
  const r=core.Session.restore(JSON.stringify(s)); assert.equal(r.status,'seated'); assert.equal(r.reserved,20);
  r.cancel(); assert.equal(r.available,800);
});
