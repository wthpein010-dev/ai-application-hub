const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const nav = fs.existsSync(__dirname + '/../navigation.js') ? require('../navigation.js') : {};

test('配套页返回来源，旧准备和小局结果恢复成最新进行中的页面', () => {
  assert.equal(typeof nav.returnTarget, 'function');
  const data = {screen:'recordDetail',navStack:['coinLobby','coinReady','history'],tournament:{status:'none'}};
  assert.equal(nav.returnTarget(data,'playing'),'history');
  data.screen='history'; assert.equal(nav.returnTarget(data,'playing'),'coinPlay');
  data.screen='eventScorePage';data.navStack=['eventSmallResult'];data.tournament.status='table';
  assert.equal(nav.returnTarget(data,'idle'),'eventTable');
});
test('匹配取消后不能由旧返回路径恢复无效准备桌，已完成赛事只回赛果', () => {
  assert.equal(typeof nav.returnTarget, 'function');
  const data={screen:'supportShop',navStack:['coinReady'],tournament:{status:'final'}};
  assert.equal(nav.returnTarget(data,'idle'),'coinLobby');
  data.navStack=['eventAllocating'];assert.equal(nav.returnTarget(data,'idle'),'eventFinal');
});
test('同页局部刷新不重复入返回栈，历史深度有界', () => {
  assert.equal(typeof nav.push, 'function');
  const data={screen:'supportShop',navStack:['coinLobby']};nav.push(data,'supportShop');assert.deepEqual(data.navStack,['coinLobby']);
  for(let i=0;i<30;i++){nav.push(data,'page'+i);data.screen='page'+i;}
  assert.ok(data.navStack.length<=16);
});
test('刷新使用原绝对期限，不重新给予十秒或三秒', () => {
  assert.equal(typeof nav.remaining, 'function');
  assert.equal(nav.remaining(11000,9000),2000); assert.equal(nav.remaining(11000,12000),0);
});
test('存档校验在采用数据前完成；破损和双重占桌状态被拒绝', () => {
  assert.equal(typeof nav.validate, 'function');
  const good={screen:'history',field:0,game:0,region:'郑州',history:[],tournament:{status:'none',round:1,hand:1,stage:0,points:0}};
  assert.doesNotThrow(()=>nav.validate(good,'idle'));
  assert.throws(()=>nav.validate({...good,field:999},'idle'));
  assert.throws(()=>nav.validate({...good,tournament:{...good.tournament,status:'table'}},'playing'));
});
