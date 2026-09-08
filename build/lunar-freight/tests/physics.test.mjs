import test from 'node:test';
import assert from 'node:assert/strict';
import { LunarSimulation, BASES, heightAt } from '../lib/simulation.mjs';
const advance=(s,n,input={})=>{for(let i=0;i<n*120;i++)s.step(1/120,input);};
test('emergency recovery bypasses manual reset speed restriction below terrain',()=>{
 const s=new LunarSimulation();s.body.position.y=heightAt(0,30)-8;s.body.velocity.set(0,-10,0);advance(s,.05);assert.ok(s.body.position.y>heightAt(0,30));assert.equal(s.resets,1);
});
test('lunar ballistic fall and coasting slopes arise from gravity',()=>{
 const s=new LunarSimulation();s.body.position.set(0,40,30);advance(s,.5);const drop=40-s.body.position.y;assert.ok(drop>.18&&drop<.23,'half-second fall should be about 0.2m on moon');
 const speeds=[];for(const sign of [-1,1]){const m=new LunarSimulation();m.body.position.set(0,heightAt(0,-25)+1.2,-25);advance(m,2,{brake:true});m.body.velocity.set(0,0,sign*2);advance(m,2);speeds.push(m.speed);}assert.ok(speeds[0]>2);assert.ok(speeds[1]<2);
});
test('rover accelerates, brakes, and remains above ground',()=>{
 const s=new LunarSimulation();advance(s,3);advance(s,6,{throttle:1});
 assert.ok(s.speed>2,'motor must propel rover');
 assert.ok(s.body.position.z<25,'forward must travel north');
 assert.ok(s.body.position.y>heightAt(s.body.position.x,s.body.position.z));
 advance(s,7,{brake:true});assert.ok(s.speed<.5);assert.ok(s.upright>.8,'braking must not pitch rover over');
});
test('delivery requires matching carried cargo, low speed, and proximity',()=>{
 const s=new LunarSimulation();assert.equal(s.interact(),false);
 for(const b of BASES){s.body.position.set(b.x,heightAt(b.x,b.z)+1.2,b.z);s.body.velocity.set(0,0,0);advance(s,1,{brake:true});assert.equal(s.interact(),true);assert.equal(s.interact(),false);}
 assert.equal(s.delivered,3);assert.equal(s.complete,true);
});
test('airborne and distant rover cannot deliver, and reset cannot erase a high-speed approach',()=>{
 const s=new LunarSimulation();s.body.position.set(0,20,-75);s.body.velocity.setZero();assert.equal(s.interact(),false);
 s.body.velocity.set(0,0,-8);const before=s.body.position.clone();s.reset();assert.deepEqual(s.body.position,before);assert.equal(s.resets,0);
});
test('depleted battery disables drive while parked solar charging recovers it',()=>{
 const s=new LunarSimulation();advance(s,2);s.battery=0;advance(s,3,{throttle:1});assert.ok(s.speed<.1);assert.equal(s.battery,0);advance(s,2,{solar:true,brake:true});assert.ok(s.battery>2);advance(s,4,{throttle:1});assert.ok(s.speed>1);
});
test('steering produces an actual turn in both directions',()=>{
 for(const sign of [-1,1]){const s=new LunarSimulation();advance(s,6,{throttle:.7,steer:sign});assert.ok(s.heading*sign>1);assert.ok(s.upright>.8);}
});
test('real rock and building contacts stop the chassis and eject cargo',()=>{
 for(const kind of ['rock','building']){const s=new LunarSimulation(),o=s.obstacles.find(o=>o.kind===kind);s.body.position.set(o.x,heightAt(o.x,o.z)+1.25,o.z+12);s.body.velocity.set(0,0,-10);advance(s,2);assert.ok(s.impacts>=1,kind+' impact must be detected by contact');assert.ok(s.cargo.some(c=>c.state==='dropped'));assert.ok(s.body.position.z>o.z-(o.r||o.sz),kind+' must block passage');}
});
test('damaging collision drops cargo, recovery preserves identity and deliveries',()=>{
 const s=new LunarSimulation();s.impact(7);assert.equal(s.cargo.filter(c=>c.state==='dropped').length,1);
 const c=s.cargo.find(c=>c.state==='dropped');s.body.position.copy(c.body.position);s.body.velocity.set(0,0,0);
 assert.equal(s.interact(),true);assert.equal(c.state,'carried');assert.equal(s.delivered,0);
});
test('reset restores upright chassis without restoring cargo or charge',()=>{
 const s=new LunarSimulation();s.battery=60;s.impact(7);s.body.quaternion.setFromEuler(0,0,Math.PI);s.reset();
 assert.equal(s.cargo.filter(c=>c.state==='dropped').length,1);assert.ok(s.battery<=60);assert.equal(s.body.quaternion.x,0);assert.equal(s.body.quaternion.z,0);
});
test('overturned cabin rests above the ground and can be recovered',()=>{
 const s=new LunarSimulation();s.body.position.y=heightAt(0,30)+4;s.body.quaternion.setFromEuler(0,0,Math.PI);advance(s,7);
 assert.ok(s.upright<.1,'fixture must remain overturned');assert.ok(s.body.position.y>heightAt(0,30)+1.2,'cabin roof must not sink through terrain');
 s.reset();advance(s,2,{brake:true});assert.ok(s.upright>.95);assert.ok(s.grounded>=4);
});
