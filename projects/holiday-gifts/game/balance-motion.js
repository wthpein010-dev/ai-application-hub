(function(root){
 function valueAt(from,to,progress){const p=Math.max(0,Math.min(1,progress));return Math.round(from+(to-from)*(1-Math.pow(1-p,3)))}
 function animate(element,from,to){
  if(!element||from===to)return Promise.resolve();
  const number=element.querySelector('b'),doc=element.ownerDocument;
  if(!number)return Promise.resolve();
  const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(reduced||doc.hidden){number.textContent=String(to);return Promise.resolve()}
  const delta=to-from,float=doc.createElement('span');float.className='balance-delta';float.textContent=(delta>0?'+':'−')+Math.abs(delta);float.setAttribute('aria-hidden','true');
  element.append(float);element.classList.add('balance-changing',delta>0?'balance-gain':'balance-spend');element.setAttribute('aria-busy','true');number.textContent=String(from);
  return new Promise(resolve=>{
   const start=root.performance.now();let frame,timer,finished=false;
   function finish(){if(finished)return;finished=true;root.cancelAnimationFrame(frame);root.clearTimeout(timer);doc.removeEventListener('visibilitychange',onVisibility);number.textContent=String(to);float.remove();element.classList.remove('balance-changing','balance-gain','balance-spend');element.removeAttribute('aria-busy');resolve()}
   function onVisibility(){if(doc.hidden)finish()}
   function tick(time){const p=(time-start)/700;number.textContent=String(valueAt(from,to,p));if(p<1)frame=root.requestAnimationFrame(tick)}
   doc.addEventListener('visibilitychange',onVisibility);frame=root.requestAnimationFrame(tick);timer=root.setTimeout(finish,900);
  });
 }
 const api={valueAt,animate};if(typeof module==='object'&&module.exports)module.exports=api;else root.MoonBalance=api;
})(typeof window==='undefined'?globalThis:window);
