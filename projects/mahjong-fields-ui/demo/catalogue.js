(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FieldCatalogue=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Reference catalogue only. Actual region modes and opening criteria replace this data together.
  const profile=(id,name,players,art,rules)=>({id,name,players,art,rules});
  const GROUPS=[
    {id:'mahjong',name:'麻将',art:0,profiles:[
      profile('','地方麻将',4,0,['四人对局，按地区玩法完成摸牌、出牌和胡牌。','本局金币按该玩法最终输赢结算，结束后重新选场。']),
      profile('red','红中麻将',4,0,['红中作为赖子，合法组合与胡牌判断使用本玩法规则。','本局结束统一结算，不在局中更换玩家。'])]},
    {id:'ddz',name:'斗地主',art:1,profiles:[
      profile('ddz-fast','免洗斗地主',3,1,['三人对局，一名地主对两名农民；先完成叫分，再进行出牌。','按地主或农民获胜结果结算，倍率在牌桌与结算明细中展示。']),
      profile('ddz-classic','经典斗地主',3,1,['三人对局，叫分确定地主，地主获得底牌。','一方先出完手牌即本局结束；炸弹与春天计入最终倍率，不设重炸。'])]},
    {id:'gouji',name:'够级',art:2,profiles:[
      profile('gouji-dragon','六副带龙',6,2,['六人围桌，两队交叉入座；牌桌显示队伍与对门关系。','按当前模式的名次与团队结果结算，本局中不能离桌。']),
      profile('gouji-normal','六副普通',6,2,['六人对局，保留对门和队伍提示；本模式不使用带龙提示。','本人出完手牌后等待整桌结束，结算完成才能开始新局。']),
      profile('gouji-four','开点发四',6,2,['六人对局，牌桌展示开点、名次及当前出牌状态。','托管承接原座位和手牌；整桌结果确认后结算并清房。'])]},
    {id:'guandan',name:'掼蛋',art:4,profiles:[
      profile('guandan-classic','经典掼蛋',4,4,['四人两队，对家同队；牌桌展示队伍和当前级牌。','结算显示本局名次和队伍结果，金币场单局结束后清房。']),
      profile('guandan-a','过A掼蛋',4,4,['四人两队，显示当前级牌与本轮目标。','金币按一次完整玩法结果结算，不在途中重复匹配收费。']),
      profile('guandan-double','翻倍掼蛋',4,4,['四人两队，场档底分与本局倍率分别展示。','完成当前对局后按最终倍率结算，不能提前开启第二桌。'])]},
    {id:'poker',name:'扑克合集',art:1,profiles:[
      profile('pdk','跑得快',3,1,['三人依次出牌，先出完手牌获胜。','金币场采用当前场次配置，不显示红10翻倍选项；红10翻倍仅可用于两人配置。']),
      profile('shengji','升级',4,4,['四人两队，对家同队；显示庄家、主牌和当前级牌。','本局完成后按本玩法结果结算，托管不产生额外座位。'])]}
  ];
  const FOUR=[{name:'休闲场',min:500,max:5000,base:10},{name:'进阶场',min:5000,max:50000,base:50},{name:'高手场',min:50000,max:500000,base:200},{name:'大师场',min:500000,max:Infinity,base:1000}];
  const SIX=[{name:'练习场',min:500,max:5000,base:10},{name:'进阶场',min:5000,max:50000,base:50},{name:'精英场',min:50000,max:500000,base:200},{name:'至尊场',min:500000,max:1000000,base:1000},{name:'大师场',min:1000000,max:5000000,base:2000},{name:'巅峰场',min:5000000,max:Infinity,base:10000}];
  const PACKS=[{price:6,base:3000,bonus:0,coins:3000},{price:30,base:15000,bonus:1500,coins:16500},{price:68,base:34000,bonus:6800,coins:40800},{price:128,base:64000,bonus:19200,coins:83200},{price:328,base:164000,bonus:65600,coins:229600},{price:648,base:324000,bonus:194400,coins:518400}];
  const getProfile=id=>GROUPS.flatMap(g=>g.profiles).find(p=>p.id===id)||null;
  const groupFor=id=>GROUPS.find(g=>g.profiles.some(p=>p.id===id))||GROUPS[0];
  const FIVE=SIX.slice(0,5).map((f,i)=>({...f,max:i===4?Infinity:f.max}));
  const THREE=SIX.slice(0,3).map((f,i)=>({...f,max:i===2?Infinity:f.max}));
  const fieldsFor=id=>groupFor(id).id==='mahjong'?FOUR:id==='ddz-fast'?SIX:id==='guandan-a'?THREE:FIVE;
  const recommend=(id,coins)=>fieldsFor(id).findIndex(f=>coins>=f.min&&coins<f.max);
  function entryStatus(session,field){const gap=Math.max(0,field.min-session.available);return {gap,kind:gap?(session.principal>0&&session.coins>=field.min?'locked':'shortage'):session.available>=field.max?'over':'eligible'};}
  return {GROUPS,PACKS,getProfile,groupFor,fieldsFor,recommend,entryStatus};
});
