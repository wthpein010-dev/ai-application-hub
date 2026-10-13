(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FieldNavigation=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const coinPages=['coinMatch','coinReady','coinPlay'];
  const eventPages=['eventRegistered','eventStandby','eventAllocating','eventTable','eventSmallResult','eventRoundWait','eventFinal'];
  const eventMap={none:'eventCenter',registered:'eventRegistered',standby:'eventStandby',checkin:'eventRegistered',allocating:'eventAllocating',published:'eventAllocating',table:'eventTable',smallResult:'eventSmallResult',roundWait:'eventRoundWait',finalTemp:'eventFinal',final:'eventFinal',cancelled:'eventCenter',eliminated:'eventFinal'};
  function push(data,target){if(data.screen===target)return;data.navStack=(Array.isArray(data.navStack)?data.navStack:[]).concat(data.screen).slice(-16);}
  function returnTarget(data,status){
    const stack=Array.isArray(data.navStack)?data.navStack:[];let target=stack.pop()||data.returnScreen||'home';
    if(coinPages.includes(target))target=({matching:'coinMatch',seated:'coinReady',playing:'coinPlay'})[status]||'coinLobby';
    if(eventPages.includes(target))target=eventMap[data.tournament?.status]||'eventCenter';
    return target;
  }
  function remaining(deadline,now=Date.now()){return Number.isFinite(deadline)?Math.max(0,deadline-now):0;}
  function validate(data,coinStatus){
    if(!data||!Number.isInteger(data.field)||data.field<0||data.field>3||!Number.isInteger(data.game)||data.game<0||data.game>2||!['郑州','武汉','陕北'].includes(data.region)||!Array.isArray(data.history))throw Error('演示页面存档无效');
    const t=data.tournament;if(!t||!(t.status in eventMap)||!Number.isFinite(t.points)||!Number.isInteger(t.round)||t.round<1||t.round>4||!Number.isInteger(t.hand)||t.hand<1||t.hand>4||!Number.isInteger(t.stage)||t.stage<0||t.stage>2)throw Error('演示赛事存档无效');
    if(coinStatus!=='idle'&&['allocating','published','table','smallResult','roundWait'].includes(t.status))throw Error('重复占用的演示存档无效');
  }
  function escape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  return {push,returnTarget,remaining,validate,escape,eventMap};
});
