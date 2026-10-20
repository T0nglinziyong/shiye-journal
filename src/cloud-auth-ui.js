import {cloudEnabled,cloudClient,prepareCloudClient,requireCloudUser} from './cloud-session.js';
import {createBackup} from './store.js';
import {checkAccountResetEpoch} from './account-reset-epoch.js';
import {eraseSiteAppData} from './account-data-wipe.js';
import {cloudApiRequest} from './cloud-api-origin.js';
import {cloudClearCache,cloudPendingLocalSummary,cloudResumeCache,
  cloudSetResetCleanupPending,cloudCloseCacheBeforeRemoteReset} from './cloud-store.js';
import {renderLoginGate,clearLoginGate} from './react-cloud-auth.jsx';
import {updateShell} from './react-shell.jsx';
import {passwordIdentifier,requestLoginOtp,verifyLoginOtp,configuredOAuthProviders} from './cloud-auth-methods.js';
import {foregroundIsIdle} from './foreground-idle.js';

const oauthProviders=configuredOAuthProviders(import.meta.env?.VITE_SHIYE_OAUTH_PROVIDERS);

export async function startCloudSession(onReady){
  if(!cloudEnabled){
    document.querySelector('#app').hidden=true;
    renderLoginGate({visible:false,status:'CloudBase 网站配置缺失；未打开或改写本机私人资料。',onLogin:async()=>{}});
    return;
  }
  const app=document.querySelector('#app');app.hidden=true;
  try{await prepareCloudClient();}
  catch(error){
    renderLoginGate({visible:false,status:error.message||'CloudBase 初始化失败；未打开本机私人资料。',onLogin:async()=>{}});
    return;
  }
  const client=cloudClient();
  const gate={visible:false,status:'正在恢复登录…',retryReady:false};
  let otpChallenge=null,resetChallenge=null;
  const showGate=patch=>{Object.assign(gate,patch);renderLoginGate({...gate,
    onLogin:login,onSendOtp:sendOtp,onVerifyOtp:verifyOtp,onResetPassword:resetPassword,
    onConfirmReset:confirmReset,
    onOAuth:oauthLogin,onSwitchAccount:switchAccount,oauthProviders,onRetry:retry});};
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
  async function switchAccount(){
    try{
      const result=await client.auth.signOut();
      if(result?.error)throw result.error;
      otpChallenge=null;
      showGate({visible:true,retryReady:false,status:'已退出当前身份，请使用受邀账号登录。'});
    }catch(error){showGate({visible:true,status:error.message||'切换账号失败，请重试'});}
  }
  async function login(username,password){
    showGate({status:'正在验证账号…'});
    let signedIn=false;
    try{
      const {error}=await client.auth.signInWithPassword({...passwordIdentifier(username),password});
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
  async function sendOtp(kind,value){
    otpChallenge=null;
    showGate({status:'正在发送验证码…'});
    try{
      const verify=await requestLoginOtp(client.auth,kind,value);
      otpChallenge={kind,value:value.trim(),verify};
      showGate({status:'验证码已发送，请输入收到的验证码。'});
      return true;
    }catch(error){showGate({status:error.message||'验证码发送失败'});return false;}
  }
  async function verifyOtp(kind,value,code){
    showGate({status:'正在验证验证码…'});
    let signedIn=false;
    try{
      if(!otpChallenge||otpChallenge.kind!==kind||otpChallenge.value!==value.trim())
        throw Error('登录信息已变化，请重新发送验证码');
      await verifyLoginOtp(otpChallenge.verify,code);
      otpChallenge=null;signedIn=true;
      await enter();
    }catch(error){showGate({visible:true,retryReady:signedIn,
      status:error.message||'验证码登录失败'});}
  }
  async function resetPassword(email){
    resetChallenge=null;
    showGate({status:'正在发送密码重置邮件…'});
    try{
      const {data,error}=await client.auth.resetPasswordForEmail(email.trim());
      if(error)throw error;
      if(typeof data?.updateUser!=='function')throw Error('登录服务未返回密码重置方法');
      resetChallenge={email:email.trim(),update:data.updateUser};
      showGate({status:'重置验证码已发送，请输入验证码和新密码。'});
      return true;
    }catch(error){showGate({status:error.message||'重置邮件发送失败'});return false;}
  }
  async function confirmReset(email,nonce,password){
    showGate({status:'正在更新密码…'});
    try{
      if(!resetChallenge||resetChallenge.email!==email.trim())throw Error('请重新发送重置验证码');
      const {error}=await resetChallenge.update({nonce:nonce.trim(),password});
      if(error)throw error;
      resetChallenge=null;
      showGate({status:'密码已更新，正在打开资料…'});
      await enter();
    }catch(error){showGate({visible:true,status:error.message||'密码重置失败'});}
  }
  async function oauthLogin(provider){
    if(!oauthProviders.some(item=>item.id===provider))return;
    showGate({status:'正在前往第三方登录…'});
    try{
      const {error}=await client.auth.signInWithOAuth({provider,
        options:{redirectTo:location.origin+location.pathname}});
      if(error)throw error;
    }catch(error){showGate({visible:true,status:error.message||'第三方登录暂不可用'});}
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
        updateShell({resetNotice:{message:'账号已重置，可正常使用。旧图片会在后台逐批回收，不影响新作品。'}});
        setTimeout(()=>updateShell({resetNotice:null}),6500);
        try{localStorage.setItem(noticeKey,'1');}catch{}
      }
    }
    // One bounded batch per idle window. The server chooses paths and Storage
    // RLS rechecks them; no large object scan runs on the browser main thread.
    const gcStamp='shiye-last-gc-check:'+user.id;
    let gcBusy=false,gcTimer,gcResetPending=initialReset.pending;
    const runGC=async()=>{
      if(gcBusy)return;
      if(document.visibilityState==='hidden'||!foregroundIsIdle(1800)){
        gcTimer=setTimeout(()=>void runGC(),10000);return;
      }
      gcBusy=true;
      try{
        const response=await cloudApiRequest('/api/account-gc',{method:'POST',body:'{}'});
        if(!response.ok)return;
        const result=await response.json();
        lastGC=Date.now();
        try{localStorage.setItem(gcStamp,String(lastGC));}catch{}
        if(result.resetComplete)gcResetPending=false;
        if(result.more||gcResetPending)
          gcTimer=setTimeout(()=>void runGC(),10000);
      }catch(error){console.warn('云端图片回收待下次访问重试',error?.message);}
      finally{gcBusy=false;}
    };
    let lastGC=0;try{lastGC=Number(localStorage.getItem(gcStamp))||0;}catch{}
    if(gcResetPending||Date.now()-lastGC>=24*60*60*1000)
      gcTimer=setTimeout(()=>void runGC(),5000);
    window.addEventListener('focus',()=>{
      if(gcResetPending||Date.now()-lastGC>=24*60*60*1000){
        clearTimeout(gcTimer);gcTimer=setTimeout(()=>void runGC(),3000);
      }
    });
    window.addEventListener('pagehide',()=>clearTimeout(gcTimer),{once:true});
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
      try{result=await client.auth.signOut();}
      catch{cloudResumeCache();alert('退出失败，请检查网络');return;}
      if(result?.error){cloudResumeCache();alert('退出失败，请检查网络');return;}
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
      userID:user.id,client,oauthProviders,onLogout:logout,onOldBackup:backup}});
    client.auth.onAuthStateChange(event=>{
      if(event==='SIGNED_OUT'){
        app.hidden=true;void cloudClearCache().catch(console.warn).finally(()=>location.reload());
      }
    });
  }
  try{await enter();}
  catch(error){
    const persisted=await hasSession();
    showGate({visible:true,retryReady:persisted||error.status!==401,
      status:error.status===401?(persisted?
        '登录验证暂时未通过，会话仍在本机；请先重试连接。':
        '登录会话不存在或已经过期，请重新登录。'):(error.message||'连接暂时不可用，请重试')});
  }
}
