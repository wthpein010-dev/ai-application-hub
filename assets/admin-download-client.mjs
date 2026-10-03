const ID=/^[a-z0-9][a-z0-9_-]{0,100}$/;
export function createAdminDownloadClient({apiBase='',fetchImpl=globalThis.fetch}={}) {
  let base='';
  if(apiBase){const url=new URL(apiBase);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('管理员服务必须使用 HTTPS');if(url.username||url.password||url.search||url.hash)throw new Error('无效的管理员服务地址');base=url.href.replace(/\/$/,'');}
  let session=null; let artifacts=[];let revision=0;
  function clear(){revision++;session=null;artifacts=[];}
  async function send(path,options={}){
    if(!base)throw new Error('管理员服务未配置');
    const response=await fetchImpl(base+path,{...options,credentials:'include',cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(response.status===401?'请登录管理员账号':response.status===403?'需要超级管理员权限':'管理员服务暂不可用');
    return response.status===204?null:response.json();
  }
  async function refresh(){
    clear();const operation=revision;
    try{
      const verified=await send('/v1/session');
      if(verified?.role!=='superadmin'||!Number.isFinite(verified.expiresAt)||verified.expiresAt<=Date.now())throw new Error('需要有效的超级管理员会话');
      const catalog=await send('/v1/admin/artifacts');
      if(!Array.isArray(catalog?.artifacts)||catalog.artifacts.some(a=>!ID.test(a.id)||typeof a.name!=='string'||!['windows','mac','cross-platform'].includes(a.platform)||!['native','extension','source'].includes(a.kind)))throw new Error('管理员资源目录无效');
      if(new Set(catalog.artifacts.map(a=>a.id)).size!==catalog.artifacts.length)throw new Error('管理员资源目录无效');
      if(operation!==revision)throw new Error('管理员状态已更新');
      session=verified;artifacts=catalog.artifacts;return artifacts;
    }catch(error){if(operation===revision)clear();throw error;}
  }
  return {
    get configured(){return Boolean(base);},
    get authenticated(){return Boolean(session&&session.expiresAt>Date.now());},
    get expiresAt(){return session?.expiresAt||0;},
    get artifacts(){return session&&session.expiresAt>Date.now()?artifacts:[];},
    clear,refresh,
    async login(credentials){clear();const operation=revision;try{await send('/v1/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)});if(operation!==revision)throw new Error('管理员状态已更新');return await refresh();}catch(error){if(operation===revision)clear();throw error;}},
    async logout(){const csrf=session?.csrfToken;clear();try{return await send('/v1/session',{method:'DELETE',headers:{'X-CSRF-Token':csrf||''}});}finally{clear();}},
    downloadUrl(id){if(!session||session.expiresAt<=Date.now()||!artifacts.some(a=>a.id===id)||!ID.test(id))throw new Error('请重新登录并选择有效资源');return base+'/v1/admin/artifacts/'+encodeURIComponent(id)+'/file';}
  };
}
