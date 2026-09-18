import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {loadDefaultAppsFromRuntime} from './helpers/default-apps.mjs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('holiday game is appended with real demo and video, without fake platform downloads',()=>{
 const apps=loadDefaultAppsFromRuntime(read('app-20260706-restore-games.js'));
 const app=apps.at(-1);assert.equal(app.id,'holiday-gifts');assert.equal(app.status,'game');
 for(const p of [app.entry,app.video])assert(existsSync(new URL(p,root)));
 assert.equal(app.platforms.windows,'');assert.equal(app.platforms.mac,'');
});
test('demo and video reuse shared shell and local playable resources',()=>{
 const html=read('projects/holiday-gifts/index.html');assert.match(html,/<title>好事成双 · 双节活动<\/title>/);assert.match(html,/subpage-shell.css/);assert.match(html,/index.html#games/);assert.match(html,/game\/index.html/);
 const video=read('projects/holiday-gifts/video/index.html');assert.match(video,/hub-video-player.js/);assert.match(video,/holiday-demo.mp4/);
 assert.match(read('projects/holiday-gifts/game/results.js'),/暂无可消/);
 assert.match(read('projects/holiday-gifts/game/index.html'),/调出失败界面/);
});
test('video, poster and offline web package are real artifacts',()=>{
 for(const p of ['video/holiday-demo.mp4','video/poster.jpg','download/holiday-gifts-web.zip'])assert(statSync(new URL('projects/holiday-gifts/'+p,root)).size>1000);
});
