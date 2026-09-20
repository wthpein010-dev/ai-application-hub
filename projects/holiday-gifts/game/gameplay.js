// Native game assets; VFX are anchored to the actual matched pair.
function sceneMarkup(){return `<div class="scene-grass" aria-hidden="true">${[[210,214],[560,285],[80,320],[660,470],[42,900],[680,1075],[140,1255],[570,1330],[42,1490],[680,1520]].map(([x,y],i)=>`<i style="left:${x}px;top:${y}px;animation-delay:-${i*.37}s"></i>`).join('')}</div><div class="date-ornament" aria-hidden="true"></div><div class="miniapp-capsule" aria-hidden="true">•••　◉</div>`}
function showMoonTutorial(){openModal(`<h2 class="holiday-dialog-title">玩法说明</h2><button class="holiday-dialog-close" data-action="tutorial" aria-label="知道了"></button><img class="holiday-tutorial-picture" src="assets/holiday-0920/shuoming2.png" alt="同状态月饼砖碰撞后，从完整变为缺口，再变为少量剩余"><p class="holiday-tutorial-copy">相同状态的月饼砖，碰撞<br><strong>3次</strong>，消除<strong>2个月饼</strong>！</p><p class="holiday-tutorial-note">本局结算后，存入月饼余额</p>`,'tutorial');}
function tileFace(t){return t.type==='moon'?`<div class="moon-face ${t.hp===2?'bite2':t.hp===1?'bite1':''}"></div>`:`<img class="native-face" src="assets/gameplay/block_${Number(t.type)+1}.png" alt="">`;}
function animateCollision(a,b){
 const board=document.querySelector('#board');if(!board)return Promise.resolve();
 const nodes=[a,b].map(t=>board.querySelector(`[data-tile="${t.id}"]`));if(nodes.some(n=>!n))return Promise.resolve();
 const final=a.type!=='moon'||a.hp===1,layer=document.createElement('div');layer.className='collision-layer';board.append(layer);
 const pos=nodes.map(n=>({x:parseFloat(n.style.left),y:parseFloat(n.style.top)}));
 // Contact point follows the destination, never an unrelated fixed screen point.
 const cx=Math.max(96,Math.min(606,pos[1].x+47)),cy=pos[1].y+53;
 const animations=[];
 nodes.forEach((n,i)=>{n.style.visibility='hidden';const copy=n.cloneNode(true);copy.removeAttribute('data-tile');copy.removeAttribute('aria-label');copy.className='tile collision-tile';copy.style.cssText=`left:0;top:0;visibility:visible`;copy.inert=true;layer.append(copy);
 const side=i===0?-1:1,tx=cx-47+side*36,ty=cy-53;
 const motion=copy.animate([{transform:`translate(${pos[i].x}px,${pos[i].y}px) rotate(0deg)`,offset:0},{transform:`translate(${tx}px,${ty}px) rotate(${side*-7}deg)`,offset:.40},{transform:`translate(${tx+side*-7}px,${ty}px) rotate(${side*4}deg)`,offset:.48},{transform:`translate(${tx}px,${ty}px) rotate(0deg)`,offset:.58},{transform:final?`translate(${tx}px,${ty}px) scale(.72)`:`translate(${pos[i].x}px,${pos[i].y}px)`,opacity:final?0:1,offset:1}],{duration:final?520:650,easing:'ease-in-out',fill:'forwards'});animations.push(motion);
 if(!final)setTimeout(()=>{if(layer.isConnected)copy.innerHTML=tileFace({...a,hp:a.hp-1});},310);
 });
 const fxTimer=setTimeout(()=>{
  if(!layer.isConnected)return;
  const flash=document.createElement('i');flash.className='impact-flash';flash.style.cssText=`left:${cx-42}px;top:${cy-42}px`;layer.append(flash);flash.animate([{transform:'scale(.2)',opacity:1},{transform:'scale(1.2)',opacity:.9,offset:.32},{transform:'scale(1.6)',opacity:0}],{duration:260,fill:'forwards'});
  if(final){const atlas=[[205,3,19,15],[202,40,9,10],[204,54,19,22],[161,12,21,23],[91,2,21,26],[184,12,19,23],[114,4,21,25],[182,37,18,13],[182,52,20,24]];
   for(let k=0;k<18;k++){let [sx,sy,w,h]=atlas[k%atlas.length],part=document.createElement('i');part.className='impact-fragment';part.style.cssText=`left:${cx-w/2}px;top:${cy-h/2}px;width:${w}px;height:${h}px;background-position:-${sx}px -${sy}px`;layer.append(part);const angle=k*2.399,dx=Math.cos(angle)*(64+k%4*17),dy=Math.sin(angle)*60;part.animate([{transform:'translate(0,0) rotate(0deg)',opacity:1},{transform:`translate(${dx*.75}px,${dy-28}px) rotate(${k*25}deg)`,opacity:1,offset:.55},{transform:`translate(${dx}px,${dy+55}px) rotate(${k*45}deg)`,opacity:0}],{duration:350,fill:'forwards',easing:'ease-out'});}
  }
 },255);
 return new Promise(resolve=>setTimeout(()=>{clearTimeout(fxTimer);animations.forEach(m=>m.cancel());layer.remove();nodes.forEach(n=>n.style.visibility='');resolve();},680));
}
