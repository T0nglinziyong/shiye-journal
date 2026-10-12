import {cloudEnabled,cloudClient,requireCloudUser} from './cloud-session.js';
import {createBackup,purgeLocalAfterCloudReset} from './store.js';
import {checkAccountResetEpoch,finishPendingAccountReset} from './account-reset-epoch.js';
import {eraseSiteAppData} from './account-data-wipe.js';
import {cloudClearCache,cloudPendingLocalSummary,cloudResumeCache,cloudSetResetCleanupPending} from './cloud-store.js';
import {openAdminView} from './admin-view.js';
import {openStorageUsage} from './storage-usage-ui.js';
import {openAccountManagement} from './account-management.js';

const emailForLogin=value=>{const name=value.trim().toLowerCase();return name==='lrx'?'lrx@shiyejournal.vip':/^[a-z][a-z0-9_]{2,31}$/.test(name)?name+'@accounts.shiyejournal.invalid':name;};

function changePasswordDialog(client){
  const backdrop=document.createElement('div');backdrop.className='cloud-admin-backdrop';
  const panel=document.createElement('section');panel.className='cloud-password-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','修改密码');
  panel.innerHTML='<h2>修改密码</h2><form><label>当前密码<input name="old" type="password" autocomplete="current-password" required></label><label>新密码（至少 12 位）<input name="next" type="password" autocomplete="new-password" minlength="12" required></label><label>确认新密码<input name="confirm" type="password" autocomplete="new-password" minlength="12" required></label><p role="status"></p><div class="cloud-dialog-actions"><button type="button" class="btn" data-cancel>取消</button><button type="submit" class="btn primary">更新密码</button></div></form>';
  backdrop.append(panel);document.body.append(backdrop);
  const close=()=>{backdrop.remove();document.removeEventListener('keydown',escape);};
  const escape=event=>{if(event.key==='Escape')close();};
  panel.querySelector('[data-cancel]').onclick=close;backdrop.onclick=event=>{if(event.target===backdrop)close();};document.addEventListener('keydown',escape);
  const form=panel.querySelector('form'),status=panel.querySelector('[role=status]');
  form.onsubmit=async event=>{
    event.preventDefault();const old=form.elements.old.value,next=form.elements.next.value,confirmation=form.elements.confirm.value;
    if(next!==confirmation){status.textContent='两次输入的新密码不一致';return;}
    if(next===old){status.textContent='新密码不能与当前密码相同';return;}
    const button=form.querySelector('[type=submit]');button.disabled=true;status.textContent='正在核对当前密码…';
    try{
      const changed=await client.auth.updateUser({password:next,currentPassword:old});if(changed.error)throw changed.error;
      form.reset();status.textContent='密码已更新';setTimeout(close,900);
    }catch(error){status.textContent=error.message||'修改失败，请稍后重试';}finally{button.disabled=false;}
  };
  form.elements.old.focus();
}

