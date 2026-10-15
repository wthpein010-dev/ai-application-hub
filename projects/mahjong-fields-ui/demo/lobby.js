/* 大厅视觉方案共用动作及数值，方案控件置于游戏画面外。 */
(() => {
  'use strict';
  const layouts = [
    {id:'classic',name:'蓝金四宫格',note:'四个入口均衡展示',image:'home-hub.webp',width:1671,height:941,coin:[654,206,594,327],event:[1274,206,602,326],floor:[46,232,224,58]},
    {id:'jade',name:'青玉双竖卡',note:'金币与赛事双主入口',image:'home-jade.webp',width:1672,height:941,coin:[609,132,571,580],event:[1206,132,624,580],floor:[120,246,290,68]},
    {id:'wood',name:'暖木茶馆主卡',note:'突出茶馆，场次独立分栏',image:'home-wood.webp',width:1672,height:941,coin:[1281,179,586,264],event:[1281,456,586,258],floor:[38,177,264,64]},
    {id:'ink',name:'水墨横排四卡',note:'同级入口，横向一览',image:'home-ink.webp',width:1672,height:941,coin:[511,235,329,620],event:[856,235,328,620],floor:[32,493,263,65]},
    {id:'night',name:'夜色主次分栏',note:'金币主卡，赛事与社交分级',image:'home-night.webp',width:1672,height:941,coin:[570,221,608,616],event:[1195,221,662,302],floor:[34,291,262,71]},
    {id:'corner',name:'游园活动角',note:'茶馆主位，礼盒轻浮',image:'home-corner.webp',width:1672,height:941,coin:[647,529,597,324],event:[1263,529,608,324],floor:[46,217,230,61],promotion:'corner',promoBox:[45,690,190,180]},
    {id:'rail',name:'云台活动侧栏',note:'中部玩法，右侧活动架',image:'home-rail.webp',width:1672,height:941,coin:[478,224,469,310],event:[959,224,482,310],floor:[33,217,204,58],promotion:'rail',promoBox:[1480,224,382,630]},
    {id:'festival',name:'花灯活动长廊',note:'顶部活动横幅，玩法下排',image:'home-festival.webp',width:1672,height:941,coin:[528,341,339,502],event:[880,341,322,502],floor:[21,420,296,64],promotion:'banner',promoBox:[528,162,1350,165]},
    {id:'poster',name:'茶庭活动海报',note:'左侧主推海报，玩法靠右',image:'home-poster.webp',width:1672,height:940,coin:[766,538,552,320],event:[766,204,552,317],floor:[42,228,218,60],promotion:'poster',promoBox:[32,220,300,650],tools:[['进入商城','shop',868,184],['查看活动','activity',1088,174],['查看战绩','history',1278,181],['帮助反馈','help',1477,181],['设置','settings',1660,168]]},
    {id:'shelf',name:'灯会福利展台',note:'金币主卡，底部福利展台',image:'home-shelf.webp',width:1672,height:941,coin:[563,180,1234,285],event:[564,483,504,262],floor:[92,200,276,64],promotion:'shelf',promoBox:[564,775,1234,116]}
  ];
  const activities=Object.freeze([
    {id:'signin',name:'七日茶约',copy:'每日签到 · VIP额外20%',action:'support:signinPage',art:'reward-art reward-coins'},
    {id:'tea',name:'茶歇好礼',copy:'闲时茶歇领好礼',action:'support:teaPage',art:'reward-art reward-tea'},
    {id:'return',name:'回访有礼',copy:'回到大厅领茶礼',action:'support:returnPage',art:'reward-art reward-chest'},
    {id:'flip',name:'好运翻牌',copy:'完成对局再翻牌',action:'support:flipPage',art:'rich-art rich-3'}
  ].map(Object.freeze));
  const get=id=>layouts.find(x=>x.id===id)||layouts[0];
  const box=([left,top,width,height])=>`left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
  function promotion(l,b){
    if(!l.promotion)return '';
    const art='<img class="lobby-promo-art" src="assets/activity-festival.webp" width="1536" height="1024" alt="" decoding="async">';
    const title='<div class="lobby-promo-title">每日好礼</div>';
    const all=()=>b('全部活动 ›','activity','lobby-promo-all',`data-value="${l.id}-all" aria-label="查看全部活动"`);
    const entry=a=>b(`<span class="${a.art}" aria-hidden="true"></span><span><strong>${a.name}</strong><small>${a.copy}</small></span>`,a.action,'lobby-promo-entry',`aria-label="${a.name}，查看活动"`);
    let body='';
    if(l.promotion==='corner')body=b(`${art}<span>活动好礼</span>`,'activity','lobby-gift-entry','data-value="corner-gift" aria-label="活动好礼，进入活动中心"');
    else if(l.promotion==='poster')body=title+b(`<strong>七日茶约</strong><small>每日签到领金币</small>${art}<span class="lobby-vip-tag">VIP签到额外20%</span><span class="lobby-promo-cta">查看茶约 ›</span>`,'support:signinPage','lobby-promo-poster','aria-label="七日茶约，查看签到活动"')+all();
    else if(l.promotion==='banner')body=`<div class="lobby-promo-heading">${title}<span>签到 · 茶礼 · 翻牌</span>${all()}</div><nav aria-label="大厅精选活动">${activities.map(entry).join('')}</nav>${art}`;
    else if(l.promotion==='rail')body=title+`<nav aria-label="大厅精选活动">${activities.slice(0,3).map(entry).join('')}</nav>`+all();
    else body=`<div class="lobby-promo-heading">${title}${all()}</div><nav aria-label="大厅精选活动">${activities.map(entry).join('')}</nav>`;
    return `<aside class="lobby-promotion promo-${l.promotion}" aria-label="大厅活动" style="${box(l.promoBox)}">${body}</aside>`;
  }
  function home({id,coins,floor,region,b,fmt,resume}){
    const l=get(id);
    return `<img class="home-photo" src="assets/${l.image}" width="${l.width}" height="${l.height}" fetchpriority="high" decoding="async" alt="${l.name}大厅：金币场、比赛场、茶馆、亲友房">${b(`<span id="home-floor" class="home-entry-floor" style="${box(l.floor)}"><i class="gold-coin" aria-hidden="true"></i>${fmt(floor)} 金币起</span>`,'coin','home-hit home-mode-hit',`style="${box(l.coin)}" aria-label="进入金币场" aria-describedby="home-floor"`)}${b('','tournament','home-hit home-mode-hit',`style="${box(l.event)}" aria-label="进入比赛场"`)}
      <div class="home-region">${region}</div>
      ${b(fmt(coins),'supply','home-balance coins',`aria-label="金币余额${coins}，查看补给"`)}${b('433','wallet','home-balance cards','aria-label="房卡余额433"')}${b('0','wallet','home-balance diamonds','aria-label="钻石余额0"')}
      ${promotion(l,b)}<nav class="home-tools" aria-label="大厅常用功能">${(l.tools||[['进入商城','shop',735,168],['查看活动','activity',978,172],['查看战绩','history',1221,170],['帮助反馈','help',1456,180],['设置','settings',1690,168]]).map(([label,action,left,width])=>b('',action,'home-hit',`style="${box([left,903,width,162])}" data-value="lobby-tool-${action}" aria-label="${label}"`)).join('')}</nav>${resume}`;
  }
  function chooser(id,b){const chosen=get(id);return `<div class="lobby-choice-label"><strong>大厅方案</strong><span>选择风格与排版</span></div><div class="lobby-options" role="group" aria-label="主界面设计方案">${layouts.map((l,i)=>b(`<i class="layout-icon icon-${l.id}" aria-hidden="true"><em></em><em></em><em></em><em></em></i><span><strong>${i+1} · ${l.name}</strong><small>${l.note}</small></span>`,'lobbyStyle','lobby-choice',`data-value="${l.id}" aria-pressed="${l===chosen}"`)).join('')}</div>`;}
  window.FieldLobby=Object.freeze({layouts:Object.freeze(layouts.map(Object.freeze)),activities,get,home,chooser});
})();
