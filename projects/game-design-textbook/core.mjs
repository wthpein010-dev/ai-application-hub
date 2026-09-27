export function weightShares(weights) {
 if (!Array.isArray(weights)||!weights.length||weights.some(x=>!Number.isFinite(x)||x<0)) throw Error('权重须为非负有限数');
 const total=weights.reduce((a,b)=>a+b,0);
 if(!Number.isFinite(total)||total<=0)throw Error('总权重须大于零');
 return weights.map(w=>w/total);
}
export function rewardMetrics(rows,cost) {
 if(!Number.isFinite(cost)||cost<=0||!Array.isArray(rows)||!rows.length||rows.some(r=>!Number.isFinite(r.amount)||r.amount<0||!Number.isFinite(r.p)||r.p<0||r.p>1))throw Error('成本须为正数，奖表数量与概率须合法');
 if(Math.abs(rows.reduce((s,r)=>s+r.p,0)-1)>1e-9)throw Error('概率合计须为100%');
 const expected=rows.reduce((s,r)=>s+r.amount*r.p,0);
 return {expected,net:expected-cost,rtp:expected/cost,returnRate:rows.reduce((s,r)=>s+(r.amount>0?r.p:0),0),profitRate:rows.reduce((s,r)=>s+(r.amount>cost?r.p:0),0),variance:rows.reduce((s,r)=>s+(r.amount-expected)**2*r.p,0)};
}
export function seededRandom(seed) {
 let a=Number(seed)>>>0;
 return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}
function roll(rng){const x=rng();if(!Number.isFinite(x)||x<0||x>=1)throw Error('随机数须位于[0,1)');return x;}
function choose(weights,rng){const ps=weightShares(weights),r=roll(rng);let sum=0;for(let i=0;i<ps.length;i++){sum+=ps[i];if(r<sum)return i;}return ps.findLastIndex(p=>p>0);}
export function generatePool(items,qualities,group,rng=Math.random){
 weightShares(qualities);
 if(!Array.isArray(items)||new Set(items.map(x=>x.id)).size!==items.length)throw Error('物品ID重复');
 if(items.some(x=>typeof x.id!=='string'||!Number.isInteger(x.quality)||x.quality<0||x.quality>=qualities.length||!Number.isFinite(x.weight)||x.weight<0||!Array.isArray(x.blocked)))throw Error('物品配置不合法');
 const remaining=items.filter(x=>x.weight>0&&!x.blocked.includes(group));const pool=[];
 for(let slot=0;slot<7;slot++){
  const quality=choose(qualities,rng),candidates=remaining.filter(x=>x.quality===quality);
  if(!candidates.length)throw Error(`第${slot+1}槽的${['普通','稀有','传说'][quality]}候选不足，停止生成；未改品质。`);
  const denominator=candidates.reduce((s,x)=>s+x.weight,0),item=candidates[choose(candidates.map(x=>x.weight),rng)];
  pool.push({item:{...item},quality,denominator,candidates:candidates.length});remaining.splice(remaining.findIndex(x=>x.id===item.id),1);
 }
 return pool;
}
export function awardPool(pool,rng=Math.random){if(!Array.isArray(pool)||pool.length!==7)throw Error('领取前须生成完整七槽');return pool[Math.floor(roll(rng)*7)];}
const lessonId=/^L(?:0[1-9]|[1-4][0-9]|50)$/;
function attempt(x){return x&&Array.isArray(x.answers)&&x.answers.length===4&&x.answers.every(v=>Number.isInteger(v)&&v>=0&&v<4)&&Number.isInteger(x.score)&&x.score>=0&&x.score<=100&&x.score%25===0&&typeof x.date==='string';}
export function validateProgress(value){
 if(!value||value.schemaVersion!==1||!value.lessons||Array.isArray(value.lessons)||typeof value.lessons!=='object')throw Error('不是受支持的学习记录');
 const clean={schemaVersion:1,lessons:{}};
 if('lastLesson'in value){if(!lessonId.test(value.lastLesson))throw Error('最近课次无效');clean.lastLesson=value.lastLesson;}
 for(const [id,x] of Object.entries(value.lessons)){
  if(!lessonId.test(id)||!x||typeof x!=='object'||Array.isArray(x))throw Error('课次或记录格式无效');
  const row={};
  if(('first'in x)!==('latest'in x))throw Error('答题记录须同时包含首次与最近结果');
  if('position'in x){if(typeof x.position!=='string'||!x.position.length||x.position.length>200)throw Error('阅读位置无效');row.position=x.position;}
  for(const k of ['read','review'])if(k in x){if(typeof x[k]!=='boolean')throw Error('勾选状态无效');row[k]=x[k];}
  if('note'in x){if(typeof x.note!=='string'||x.note.length>50000)throw Error('笔记格式或长度无效');row.note=x.note;}
  for(const k of ['first','latest'])if(k in x){if(!attempt(x[k]))throw Error('答题记录无效');row[k]={answers:[...x[k].answers],score:x[k].score,date:x[k].date};}
  clean.lessons[id]=row;
 }
 return clean;
}
export function recordAttempt(progress,id,answers,correct,date){
 if(!lessonId.test(id)||!Array.isArray(correct)||correct.length!==4||!Array.isArray(answers)||answers.length!==4||[...answers,...correct].some(v=>!Number.isInteger(v)||v<0||v>3))throw Error('请先完成四题');
 const next=validateProgress(progress),a={answers:[...answers],score:answers.reduce((s,x,i)=>s+(x===correct[i]?25:0),0),date};
 next.lessons[id]={...next.lessons[id],first:next.lessons[id]?.first||a,latest:a};return next;
}
