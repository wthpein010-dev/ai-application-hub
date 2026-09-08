import test from 'node:test';
import assert from 'node:assert/strict';
import { LunarSimulation,BASES,heightAt } from '../lib/simulation.mjs';

function park(sim,x,z){
  sim.body.position.set(x,heightAt(x,z)+1.1,z);
  sim.body.quaternion.set(0,0,0,1);
  sim.body.velocity.setZero();sim.body.angularVelocity.setZero();
  for(let i=0;i<240;i++)sim.step(1/120,{brake:true});
}
function accept(sim){sim.campaign.start();sim.campaign.confirm();}
function finishFirstLeg(sim){
  for(const b of BASES){park(sim,b.x,b.z);assert.equal(sim.interact(),true);sim.campaign.confirm();}
}
test('campaign starts with dispatcher authorization and five deliveries',()=>{
  const s=new LunarSimulation({campaign:true});
  assert.equal(s.snapshot().totalDeliveries,5);assert.equal(s.campaign.stage,0);
  park(s,0,-75);assert.equal(s.interact(),false);
  park(s,0,30);accept(s);assert.equal(s.campaign.stage,1);
  assert.equal(s.snapshot().campaign.dialogue,null);
});
test('three bases unlock salvage, then relay delivery, then the true ending',()=>{
  const s=new LunarSimulation({campaign:true});accept(s);finishFirstLeg(s);
  assert.equal(s.delivered,3);assert.equal(s.complete,false);assert.equal(s.campaign.stage,2);
  let d=s.cargo.find(c=>c.id==='D');assert.equal(d.state,'dropped');
  park(s,100,68);assert.equal(s.interact(),true);assert.equal(d.state,'carried');
  park(s,100,35);assert.equal(s.interact(),false); // Salvage belongs to B, not C.
  park(s,85,-90);assert.equal(s.interact(),true);s.campaign.confirm();
  assert.equal(s.campaign.stage,3);assert.equal(s.cargo.find(c=>c.id==='E').state,'carried');
  park(s,100,35);assert.equal(s.interact(),true);
  assert.equal(s.delivered,5);assert.equal(s.complete,true);assert.equal(s.campaign.stage,4);
  assert.equal(s.snapshot().campaign.rank,'S');
});
test('dialogue cannot remotely unlock missions and prevents repeated delivery rewards',()=>{
  const s=new LunarSimulation({campaign:true});accept(s);park(s,0,0);
  assert.equal(s.campaign.talk(),false);assert.equal(s.campaign.dialogue,null);
  park(s,0,-75);s.interact();const rep=s.campaign.reputation;
  assert.equal(s.interact(),false);assert.equal(s.campaign.reputation,rep);
  s.campaign.confirm();assert.equal(s.interact(),false);
});
test('cargo mass is physical and damage survives retrieval and reset',()=>{
  const s=new LunarSimulation({campaign:true});accept(s);park(s,0,30);
  const mass=s.body.mass;assert.ok(mass>180);
  s.impact(9);const box=s.cargo.find(c=>c.state==='dropped');
  assert.ok(box.integrity<100);assert.ok(s.body.mass<mass);
  const integrity=box.integrity;park(s,box.body.position.x-4,box.body.position.z);
  assert.equal(s.interact(),true);assert.equal(box.integrity,integrity);
  assert.equal(s.body.mass,mass);s.reset();assert.equal(box.integrity,integrity);
});
test('NPC collision proxies exist and campaign restart has no duplicated cargo',()=>{
  const s=new LunarSimulation({campaign:true});accept(s);
  assert.equal(s.obstacles.filter(o=>o.kind==='npc').length,4);
  const fresh=new LunarSimulation({campaign:true});
  assert.equal(fresh.cargo.length,3);assert.equal(fresh.campaign.stage,0);assert.equal(fresh.delivered,0);
});
