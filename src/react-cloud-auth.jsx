import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {AdminViewDialog,StorageUsageDialog} from './react-admin-dialog.jsx';

let loginRoot;
function LoginGate({status,visible,onLogin}){
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
      <form data-login hidden={!visible} onSubmit={submit}>
        <label>用户名<input name="email" type="text" autoComplete="username" required/></label>
        <label>密码<input name="password" type="password" autoComplete="current-password" required/></label>
        <button className="btn primary" type="submit" disabled={busy}>登录</button>
      </form><p role="status">{status}</p>
    </section>
  </main>;
}
export function renderLoginGate(props){
  loginRoot??=createRoot(document.querySelector('#auth-root'));
  loginRoot.render(<LoginGate {...props}/>);
}
export function clearLoginGate(){loginRoot?.render(null);}

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
      const changed=await client.auth.updateUser({password:next,currentPassword:old});
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
function ManageAccountsDialog({client,onClose}){
  const [action,setAction]=useState('create'),[status,setStatus]=useState(''),
    [busy,setBusy]=useState(false);
  const submit=async event=>{
    event.preventDefault();const form=event.currentTarget;
    const username=form.elements.username.value.trim().toLowerCase(),
      password=form.elements.password.value;
    if(password!==form.elements.confirm.value){setStatus('两次输入的密码不一致');return;}
    if(username==='lrx'){setStatus('管理员密码请使用“修改密码”功能');return;}
    setBusy(true);setStatus(action==='create'?'正在创建账号…':'正在重置密码…');
    try{
      const {data,error}=await client.functions.invoke('shiye-account-admin',{
        body:{action,username,password}
      });
      if(error){let message='操作失败';try{message=(await error.context?.json())?.error||message;}catch{}throw Error(message);}
      if(data?.username!==username)throw Error('服务器未确认操作');
      form.elements.password.value='';form.elements.confirm.value='';
      setStatus(action==='create'?`账号 ${username} 已创建。请将用户名和初始密码安全交给本人。`:
        `${username} 的密码已重置。`);
    }catch(error){setStatus(error.message||'操作失败，请稍后重试');}
    finally{setBusy(false);}
  };
  return <AuthDialog title="管理用户账号" onClose={onClose}>
    <p>仅 lrx 可创建普通账号或重置其密码。初始密码请安全地交给本人。</p>
    <form onSubmit={submit}>
      <label>操作<select name="action" value={action} onChange={event=>{
        setAction(event.target.value);setStatus('');
      }}><option value="create">新建账号</option><option value="reset">重置普通账号密码</option></select></label>
      <label>用户名<input name="username" autoComplete="off" pattern="[a-z][a-z0-9_]{2,31}" maxLength="32" required autoFocus/></label>
      <label>初始或新密码（至少 12 位）<input name="password" type="password" autoComplete="new-password" minLength="12" required/></label>
      <label>再次输入密码<input name="confirm" type="password" autoComplete="new-password" minLength="12" required/></label>
      <p role="status">{status}</p><div className="cloud-dialog-actions">
        <button type="button" className="btn" data-close onClick={onClose}>关闭</button>
        <button type="submit" className="btn primary" disabled={busy}>
          {action==='create'?'新建账号':'重置密码'}
        </button>
      </div>
    </form>
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
      {account.isAdmin?<><button type="button" className="btn" data-create-account
        onClick={()=>choose(()=>setDialog('manage'))}>新建账号</button>
        <button type="button" className="btn" data-admin-view
          onClick={()=>choose(()=>setDialog('admin'))}>查看其他用户（只读）</button>
        <button type="button" className="btn" data-storage-usage
          onClick={()=>choose(()=>setDialog('storage'))}>存储统计（开发者）</button></>:null}
      <button type="button" className="btn" data-change-password
        onClick={()=>choose(()=>setDialog('password'))}>修改密码</button>
      <button type="button" className="btn" data-old-backup
        onClick={()=>choose(account.onOldBackup)}>导出本机旧资料</button>
      <button type="button" className="btn" data-logout
        onClick={()=>choose(account.onLogout)}>退出登录</button>
    </div>
    {dialog==='password'?<PasswordDialog client={account.client} onClose={()=>setDialog(null)}/>:null}
    {dialog==='manage'?<ManageAccountsDialog client={account.client} onClose={()=>setDialog(null)}/>:null}
    {dialog==='admin'?<AdminViewDialog client={account.client} currentUserID={account.userID}
      onClose={()=>setDialog(null)}/>:null}
    {dialog==='storage'?<StorageUsageDialog client={account.client}
      onClose={()=>setDialog(null)}/>:null}
  </div>;
}
