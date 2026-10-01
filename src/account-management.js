export function openAccountManagement(client){
  const backdrop=document.createElement('div');backdrop.className='cloud-admin-backdrop';
  const panel=document.createElement('section');panel.className='cloud-password-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','管理用户账号');
  panel.innerHTML='<h2>管理用户账号</h2><p>仅 lrx 可创建普通账号或重置其密码。初始密码请安全地交给本人。</p><form><label>操作<select name="action"><option value="create">新建账号</option><option value="reset">重置普通账号密码</option></select></label><label>用户名<input name="username" autocomplete="off" pattern="[a-z][a-z0-9_]{2,31}" maxlength="32" required></label><label>初始或新密码（至少 12 位）<input name="password" type="password" autocomplete="new-password" minlength="12" required></label><label>再次输入密码<input name="confirm" type="password" autocomplete="new-password" minlength="12" required></label><p role="status"></p><div class="cloud-dialog-actions"><button type="button" class="btn" data-close>关闭</button><button type="submit" class="btn primary">新建账号</button></div></form>';
  backdrop.append(panel);document.body.append(backdrop);
  const close=()=>{backdrop.remove();document.removeEventListener('keydown',escape);};
  const escape=event=>{if(event.key==='Escape')close();};
  panel.querySelector('[data-close]').onclick=close;backdrop.onclick=event=>{if(event.target===backdrop)close();};document.addEventListener('keydown',escape);
  const form=panel.querySelector('form'),status=panel.querySelector('[role=status]'),button=form.querySelector('[type=submit]');
  form.elements.action.onchange=()=>{button.textContent=form.elements.action.value==='create'?'新建账号':'重置密码';status.textContent='';};
  form.onsubmit=async event=>{
    event.preventDefault();const action=form.elements.action.value,username=form.elements.username.value.trim().toLowerCase(),password=form.elements.password.value;
    if(password!==form.elements.confirm.value){status.textContent='两次输入的密码不一致';return;}
    if(username==='lrx'){status.textContent='管理员密码请使用“修改密码”功能';return;}
    button.disabled=true;status.textContent=action==='create'?'正在创建账号…':'正在重置密码…';
    try{
      const {data,error}=await client.functions.invoke('shiye-account-admin',{body:{action,username,password}});
      if(error){let message='操作失败';try{message=(await error.context?.json())?.error||message;}catch{}throw Error(message);}
      if(data?.username!==username)throw Error('服务器未确认操作');
      form.elements.password.value='';form.elements.confirm.value='';
      status.textContent=action==='create'?`账号 ${username} 已创建。请将用户名和初始密码安全交给本人。`:`${username} 的密码已重置。`;
    }catch(error){status.textContent=error.message||'操作失败，请稍后重试';}finally{button.disabled=false;}
  };
  form.elements.username.focus();
}
