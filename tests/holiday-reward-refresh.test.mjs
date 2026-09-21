import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../projects/holiday-gifts/game/app.js',import.meta.url),'utf8');
test('holiday reward dates, prices and artwork match revised schedule',()=>{
 const defs=src.slice(src.indexOf('const dates='),src.indexOf('function quantity'));
 const c={};vm.runInNewContext(defs+';this.data={dates,names,skins,prices,qualities}',c);
 const d=c.data;assert.deepEqual(Array.from(d.skins),[2,5,12]);
 assert.equal(d.dates[5],'2026-09-30');assert.equal(d.names[6],'出游墨镜');
 assert.equal(d.prices.reduce((a,b)=>a+b,0),132);
 assert.equal(d.prices[5],20);assert.equal(d.prices[6],4);
 assert.match(src,/0:'rabbit-lantern'/);assert.match(src,/5:'chef'/);assert.match(src,/12:'camp'/);
});
test('old index based ownership migrates once without affecting currency',()=>{
 const start=src.indexOf('function migrateRewardSchedule');
 assert.notEqual(start,-1);
 const end=src.indexOf('\nconst fresh=',start);
 const c={};vm.runInNewContext(src.slice(start,end)+';this.run=migrateRewardSchedule',c);
 const s={total:42,quantities:{5:3,6:1,2:1},claimed:[2,5,6],playedDays:['2026-09-30']};
 c.run(s);assert.equal(s.quantities[5],1);assert.equal(s.quantities[6],3);assert.equal(s.total,42);
 assert.deepEqual(s.claimed,[2,6,5]);c.run(s);assert.equal(s.quantities[5],1);
});
