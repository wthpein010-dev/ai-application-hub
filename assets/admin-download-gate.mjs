import { createAdminDownloadClient } from './admin-download-client.mjs';
import { ADMIN_API_BASE } from './admin-download-config.mjs';

const client=createAdminDownloadClient({apiBase:ADMIN_API_BASE});
const dialog=document.createElement('dialog');
dialog.className='hub-admin-dialog';
dialog.setAttribute('aria-labelledby','hub-admin-title');
dialog.innerHTML=`<header><h2 id="hub-admin-title">管理员下载</h2><button type="button" data-admin-close aria-label="关闭管理员窗口">关闭</button></header>
  <p role="status" aria-live="polite"></p>
  <form><label>账号<input name="username" autocomplete="username" required maxlength="200"></label><label>密码<input name="password" type="password" autocomplete="current-password" required maxlength="1024"></label><button type="submit">登录</button></form>
  <section data-admin-content hidden><p>以下资源由管理员服务授权提供。</p><ul class="hub-admin-artifacts"></ul><button type="button" data-admin-logout>退出登录</button></section>`;
document.body.append(dialog);
const status=dialog.querySelector('[role="status"]');
const form=dialog.querySelector('form');
const content=dialog.querySelector('[data-admin-content]');
const list=dialog.querySelector('ul');
let opener=null;let expiryTimer;let busy=false;
function display(message='') {
  clearTimeout(expiryTimer);
  status.textContent=message;
  form.hidden=client.authenticated;
  content.hidden=!client.authenticated;
  for(const input of form.elements)input.disabled=busy||!client.configured;
  list.replaceChildren();
  if(!client.authenticated)return;
  for(const artifact of client.artifacts) {
    const item=document.createElement('li');const details=document.createElement('span');
    details.textContent=artifact.name;const info=document.createElement('small');
    info.textContent=[{native:'原生包',extension:'浏览器插件',source:'源码 ZIP'}[artifact.kind],artifact.platform,artifact.architecture,artifact.version,artifact.platform==='mac'?'Mac 运行待验证':'运行验收以对应版本证据为准'].filter(Boolean).join(' · ');
    details.append(info);const button=document.createElement('button');button.type='button';button.textContent='下载';button.dataset.hubAuthorized='';
    button.addEventListener('click',async()=>{
      button.disabled=true;
      try{await client.refresh();location.assign(client.downloadUrl(artifact.id));}
      catch{client.clear();display('会话或资源已失效，请重新登录。');}
      finally{button.disabled=false;}
    });item.append(details,button);list.append(item);
  }
  if(!client.artifacts.length)status.textContent='暂无已配置的下载资源。';
  // Revalidate while the download console is open; failure removes all buttons.
  expiryTimer=setTimeout(async()=>{client.clear();display('正在重新验证会话…');try{await client.refresh();display();}catch{client.clear();display('会话已失效，请重新登录。');}},Math.max(0,Math.min(30000,client.expiresAt-Date.now())));
}
async function open() {
  if(!dialog.open){opener=document.activeElement;dialog.showModal();}
  if(!client.configured){display('管理员服务未配置，暂不能登录或下载。');return;}
  busy=true;client.clear();display('正在验证管理员会话…');
  try{await client.refresh();display();}catch(error){display(error.message);}
  finally{busy=false;display(status.textContent);}
}
function close(){clearTimeout(expiryTimer);form.elements.password.value='';dialog.close();opener?.focus?.();if(location.hash==='#admin')history.replaceState(null,'',location.pathname+location.search);}
dialog.querySelector('[data-admin-close]').addEventListener('click',close);
dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!client.configured)return;
  const username=form.elements.username.value;const password=form.elements.password.value;
  busy=true;display('正在登录…');
  try{await client.login({username,password});display();}catch(error){display(error.message);}
  finally{form.elements.password.value='';busy=false;display(status.textContent);}
});
dialog.querySelector('[data-admin-logout]').addEventListener('click',async()=>{
  if(busy)return;busy=true;const pending=client.logout();display('正在退出登录…');
  try{await pending;status.textContent='已退出登录。';}catch{status.textContent='本页已退出；服务暂不可用，远端会话可能仍有效。';}
  finally{busy=false;display(status.textContent);}
});
// Legacy package controls never navigate to public URLs, even after login.
const legacySelector='[data-hub-package], [data-role="download-button"], a[href*="/releases/download/"], a[href*="/downloads/"], a[href*="/download/"], .card-actions [data-action="download"], .card-actions [data-action="mac"]';
document.addEventListener('click',event=>{if(event.target.closest?.(legacySelector)){event.preventDefault();event.stopImmediatePropagation();open();}},true);
window.addEventListener('hashchange',()=>{if(location.hash==='#admin')open();});
if(location.hash==='#admin')open();