export async function startCloudSession(onReady){
  if(!cloudEnabled){await onReady(null);return;}
  const app=document.querySelector('#app');app.hidden=true;
  const gate=document.createElement('main');gate.className='cloud-login';
  gate.innerHTML='<section class="panel"><h1>登录拾页</h1><p>每位用户的资料独立保存在私人云端。账号由管理员创建；登录后本浏览器会保持会话，直到主动退出。</p><form data-login><label>用户名<input name="email" type="text" autocomplete="username" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button class="btn primary" type="submit">登录</button></form><p role="status"></p></section>';
  gate.style.cssText='max-width:420px;margin:12vh auto;padding:16px';document.body.append(gate);
  const client=cloudClient(),status=gate.querySelector('[role=status]'),loginForm=gate.querySelector('[data-login]');
  loginForm.hidden=true;status.textContent='正在恢复登录…';
  async function enter(){
    const user=await requireCloudUser();
    const {data:account,error}=await client.from('shiye_accounts').select('username,is_admin').eq('user_id',user.id).single();
    if(error||!account)throw Error('无法读取账号资料');
    // A reset from another device must be observed BEFORE cachedCollections,
    // old outbox recovery, or any background upload can start.
    const wipeOldLocalData=async()=>{
      window.dispatchEvent(new Event('shiye-account-reset-detected'));
      await purgeLocalAfterCloudReset();
      const outcome=await eraseSiteAppData({preserveAuthentication:true});
      if(outcome.errors.length)
        throw Error('云端已清空，但本设备还有数据未能删除；请关闭其他拾页标签页并重试：'+outcome.errors.join('；'));
    };
    const preflight=()=>checkAccountResetEpoch({
      client,userId:user.id,storage:localStorage,erase:wipeOldLocalData,
      onProgress:message=>{status.textContent=message;}
    });
    const initialReset=await preflight();
    if(initialReset.wiped){location.reload();return;}
    // Login is not a garbage-collection job. The logical cloud reset is
    // already complete when phase=deleting; keep the empty account readable.
    // Never enable new writes while the old COS prefix is still being purged.
    cloudSetResetCleanupPending(initialReset.pending);
    gate.remove();app.hidden=false;await onReady(user,{resetPending:initialReset.pending});
    if(initialReset.pending){
      const banner=document.createElement('aside');
      banner.setAttribute('role','status');
      banner.style.cssText='position:fixed;bottom:78px;left:12px;right:12px;max-width:600px;margin:auto;background:#284234;color:white;z-index:2147483500;padding:15px;border-radius:14px;box-shadow:0 6px 25px #0003;font-size:14px';
      banner.textContent='云端内容已清空，正在后台清理旧图片。现在可以进入空白账户查看；清理结束后即可创建新资料。';
      const retry=document.createElement('button');
      retry.type='button';retry.className='btn mini';
      retry.textContent='继续清理';
      retry.style.cssText='margin-left:12px;background:#fff;color:#26442f';
      banner.append(retry);document.body.append(banner);
      let running=false;
      const cleanup=async()=>{
        if(running)return;
        running=true;retry.disabled=true;
        try{
          await finishPendingAccountReset({
            client,resetId:initialReset.resetId,
            onProgress:message=>{banner.firstChild.textContent=message+' · 仅旧图片清理，作品索引已清空。';}
          });
          banner.firstChild.textContent='云端旧文件清理完成，正在重新开启可编辑账户…';
          location.reload();
        }catch(error){
          // Login remains usable in read-only mode. Failed file deletion must
          // not be confused with incorrect credentials or a lost account.
          banner.firstChild.textContent='账户已登录，云端旧文件清理未完成：'+(error.message||'请重试')+'。';
          retry.disabled=false;
        }finally{running=false;}
      };
      retry.onclick=()=>void cleanup();
      void cleanup();
    }
    // Already-open phones and computers also notice a reset on return to the
    // tab, without waiting for a new manual sign-in.
    let watching=false;
    const watch=async()=>{
      if(watching||document.visibilityState==='hidden')return;
      watching=true;
      try{
        const outcome=await preflight();
        if(outcome.wiped){location.reload();return;}
        if(initialReset.pending&&!outcome.pending){location.reload();return;}
      }catch(error){console.warn('跨设备重置检查未完成',error?.message);}
      finally{watching=false;}
    };
    const timer=setInterval(()=>void watch(),15000);
    window.addEventListener('focus',()=>void watch());
    window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
    const menuHost=document.createElement('div');menuHost.className='cloud-account';
    menuHost.innerHTML='<button type="button" class="btn mini" aria-expanded="false" aria-controls="cloud-account-menu">账号</button><div id="cloud-account-menu" class="cloud-account-menu" hidden><small data-account-name></small><button type="button" class="btn" data-create-account hidden>新建账号</button><button type="button" class="btn" data-admin-view hidden>查看其他用户（只读）</button><button type="button" class="btn" data-storage-usage hidden>存储统计（开发者）</button><button type="button" class="btn" data-change-password>修改密码</button><button type="button" class="btn" data-old-backup>导出本机旧资料</button><button type="button" class="btn" data-logout>退出登录</button></div>';
    menuHost.querySelector('[data-account-name]').textContent=account.username+' · 私人云端资料';
    const toggle=menuHost.firstElementChild,menu=menuHost.querySelector('.cloud-account-menu');
    toggle.onclick=()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden));};
    document.addEventListener('click',event=>{if(!menuHost.contains(event.target)){menu.hidden=true;toggle.setAttribute('aria-expanded','false');}});
    menuHost.onkeydown=event=>{if(event.key==='Escape'){menu.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();}};
    menuHost.querySelector('[data-change-password]').onclick=()=>{menu.hidden=true;changePasswordDialog(client);};
    if(account.is_admin===true){const usage=menuHost.querySelector('[data-storage-usage]');usage.hidden=false;usage.onclick=()=>{menu.hidden=true;void openStorageUsage(client).catch(error=>alert('存储统计暂不可用：'+error.message));};const create=menuHost.querySelector('[data-create-account]');create.hidden=false;create.onclick=()=>{menu.hidden=true;openAccountManagement(client);};const button=menuHost.querySelector('[data-admin-view]');button.hidden=false;button.onclick=async()=>{menu.hidden=true;try{await openAdminView(client,user.id);}catch(error){alert('无法查看其他用户：'+(error.message||'请检查网络'));}};}
    menuHost.querySelector('[data-logout]').onclick=async()=>{try{const detail={tasks:[]};window.dispatchEvent(new CustomEvent('shiye-flush-before-logout',{detail}));await Promise.all(detail.tasks);}catch{alert('本机暂存失败，修改还在当前页面；请先解决后再退出');return;}let pending;try{pending=await cloudPendingLocalSummary();}catch{alert('无法检查本机待同步资料，请先重试');return;}const count=pending.projects+pending.imports;if(count&&!confirm(`本机还有 ${count} 项待同步修改。退出登录会保留这些原稿；下次用同一账号登录后继续上传。确定退出吗？`))return;try{await cloudClearCache();}catch{alert('本机私人缓存清理失败，请重试退出');return;}let result;try{result=await client.auth.signOut({scope:'local'});}catch(error){cloudResumeCache();alert('退出失败，请检查网络');return;}if(result.error){cloudResumeCache();alert('退出失败，请检查网络');return;}location.reload();};
    menuHost.querySelector('[data-old-backup]').onclick=async()=>{try{const blob=await createBackup({browserOnly:true}),link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download='拾页本机旧资料.shiyepwa';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){alert('旧资料导出失败：'+error.message);}};
    document.querySelector('.top-actions').append(menuHost);
    client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){app.hidden=true;void cloudClearCache().catch(console.warn).finally(()=>location.reload());}});
  }
  loginForm.onsubmit=async event=>{
    event.preventDefault();const button=loginForm.querySelector('[type=submit]');button.disabled=true;status.textContent='正在验证账号…';
    try{const {error}=await client.auth.signInWithPassword({email:emailForLogin(loginForm.elements.email.value),password:loginForm.elements.password.value});loginForm.elements.password.value='';if(error)throw Error('用户名或密码不正确');await enter();}
    catch(error){status.textContent=error.message||'登录失败，请检查网络';}finally{button.disabled=false;}
  };
  try{await enter();}catch(error){loginForm.hidden=false;status.textContent=error.status===401?'登录后，同一浏览器会自动保持登录，直到主动退出。':error.message;}
}
