// Deployment adapters must supply real identity and PRIVATE storage.
// No production credentials, mock identity, public URL fallback or account setup.
const ID = /^[a-z0-9][a-z0-9_-]{0,100}$/;
const metadataKeys=['id','projectId','name','platform','kind','architecture','version','fileName','bytes','sha256'];
const headers = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function json(body,status=200,extra={}) { return Response.json(body,{status,headers:{...headers,...extra}}); }
function validSession(session) { return session && Number.isFinite(session.expiresAt) && session.expiresAt>Date.now(); }
function metadata(record) {
  if(!ID.test(record.id)||typeof record.name!=='string'||!['windows','mac','cross-platform'].includes(record.platform)||!['native','extension','source'].includes(record.kind))throw new Error('invalid-private-artifact');
  return Object.fromEntries(metadataKeys.filter(key=>record[key]!==undefined).map(key=>[key,record[key]]));
}
export function createAdminDownloadApi({identity,storage,allowedOrigin}={}) {
  const configured=Boolean(allowedOrigin&&identity?.getSession&&identity?.login&&identity?.logout&&storage?.list&&storage?.open);
  return async function handle(request) {
    if(!configured)return json({error:'service-not-configured'},503);
    const origin=request.headers.get('Origin');
    if(origin&&origin!==allowedOrigin)return json({error:'origin-rejected'},403);
    const url=new URL(request.url);
    const path=url.pathname;
    try {
      if(request.method==='OPTIONS') {
        if(origin!==allowedOrigin)return json({error:'origin-rejected'},403);
        return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-CSRF-Token','Vary':'Origin'}});
      }
      const cors=origin===allowedOrigin?{'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Credentials':'true','Vary':'Origin'}:{};
      if(path==='/v1/session'&&request.method==='POST') {
        if(origin!==allowedOrigin)return json({error:'origin-rejected'},403);
        if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'json-required'},415,cors);
        const result=await identity.login(request);
        if(!result?.cookie)return json({error:'authentication-failed'},401,cors);
        return json({authenticated:true},200,{...cors,'Set-Cookie':result.cookie});
      }
      const session=await identity.getSession(request);
      if(!validSession(session))return json({error:'authentication-required'},401,cors);
      if(path==='/v1/session'&&request.method==='DELETE') {
        if(origin!==allowedOrigin||!session.csrfToken||request.headers.get('X-CSRF-Token')!==session.csrfToken)return json({error:'csrf-rejected'},403,cors);
        const result=await identity.logout(request);
        return new Response(null,{status:204,headers:{...headers,...cors,...(result?.cookie?{'Set-Cookie':result.cookie}:{})}});
      }
      if(session.role!=='superadmin')return json({error:'administrator-required'},403,cors);
      if(path==='/v1/session'&&request.method==='GET')return json({role:session.role,expiresAt:session.expiresAt,csrfToken:session.csrfToken},200,cors);
      if(path==='/v1/admin/artifacts'&&request.method==='GET')return json({artifacts:(await storage.list()).map(metadata)},200,cors);
      const match=/^\/v1\/admin\/artifacts\/([a-z0-9][a-z0-9_-]{0,100})\/file$/.exec(path);
      if(match&&request.method==='GET') {
        const allowed=(await storage.list()).map(metadata).some(artifact=>artifact.id===match[1]);
        if(!allowed)return json({error:'artifact-not-found'},404,cors);
        const file=await storage.open(match[1]);
        if(!file?.body||typeof file.fileName!=='string')return json({error:'artifact-unavailable'},503,cors);
        // Streaming private bytes avoids permanent or bearer download URLs.
        return new Response(file.body,{headers:{...headers,...cors,'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="download.zip"; filename*=UTF-8''${encodeURIComponent(file.fileName).replaceAll("'",'%27')}`}});
      }
      return json({error:'not-found'},404,cors);
    } catch { return json({error:'service-unavailable'},503); }
  };
}
