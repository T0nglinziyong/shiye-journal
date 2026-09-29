import './styles.css';
import './cloud.css';
import {cloudEnabled,cloudClient,requireCloudUser} from './cloud-session.js';
import {createBackup} from './store.js';
import {cloudClearCache} from './cloud-store.js';

const app=document.querySelector('#app');
export async function startCloudSession(onReady){
  if(!cloudEnabled){await onReady();return;}
  app.hidden=true;
  const gate=document.createElement('main');gate.className='cloud-login';
  gate.innerHTML='<section class="panel"><h1>登录拾页</h1><p>测试阶段仅开放指定账号。数据不会公开。</p><form><label>用户名<input name="username" autocomplete="username" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button class="btn primary" type="submit">登录</button></form><p role="status"></p></section>';
  gate.style.cssText='max-width:420px;margin:12vh auto;padding:16px';document.body.append(gate);
  const status=gate.querySelector('[role=status]'),loginForm=gate.querySelector('form');
  loginForm.hidden=true;status.textContent='正在恢复登录…';
  async function enter(){
    await requireCloudUser();gate.remove();app.hidden=false;await onReady();
    const account=document.createElement('div');account.className='cloud-account';
    account.innerHTML='<button type="button" class="btn mini" aria-expanded="false" aria-controls="cloud-account-menu">账号</button><div id="cloud-account-menu" class="cloud-account-menu" hidden><small>lrx · 云端资料</small><button type="button" class="btn" data-old-backup>导出本机旧资料</button><button type="button" class="btn" data-logout>退出登录</button></div>';
    const toggle=account.firstElementChild,menu=account.querySelector('.cloud-account-menu');
    toggle.onclick=()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden));};
    document.addEventListener('click',event=>{if(!account.contains(event.target)){menu.hidden=true;toggle.setAttribute('aria-expanded','false');}});
    account.onkeydown=event=>{if(event.key==='Escape'){menu.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();}};
    account.querySelector('[data-logout]').onclick=async()=>{try{const detail={tasks:[]};window.dispatchEvent(new CustomEvent('shiye-flush-before-logout',{detail}));await Promise.all(detail.tasks);}catch{alert('有修改尚未同步到云端，请保存成功后再退出');return;}try{await cloudClearCache();}catch{alert('本机私人缓存清理失败，请重试退出');return;}const {error}=await cloudClient().auth.signOut({scope:'local'});if(error){alert('退出失败，请检查网络');return;}location.reload();};
    account.querySelector('[data-old-backup]').onclick=async()=>{try{const blob=await createBackup({browserOnly:true}),link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download='拾页本机旧资料.shiyepwa';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){alert('旧资料导出失败：'+error.message);}};
    document.querySelector('.top-actions').append(account);
    cloudClient().auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){app.hidden=true;void cloudClearCache().catch(console.warn).finally(()=>location.reload());}});
  }
  gate.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const form=event.target,button=form.querySelector('button');button.disabled=true;status.textContent='正在验证账号…';
    try{
      // Username mapping is a public identifier, not a password or permission.
      // Authorization is enforced by the database allowlist and ownership RLS.
      if(form.elements.username.value.trim()!=='lrx')throw Error('用户名或密码不正确');
      const {error}=await cloudClient().auth.signInWithPassword({email:'lrx@shiyejournal.vip',password:form.elements.password.value});
      form.elements.password.value='';if(error)throw Error('用户名或密码不正确');await enter();
    }catch(error){status.textContent=error.message||'登录失败，请检查网络';}finally{button.disabled=false;}
  };
  try{await enter();}catch(error){loginForm.hidden=false;status.textContent=error.status===401?'登录后，同一浏览器会自动保持登录，直到主动退出。':error.message;}
}
