import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminDownloadApi } from '../server/admin-download-api.mjs';

const origin = 'https://hub.example';
function request(path, options = {}) { return new Request(origin + path, options); }
function fixture(role = 'superadmin') {
  let loggedIn = false;
  const identity = {
    async getSession() { return loggedIn ? {role, expiresAt:Date.now()+60000, csrfToken:'test-only-csrf'} : null; },
    async login() { loggedIn = true; return {cookie:'test_session=opaque; Secure; HttpOnly; SameSite=Strict; Path=/'}; },
    async logout() { loggedIn = false; return {cookie:'test_session=; Max-Age=0; Path=/'}; }
  };
  let reads = 0;
  const storage = {
    async list() { return [{id:'tool-windows',projectId:'tool',name:'Tool',platform:'windows',kind:'native',architecture:'x64',fileName:'Tool.zip',bytes:4,sha256:'A'.repeat(64),internalUrl:'must-never-leak'}]; },
    async open() { reads++; return {body:new Uint8Array([1,2,3,4]),fileName:'Tool.zip'}; }
  };
  return {api:createAdminDownloadApi({identity,storage,allowedOrigin:origin}), get reads(){return reads;}};
}
async function login(api) { return api(request('/v1/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})); }

test('unconfigured adapters fail closed for login, directory and file', async () => {
  const api = createAdminDownloadApi();
  for (const path of ['/v1/session','/v1/admin/artifacts','/v1/admin/artifacts/tool/file']) {
    const response = await api(request(path)); assert.equal(response.status,503); assert.equal(response.headers.get('cache-control'),'no-store');
  }
});
test('anonymous and non-admin users cannot list or read files', async () => {
  const f = fixture('viewer');
  assert.equal((await f.api(request('/v1/admin/artifacts'))).status,401);
  await login(f.api);
  assert.equal((await f.api(request('/v1/admin/artifacts'))).status,403);
  assert.equal((await f.api(request('/v1/admin/artifacts/tool-windows/file'))).status,403);
  assert.equal(f.reads,0);
});
test('wrong origin and missing CSRF are rejected before side effects', async () => {
  const f = fixture();
  assert.equal((await f.api(request('/v1/session',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'}))).status,403);
  await login(f.api);
  assert.equal((await f.api(request('/v1/session',{method:'DELETE',headers:{Origin:origin}}))).status,403);
  assert.equal((await f.api(request('/v1/session',{method:'DELETE',headers:{Origin:origin,'X-CSRF-Token':'test-only-csrf'}}))).status,204);
  assert.equal((await f.api(request('/v1/admin/artifacts'))).status,401);
});
test('authenticated metadata excludes internal URLs and every file read rechecks session', async () => {
  const f = fixture(); await login(f.api);
  const response=await f.api(request('/v1/admin/artifacts')); const body=await response.json();
  assert.equal(body.artifacts.length,1); assert.equal('internalUrl' in body.artifacts[0],false);
  assert.equal((await f.api(request('/v1/admin/artifacts/unknown/file'))).status,404);
  const file=await f.api(request('/v1/admin/artifacts/tool-windows/file'));
  assert.equal(file.status,200); assert.equal(file.headers.get('content-type'),'application/octet-stream');
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())],[1,2,3,4]); assert.equal(f.reads,1);
});
test('expired sessions and adapter errors do not leak storage or credentials',async()=>{
  const identity={getSession:async()=>({role:'superadmin',expiresAt:0}),login:async()=>{},logout:async()=>{}};
  const storage={list:async()=>{throw new Error('private detail');},open:async()=>{}};
  const api=createAdminDownloadApi({identity,storage,allowedOrigin:origin});
  assert.equal((await api(request('/v1/admin/artifacts'))).status,401);
  identity.getSession=async()=>({role:'superadmin',expiresAt:Date.now()+60000});
  const response=await api(request('/v1/admin/artifacts')); assert.equal(response.status,503); assert.equal((await response.text()).includes('private detail'),false);
});
