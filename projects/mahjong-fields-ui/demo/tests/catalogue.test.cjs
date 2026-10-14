const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const catalogue=fs.existsSync(__dirname+'/../catalogue.js')?require('../catalogue.js'):{};

test('金币场地区及四项玩法名称顺序与提供清单逐项一致',()=>{
  const expected={洛阳:['杠次','跑得快','斗地主','洛阳麻将'],郑州:['郑州麻将','红中麻将','斗地主','跑的快'],信阳:['固始麻将','老五嘴麻将','斗地主','跑的快'],南阳:['卡五星','中发白','斗地主','跑得快'],云南昭通:['光春天','血战麻将','跑的快','斗地主']};
  assert.deepEqual(catalogue.REGIONS,Object.keys(expected));
  for(const [region,names] of Object.entries(expected)){
    const games=catalogue.gamesFor(region);
    assert.deepEqual(games.map(x=>x.name),names,region);
    assert.equal(new Set(games.map(x=>x.id)).size,4);
    games.forEach(x=>{assert.ok(catalogue.getProfile(x.id));assert.equal(catalogue.isAvailable(region,x.id),true);});
  }
  assert.deepEqual(catalogue.gamesFor('未知地区'),[]);
  assert.equal(catalogue.isAvailable('郑州','gushi'),false);
  assert.equal(catalogue.isAvailable('信阳','gouji-dragon'),false);
});

test('参考玩法人数和场档数量随模式切换，麻将保留原四档',()=>{
  assert.equal(typeof catalogue.getProfile,'function');
  assert.equal(catalogue.getProfile('ddz-fast').players,3);
  assert.equal(catalogue.getProfile('gouji-dragon').players,6);
  assert.equal(catalogue.fieldsFor('ddz-fast').length,6);
  assert.equal(catalogue.fieldsFor('').length,4);
  assert.equal(catalogue.recommend('',128600),2);
  assert.equal(catalogue.fieldsFor('ddz-fast')[5].min,5000000);
});

test('准入不足、过上限、锁定本金分别给出正确结果，边界可入',()=>{
  assert.equal(typeof catalogue.entryStatus,'function');
  const room={min:5000,max:50000};
  assert.equal(catalogue.entryStatus({available:4999,coins:4999,principal:0},room).kind,'shortage');
  assert.equal(catalogue.entryStatus({available:5000,coins:5000,principal:0},room).kind,'eligible');
  assert.equal(catalogue.entryStatus({available:50000,coins:50000,principal:0},room).kind,'over');
  assert.equal(catalogue.entryStatus({available:50,coins:6000,principal:5950},room).kind,'locked');
  assert.equal(catalogue.entryStatus({available:50,coins:50,principal:0},room).gap,4950);
});

test('所有可见参考模式可选，有独立稳定ID、规则和有限人数',()=>{
  assert.ok(Array.isArray(catalogue.GROUPS));
  const profiles=catalogue.GROUPS.flatMap(group=>group.profiles);
  assert.equal(new Set(profiles.map(p=>p.id)).size,profiles.length);
  assert.ok(profiles.some(p=>p.id==='pdk'));
  assert.ok(profiles.some(p=>p.id==='guandan-a'));
  assert.ok(profiles.every(p=>p.players>=2&&p.players<=6&&p.rules.length>=2));
  assert.equal(catalogue.getProfile('not-a-mode'),null);
});

test('竞品各模式使用各自场档数量，切换模式不会沿用统一六档',()=>{
  assert.equal(catalogue.fieldsFor('ddz-classic').length,5);
  assert.equal(catalogue.fieldsFor('gouji-dragon').length,5);
  assert.equal(catalogue.fieldsFor('guandan-a').length,3);
  assert.equal(catalogue.fieldsFor('pdk').length,5);
  for(const id of ['','red','ddz-fast','ddz-classic','gouji-dragon','guandan-a','pdk']){
    const fields=catalogue.fieldsFor(id);assert.equal(fields.at(-1).max,Infinity);
    fields.slice(0,-1).forEach((f,i)=>assert.equal(f.max,fields[i+1].min));
  }
});
