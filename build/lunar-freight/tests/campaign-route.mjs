import assert from 'node:assert/strict';
import {LunarSimulation} from '../lib/simulation.mjs';
const s=new LunarSimulation({campaign:true});s.campaign.start();s.campaign.confirm();
let deliveries=0,pickups=0;
for(let frame=0;frame<480*120&&!s.complete;frame++){
 if(s.campaign.dialogue)s.campaign.confirm();
 const goal=s.campaign.snapshot().objective;
 const dx=goal.x-s.body.position.x,dz=goal.z-s.body.position.z,d=Math.hypot(dx,dz);
 const err=Math.atan2(Math.sin(Math.atan2(-dx,-dz)-s.heading),Math.cos(Math.atan2(-dx,-dz)-s.heading));
 const speedGoal=d<5?0:Math.min(Math.abs(err)>1?1.6:4.3,Math.sqrt(Math.max(0,d-4)*1.3));
 s.step(1/120,{throttle:s.speed<speedGoal?1:0,steer:Math.max(-1,Math.min(1,err*1.8)),brake:s.speed>speedGoal+.1||d<5});
 if(d<5.5&&s.speed<.65&&s.grounded>=2){
  const dropped=s.cargo.filter(c=>c.state==='dropped').length;
  if(s.interact()){
   if(s.delivered>deliveries){deliveries=s.delivered;console.log('DELIVERY',deliveries,s.time.toFixed(1),'stage',s.campaign.stage);}
   else if(s.cargo.filter(c=>c.state==='dropped').length<dropped)pickups++;
  }
 }
 assert.ok(s.upright>.2,'route rolled over: '+JSON.stringify(s.snapshot()));
}
assert.ok(s.complete,JSON.stringify(s.snapshot()));assert.equal(s.delivered,5);assert.ok(pickups>=1);
console.log('CAMPAIGN ROUTE PASSED',JSON.stringify({seconds:s.time,pickups,impacts:s.impacts,resets:s.resets,rank:s.campaign.rank}));
