const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

test('runtime image references resolve to smaller lossless WebP assets',()=>{
  const files=fs.readdirSync(root).filter(x=>/\.(css|js|html)$/.test(x));
  const refs=new Set();
  for(const file of files){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    for(const m of source.matchAll(/assets\/([\w-]+\.(?:png|webp))/g))refs.add(m[1]);
  }
  assert.ok(refs.size>=6);
  for(const name of refs){
    assert.ok(name.endsWith('.webp'),name+' must use the compressed asset');
    const body=fs.readFileSync(path.join(root,'assets',name));
    assert.equal(body.subarray(8,12).toString(),'WEBP');
  }
  const home=fs.statSync(path.join(root,'assets/home-hub.webp')).size;
  assert.ok(home<2143150,'compressed hall must be smaller than the original PNG');
});
