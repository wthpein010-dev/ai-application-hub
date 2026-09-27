import test from 'node:test';
import assert from 'node:assert/strict';
import { weightShares, rewardMetrics, generatePool, awardPool, seededRandom, validateProgress, recordAttempt } from '../projects/game-design-textbook/core.mjs';
test('权重改变时分母随之改变，零或负权重不能伪造概率',()=>{
 assert.deepEqual(weightShares([4,2,2]),[.5,.25,.25]);
 assert.equal(weightShares([8,2,2])[0],2/3);
 for(const x of [[0,0],[-1,2],[NaN,2],[]])assert.throws(()=>weightShares(x));
 assert.deepEqual(weightShares([0,2]),[0,1]);
});
test('返还、净赚频率和方差分开计算',()=>{
 assert.deepEqual(rewardMetrics([{amount:0,p:.6},{amount:10,p:.3},{amount:30,p:.1}],10),{expected:6,net:-4,rtp:.6,returnRate:.4,profitRate:.1,variance:84});
 assert.throws(()=>rewardMetrics([{amount:1,p:.8}],10));
 assert.throws(()=>rewardMetrics([{amount:1,p:1}],0));
 assert.throws(()=>rewardMetrics([{amount:-1,p:1}],10));
});
const items=Array.from({length:24},(_,i)=>({id:`I${i}`,quality:i%3,weight:1,blocked:i===0?['G1']:[]}));
test('固定随机种子复现七槽，名单限制与逐池不放回同时生效',()=>{
 const a=generatePool(items,[70,22,8],'G1',seededRandom(17));
 assert.equal(a.length,7);assert.equal(new Set(a.map(x=>x.item.id)).size,7);
 assert.ok(a.every(x=>x.item.id!=='I0'&&x.denominator>0));
 assert.deepEqual(a,generatePool(items,[70,22,8],'G1',seededRandom(17)));
 assert.equal(awardPool(a,()=>.999).item.id,a[6].item.id);
 assert.equal(awardPool(a,()=>0).item.id,a[0].item.id);
});
test('同品质候选不足即停，禁止改成别的品质凑齐',()=>{
 assert.throws(()=>generatePool(items.slice(0,6),[1,0,0],'G1',()=>0),/候选不足/);
 assert.throws(()=>generatePool([...items,items[0]],[1,0,0],'G1',()=>0),/重复/);
 assert.throws(()=>awardPool([],()=>0));
});
test('记录导入拒绝坏版本及越界答案，复做保留首次成绩',()=>{
 const empty={schemaVersion:1,lessons:{}};
 const first=recordAttempt(empty,'L01',[0,1,2,3],[0,0,2,2],'2026-09-27');
 const second=recordAttempt(first,'L01',[0,0,2,2],[0,0,2,2],'2026-09-28');
 assert.equal(second.lessons.L01.first.score,50);assert.equal(second.lessons.L01.latest.score,100);
 assert.deepEqual(validateProgress(JSON.parse(JSON.stringify(second))),second);
 assert.throws(()=>validateProgress({schemaVersion:99,lessons:{}}));
 assert.throws(()=>validateProgress({schemaVersion:1,lessons:{L01:{note:123}}}));
 assert.throws(()=>recordAttempt(empty,'L01',[-1,0,0,0],[0,0,0,0],'date'));
 assert.deepEqual(empty,{schemaVersion:1,lessons:{}});
});

test('不完整答题记录不能使课程加载崩溃，阅读位置导入后仍保留',()=>{
 const a={answers:[0,1,2,3],score:50,date:'2026-09-27'};
 assert.throws(()=>validateProgress({schemaVersion:1,lessons:{L16:{latest:a}}}),/答题记录/);
 assert.throws(()=>validateProgress({schemaVersion:1,lessons:{L16:{first:a}}}),/答题记录/);
 const input={schemaVersion:1,lastLesson:'L16',lessons:{L16:{position:'topic-规则先作用',first:a,latest:a}}};
 assert.deepEqual(validateProgress(input),input);
 assert.throws(()=>validateProgress({schemaVersion:1,lessons:{L16:{position:123}}}));
 assert.throws(()=>validateProgress({schemaVersion:1,lastLesson:'L99',lessons:{}}));
});
