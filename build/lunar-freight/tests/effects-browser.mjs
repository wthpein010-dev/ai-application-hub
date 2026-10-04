import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=resolve('../../projects/lunar-freight/game');
const server=createServer(async(req,res)=>{try{
 if(req.url==='/harness'){res.setHeader('Content-Type','text/html');res.end(`<canvas style="width:800px;height:450px"></canvas><script type="importmap">{"imports":{"three":"/deps/three/build/three.module.js","three/addons/":"/deps/three/examples/jsm/","cannon-es":"/deps/cannon-es/dist/cannon-es.js"}}</script><script type="module">import {LunarSimulation,heightAt} from '/source/lib/simulation.mjs';import {createScene} from '/source/lib/scene.mjs';window.harness={LunarSimulation,heightAt,createScene};</script>`);return;}
 const url=decodeURIComponent(req.url.split('?')[0]);const base=url.startsWith('/deps/')?resolve('node_modules'):url.startsWith('/source/')?resolve('.'):root;const relative=url.startsWith('/deps/')?url.slice(6):url.startsWith('/source/')?url.slice(8):url==='/'?'index.html':url.slice(1);const file=resolve(base,relative);if(!file.startsWith(base))throw Error('path');const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.glb':'model/gltf-binary'})[extname(file)]||'application/octet-stream');res.end(data);
 }catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||chromium.executablePath(),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]){
 const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.tools={};Object.defineProperty(document,'modelContext',{value:{registerTool(tool){window.tools[tool.name]=tool;}}});});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.tools.mission_status&&window.tools.mission_status.execute().assets.loaded);
 await page.locator('.launch-button').click();await page.locator('.dialogue-confirm').click();await page.evaluate(()=>window.tools.rover_action.execute({action:'camera',camera:3}));
 await page.evaluate(()=>{window.frameSamples=[];window.sampleFrames=true;let last=performance.now();const probe=now=>{if(!window.sampleFrames)return;window.frameSamples.push(now-last);last=now;requestAnimationFrame(probe);};requestAnimationFrame(probe);});
 await page.evaluate(()=>window.tools.drive_rover.execute({throttle:1,steer:0,seconds:6}));
 const timings=await page.evaluate(()=>{window.sampleFrames=false;const values=window.frameSamples.slice(5).sort((a,b)=>a-b);return {frames:values.length,medianMs:values[Math.floor(values.length/2)],p95Ms:values[Math.floor(values.length*.95)]};});
 await mkdir('tests/artifacts/effects',{recursive:true});await page.screenshot({path:'tests/artifacts/effects/'+viewport.width+'x'+viewport.height+'.png'});
 const moving=await page.evaluate(()=>window.tools.mission_status.execute());console.log("MOVING",JSON.stringify({speed:moving.speed,grounded:moving.grounded,effects:moving.effects}));assert.ok(moving.effects.particles>0);assert.ok(moving.effects.particles<=180);
 await page.evaluate(()=>window.tools.rover_action.execute({action:'pause'}));const paused=await page.evaluate(()=>window.tools.mission_status.execute());await page.waitForTimeout(300);const later=await page.evaluate(()=>window.tools.mission_status.execute());assert.equal(later.time,paused.time);assert.equal(later.effects.particles,paused.effects.particles);
 await page.evaluate(()=>window.tools.rover_action.execute({action:'restart'}));await page.waitForFunction(()=>window.tools.mission_status.execute().assets.loaded);const restarted=await page.evaluate(()=>window.tools.mission_status.execute());assert.equal(restarted.delivered,0);assert.equal(restarted.effects.particles,0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 for(const selector of ['.dialogue-confirm','.npc-dialog']){const b=await page.locator(selector).boundingBox();assert.ok(b&&b.x>=-1&&b.y>=-1&&b.x+b.width<=viewport.width+1&&b.y+b.height<=viewport.height+1,selector+' outside viewport '+JSON.stringify(b));}
 assert.deepEqual(errors,[]);console.log('BROWSER PASS',JSON.stringify({viewport,particles:moving.effects.particles,assets:moving.assets.models,pausedTime:paused.time,timings}));await page.close();
}
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/harness`);await page.waitForFunction(()=>window.harness);
 const route=await page.evaluate(()=>{
  const {LunarSimulation,createScene}=window.harness,s=new LunarSimulation({campaign:true}),v=createScene(document.querySelector('canvas'),s);s.campaign.start();s.campaign.confirm();v.draw(0);let events=0,maxParticles=0;
  for(let frame=0;frame<480*120&&!s.complete;frame++){if(s.campaign.dialogue)s.campaign.confirm();const goal=s.campaign.snapshot().objective,dx=goal.x-s.body.position.x,dz=goal.z-s.body.position.z,d=Math.hypot(dx,dz),err=Math.atan2(Math.sin(Math.atan2(-dx,-dz)-s.heading),Math.cos(Math.atan2(-dx,-dz)-s.heading)),speedGoal=d<5?0:Math.min(Math.abs(err)>1?1.6:4.3,Math.sqrt(Math.max(0,d-4)*1.3));s.step(1/120,{throttle:s.speed<speedGoal?1:0,steer:Math.max(-1,Math.min(1,err*1.8)),brake:s.speed>speedGoal+.1||d<5});
   if(frame%120===0){v.draw(1);maxParticles=Math.max(maxParticles,v.effects.particles);}
   if(d<5.5&&s.speed<.65&&s.grounded>=2){const before=s.delivered;if(s.interact()&&s.delivered>before){v.draw(.01);if(v.effects.feedback?.kind==='delivery')events++;}}
  }
  const result={deliveries:s.delivered,complete:s.complete,events,maxParticles};v.dispose();
  const collision=new LunarSimulation(),cv=createScene(document.querySelector('canvas'),collision);cv.draw(0);const rock=collision.obstacles.find(o=>o.kind==='rock');collision.body.position.set(rock.x,window.harness.heightAt(rock.x,rock.z)+1.25,rock.z+12);collision.body.velocity.set(0,0,-10);for(let i=0;i<240;i++)collision.step(1/120);cv.draw(.01);result.dropCue=cv.effects.feedback?.kind;const cargo=collision.cargo.find(c=>c.state==='dropped');collision.body.position.copy(cargo.body.position);collision.body.velocity.setZero();collision.interact();cv.draw(.01);result.pickupCue=cv.effects.feedback?.kind;collision.body.quaternion.setFromEuler(0,0,Math.PI);collision.reset();result.resets=collision.resets;cv.dispose();return result;
 });assert.equal(route.deliveries,5);assert.equal(route.complete,true);assert.equal(route.events,5);assert.ok(route.maxParticles<=180);assert.equal(route.dropCue,'damage');assert.equal(route.pickupCue,'pickup');assert.equal(route.resets,1);console.log('RENDERED ROUTE PASS',JSON.stringify(route));await page.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
