import {cloudEnabled,cloudClient,requireCloudUser} from './cloud-session.js';
import {createBackup} from './store.js';
import {checkAccountResetEpoch} from './account-reset-epoch.js';
import {eraseSiteAppData} from './account-data-wipe.js';
import {cloudClearCache,cloudPendingLocalSummary,cloudResumeCache,
  cloudSetResetCleanupPending,cloudCloseCacheBeforeRemoteReset} from './cloud-store.js';
import {renderLoginGate,clearLoginGate} from './react-cloud-auth.jsx';
import {updateShell} from './react-shell.jsx';

const emailForLogin=value=>{const name=value.trim().toLowerCase();return name==='lrx'?
  'lrx@shiyejournal.vip':/^[a-z][a-z0-9_]{2,31}$/.test(name)?
  name+'@accounts.shiyejournal.invalid':name;};

export async function startCloudSession(onReady){
  if(!cloudEnabled){document.querySelector('#auth-root').hidden=true;
    document.querySelector('#app').hidden=false;await onReady(null);return;}
  const app=document.querySelector('#app');app.hidden=true;
  const client=cloudClient();
  const gate={visible:false,status:'正在恢复登录…',retryReady:false};
  const showGate=patch=>{Object.assign(gate,patch);renderLoginGate({...gate,onLogin:login,onRetry:retry});};
  const hasSession=async()=>{
    let timer;
    try{return !!(await Promise.race([client.auth.getSession(),new Promise(resolve=>{
      timer=setTimeout(()=>resolve(null),2500);
    })]))?.data?.session;}
    catch{return false;}
    finally{clearTimeout(timer);}
  };
  async function retry(){
    showGate({visible:false,status:'正在重新核对账号…'});
    try{await enter();}
    catch(error){showGate({visible:true,retryReady:true,status:error.message||'连接暂时不可用，请重试'});}
  }
  async function login(username,password){
    showGate({status:'正在验证账号…'});
    let signedIn=false;
    try{
      const {error}=await client.auth.signInWithPassword({
        email:emailForLogin(username),password
      });
      if(error){
        if(error.code==='invalid_credentials')throw Error('用户名或密码不正确');
        throw Error(error.message||'登录服务暂时不可用，请稍后重试');
      }
      signedIn=true;
      await enter();
    }catch(error){
      showGate({visible:true,retryReady:signedIn||await hasSession(),
        status:error.message||'登录失败，请检查网络'});
    }
  }
  showGate({});
  async function enter(){
    showGate({status:'正在核对账号权限…'});
    const {user,account}=await requireCloudUser({withAccount:true});
    const wipeOldLocalData=async()=>{
      window.dispatchEvent(new Event('shiye-account-reset-detected'));
      await cloudCloseCacheBeforeRemoteReset();
      const outcome=await eraseSiteAppData({preserveAuthentication:true});
      if(outcome.errors.length)throw Error('云端已清空，但本设备还有数据未能删除；请关闭其他拾页标签页并重试：'+
        outcome.errors.join('；'));
    };
    const preflight=()=>checkAccountResetEpoch({
      client,userId:user.id,storage:localStorage,erase:wipeOldLocalData,
      onProgress:message=>showGate({status:message})
    });
    showGate({status:'正在检查账号资料…'});
    const initialReset=await preflight();
    if(initialReset.wiped){location.reload();return;}
    cloudSetResetCleanupPending(initialReset.pending,initialReset.resetId);
    let shown=false;
    const showApp=()=>{if(shown)return;shown=true;clearLoginGate();
      document.querySelector('#auth-root').hidden=true;app.hidden=false;};
    showGate({status:'正在打开本机资料…'});
    await onReady(user,{afterAccountReset:!!initialReset.resetId,onFirstView:showApp});
    showApp();
    if(initialReset.pending&&initialReset.resetId){
      const noticeKey='shiye-gc-notice-v1:'+user.id+':'+initialReset.resetId;
      let previouslyNotified=false;
      try{previouslyNotified=localStorage.getItem(noticeKey)==='1';}catch{}
      if(!previouslyNotified){
        updateShell({resetNotice:{message:'账号已重置，可正常使用。旧 COS 文件仍在服务器后台清理，不影响新作品。'}});
        setTimeout(()=>updateShell({resetNotice:null}),6500);
        try{localStorage.setItem(noticeKey,'1');}catch{}
      }
    }
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
    const logout=async()=>{
      try{
        const detail={tasks:[]};
        window.dispatchEvent(new CustomEvent('shiye-flush-before-logout',{detail}));
        await Promise.all(detail.tasks);
      }catch{alert('本机暂存失败，修改还在当前页面；请先解决后再退出');return;}
      let pending;
      try{pending=await cloudPendingLocalSummary();}
      catch{alert('无法检查本机待同步资料，请先重试');return;}
      const count=pending.projects+pending.imports;
      if(count&&!confirm(`本机还有 ${count} 项待同步修改。退出登录会保留这些原稿；下次用同一账号登录后继续上传。确定退出吗？`))return;
      try{await cloudClearCache();}
      catch{alert('本机私人缓存清理失败，请重试退出');return;}
      let result;
      try{result=await client.auth.signOut({scope:'local'});}
      catch{cloudResumeCache();alert('退出失败，请检查网络');return;}
      if(result.error){cloudResumeCache();alert('退出失败，请检查网络');return;}
      location.reload();
    };
    const backup=async()=>{
      try{
        const blob=await createBackup({browserOnly:true}),url=URL.createObjectURL(blob),
          link=document.createElement('a');
        link.href=url;link.download='拾页本机旧资料.shiyepwa';link.click();
        setTimeout(()=>URL.revokeObjectURL(url),60000);
      }catch(error){alert('旧资料导出失败：'+error.message);}
    };
    updateShell({account:{username:account.username,isAdmin:account.is_admin===true,
      userID:user.id,client,onLogout:logout,onOldBackup:backup}});
    client.auth.onAuthStateChange(event=>{
      if(event==='SIGNED_OUT'){
        app.hidden=true;void cloudClearCache().catch(console.warn).finally(()=>location.reload());
      }
    });
  }
  try{await enter();}
  catch(error){
    showGate({visible:true,retryReady:await hasSession(),status:error.status===401?
      '登录后，同一浏览器会自动保持登录，直到主动退出。':error.message});
  }
}
