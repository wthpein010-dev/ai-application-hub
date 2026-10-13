import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {loadDefaultAppsFromRuntime} from './helpers/default-apps.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const project=join(root,'projects/mahjong-fields-ui');
const read=p=>readFileSync(join(project,p),'utf8');
test('mahjong UI reference is appended with public demo and video, without installation downloads',()=>{
  const apps=loadDefaultAppsFromRuntime(readFileSync(join(root,'app-20260706-restore-games.js'),'utf8'));
  const app=apps.find(app=>app.id==='mahjong-fields-ui');
  assert.equal(apps.filter(app=>app.id==='mahjong-fields-ui').length,1);
  assert.equal(app.id,'mahjong-fields-ui');
  assert.equal(app.status,'engineering');
  assert.equal(app.entry,'./projects/mahjong-fields-ui/index.html');
  assert.equal(app.video,'./projects/mahjong-fields-ui/video/index.html');
  assert.equal(app.platforms.windows,'');
  assert.equal(app.platforms.mac,'');
  assert.ok(read('index.html').includes(`<title>${app.name}</title>`));
});
test('public wrapper carries the shared return control and original relative-resource demo',()=>{
  const html=read('index.html');
  assert.match(html,/class="hub-home-link" href="\.\.\/\.\.\/index\.html#engineering"/);
  assert.match(html,/assets\/subpage-shell\.css/);
  assert.match(html,/assets\/hero-ai-companion\.png/);
  assert.match(html,/iframe src="\.\/demo\/index\.html"/);
  for(const path of ['demo/app.js','demo/state.js','demo/styles.css','demo/assets/coin-lobby.png','demo/assets/coin-match.png','demo/assets/coin-ready.png','demo/assets/courtyard.png'])assert.ok(existsSync(join(project,path)),path);
  const source=read('demo/app.js');
  assert.doesNotMatch(source,/https?:\/\/|[A-Z]:[\\/]/);
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest)\s*\(/);
});
test('walkthrough uses shared lazy player, real H264 media and single-line captions',()=>{
  const html=read('video/index.html');
  assert.match(html,/data-hub-video-page/);
  assert.match(html,/preload="none" data-src="\.\/fields-walkthrough\.mp4"/);
  assert.match(html,/hub-video-player\.js/);
  assert.ok(readFileSync(join(project,'video/fields-walkthrough.mp4')).includes(Buffer.from('avc1')));
  const blocks=read('video/fields-walkthrough.vtt').replaceAll('\r\n','\n').trim().split(/\n\n/).slice(1);
  assert.equal(blocks.length,13);
  for(const block of blocks)assert.equal(block.split('\n').length,3);
});

test('round2 ships all project modules and excludes private source documentation',()=>{
  const entry=read('demo/index.html');
  for(const name of ['app','state','navigation','support','details']) {
    assert.ok(existsSync(join(project,'demo/'+name+'.js')),name);
    assert.ok(entry.includes('src="'+name+'.js?v=1.2.0"'),name);
    assert.doesNotMatch(read('demo/'+name+'.js'),/https?:\/\/|[A-Z]:[\\/]/);
  }
  for(const name of ['styles','navigation','support','details','overlays'])assert.ok(entry.includes('href="'+name+'.css?v=1.2.0"'),name);
  assert.doesNotMatch(read('README.md'),/[A-Z]:[\\/]|feishu\.cn|larksuite\.com/i);
  assert.equal(existsSync(join(project,'demo/DESIGN.md')),false);
  assert.equal(existsSync(join(project,'demo/UX-CONTRACT.md')),false);
  const pkg=JSON.parse(read('demo/package.json'));
  assert.ok(pkg.scripts.test.includes('tests/*.test.cjs'));
  for(const name of ['app','state','navigation','support','details'])assert.ok(pkg.scripts.check.includes(name+'.js'));
});
