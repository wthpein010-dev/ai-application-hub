export const LOST_SITE={x:100,z:68};
export const NPCS=[
 {id:'dispatch',name:'沈岚',role:'月面调度员',x:4,z:32,color:'#dfad65',line:'货物有目的地，路上的人也是。出发前看一眼地图，弯道和陨石坑前提前制动。'},
 {id:'A',name:'林澈',role:'曙光站 · 生命支持',x:-5,z:-80,color:'#75eadb',line:'这里的每一次呼吸都依赖送来的设备。请保持车速，保护好箱子。'},
 {id:'B',name:'乔恩',role:'开普勒站 · 勘探工程师',x:82,z:-96,color:'#ffba69',line:'岩石后的直线不一定更快。可以绕路，但别把中继电源摔坏。'},
 {id:'C',name:'阿遥',role:'静海站 · 通信员',x:104,z:36,color:'#a6b7ff',line:'通信中断之后，我们等的不只是设备。每辆抵达的车都意味着有人还记得这里。'},
];
const CHAPTERS=[
 ['运输许可','与调度员确认路线，领取第一批设备。'],
 ['重连前哨站','将三箱设备送到曙光、开普勒和静海站，恢复月面基础网络。'],
 ['失联的货物','静海站南侧有一箱失联勘探数据。找回它，交给开普勒站的乔恩。'],
 ['最后一公里','将乔恩的中继电源送至静海站。这件易损货物需要格外平稳地运输。'],
 ['月面网络已重连','所有设备和失联数据都已送达，三座前哨站重新建立了联系。'],
];
export class Campaign{
 constructor(sim){this.sim=sim;this.stage=0;this.reputation=0;this.dialogue=null;this.route=[];}
 get nearby(){return NPCS.find(n=>Math.hypot(n.x-this.sim.body.position.x,n.z-this.sim.body.position.z)<10)||null;}
 get rank(){const done=this.sim.cargo.filter(c=>c.state==='delivered');const quality=done.length?done.reduce((sum,c)=>sum+c.integrity,0)/done.length:100;return quality>=90?'S':quality>=70?'A':'B';}
 open(npc,text,actionLabel='继续运输'){this.dialogue={npcId:npc.id,name:npc.name,role:npc.role,text,actionLabel};}
 start(){if(this.stage===0)this.open(NPCS[0],'运输员，三座前哨站正等待设备。车上是生命支持、地质勘探和通信设备。按顺序沿信标前进，把它们送到收货圆环里。低重力下制动距离很长，货物越重，车越难加速。','接受委托 · 出发');}
 confirm(){if(!this.dialogue)return false;if(this.stage===0)this.stage=1;this.dialogue=null;return true;}
 talk(){
  const s=this.sim,n=this.nearby;
  if(!n||s.speed>.8||s.grounded<2||s.upright<.45){s.say('靠近工作人员后停车，按 F 对话。');return false;}
  if(this.stage===0){if(n.id==='dispatch'){this.start();return true;}s.say('先返回出发点，与沈岚确认运输许可。');return false;}
  this.open(n,n.line,'收到 · 继续运输');return true;
 }
 onPickup(c){if(c.id==='D'&&this.sim.body.position.z>45&&!this.route.length)this.route=[{x:116,z:68,label:'沿信标绕行静海站东侧'},{x:118,z:0,label:'绕过建筑群，返回开普勒站'}];}
 advanceRoute(){while(this.route.length&&Math.hypot(this.sim.body.position.x-this.route[0].x,this.sim.body.position.z-this.route[0].z)<7)this.route.shift();}
 onDelivery(c){
  this.reputation+=Math.round(c.integrity/10);
  const n=NPCS.find(n=>n.id===c.destination.id)||NPCS[0];
  const receipt=`${c.name}已签收。完整度 ${Math.round(c.integrity)}%，评价 ${c.integrity>=90?'S':c.integrity>=70?'A':'B'}。`;
  if(this.stage===1&&this.sim.delivered===3){
   this.stage=2;this.sim.addCargo({id:'D',name:'失联勘探数据',mass:16,destination:this.sim.bases[1],droppedAt:LOST_SITE});
   this.open(n,receipt+' 阿遥收到了失联货物的信号：静海站南侧的废弃信标旁。带上那箱勘探数据，送回开普勒站。','接受回收委托');
  }else if(this.stage===2&&c.id==='D'){
   this.stage=3;this.route=[{x:100,z:-80,label:'沿出口信标驶向静海站'}];this.sim.addCargo({id:'E',name:'易损中继电源',mass:34,fragile:true,destination:this.sim.bases[2]});
   this.open(n,receipt+' 数据里保存了新的通信频率。我已把中继电源装上车。再跑一趟静海站，我们就能听到彼此的声音。','接收电源 · 运往静海');
  }else if(this.stage===3&&c.id==='E'){
   this.stage=4;this.dialogue=null;this.sim.say('阿遥：信号接通了。谢谢你，运输员。三座前哨站都在线。');
  }else this.open(n,receipt+' '+n.line,'签收完成 · 继续运输');
 }
 snapshot(){
  const s=this.sim;const pending=s.cargo.find(c=>c.state==='dropped')||s.cargo.find(c=>c.state==='carried');
  let objective={x:0,z:30,label:'与沈岚确认运输许可'};
  if(this.stage===4)objective={x:100,z:35,label:'三座前哨站已全部上线'};
  else if(this.stage>0&&pending){objective=pending.state==='dropped'?{x:pending.body.position.x,z:pending.body.position.z,label:`找回 ${pending.name}`}:(this.route[0]||{x:pending.destination.x,z:pending.destination.z,label:`送往${pending.destination.name}`});}
  return {stage:this.stage,title:CHAPTERS[this.stage][0],brief:CHAPTERS[this.stage][1],objective,reputation:this.reputation,rank:this.rank,dialogue:this.dialogue,nearbyNpc:s.speed<.8?this.nearby:null,completedOrders:s.delivered};
 }
}
