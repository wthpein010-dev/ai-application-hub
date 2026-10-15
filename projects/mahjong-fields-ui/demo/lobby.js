/* 大厅视觉方案共用动作及数值，方案控件置于游戏画面外。 */
(() => {
  'use strict';
  const layouts = [
    {id:'classic',name:'蓝金四宫格',note:'四个入口均衡展示',image:'home-hub.webp',width:1671,height:941,coin:[654,206,594,327],event:[1274,206,602,326],floor:[46,232,224,58]},
    {id:'jade',name:'青玉双竖卡',note:'金币与赛事双主入口',image:'home-jade.webp',width:1672,height:941,coin:[609,132,571,580],event:[1206,132,624,580],floor:[120,246,290,68]},
    {id:'wood',name:'暖木茶馆主卡',note:'突出茶馆，场次独立分栏',image:'home-wood.webp',width:1672,height:941,coin:[1281,179,586,264],event:[1281,456,586,258],floor:[38,177,264,64]},
    {id:'ink',name:'水墨横排四卡',note:'同级入口，横向一览',image:'home-ink.webp',width:1672,height:941,coin:[511,235,329,620],event:[856,235,328,620],floor:[32,493,263,65]},
    {id:'night',name:'夜色主次分栏',note:'金币主卡，赛事与社交分级',image:'home-night.webp',width:1672,height:941,coin:[570,221,608,616],event:[1195,221,662,302],floor:[34,291,262,71]}
  ];
  const get=id=>layouts.find(x=>x.id===id)||layouts[0];
  const box=([left,top,width,height])=>`left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
  function home({id,coins,floor,region,b,fmt,resume}){
    const l=get(id);
    return `<img class="home-photo" src="assets/${l.image}" width="${l.width}" height="${l.height}" fetchpriority="high" decoding="async" alt="${l.name}大厅：金币场、比赛场、茶馆、亲友房">${b(`<span id="home-floor" class="home-entry-floor" style="${box(l.floor)}"><i class="gold-coin" aria-hidden="true"></i>${fmt(floor)} 金币起</span>`,'coin','home-hit home-mode-hit',`style="${box(l.coin)}" aria-label="进入金币场" aria-describedby="home-floor"`)}${b('','tournament','home-hit home-mode-hit',`style="${box(l.event)}" aria-label="进入比赛场"`)}
      <div class="home-region">${region}</div>
      ${b(fmt(coins),'supply','home-balance coins',`aria-label="金币余额${coins}，查看补给"`)}${b('433','wallet','home-balance cards','aria-label="房卡余额433"')}${b('0','wallet','home-balance diamonds','aria-label="钻石余额0"')}
      <nav class="home-tools" aria-label="大厅常用功能">${[['进入商城','shop',735,168],['查看活动','activity',978,172],['查看战绩','history',1221,170],['帮助反馈','help',1456,180],['设置','settings',1690,168]].map(([label,action,left,width])=>b('',action,'home-hit',`style="${box([left,903,width,162])}" aria-label="${label}"`)).join('')}</nav>${resume}`;
  }
  function chooser(id,b){const chosen=get(id);return `<div class="lobby-choice-label"><strong>大厅方案</strong><span>选择风格与排版</span></div><div class="lobby-options" role="group" aria-label="主界面设计方案">${layouts.map((l,i)=>b(`<i class="layout-icon icon-${l.id}" aria-hidden="true"><em></em><em></em><em></em><em></em></i><span><strong>${i+1} · ${l.name}</strong><small>${l.note}</small></span>`,'lobbyStyle','lobby-choice',`data-value="${l.id}" aria-pressed="${l===chosen}"`)).join('')}</div>`;}
  window.FieldLobby=Object.freeze({layouts:Object.freeze(layouts.map(Object.freeze)),get,home,chooser});
})();
