import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {loadDefaultAppsFromRuntime} from './helpers/default-apps.mjs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
test('教材追加到应用集合并提供真实阅读与视频入口',()=>{
 const apps=loadDefaultAppsFromRuntime(read('app-20260706-restore-games.js'));
 const a=apps.at(-1);assert.equal(a.id,'game-design-textbook');assert.equal(a.status,'training');
 assert.equal(apps.at(-2).id,'announcement-center');assert.equal(a.platforms.windows,'');assert.equal(a.platforms.mac,'');
 for(const path of [a.entry,a.video])assert.ok(existsSync(new URL(path,root)));
});
test('已发布课程媒体、脑图跳转和测验完整，规划课不伪装成正文',()=>{
 const dir='projects/game-design-textbook/';const catalog=JSON.parse(read(dir+'data/catalog.json'));
 assert.equal(catalog.length,50);assert.equal(new Set(catalog.map(x=>x.id)).size,50);
 for(const c of catalog){
  if(!c.ready){assert.ok(c.question&&c.practice);continue;}
  const d=JSON.parse(read(dir+'data/'+c.id+'.json'));assert.equal(d.id,c.id);assert.equal(d.quiz.length,4);
  assert.ok(d.quiz.every(q=>q.options.length===4&&q.answer>=0&&q.answer<4&&q.why));
  const sections=new Set(d.sections.map(s=>s.id));assert.equal(sections.size,d.sections.length);
  assert.deepEqual(Object.keys(d.map_links),Object.keys(d.map));assert.ok(Object.values(d.map_links).every(x=>new Set(['quiz',...d.sections.filter(s=>!/^练习|^解答|^选择题/.test(s.title)).map(s=>s.id)]).has(x)));
  for(const f of d.figures){assert.ok(sections.has(f.section));assert.ok(f.width>0&&f.height>0);}
  for(const path of [d.audio.src,d.audio.transcript,d.audio.subtitles,...d.figures.map(f=>f.src)])assert.ok(existsSync(new URL(dir+path,root)),path);
  for(const v of d.videos){assert.equal(new URL(v.url).searchParams.get('p'),String(v.page));assert.ok(v.duration>0);}
 }
});
