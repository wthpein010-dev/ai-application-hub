const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const file=path.join(__dirname,'../lobby.js');
function load(){const c={window:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),c);return c.window.FieldLobby;}
test('five distinct hall layouts normalize obsolete or malformed preferences without touching game state',()=>{
  const L=load();assert.equal(L.layouts.length,5);
  assert.equal(new Set(L.layouts.map(x=>x.image)).size,5);
  assert.equal(new Set(L.layouts.map(x=>JSON.stringify(x.coin))).size,5);
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
    assert.equal((chooser.match(/data-action="lobbyStyle"/g)||[]).length,5);
  }
});
