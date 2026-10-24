import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal,flushSync} from 'react-dom';
import {StorageUsageDialog,PlatformHealthDialog} from './react-admin-dialog.jsx';
import {requestIdentityBinding,confirmIdentityBinding} from './cloud-auth-methods.js';

let loginRoot;
function LoginGate({status,visible,onLogin,onSendOtp,onVerifyOtp,onResetPassword,
  onConfirmReset,onOAuth,onSwitchAccount,oauthProviders=[],onRetry,retryReady=false}){
  const [busy,setBusy]=useState(false);
  const [mode,setMode]=useState('password');
  const [codeSent,setCodeSent]=useState(false);
  const [resetSent,setResetSent]=useState(false);
  const selectMode=next=>{setMode(next);setCodeSent(false);setResetSent(false);};
  const submit=async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    setBusy(true);
    try{
      if(mode==='password'){
        await onLogin(form.elements.identifier.value,form.elements.password.value);
        form.elements.password.value='';
      }else if(mode==='reset'){
        if(resetSent)await onConfirmReset(form.elements.identifier.value,
          form.elements.code.value,form.elements.password.value);
        else setResetSent(await onResetPassword(form.elements.identifier.value));
      }
      else if(codeSent)await onVerifyOtp(mode,form.elements.identifier.value,form.elements.code.value);
      else setCodeSent(await onSendOtp(mode,form.elements.identifier.value));
    }finally{setBusy(false);}
  };
  return <main className="cloud-login">
    <section className="panel"><h1>登录拾页</h1>
      <p>账号采用邀请制。请使用已授权的用户名、邮箱或手机号登录。</p>
      {retryReady&&<button className="btn primary" type="button" disabled={busy}
        onClick={async()=>{setBusy(true);try{await onRetry();}finally{setBusy(false);}}}>重试连接</button>}
      <form data-login hidden={!visible} onSubmit={submit}>
        <div className="cloud-login-modes" role="tablist" aria-label="登录方式">
          {[['password','密码'],['email','邮箱验证码'],['phone','短信验证码']].map(([id,label])=><button
            key={id} type="button" role="tab" aria-selected={mode===id} disabled={busy}
            onClick={()=>selectMode(id)}>{label}</button>)}
        </div>
        <label>{mode==='email'||mode==='reset'?'邮箱':mode==='phone'?'手机号':'用户名 / 邮箱 / 手机号'}
          <input name="identifier" type={mode==='email'||mode==='reset'?'email':mode==='phone'?'tel':'text'}
            autoComplete={mode==='phone'?'tel':mode==='email'||mode==='reset'?'email':'username'} required
            onChange={()=>{setCodeSent(false);setResetSent(false);}}/></label>
        {mode==='password'?<label>密码<input name="password" type="password"
          autoComplete="current-password" required/></label>:null}
        {(mode==='email'||mode==='phone')&&codeSent?<label>验证码<input name="code"
          inputMode="numeric" autoComplete="one-time-code" required/></label>:null}
        {mode==='reset'&&resetSent?<><label>邮件验证码<input name="code" inputMode="numeric"
          autoComplete="one-time-code" required/></label><label>新密码（至少 12 位）
          <input name="password" type="password" minLength="12" autoComplete="new-password" required/></label></>:null}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy?'请稍候…':mode==='reset'?(resetSent?'重置密码':'发送重置验证码'):
            mode==='password'?'登录':codeSent?'验证并登录':'发送验证码'}</button>
        {(mode==='email'||mode==='phone')&&codeSent?<button className="btn" type="button"
          disabled={busy} onClick={()=>setCodeSent(false)}>重新发送</button>:null}
        {mode==='password'?<button className="cloud-login-link" type="button" onClick={()=>selectMode('reset')}>忘记密码？</button>:null}
        {mode==='reset'?<button className="cloud-login-link" type="button" onClick={()=>selectMode('password')}>返回登录</button>:null}
      </form><p role="status">{status}</p>
      {visible&&retryReady?<button className="cloud-login-link" type="button"
        onClick={onSwitchAccount}>切换账号</button>:null}
      {visible&&oauthProviders.length?<div className="cloud-login-oauth"><p>其他已绑定的登录方式</p>
        {oauthProviders.map(provider=><button className="btn" type="button" key={provider.id}
          disabled={busy} onClick={()=>onOAuth(provider.id)}>{provider.label}登录</button>)}
      </div>:null}
    </section>
  </main>;
}
export function renderLoginGate(props){
  const host=document.querySelector('#auth-root');host.hidden=false;
  loginRoot??=createRoot(host);
  loginRoot.render(<LoginGate {...props}/>);
}
export function clearLoginGate(){if(loginRoot)flushSync(()=>loginRoot.render(null));}

