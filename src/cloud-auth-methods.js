const oauthNames={wechat:'微信',github:'GitHub',google:'Google',apple:'Apple',qq:'QQ'};

export function passwordIdentifier(value){
  const identifier=String(value||'').trim();
  if(!identifier)throw Error('请输入用户名、邮箱或手机号');
  if(identifier.includes('@'))return {email:identifier};
  if(/^\+?\d{7,15}$/.test(identifier))return {phone:identifier.startsWith('+')?identifier:`+86${identifier}`};
  return {username:identifier};
}

export function otpIdentifier(kind,value){
  const identifier=String(value||'').trim();
  if(kind==='email'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier))return {email:identifier};
  if(kind==='phone'&&/^(?:\+86)?1\d{10}$/.test(identifier))
    return {phone:identifier.startsWith('+')?identifier:`+86${identifier}`};
  throw Error(kind==='phone'?'请输入有效的中国大陆手机号':'请输入有效的邮箱');
}

export function configuredOAuthProviders(value){
  return [...new Set(String(value||'').split(',').map(item=>item.trim().toLowerCase()))]
    .filter(id=>/^[a-z][a-z0-9_-]{1,49}$/.test(id)).map(id=>({id,label:oauthNames[id]||id}));
}

export async function requestLoginOtp(auth,kind,value){
  const {data,error}=await auth.signInWithOtp({...otpIdentifier(kind,value),
    options:{shouldCreateUser:false}});
  if(error)throw Error(error.message||'验证码发送失败，请稍后重试');
  if(typeof data?.verifyOtp!=='function')throw Error('登录服务未返回验证码校验方法');
  return data.verifyOtp;
}

export async function verifyLoginOtp(verifyOtp,code){
  if(typeof verifyOtp!=='function')throw Error('请先发送验证码');
  const token=String(code||'').trim();
  if(!/^\d{4,8}$/.test(token))throw Error('请输入收到的验证码');
  const {error}=await verifyOtp({token});
  if(error)throw Error(error.message||'验证码错误或已过期');
}

export async function requestIdentityBinding(auth,kind,value){
  const identifier=otpIdentifier(kind,value);
  const {data,error}=await auth.updateUser(identifier);
  if(error)throw Error(error.message||'发送绑定验证码失败');
  if(typeof data?.verifyOtp==='function')return {identifier,verifyOtp:data.verifyOtp};
  if(data?.user)return {identifier,complete:true};
  throw Error('登录服务未返回绑定验证码，请稍后重试');
}

export async function confirmIdentityBinding(challenge,code){
  if(typeof challenge?.verifyOtp!=='function')throw Error('请先发送绑定验证码');
  const token=String(code||'').trim();
  if(!/^\d{4,8}$/.test(token))throw Error('请输入收到的验证码');
  const {error}=await challenge.verifyOtp({...challenge.identifier,token});
  if(error)throw Error(error.message||'验证码错误或已过期');
}
