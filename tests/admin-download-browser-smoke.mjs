// Explicit local-only test fixture. Never imported by the site or production API.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createAdminDownloadApi} from '../server/admin-download-api.mjs';
const root=resolve('.');
const modulePath=process.env.HUB_PLAYWRIGHT_MODULE;
if(!modulePath)throw new Error('Set HUB_PLAYWRIGHT_MODULE to an existing Playwright index.mjs; no dependency installation required.');
const {chromium}=await import(pathToFileURL(modulePath).href);
let origin;let active=false;let fileReads=0;let configEnabled=false;
const testValue=randomUUID();
const identity={
  async getSession(req){return active&&req.headers.get('cookie')?.includes(testValue)?{role:'superadmin',expiresAt:Date.now()+60000,csrfToken:testValue}:null;},
  async login(req){const body=await req.json();if(body.username!==testValue||body.password!==testValue)return null;active=true;return {cookie:`fixture=${testValue}; HttpOnly; SameSite=Strict; Path=/`};},
  async logout(){active=false;return{cookie:'fixture=; Max-Age=0; Path=/'};}
};
const storage={async list(){return [{id:'fixture-mac',projectId:'fixture',name:'本地测试文件（无真实包）',platform:'mac',kind:'native',architecture:'arm64',fileName:'local-fixture.txt'}];},async open(){fileReads++;return{body:new TextEncoder().encode('local test only'),fileName:'local-fixture.txt'};}};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,origin);
    if(url.pathname.startsWith('/v1/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
      const response=await createAdminDownloadApi({identity,storage,allowedOrigin:origin})(request);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(url.pathname==='/assets/admin-download-config.mjs'){
      res.writeHead(200,{'content-type':'text/javascript'});res.end(`export const ADMIN_API_BASE = ${JSON.stringify(configEnabled?origin:'')};`);return;
    }
    const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!path.startsWith(root+'\\')&&!path.startsWith(root+'/')){res.writeHead(403);res.end();return;}
    const bytes=await readFile(path);res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.HUB_BROWSER_PATH});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const badge=document.createElement('p');badge.textContent='本地测试 · 无真实鉴权 · 无真实安装包';badge.style='position:fixed;bottom:0;left:0;z-index:99999;background:#ffef99;color:#111;padding:8px';document.body.append(badge);}));
  await page.goto(origin);await page.locator('.card-actions').first().waitFor();
  assert.equal(await page.locator('[data-hub-package]:visible').count(),0);
  assert.equal(await page.locator('.hub-admin-dialog').isVisible(),false);
  assert.ok(await page.locator('.card-actions [data-action="web"]:visible').count()>0);
  await page.goto(origin+'/#admin');await page.locator('.hub-admin-dialog').waitFor();
  assert.match(await page.locator('.hub-admin-dialog [role="status"]').textContent(),/未配置/);
  assert.equal(await page.locator('.hub-admin-dialog button[type="submit"]').isDisabled(),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('.hub-admin-dialog').isVisible(),false);
  configEnabled=true;await page.goto(origin+'/?fixture=1#admin');await page.locator('.hub-admin-dialog input[name="username"]').fill(testValue);await page.locator('.hub-admin-dialog input[name="password"]').fill(testValue);
  await page.locator('.hub-admin-dialog button[type="submit"]').click();await page.locator('[data-hub-authorized]').waitFor();
  assert.match(await page.locator('.hub-admin-artifacts').textContent(),/Mac 运行待验证/);
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-hub-authorized]').click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'local-fixture.txt');assert.equal(fileReads,1);
  await mkdir(resolve(root,'docs/audits/evidence'),{recursive:true});await page.screenshot({path:resolve(root,'docs/audits/evidence/2026-10-03-admin-local-fixture.png')});
  await page.locator('[data-admin-logout]').click();await page.locator('.hub-admin-dialog input[name="username"]').waitFor();assert.equal(await page.locator('[data-hub-authorized]:visible').count(),0);
  assert.equal((await page.request.get(origin+'/v1/admin/artifacts/fixture-mac/file')).status(),401);
  await page.setViewportSize({width:390,height:844});await page.goto(origin+'/#admin');await page.locator('.hub-admin-dialog').waitFor();assert.ok(await page.locator('.hub-admin-dialog').evaluate(el=>el.getBoundingClientRect().width)<=390);
  console.log('Browser smoke passed: hidden downloads, public introductions, unconfigured failure, local fixture login/download/logout, Mac pending label, Escape, mobile width. No real application executed.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
