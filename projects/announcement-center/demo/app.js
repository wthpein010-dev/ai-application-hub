const state=new NoticeState();
const overlay=document.querySelector('#overlay'),viewport=document.querySelector('#viewport'),list=document.querySelector('#list'),close=document.querySelector('#close'),fade=document.querySelector('#fade'),reopen=document.querySelector('#reopen');
const pages={
  compensation:`<h2>挂件焕新说明</h2><p>为了带来更好看的挂件和更协调的穿戴效果，我们将提升挂件的造型与美术品质。<br>本次将回收玩家当前持有的所有挂件。</p><section class="box"><h3>回收与补偿</h3><p>按实际回收数量，<strong>返回对应兑奖券</strong>，可用于重新抽取新版挂件。</p><div class="reward"><img src="assets/ticket.png" alt="黄色兑奖券"><div>全服额外补偿<b>兑奖券 ×5</b></div></div></section><section class="box comparebox"><h3>挂件品质升级</h3><img class="comparison" src="assets/comparison.png" alt="旧版草砖块佩戴罐头、骨头和箱子；新版草砖块佩戴花纹挎包、吉他和粉色腰包"></section>`,
  update:`<h2>更新公告</h2><p>新内容与优化，一起看看。</p><section class="box"><h3>公告展示升级</h3><p>更新内容、挂件调整与玩法说明，可以在公告中心集中查看。</p><ul><li>点击横幅，查看对应说明。</li><li>详情右上角关闭，回到公告列表。</li><li>列表支持滑动，浏览更多内容。</li></ul></section><p class="example-note">此页为交互演示文案，正式更新内容待补充。</p>`,
  guide:`<h2>玩法指南</h2><p class="example-note">本页为扩展公告的交互示例。</p><section class="box"><h3>查看公告</h3><p>点击横幅打开详情。查看后，横幅上的未读红点会消失。</p><p>详情右上角关闭可回到列表，保留此前浏览位置。</p><p>点击弹窗外空白处，可直接关闭公告中心。</p></section>`
};
function updateFade(){fade.classList.toggle('at-bottom',viewport.scrollTop+viewport.clientHeight>=viewport.scrollHeight-2);}
pages.update=`<h2>更新公告</h2><p>新内容与优化，一起看看。</p><section class="box"><h3>公告展示升级</h3><p>更新内容、挂件调整与玩法说明，可以在公告中心集中查看。</p><ul><li>点击横幅，下方展开对应说明。</li><li>点击其他横幅，切换查看内容。</li><li>再次点击当前横幅，可收起详情。</li></ul></section><p class="example-note">此页为交互演示文案，正式更新内容待补充。</p>`;
pages.guide=`<h2>玩法指南</h2><p class="example-note">本页为扩展公告的交互示例。</p><section class="box"><h3>查看公告</h3><p>点击横幅，在下方展开详情。查看后，横幅上的未读红点会消失。</p><p>点击其他横幅切换内容，再次点击当前横幅可收起。</p><p>点击右上角关闭或弹窗外空白处，可关闭公告中心。</p></section>`;
const buttons=[...document.querySelectorAll('[data-notice]')];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');let motion=0;
buttons.forEach(b=>{
  const id=b.dataset.notice,item=document.createElement('section'),panel=document.createElement('div');
  item.className='notice-item';b.before(item);item.append(b);b.id='banner-'+id;
  panel.className='expansion';panel.id='panel-'+id;panel.setAttribute('role','region');panel.setAttribute('aria-labelledby',b.id);
  panel.innerHTML='<div class="expansion-clip"><article class="detail">'+pages[id]+'</article></div>';item.append(panel);
  b.setAttribute('aria-controls',panel.id);b.setAttribute('aria-expanded','false');
  b.addEventListener('click',()=>{
    cancelAnimationFrame(motion);
    const start=b.getBoundingClientRect().top-viewport.getBoundingClientRect().top;
    state.open(id);render();const begin=performance.now(),duration=reduced.matches?0:360;
    function align(now){
      const t=duration?Math.min(1,(now-begin)/duration):1,ease=1-Math.pow(1-t,3);
      const desired=start+(4-start)*ease;
      viewport.scrollTop+=b.getBoundingClientRect().top-viewport.getBoundingClientRect().top-desired;
      updateFade();if(t<1)motion=requestAnimationFrame(align);
    }
    motion=requestAnimationFrame(align);
  });
});
function render(){
  const closed=state.view==='closed';overlay.hidden=closed;reopen.hidden=!closed;
  buttons.forEach(b=>{const expanded=state.expanded===b.dataset.notice;
    b.classList.toggle('is-read',state.read.has(b.dataset.notice));b.setAttribute('aria-expanded',String(expanded));
    b.parentElement.classList.toggle('expanded',expanded);const panel=b.nextElementSibling;
    panel.inert=!expanded;panel.setAttribute('aria-hidden',String(!expanded));
  });
  if(closed){cancelAnimationFrame(motion);reopen.focus({preventScroll:true});}
  requestAnimationFrame(updateFade);
}
close.addEventListener('click',()=>{state.backOrClose();render();});
document.querySelector('#scrim').addEventListener('click',()=>{state.dismiss();render();});
reopen.addEventListener('click',()=>{state.show();render();viewport.scrollTop=0;close.focus({preventScroll:true});});
viewport.addEventListener('scroll',updateFade,{passive:true});
document.querySelectorAll('img').forEach(img=>img.addEventListener('load',updateFade));
const resize=new ResizeObserver(updateFade);resize.observe(viewport);resize.observe(list);
['wheel','touchstart'].forEach(event=>viewport.addEventListener(event,()=>cancelAnimationFrame(motion),{passive:true}));
document.addEventListener('keydown',e=>{
  if(state.view==='closed')return;
  if(e.key==='Escape'){e.preventDefault();state.backOrClose();render();}
  if(e.key==='Tab'){
    const focusable=[...document.querySelectorAll('#modal button')].filter(el=>el.getClientRects().length);
    const first=focusable[0],last=focusable.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
render();
