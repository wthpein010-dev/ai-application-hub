function resultMarkup(win){
 const r=state.result||{count:0,seconds:0,date:day()};
 return `<div class="page result ${win?'result-success':'result-failure'}"><div class="result-scene">${sceneMarkup()}</div><div class="result-dim"></div><div class="result-inner">
 ${win?`<div class="date">- ${fmt(r.date||day())} -</div>`:''}
 <div class="result-heading"><h2>${win?'<small>恭喜你</small>挑战成功':'挑战失败'}</h2><div class="duration">${win?`通关用时 ${Math.floor(r.seconds/60)}分${String(r.seconds%60).padStart(2,'0')}秒`:`今日已挑战${state.attempts}次`}</div></div>
 ${win?`<div class="reward-halo"></div><div class="reward-moon-tile"><div class="reward-moon-hd" role="img" aria-label="完整高清月饼"></div><b>×${r.count}</b></div><div class="result-copy"><strong>本局获得 ${r.count} 个月饼</strong><p>月饼已入账，回去兑换喜欢的好礼吧</p></div>`:`<div class="failure-bubble">失败是成功之母。</div><img class="failure-tomb" src="assets/results/fail_dead1.png" alt="原游戏木十字墓碑"><button class="white-btn again native-result-button" data-action="again">重新挑战</button>`}
 <button class="white-btn return native-result-button" data-action="return">返回活动</button><button class="white-btn share" data-action="share" aria-label="分享"></button>
 </div></div>`;
}

let noMovesGame=null;
function hasAvailablePair(game){const live=game.tiles.filter(t=>!t.gone);return live.some((a,i)=>live.slice(i+1).some(b=>a.type===b.type&&(a.type!=='moon'||a.hp===b.hp)));}
function checkBoardOutcome(){
 const g=state.game;if(page!=='game'||dialog||lock||!g||noMovesGame)return;
 if(g.tiles.every(t=>t.gone)){settle(true);return;}
 if(hasAvailablePair(g))return;
 noMovesGame=g;lock=true;selected=null;clearTimeout(toastTimer);$('#toast').classList.remove('show');
 const gamePage=$('.game');gamePage.classList.add('no-moves');const label=document.createElement('div');label.className='no-moves-effect';label.setAttribute('role','status');label.textContent='暂无可消';gamePage.append(label);
 setTimeout(()=>{const current=state.game===g&&page==='game';noMovesGame=null;lock=false;if(current)settle(false);},1100);
}
function demoNoMoves(){
 if(phase()!=='open'){toast('请切换到活动开放日期');return;}
 // Explicit review fixture; not a production difficulty/solvability rule.
 if(!state.game){state.game={tiles:[],date:day(),count:0,started:Date.now(),stashed:null};state.attempts++;}
 state.game.tiles=Array.from({length:8},(_,i)=>({id:i,type:i,hp:3,gone:false}));state.game.stashed=null;save();navigate('game');
}
