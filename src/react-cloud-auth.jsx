import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal,flushSync} from 'react-dom';
import {StorageUsageDialog,PlatformHealthDialog} from './react-admin-dialog.jsx';

let loginRoot;
function LoginGate({status,visible,onLogin,onRetry,retryReady=false}){
  const [busy,setBusy]=useState(false);
  const submit=async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    setBusy(true);
    try{await onLogin(form.elements.email.value,form.elements.password.value);
      form.elements.password.value='';
    }finally{setBusy(false);}
  };
  return <main className="cloud-login" style={{maxWidth:420,margin:'12vh auto',padding:16}}>
    <section className="panel"><h1>登录拾页</h1>
      <p>每位用户的资料独立保存在私人云端。账号由管理员创建；登录后本浏览器会保持会话，直到主动退出。</p>
      {retryReady&&<button className="btn primary" type="button" disabled={busy}
        onClick={async()=>{setBusy(true);try{await onRetry();}finally{setBusy(false);}}}>重试连接</button>}
      <form data-login hidden={!visible} onSubmit={submit}>
        <label>用户名<input name="email" type="text" autoComplete="username" required/></label>
        <label>密码<input name="password" type="password" autoComplete="current-password" required/></label>
        <button className="btn primary" type="submit" disabled={busy}>登录</button>
      </form><p role="status">{status}</p>
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
    
    
    {dialog==='storage'?<StorageUsageDialog onClose={()=>setDialog(null)}/>:null}
    {dialog==='health'?<PlatformHealthDialog onClose={()=>setDialog(null)}/>:null}
  </div>;
}
