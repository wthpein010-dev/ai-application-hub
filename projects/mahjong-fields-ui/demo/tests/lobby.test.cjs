const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const file=path.join(__dirname,'../lobby.js');
function load(){const c={window:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),c);return c.window.FieldLobby;}
test('ten distinct hall layouts normalize obsolete or malformed preferences without touching game state',()=>{
  const L=load();assert.equal(L.layouts.length,10);
  assert.equal(new Set(L.layouts.map(x=>x.image)).size,10);
  assert.equal(new Set(L.layouts.map(x=>JSON.stringify(x.coin))).size,10);
  for(const invalid of [null,'','missing','<img>',{},3])assert.equal(L.get(invalid).id,'classic');
  for(const x of L.layouts){assert.equal(L.get(x.id).id,x.id);for(const box of [x.coin,x.event]){assert.ok(box[0]>=0&&box[1]>=0&&box[0]+box[2]<=1920&&box[1]+box[3]<=1080);}}
});
test('each design uses the same entry actions and live account values, and offers one selected option',()=>{
  const L=load();const b=(label,action,cls,attrs='')=>`<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
  for(const layout of L.layouts){
    const html=L.home({id:layout.id,coins:3250,floor:500,region:'<label>地区</label>',b,fmt:x=>String(x),resume:''});
    assert.equal((html.match(/data-action="coin"/g)||[]).length,1);
    assert.equal((html.match(/data-action="tournament"/g)||[]).length,1);
    for(const a of ['shop','activity','history','help','settings'])assert.ok(html.includes(`data-action="${a}"`));
    assert.ok(html.includes('3250'));assert.ok(html.includes('500 金币起'));
    const chooser=L.chooser(layout.id,b);assert.equal((chooser.match(/aria-pressed="true"/g)||[]).length,1);
    assert.equal((chooser.match(/data-action="lobbyStyle"/g)||[]).length,10);
  }
});

test('five activity placements share one expandable directory and open actual activities without duplicate game entries',()=>{
  const L=load();const b=(label,action,cls,attrs='')=>`<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
  assert.equal(L.activities.length,4);
  assert.equal(new Set(L.layouts.slice(5).map(l=>l.promotion)).size,5);
  for(const l of L.layouts.slice(5)){
    const html=L.home({id:l.id,coins:7654,floor:500,region:'',b,fmt:String,resume:''});
    assert.ok(html.includes('lobby-promotion'));
    assert.ok(html.includes('data-action="activity"'));
    assert.doesNotMatch(html,/领取成功|立即到账|红包提现|现金奖励/);
    assert.equal((html.match(/data-action="coin"/g)||[]).length,1);
  }
});

test('activity entry points retain distinct focus identities and their explicit all-activities font size',()=>{
  const L=load();const b=(label,action,cls,attrs='')=>`<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
  for(const layout of L.layouts){
    const render=()=>L.home({id:layout.id,coins:3250,floor:500,region:'',b,fmt:String,resume:''});
    const identities=html=>(html.match(/<button\b[^>]*>/g)||[])
      .filter(tag=>/\bdata-action="activity"/.test(tag))
      .map(tag=>tag.match(/\bdata-value="([^"]+)"/)?.[1]);
    const values=identities(render());
    assert.ok(values.length>=(layout.promotion?2:1),`${layout.id} exposes its activity entry points`);
    assert.ok(values.every(Boolean),`${layout.id} activity entries need a focus identity`);
    assert.equal(new Set(values).size,values.length,`${layout.id} activity focus identities must be unique`);
    assert.deepEqual(identities(render()),values,`${layout.id} identities survive the hall rerender`);
  }
  const css=fs.readFileSync(path.join(__dirname,'../lobby.css'),'utf8');
  const inheritedButtonRule=css.match(/\.lobby-promotion\s+button\s*\{([^}]*)\}/)?.[1];
  assert.ok(inheritedButtonRule,'activity button inheritance rule exists');
  assert.doesNotMatch(inheritedButtonRule,/(?:^|;)\s*font\s*:/,'font shorthand must not reset the more specific activity-entry font size');
  assert.match(css,/\.lobby-promo-all\s*\{[^}]*\bfont-size\s*:\s*23px\b/,'all-activities entry keeps its readable design size');
});
