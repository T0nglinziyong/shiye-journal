// CloudBase is the only hosted identity and relational database provider.
// A missing cloud configuration is never interpreted as a network fallback.
const envId=import.meta.env?.VITE_SHIYE_CLOUDBASE_ENV_ID;
const publishableKey=import.meta.env?.VITE_SHIYE_CLOUDBASE_PUBLISHABLE_KEY;
export const cloudRealtimeEnabled=import.meta.env?.VITE_SHIYE_REALTIME_ENABLED==='true';
export const cloudEnabled=!!envId;
export const cloudbaseEnabled=cloudEnabled;
let client,app,preparing;

export async function prepareCloudClient(){
  if(!cloudEnabled||client)return;
  if(!publishableKey)throw Error('CloudBase 浏览器公钥未配置；未切换到本机存储');
  preparing??=(async()=>{
    const [{default:cloudbase},{registerAuth},{registerMySQL},{registerFunctions},{registerStorage}]=await Promise.all([
      import('@cloudbase/js-sdk/app'),import('@cloudbase/js-sdk/auth'),
      import('@cloudbase/js-sdk/mysql'),import('@cloudbase/js-sdk/functions'),
      import('@cloudbase/js-sdk/storage')]);
    registerAuth(cloudbase);registerMySQL(cloudbase);registerFunctions(cloudbase);
    if(cloudRealtimeEnabled){const {registerRealtimeJs}=await import('@cloudbase/js-sdk/realtime-js');registerRealtimeJs(cloudbase);}
    registerStorage(cloudbase);
    const instance=cloudbase.init({env:envId,accessKey:publishableKey,region:'ap-shanghai',
      timeout:30000,auth:{detectSessionInUrl:true}});
    const db=instance.rdb(),auth=typeof instance.auth==='function'?instance.auth():instance.auth;
    // Do not override GATEWAY with the website origin. Localhost, the testing
    // site and the custom domain all connect directly to the same environment.
    app=instance;
    client={auth,from:table=>db.from(table),rpc:(name,args)=>db.rpc(name,args)};
  })();
  try{await preparing;}finally{preparing=null;}
}
export function cloudClient(){
  if(!client)throw Error('CloudBase 尚未初始化；请检查配置并重试登录');
  return client;
}
export function cloudRealtime(){
  if(!app)throw Error('CloudBase 尚未初始化，无法订阅账号修订');
  return app.realtime();
}
export function cloudStorage(){
  if(!app)throw Error('CloudBase 尚未初始化，无法读取云存储');
  return app.storage;
}
export async function invokeCloudFunction(options){
  await prepareCloudClient();
  if(!app)throw Error('CloudBase 未配置，无法调用云函数');
  return app.callFunction(options);
}
async function authStep(promise,message){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Object.assign(Error(message),{status:503})),15000);
  })]);}finally{clearTimeout(timer);}
}
export async function requireCloudUser({withAccount=false}={}){
  const {data,error}=await authStep(cloudClient().auth.getUser(),
    '登录验证服务响应超时，请重试连接；已保留登录会话');
  if(error||!data?.user){
    const signedOut=!error||error.status===401||error.name==='AuthSessionMissingError';
    const failure=Error(signedOut?'请先登录拾页':'登录验证服务暂时不可用，请重试连接');
    failure.status=signedOut?401:error.status||503;failure.code=error?.code;failure.cause=error;throw failure;
  }
  const allowed=await authStep(cloudClient().from('shiye_accounts')
    .select(withAccount?'user_id,username,is_admin':'user_id').eq('user_id',data.user.id).maybeSingle(),
    '云端账号核验响应超时，请重试连接；已保留登录会话');
  if(allowed.error){
    const failure=Error('云端账号核验暂时不可用，请重试连接；已保留登录会话');
    failure.status=allowed.status;failure.code=allowed.error.code;failure.cause=allowed.error;throw failure;
  }
  if(!allowed.data)throw Object.assign(Error('此账号未获测试权限'),{status:403});
  return withAccount?{user:data.user,account:allowed.data}:data.user;
}
