import { LunarSimulation } from './simulation.mjs';
import { createScene } from './scene.mjs';
export function createRuntime(canvas,publish,onError){
 let sim=new LunarSimulation({campaign:true}),view=createScene(canvas,sim),started=false,paused=false,mode=2,raf=0,last=performance.now(),acc=0,ui=0,external=null,disposed=false;
 const keys=new Set(),lifecycle=new AbortController();
 const snapshot=()=>({...sim.snapshot(),started,paused,mode,assets:view.assetStatus});
 const clear=()=>{keys.clear();external=null;};
 function action(name,value){
  if(name==='start'){started=true;paused=false;sim.campaign.start();clear();}
  else if(name==='pause'&&started&&!sim.complete){paused=!paused;clear();}
  else if(name==='camera'){if(![1,2,3].includes(value))throw Error('镜头必须是 1、2 或 3');mode=value;}
  else if(name==='restart'){clear();view.dispose();sim=new LunarSimulation({campaign:true});view=createScene(canvas,sim);started=true;paused=false;acc=0;sim.campaign.start();}
  else if(started){if(name==='confirm')sim.campaign.confirm();else if(!paused&&!sim.campaign.dialogue){if(name==='interact')sim.interact();else if(name==='talk')sim.campaign.talk();else if(name==='reset')sim.reset();}}
  if(sim.campaign.dialogue){clear();acc=0;}
  publish(snapshot());canvas.focus({preventScroll:true});return snapshot();
 }
 const down=e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.repeat)return;if(sim.campaign.dialogue){if(e.code==='Enter'){e.preventDefault();action('confirm');}return;}if(e.code==='Enter'&&!started){e.preventDefault();action('start');return;}if(e.code==='Escape'){action('pause');return;}if(e.code.startsWith('Digit')&&['1','2','3'].includes(e.key))action('camera',Number(e.key));if(e.code==='KeyC')action('camera',mode%3+1);if(e.code==='KeyE')action('interact');if(e.code==='KeyF')action('talk');if(e.code==='KeyR')action('reset');keys.add(e.code);};
 const up=e=>keys.delete(e.code);const blur=()=>{clear();if(started&&!sim.complete)paused=true;};
 window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);const visibility=()=>{if(document.hidden)blur();};document.addEventListener('visibilitychange',visibility);
 const contextLost=e=>{e.preventDefault();blur();onError('图形上下文已中断，请刷新页面重新载入。');};canvas.addEventListener('webglcontextlost',contextLost);
 function frame(now){
  const dt=Math.min((now-last)/1000,.08);last=now;
  if(started&&!paused&&!sim.campaign.dialogue){acc+=dt;while(acc>=1/120){const input=external||{throttle:keys.has('KeyW')||keys.has('ArrowUp')?1:keys.has('KeyS')||keys.has('ArrowDown')?-1:0,steer:keys.has('KeyA')||keys.has('ArrowLeft')?1:keys.has('KeyD')||keys.has('ArrowRight')?-1:0,brake:keys.has('Space'),solar:keys.has('KeyT')};sim.step(1/120,input);acc-=1/120;}}else acc=0;
  view.draw(dt,mode);if(now-ui>100){publish(snapshot());ui=now;}raf=requestAnimationFrame(frame);
 }
 raf=requestAnimationFrame(frame);
 const context=document.modelContext;
 if(context?.registerTool){
  const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'mission_status',description:'读取月球车位置、航向、速度（米/秒）、电池、五件货物及三段委托状态。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:snapshot});
  register({name:'rover_action',description:'开始、暂停/继续、重开、装卸、NPC 对话(talk)、确认当前对话(confirm)、扶正或切换镜头。遵循与页面按钮相同的规则。',inputSchema:{type:'object',properties:{action:{type:'string',enum:['start','pause','restart','interact','talk','confirm','reset','camera']},camera:{type:'integer',enum:[1,2,3]}},required:['action'],additionalProperties:false},execute:({action:name,camera})=>{if(!['start','pause','restart','interact','talk','confirm','reset','camera'].includes(name))throw Error('无效动作');return action(name,camera);}});
  register({name:'drive_rover',description:'持续操作当前月球车，经过真实时间和同一物理循环后返回状态。不会传送车辆或直接交付。油门 -1 到 1，转向正数左转，负数右转。',inputSchema:{type:'object',properties:{throttle:{type:'number',minimum:-1,maximum:1},steer:{type:'number',minimum:-1,maximum:1},brake:{type:'boolean'},seconds:{type:'number',minimum:.1,maximum:8}},required:['throttle','steer','seconds'],additionalProperties:false},execute:async input=>{
   if(!started||paused||sim.complete||sim.campaign.dialogue)throw Error('请先开始或继续未完成的任务，并确认当前 NPC 对话');
   if(external)throw Error('上一个驾驶指令仍在执行');
   if(!Number.isFinite(input.seconds)||input.seconds<.1||input.seconds>8||!Number.isFinite(input.throttle)||Math.abs(input.throttle)>1||!Number.isFinite(input.steer)||Math.abs(input.steer)>1)throw Error('输入超出驾驶范围');
   const target=sim.time+input.seconds,deadline=performance.now()+25000;external=input;
   await new Promise(resolve=>{const check=()=>{if(disposed||paused||sim.complete||sim.campaign.dialogue||sim.time>=target||performance.now()>deadline){external=null;resolve();}else setTimeout(check,30);};check();});publish(snapshot());return snapshot();
  }});
 }
 return {action,hold(code,held){if(held)keys.add(code);else keys.delete(code);},dispose(){disposed=true;lifecycle.abort();cancelAnimationFrame(raf);view.dispose();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('webglcontextlost',contextLost);}};
}
