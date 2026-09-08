import assert from 'node:assert/strict';
import { LunarSimulation,BASES } from '../lib/simulation.mjs';
const s=new LunarSimulation();let samples=[];
for(const b of BASES){let arrived=false;for(let t=0;t<160*120;t++){
 const dx=b.x-s.body.position.x,dz=b.z-s.body.position.z,d=Math.hypot(dx,dz),yaw=Math.atan2(-dx,-dz),err=Math.atan2(Math.sin(yaw-s.heading),Math.cos(yaw-s.heading));
 const goal=d<5?0:Math.min(Math.abs(err)>1?1.8:4.5,Math.sqrt(Math.max(0,d-4)*1.5));
 s.step(1/120,{throttle:s.speed<goal?1:0,steer:Math.max(-1,Math.min(1,err*2)),brake:s.speed>goal+.1||d<5});
 if(s.upright<.3)throw Error('rolled over heading to '+b.id+' '+JSON.stringify(s.snapshot()));
 if(d<5.5&&s.speed<.65&&s.interact()){arrived=true;samples.push(s.snapshot());console.log('DELIVERY',b.id,s.time.toFixed(1),s.body.position.toString());break;}
 }assert.ok(arrived,'must reach '+b.id+' '+JSON.stringify(s.snapshot()));}
assert.equal(s.delivered,3);console.log('ROUTE PASSED',JSON.stringify({seconds:s.time,impacts:s.impacts,resets:s.resets,battery:s.battery}));
