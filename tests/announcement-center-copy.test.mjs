import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const c={};vm.runInNewContext(readFileSync(new URL('../projects/announcement-center/demo/content.js',import.meta.url),'utf8'),c);
test('public update has player-facing groups and no duplicated title or internal mechanics',()=>{for(const h of ['【新增】','【优化】','【修复】'])assert(c.NoticeCopy.update.includes(h));assert(!/<h2|打点|概率|保底|开发中|内测|提交ID/.test(c.NoticeCopy.update));});
test('guide covers daily challenge, drag-to-peek, accessories and special tile strategy',()=>{for(const w of ['每日挑战','拖拽','下层','每日挂件','兑奖券','特殊砖块'])assert(c.NoticeCopy.guide.includes(w));});
