(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FieldCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const recommend = (coins) => coins < 500 ? -1 : coins < 5000 ? 0 : coins < 50000 ? 1 : coins < 500000 ? 2 : 3;
  class Session {
    constructor(coins = 128600) {
      this.coins = coins; this.reserved = 0; this.principal = 0; this.fee = 0;
      this.status = 'idle'; this.auto = false; this.result = null; this.started = 0;
    }
    get available() { return this.coins - this.reserved - this.principal; }
    canStart() { return this.status === 'idle'; }
    queue(fee) {
      if (!this.canStart() || this.available < fee || fee < 0) throw Error('当前流程未结束或余额不足');
      this.reserved = fee; this.fee = fee; this.status = 'matching'; this.started = Date.now(); this.result = null;
    }
    seat() { if (this.status !== 'matching') throw Error('没有有效匹配'); this.status = 'seated'; }
    cancel() {
      if (!['matching', 'seated'].includes(this.status)) throw Error('本局尚未结束，不能离桌');
      this.reserved = 0; this.fee = 0; this.status = 'idle'; this.started = 0;
    }
    deal() {
      if (this.status !== 'seated') throw Error('没有可发牌的原房间');
      this.coins -= this.reserved; this.reserved = 0; this.principal = this.coins;
      this.status = 'playing'; this.auto = false;
    }
    trust(value) { if (this.status !== 'playing') throw Error('尚未开局'); this.auto = Boolean(value); }
    reward(amount) { if (!Number.isFinite(amount) || amount < 0) throw Error('奖励无效'); this.coins += amount; }
    spend(amount) { if (amount < 0 || amount > this.available) throw Error('不能消费锁定本金'); this.coins -= amount; }
    settle(net, id) {
      if (this.result && this.result.id === id) return this.result;
      if (this.status !== 'playing' || !Number.isFinite(net)) throw Error('没有待结算的本局');
      const principal = this.principal;
      const actual = net >= 0 ? net : -Math.min(-net, principal);
      this.coins += actual; this.principal = 0; this.status = 'idle'; this.auto = false;
      this.result = { id, net, actual, shortfall: Math.max(0, -net - principal), principal, fee: this.fee, balance: this.coins };
      return this.result;
    }
    static restore(raw) {
      const data = JSON.parse(raw); const s = new Session();
      for(const key of ['coins','reserved','principal','fee','status','auto','result','started'])if(Object.hasOwn(data,key))s[key]=data[key];
      if (!['idle','matching','seated','playing'].includes(s.status) || ['coins','reserved','principal','fee','started'].some(k=>!Number.isFinite(s[k])||s[k]<0) || s.available < 0 || typeof s.auto!=='boolean') throw Error('演示存档无效');
      if(s.status==='idle'&&(s.reserved!==0||s.principal!==0)||['matching','seated'].includes(s.status)&&(s.principal!==0||s.reserved!==s.fee)||s.status==='playing'&&s.reserved!==0)throw Error('演示资产状态无效');
      if(s.result&&(!Number.isFinite(s.result.net)||!Number.isFinite(s.result.actual)||typeof s.result.id!=='string'||['shortfall','principal','fee','balance'].some(k=>!Number.isFinite(s.result[k])||s.result[k]<0)))throw Error('演示结果存档无效');
      return s;
    }
  }
  return { recommend, Session };
});