function AuthDialog({title,onClose,children}){
  useEffect(()=>{
    const escape=event=>{if(event.key==='Escape')onClose();};
    document.addEventListener('keydown',escape);
    return ()=>document.removeEventListener('keydown',escape);
  },[onClose]);
  return createPortal(<div className="cloud-admin-backdrop"
    onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="cloud-password-panel" role="dialog" aria-modal="true" aria-label={title}>
      <h2>{title}</h2>{children}
    </section>
  </div>,document.body);
}
function PasswordDialog({client,onClose}){
  const [status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  const submit=async event=>{
    event.preventDefault();const form=event.currentTarget;
    const old=form.elements.old.value,next=form.elements.next.value,
      confirmation=form.elements.confirm.value;
    if(next!==confirmation){setStatus('两次输入的新密码不一致');return;}
    if(next===old){setStatus('新密码不能与当前密码相同');return;}
    setBusy(true);setStatus('正在核对当前密码…');
    try{
      const changed=await client.auth.resetPasswordForOld({old_password:old,new_password:next});
      if(changed.error)throw changed.error;
      form.reset();setStatus('密码已更新');setTimeout(onClose,900);
    }catch(error){setStatus(error.message||'修改失败，请稍后重试');}
    finally{setBusy(false);}
  };
  return <AuthDialog title="修改密码" onClose={onClose}><form onSubmit={submit}>
    <label>当前密码<input name="old" type="password" autoComplete="current-password" required autoFocus/></label>
    <label>新密码（至少 12 位）<input name="next" type="password" autoComplete="new-password" minLength="12" required/></label>
    <label>确认新密码<input name="confirm" type="password" autoComplete="new-password" minLength="12" required/></label>
    <p role="status">{status}</p><div className="cloud-dialog-actions">
      <button type="button" className="btn" onClick={onClose}>取消</button>
      <button type="submit" className="btn primary" disabled={busy}>更新密码</button>
    </div>
  </form></AuthDialog>;
}
function AccountIdentityDialog({account,onClose}){
  const [user,setUser]=useState(null),[status,setStatus]=useState('正在读取登录身份…');
  const [mode,setMode]=useState(null),[challenge,setChallenge]=useState(null);
  const [busy,setBusy]=useState(false);
  const auth=account.client.auth;
  const refresh=async()=>{
    const {data,error}=await auth.getUser();
    if(error)throw error;
    setUser(data?.user||null);
  };
  useEffect(()=>{let alive=true;
    void auth.getUser().then(({data,error})=>{
      if(!alive)return;
      if(error)throw error;
      setUser(data?.user||null);setStatus('');
    }).catch(error=>{if(alive)setStatus(error.message||'身份资料暂不可用');});
    return ()=>{alive=false;};
  },[auth]);
  const providers=(Array.isArray(user?.app_metadata?.providers)?user.app_metadata.providers:[])
    .filter(provider=>!['cloudbase','email','phone','password'].includes(provider));
  const chooseMode=next=>{setMode(next);setChallenge(null);setStatus('');};
  const bind=async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    setBusy(true);setStatus(challenge?'正在验证…':'正在发送验证码…');
    try{
      if(challenge){
        await confirmIdentityBinding(challenge,form.elements.code.value);
        await refresh();setChallenge(null);setMode(null);setStatus('绑定成功，可以使用此方式登录。');
      }else{
        const next=await requestIdentityBinding(auth,mode,form.elements.identifier.value);
        if(next.complete){
          await refresh();setMode(null);setStatus('绑定成功，可以使用此方式登录。');
        }else{setChallenge(next);setStatus('验证码已发送，请输入收到的验证码。');}
      }
    }catch(error){setStatus(error.message||'绑定失败，请稍后重试');}
    finally{setBusy(false);}
  };
  const link=async provider=>{
    setBusy(true);setStatus('正在连接第三方身份…');
    try{
      const {error}=await auth.linkIdentity({provider});
      if(error)throw error;
      await refresh();setStatus('第三方身份已绑定。');
    }catch(error){setStatus(error.message||'第三方身份绑定失败');}
    finally{setBusy(false);}
  };
  return <AuthDialog title="账号与登录方式" onClose={onClose}>
    <p>受邀账号：{account.username}</p>
    {user?<>
      <div className="cloud-identity-row"><span>邮箱：{user.email||'未绑定'}</span>
        <button className="btn" type="button" disabled={busy} onClick={()=>chooseMode('email')}>{user.email?'更换':'绑定'}</button></div>
      <div className="cloud-identity-row"><span>手机号：{user.phone||'未绑定'}</span>
        <button className="btn" type="button" disabled={busy} onClick={()=>chooseMode('phone')}>{user.phone?'更换':'绑定'}</button></div>
      <p>第三方身份：{providers.length?providers.join('、'):'未绑定'}</p>
      {account.oauthProviders?.filter(provider=>!providers.includes(provider.id)).map(provider=><button
        key={provider.id} className="btn" type="button" disabled={busy}
        onClick={()=>void link(provider.id)}>绑定{provider.label}</button>)}
      <p>验证码和第三方登录只有与当前受邀身份绑定时，才能打开这个账号的资料。</p>
    </>:null}
    {mode?<form className="cloud-identity-form" onSubmit={bind}>
      <label>{mode==='email'?'新邮箱':'新手机号'}<input name="identifier"
        type={mode==='email'?'email':'tel'} autoComplete={mode==='email'?'email':'tel'}
        disabled={busy||!!challenge} required onChange={()=>setChallenge(null)}/></label>
      {challenge?<label>验证码<input name="code" inputMode="numeric"
        autoComplete="one-time-code" disabled={busy} required/></label>:null}
      <div className="cloud-dialog-actions"><button className="btn" type="button"
        disabled={busy} onClick={()=>chooseMode(null)}>取消</button>
        <button className="btn primary" type="submit" disabled={busy}>{challenge?'验证并绑定':'发送验证码'}</button></div>
    </form>:null}
    <p role="status">{status}</p>
    <div className="cloud-dialog-actions"><button className="btn" type="button" onClick={onClose}>关闭</button></div>
  </AuthDialog>;
}
export function CloudAccountMenu({account}){
  const [open,setOpen]=useState(false),[dialog,setDialog]=useState(null),host=useRef(null);
  useEffect(()=>{
    if(!open)return;
    const outside=event=>{if(!host.current?.contains(event.target))setOpen(false);};
    const escape=event=>{if(event.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',outside);
      document.removeEventListener('keydown',escape);};
  },[open]);
  const choose=callback=>{setOpen(false);callback();};
  return <div className="cloud-account" ref={host}>
    <button type="button" className="btn mini" aria-expanded={open}
      aria-controls="cloud-account-menu" onClick={()=>setOpen(value=>!value)}>账号</button>
    <div id="cloud-account-menu" className="cloud-account-menu" hidden={!open}>
      <small data-account-name="">{account.username} · 私人云端资料</small>
      <button type="button" className="btn" onClick={()=>choose(()=>setDialog('identity'))}>账号与登录方式</button>
      <button type="button" className="btn" data-storage-usage
        onClick={()=>choose(()=>setDialog('storage'))}>我的存储用量</button>
      <button type="button" className="btn" data-platform-health
        onClick={()=>choose(()=>setDialog('health'))}>CloudBase 服务状态</button>
      <button type="button" className="btn" data-change-password
        onClick={()=>choose(()=>setDialog('password'))}>修改密码</button>
      <button type="button" className="btn" data-old-backup
        onClick={()=>choose(account.onOldBackup)}>导出本机旧资料</button>
      <button type="button" className="btn" data-logout
        onClick={()=>choose(account.onLogout)}>退出登录</button>
    </div>
    {dialog==='password'?<PasswordDialog client={account.client} onClose={()=>setDialog(null)}/>:null}
    {dialog==='identity'?<AccountIdentityDialog account={account} onClose={()=>setDialog(null)}/>:null}
    
    
    {dialog==='storage'?<StorageUsageDialog onClose={()=>setDialog(null)}/>:null}
    {dialog==='health'?<PlatformHealthDialog onClose={()=>setDialog(null)}/>:null}
  </div>;
}
