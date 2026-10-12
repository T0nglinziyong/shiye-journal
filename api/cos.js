import COS from 'cos-nodejs-sdk-v5';
import {createClient} from '@supabase/supabase-js';
import {createTicketHandler} from '../server/cos-tickets.mjs';
import {trustedOrigins} from '../server/trusted-origins.mjs';
export const config={maxDuration:30};
export default async function handler(req,res){
  const env=process.env;
  const ready=!!(env.SHIYE_COS_SECRET_ID&&env.SHIYE_COS_SECRET_KEY&&env.SHIYE_COS_BUCKET&&env.SHIYE_COS_REGION);
  const run=createTicketHandler({ready,origins:trustedOrigins(env),
    authenticate:async token=>{
      const client=createClient(env.VITE_SHIYE_SUPABASE_URL,env.VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token},fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
      const {data,error}=await client.auth.getUser(token);if(error||!data.user||data.user.is_anonymous)return null;
      const allowed=await client.from('shiye_accounts').select('user_id,is_admin').eq('user_id',data.user.id).maybeSingle();
      if(allowed.error)throw Error('authorization unavailable');
      if(!allowed.data)return null;
      // Read the authoritative generation, not a client-supplied prefix.
      // After a full reset, old versions of the PWA can no longer PUT to the
      // previous COS generation (even during asynchronous cleanup).
      const {data:marker,error:resetError}=await client.from('shiye_records')
        .select('record').eq('user_id',data.user.id).eq('store','meta')
        .eq('id','shiye-reset-barrier').maybeSingle();
      if(resetError)throw Error('reset epoch unavailable');
      return {userID:data.user.id,isAdmin:allowed.data.is_admin===true,
        resetId:marker?.record?.resetId||null};
    },
    sign:async({path,method,headers,variant})=>{
      const cos=new COS({SecretId:env.SHIYE_COS_SECRET_ID,SecretKey:env.SHIYE_COS_SECRET_KEY});
      const edge=Number(/^preview([1-9]\d{0,3})$/.exec(variant||'')?.[1]);
      if(variant&&![256,360,480,600,720,960,1200,1440,1920,2560,3200,3840,5120].includes(edge))throw Error('图片显示尺寸无效');
      return new Promise((resolve,reject)=>cos.getObjectUrl({Bucket:env.SHIYE_COS_BUCKET,Region:env.SHIYE_COS_REGION,Key:path,Method:method,Protocol:'https:',Sign:true,Expires:60,Headers:headers,...(edge?{QueryString:`imageMogr2/thumbnail/${edge}x${edge}/format/webp/quality/90`}:{})},(error,data)=>error?reject(error):resolve(data.Url)));
    },
  });
  const result=await run({method:req.method,origin:req.headers.origin,authorization:req.headers.authorization,body:req.body});
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Origin');
  res.status(result.status).json(result.body);
}
