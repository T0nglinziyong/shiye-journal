import {createClient} from 'npm:@supabase/supabase-js@2.117.2';

const origin='https://shiye-journal-test.vercel.app';
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
const reply=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'private, no-store'}});

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return reply(405,{error:'仅支持 POST'});
  if(request.headers.get('origin')&&request.headers.get('origin')!==origin)return reply(403,{error:'来源不允许'});
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(authorization))return reply(401,{error:'请先登录'});
  const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anon||!service)return reply(503,{error:'账号管理暂不可用'});
  try{
    const actor=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}});
    const {data:identity,error:identityError}=await actor.auth.getUser(authorization.slice(7));
    if(identityError||!identity.user||identity.user.is_anonymous)return reply(401,{error:'登录已失效'});
    const {data:role,error:roleError}=await actor.from('shiye_accounts').select('is_admin').eq('user_id',identity.user.id).single();
    if(roleError||role?.is_admin!==true)return reply(403,{error:'仅管理员可以创建账号'});
    const raw=await request.text();if(raw.length>4096)return reply(413,{error:'请求过大'});
    const input=JSON.parse(raw),username=String(input.username||'').trim().toLowerCase(),password=String(input.password||'');
    if(!/^[a-z][a-z0-9_]{2,31}$/.test(username)||username==='lrx')return reply(400,{error:'用户名需为 3–32 位英文、数字或下划线，且不能使用 lrx'});
    if(password.length<12||password.length>128)return reply(400,{error:'密码需为 12–128 位'});
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    if(input.action==='create'){
      // The reserved .invalid address is never mailed or exposed to other users.
      // auth.users trigger provisions its account/revision in the same transaction.
      const email=username+'@accounts.shiyejournal.invalid';
      const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username}});
      if(error)return reply(error.message.includes('already')?409:502,{error:error.message.includes('already')?'用户名已存在':'创建失败，请稍后重试'});
      if(!data.user)return reply(502,{error:'创建未返回用户资料'});
      return reply(200,{username});
    }
    if(input.action==='reset'){
      const {data:target,error:lookupError}=await admin.from('shiye_accounts').select('user_id').eq('username',username).eq('is_admin',false).maybeSingle();
      if(lookupError||!target)return reply(404,{error:'未找到该普通账号'});
      const {error}=await admin.auth.admin.updateUserById(target.user_id,{password});
      if(error)return reply(502,{error:'重置失败，请稍后重试'});
      return reply(200,{username});
    }
    return reply(400,{error:'不支持的操作'});
  }catch{return reply(400,{error:'请求无效或账号管理暂不可用'});}
});
