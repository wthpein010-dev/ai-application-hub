import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminDownloadClient } from '../assets/admin-download-client.mjs';

test('no service configuration never calls network or permits download',async()=>{
  const client=createAdminDownloadClient({fetchImpl:()=>{throw new Error('must not run');}});
  assert.equal(client.configured,false);
  await assert.rejects(client.refresh(),/未配置/);
  assert.equal(client.artifacts.length,0); assert.equal(client.authenticated,false);
});
test('directory appears only after a verified superadmin session and clears on error',async()=>{
  let role='viewer'; let broken=false;
  const client=createAdminDownloadClient({apiBase:'https://admin.example',fetchImpl:async(url)=>{
    if(broken)throw new Error('offline');
    return new Response(JSON.stringify(url.endsWith('/v1/session')?{role,expiresAt:Date.now()+60000,csrfToken:'test-only'}:{artifacts:[{id:'tool-windows',name:'Tool',platform:'windows',kind:'native'}]}),{status:200});
  }});
  await assert.rejects(client.refresh(),/管理员/); assert.equal(client.authenticated,false);
  role='superadmin'; await client.refresh(); assert.equal(client.artifacts.length,1);
  assert.equal(client.downloadUrl('tool-windows'),'https://admin.example/v1/admin/artifacts/tool-windows/file');
  assert.throws(()=>client.downloadUrl('https://public.example/file.zip'));
  broken=true; await assert.rejects(client.refresh()); assert.equal(client.artifacts.length,0); assert.throws(()=>client.downloadUrl('tool-windows'));
});
test('logout hides artifacts even if the network request fails',async()=>{
  let broken=false;
  const client=createAdminDownloadClient({apiBase:'https://admin.example',fetchImpl:async(url)=>{
    if(broken)throw new Error('offline');
    return Response.json(url.endsWith('/v1/session')?{role:'superadmin',expiresAt:Date.now()+60000,csrfToken:'test-only'}:{artifacts:[{id:'tool',name:'Tool',platform:'mac',kind:'native'}]});
  }});
  await client.refresh(); broken=true; await assert.rejects(client.logout()); assert.equal(client.authenticated,false); assert.equal(client.artifacts.length,0);
});
test('insecure remote API and invalid catalog IDs cannot create download links',async()=>{
  assert.throws(()=>createAdminDownloadClient({apiBase:'http://remote.example'}));
  const client=createAdminDownloadClient({apiBase:'https://admin.example',fetchImpl:async(url)=>Response.json(url.endsWith('/v1/session')?{role:'superadmin',expiresAt:Date.now()+60000}:{artifacts:[{id:'../file',name:'unsafe'}]})});
  await assert.rejects(client.refresh()); assert.equal(client.authenticated,false);
});
test('a directory response arriving after logout cannot restore download controls',async()=>{
  let release;
  const client=createAdminDownloadClient({apiBase:'https://admin.example',fetchImpl:async(url,options)=>{
    if(options.method==='DELETE')return new Response(null,{status:204});
    if(url.endsWith('/v1/session'))return Response.json({role:'superadmin',expiresAt:Date.now()+60000,csrfToken:'test-only'});
    await new Promise(resolve=>{release=resolve;});return Response.json({artifacts:[{id:'tool',name:'Tool',platform:'mac',kind:'native'}]});
  }});
  const pending=client.refresh();while(!release)await new Promise(resolve=>setTimeout(resolve,1));
  await client.logout();release();await pending.catch(()=>{});
  assert.equal(client.authenticated,false);assert.equal(client.artifacts.length,0);
});
test('refresh started during an in-flight logout is invalidated when logout completes',async()=>{
  let finishLogout;
  const client=createAdminDownloadClient({apiBase:'https://admin.example',fetchImpl:async(url,options)=>{
    if(options.method==='DELETE'){await new Promise(resolve=>{finishLogout=resolve;});return new Response(null,{status:204});}
    return Response.json(url.endsWith('/v1/session')?{role:'superadmin',expiresAt:Date.now()+60000,csrfToken:'test-only'}:{artifacts:[{id:'tool',name:'Tool',platform:'mac',kind:'native'}]});
  }});
  await client.refresh();const logout=client.logout();await client.refresh();finishLogout();await logout;
  assert.equal(client.authenticated,false);assert.equal(client.artifacts.length,0);
});
