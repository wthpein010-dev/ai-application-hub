// Visual-only lunar dust: fixed storage, ballistic motion, no simulation writes.
export const PARTICLE_LIMIT = 180;
export class DustPool {
 constructor(random=Math.random){this.random=random;this.cursor=0;this.active=0;this.particles=Array.from({length:PARTICLE_LIMIT},()=>({life:0}));}
 emit(position,velocity){const p=this.particles[this.cursor];this.cursor=(this.cursor+1)%PARTICLE_LIMIT;Object.assign(p,{x:position.x,y:position.y,z:position.z,vx:velocity.x*.12+(this.random()-.5)*.7,vy:.5+this.random()*.55,vz:velocity.z*.12+(this.random()-.5)*.7,life:1.3+this.random()*.5});}
 step(dt){if(dt<=0)return;this.active=0;for(const p of this.particles){if(p.life<=0)continue;p.life=Math.max(0,p.life-dt);if(!p.life)continue;p.vy-=1.62*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;this.active++;}}
}
export function cargoTransitions(previous,cargo){return cargo.flatMap(c=>{const before=previous.get(c.id);previous.set(c.id,c.state);return before&&before!==c.state?[{id:c.id,state:c.state,integrity:c.integrity}]:[];});}
