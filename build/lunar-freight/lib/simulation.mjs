import * as C from 'cannon-es';
import {Campaign,NPCS} from './campaign.mjs';
export const BASES=[
 {id:'A',name:'曙光站',cargo:'生命支持设备',x:0,z:-75,color:'#75eadb'},
 {id:'B',name:'开普勒站',cargo:'地质勘探设备',x:85,z:-90,color:'#ffba69'},
 {id:'C',name:'静海站',cargo:'通信中继设备',x:100,z:35,color:'#a6b7ff'},
];
export const CRATERS=[{x:-42,z:-35,r:22,d:8},{x:49,z:-29,r:15,d:6},{x:49,z:63,r:21,d:7},{x:-97,z:-111,r:31,d:10},{x:143,z:-48,r:23,d:7},{x:-72,z:80,r:27,d:9}];
export const SIZE=200, CELL=2;
const rawHeight=(x,z)=>{
 let y=1.65*Math.sin(x*.035)+1.27*Math.sin(z*.038)+.83*Math.sin((x+z)*.045);
 for(const c of CRATERS){const t=Math.hypot(x-c.x,z-c.z)/c.r;y+=2.5*Math.exp(-(((t-1)/.14)**2))-c.d*Math.exp(-((t/.7)**4));}
 return y;
};
export function heightAt(x,z){
 let h=rawHeight(x,z);
 for(const b of [...BASES,{x:0,z:30}]){const d=Math.hypot(x-b.x,z-b.z);if(d<32){const t=Math.max(0,Math.min(1,(d-12)/20));h=rawHeight(b.x,b.z)*(1-t*t*(3-2*t))+h*t*t*(3-2*t);}}
 return h;
}
export function makeObstacles(){
 const a=[{kind:'rock',x:17,z:5,r:2.4},{kind:'rock',x:-12,z:-40,r:1.7}];
 let seed=72613;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 for(let i=0;i<130;i++){
  const x=(rand()-.5)*360,z=(rand()-.5)*360,r=.65+rand()*2.2;
  if(Math.abs(x)<10&&z<45&&z>-100||z>-103&&z<-66&&x>-10&&x<100||x>74&&x<112&&z>-110&&z<53||BASES.some(b=>Math.hypot(x-b.x,z-b.z)<24)||Math.hypot(x,z-30)<20)continue;
  a.push({kind:'rock',x,z,r});
 }
 for(const b of BASES){a.push({kind:'building',x:b.x-9,z:b.z-11,sx:5,sy:4,sz:4});a.push({kind:'building',x:b.x+8,z:b.z-10,sx:4,sy:3,sz:5});}
 return a;
}
export class LunarSimulation {
 constructor({campaign=false}={}){
  this.world=new C.World({gravity:new C.Vec3(0,-1.62,0)});this.world.broadphase=new C.NaiveBroadphase();this.world.solver.iterations=15;
  this.world.defaultContactMaterial.friction=.65;this.world.defaultContactMaterial.restitution=.03;
  this.time=0;this.battery=100;this.lastImpact=-10;this.resets=0;this.impacts=0;this.message='三箱设备已装车，沿青色信标前往曙光站。';this.messageUntil=9;
  this.data=Array.from({length:201},(_,i)=>Array.from({length:201},(_,j)=>heightAt(i*CELL-SIZE,SIZE-j*CELL)));
  this.ground=new C.Body({mass:0,shape:new C.Heightfield(this.data,{elementSize:CELL})});this.ground.position.set(-SIZE,0,SIZE);this.ground.quaternion.setFromEuler(-Math.PI/2,0,0);this.world.addBody(this.ground);
  this.bases=BASES;this.campaign=campaign?new Campaign(this):null;
  this.obstacles=makeObstacles().filter(o=>!campaign||o.kind!=='rock'||!(o.x>88&&o.x<128&&o.z>-10&&o.z<82));
  if(campaign){this.obstacles.push({kind:'building',x:-11,z:24,sx:6,sy:4,sz:5});for(const n of NPCS)this.obstacles.push({kind:'npc',id:n.id,x:n.x,z:n.z,sx:.8,sy:1.8,sz:.8});}
  for(const o of this.obstacles){const body=new C.Body({mass:0,shape:o.kind==='rock'?new C.Sphere(o.r):new C.Box(new C.Vec3(o.sx/2,o.sy/2,o.sz/2))});body.position.set(o.x,heightAt(o.x,o.z)+(o.kind==='rock'?o.r*.55:o.sy/2),o.z);this.world.addBody(body);o.body=body;}
  // Raised enclosing walls prevent leaving the finite heightfield.
  for(const [x,z,sx,sz]of [[-198,0,1,200],[198,0,1,200],[0,-198,200,1],[0,198,200,1]]){const b=new C.Body({mass:0,shape:new C.Box(new C.Vec3(sx,25,sz))});b.position.set(x,0,z);this.world.addBody(b);}
  this.body=new C.Body({mass:180,linearDamping:.015,angularDamping:.22});this.body.addShape(new C.Box(new C.Vec3(1.14,.38,1.95)),new C.Vec3(0,.12,0));this.body.addShape(new C.Box(new C.Vec3(1.05,.55,.8)),new C.Vec3(0,.87,-.85));this.body.position.set(0,heightAt(0,30)+1.2,30);this.world.addBody(this.body);
  this.vehicle=new C.RaycastVehicle({chassisBody:this.body,indexRightAxis:0,indexUpAxis:1,indexForwardAxis:2});
  for(const z of [-1.42,0,1.42])for(const x of [-1.3,1.3])this.vehicle.addWheel({radius:.57,directionLocal:new C.Vec3(0,-1,0),axleLocal:new C.Vec3(-1,0,0),chassisConnectionPointLocal:new C.Vec3(x,-.12,z),suspensionStiffness:16,suspensionRestLength:.55,dampingRelaxation:2.6,dampingCompression:3.8,maxSuspensionForce:1500,maxSuspensionTravel:.4,frictionSlip:2.2,rollInfluence:.15,customSlidingRotationalSpeed:-15,useCustomSlidingRotationalSpeed:true});
  this.vehicle.addToWorld(this.world);
  this.cargo=BASES.map((b,i)=>({id:b.id,name:b.cargo,mass:[22,28,18][i],integrity:100,destination:b,state:'carried',offset:new C.Vec3((i-1)*.65,.92,.72),body:null}));
  for(const c of this.cargo){c.shape=new C.Box(new C.Vec3(.32,.34,.38));this.body.addShape(c.shape,c.offset);}
  this.updateLoad();
  this.safe={x:0,z:30,yaw:0};this.heading=0;this.steer=0;
  this.body.addEventListener('collide',e=>{const speed=Math.abs(e.contact.getImpactVelocityAlongNormal());if(speed>(e.body===this.ground?6:5))this.impact(speed);});
 }
 get speed(){return this.body.velocity.length();}
 get delivered(){return this.cargo.filter(c=>c.state==='delivered').length;}
 get complete(){return this.campaign?this.campaign.stage===4:this.delivered===3;}
 get loadMass(){return this.cargo.filter(c=>c.state==='carried').reduce((sum,c)=>sum+c.mass,0);}
 updateLoad(){if(this.campaign){this.body.mass=180+this.loadMass;this.body.updateMassProperties();}}
 addCargo({id,name,mass,destination,droppedAt,fragile=false}){
  const c={id,name,mass,destination,fragile,integrity:100,state:droppedAt?'dropped':'carried',offset:new C.Vec3(0,.92,.72),shape:new C.Box(new C.Vec3(.32,.34,.38)),body:null};
  if(droppedAt){c.body=new C.Body({mass,shape:new C.Box(new C.Vec3(.36,.36,.36)),linearDamping:.24,angularDamping:.3});c.body.position.set(droppedAt.x,heightAt(droppedAt.x,droppedAt.z)+.6,droppedAt.z);this.world.addBody(c.body);}else this.body.addShape(c.shape,c.offset);
  this.cargo.push(c);this.updateLoad();return c;
 }
 get upright(){return this.body.quaternion.vmult(new C.Vec3(0,1,0)).y;}
 get grounded(){return this.vehicle.wheelInfos.filter(w=>w.isInContact).length;}
 say(message){this.message=message;this.messageUntil=this.time+5;}
 impact(speed){
  if(speed<5||this.time-this.lastImpact<1.6||this.complete)return;
  const c=this.cargo.find(c=>c.state==='carried');if(!c)return;
  this.lastImpact=this.time;this.impacts++;c.state='dropped';c.integrity=Math.max(10,c.integrity-Math.round((speed-2)*(c.fragile?7:4)));this.body.removeShape(c.shape);this.updateLoad();
  c.body=new C.Body({mass:12,shape:new C.Box(new C.Vec3(.36,.36,.36)),linearDamping:.24,angularDamping:.3});
  const p=this.body.pointToWorldFrame(new C.Vec3(2.3,1.3,1));c.body.position.copy(p);c.body.velocity.copy(this.body.velocity.scale(.45));c.body.velocity.y+=1.8;this.world.addBody(c.body);
  this.say(`${c.id} 箱设备掉落！减速后靠近橙色方块，按 E 拾取。`);
 }
 interact(){
  if(this.complete)return false;
  if(this.campaign&&(this.campaign.stage===0||this.campaign.dialogue)){this.say('先完成工作人员的对话，再继续装卸。');return false;}
  if(this.speed>.8||this.upright<.45){this.say('请先制动停车，再装卸货物。');return false;}
  for(const c of this.cargo)if(c.state==='dropped'&&this.body.position.distanceTo(c.body.position)<6){this.world.removeBody(c.body);c.body=null;c.state='carried';this.body.addShape(c.shape,c.offset);this.updateLoad();this.campaign?.onPickup(c);this.say(`${c.id} 箱设备已重新装车，完整度 ${c.integrity}%。`);return true;}
  for(const b of BASES)if(Math.hypot(this.body.position.x-b.x,this.body.position.z-b.z)<6&&Math.abs(this.body.position.y-heightAt(b.x,b.z))<2.5&&this.grounded>=2){const c=this.cargo.find(c=>c.destination.id===b.id&&c.state==='carried');if(c){c.state='delivered';this.body.removeShape(c.shape);this.updateLoad();this.battery=Math.min(100,this.battery+25);this.say(`${b.name}交付成功，电量补充 25%。`);this.campaign?.onDelivery(c);return true;}}
  this.say('驶入基地发光圆环后停车，按 E 交付；掉落设备靠近后可拾取。');return false;
 }
 reset(){
  if(this.complete)return;
  const emergency=this.body.position.y<heightAt(this.body.position.x,this.body.position.z)-5;
  if(!emergency&&this.upright>.45&&this.speed>1){this.say('请先停车再扶正；翻覆时可直接按 R。');return;}
  if(!emergency&&this.lastReset!==undefined&&this.time-this.lastReset<3)return;
  this.lastReset=this.time;
  this.resets++;this.battery=Math.max(0,this.battery-3);
  this.body.position.set(this.safe.x,heightAt(this.safe.x,this.safe.z)+1.3,this.safe.z);this.body.quaternion.setFromEuler(0,this.safe.yaw,0);this.body.velocity.setZero();this.body.angularVelocity.setZero();this.body.force.setZero();this.body.torque.setZero();this.body.wakeUp();
  this.say('月球车已扶正至最近安全位置，掉落货物仍在原处。');
 }
 step(dt,input={}){
  if(this.complete)return;
  this.time+=dt;
  const q=this.body.quaternion,f=q.vmult(new C.Vec3(0,0,-1));this.heading=Math.atan2(-f.x,-f.z);
  const throttle=this.battery>0?(input.throttle||0):0;
  const target=(input.steer||0)*(.44/(1+this.speed*.06));this.steer+=(target-this.steer)*Math.min(1,dt*7);
  for(let i=0;i<6;i++){this.vehicle.setSteeringValue(i<2?this.steer:i>=4?-this.steer:0,i);this.vehicle.applyEngineForce(this.speed<(throttle<0?4.5:10)?throttle*48:0,i);this.vehicle.setBrake(input.brake?.38:0,i);}
  this.world.step(dt);this.campaign?.advanceRoute();
  // Cannon's visual-wheel update clears isInContact; preserve simulation contact state.
  for(let i=0;i<6;i++){const wheel=this.vehicle.wheelInfos[i],contact=wheel.isInContact;this.vehicle.updateWheelTransform(i);wheel.isInContact=contact;}
  this.battery=Math.max(0,this.battery-dt*(Math.abs(throttle)*.075+.005));
  if(input.solar&&this.speed<.3&&this.grounded>=3)this.battery=Math.min(100,this.battery+dt*1.2);
  if(this.grounded>=4&&this.upright>.92&&this.speed<6&&this.time%1<dt){this.safe={x:this.body.position.x,z:this.body.position.z,yaw:this.heading};}
  for(const c of this.cargo)if(c.state==='dropped'&&(Math.abs(c.body.position.x)>194||Math.abs(c.body.position.z)>194||c.body.position.y<heightAt(c.body.position.x,c.body.position.z)-2)){c.body.position.set(this.safe.x+3,heightAt(this.safe.x+3,this.safe.z)+1,this.safe.z);c.body.velocity.setZero();}
  if(this.body.position.y<heightAt(this.body.position.x,this.body.position.z)-5)this.reset();
 }
 snapshot(){return {x:this.body.position.x,y:this.body.position.y,z:this.body.position.z,heading:this.heading,speed:this.speed,grounded:this.grounded,upright:this.upright,battery:this.battery,time:this.time,delivered:this.delivered,totalDeliveries:this.campaign?5:3,complete:this.complete,impacts:this.impacts,resets:this.resets,loadMass:this.loadMass,campaign:this.campaign?.snapshot()||null,message:this.messageUntil>this.time?this.message:'',cargo:this.cargo.map(c=>({id:c.id,name:c.name,mass:c.mass,integrity:c.integrity,fragile:!!c.fragile,destination:c.destination,state:c.state,x:c.body?.position.x,z:c.body?.position.z}))};}
}
