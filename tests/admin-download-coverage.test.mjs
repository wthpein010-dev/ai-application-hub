import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {loadDefaultAppsFromRuntime} from './helpers/default-apps.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const files=execFileSync('git',['ls-files','-z','*.html'],{cwd:root,encoding:'utf8'}).split('\0').filter(file=>file&&existsSync(resolve(root,file)));
const packageTag=/<(?:a|button)\b[^>]*(?:href\s*=\s*["'][^"']*(?:\.zip|\.exe|\.dmg|releases\/download|\/download\/|github\.com[^"']*\/(?:tree|archive)\/)|data-role=["']download-button)[^>]*>/gi;
const coordinationFiles=['projects/planmap/index.html','projects/planmap/video/index.html'];
test('every local package page outside PlanMap coordination includes the presentation gate',()=>{
  for(const file of files){const html=readFileSync(resolve(root,file),'utf8');if(!html.match(packageTag)||coordinationFiles.includes(file))continue;
    assert.match(html,/admin-download-gate\.css/,file);assert.match(html,/admin-download-gate\.mjs/,file);
    for(const tag of html.match(packageTag)||[])assert.match(tag,/data-hub-package/,`${file}: ${tag}`);
  }
});
test('public project introductions and the Hub homepage load fail-closed gate',()=>{
  const apps=loadDefaultAppsFromRuntime(readFileSync(resolve(root,'app-20260706-restore-games.js'),'utf8'));
  for(const app of apps){if(app.id==='planmap'||/^https?:/.test(app.entry))continue;const file=resolve(root,app.entry);assert.ok(existsSync(file),app.id);assert.match(readFileSync(file,'utf8'),/admin-download-gate\.mjs/,app.id);}
});
test('PlanMap shared pages remain unchanged pending integration coordination',()=>{
  for(const file of coordinationFiles){const baseline=execFileSync('git',['show',`HEAD:${file}`],{cwd:root,encoding:'utf8'});assert.equal(readFileSync(resolve(root,file),'utf8').replaceAll('\r\n','\n'),baseline.replaceAll('\r\n','\n'));}
});
test('no production API or mock is enabled and no stale public download fallback is introduced',()=>{
  assert.match(readFileSync(resolve(root,'assets/admin-download-config.mjs'),'utf8'),/ADMIN_API_BASE = ''/);
  const runtime=readFileSync(resolve(root,'app-20260706-restore-games.js'),'utf8');
  assert.match(runtime,/data-hub-package/);
  const client=readFileSync(resolve(root,'assets/admin-download-client.mjs'),'utf8');assert.doesNotMatch(client,/localStorage|sessionStorage|releases\/download|mock/);
});
