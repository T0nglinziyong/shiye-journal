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
      const allowed=await client.from('shiye_accounts').select('user_id,is_admin').eq('user_id',data.user.id).maybeSingle();if(allowed.error)throw Error('authorization unavailable');return allowed.data?{userID:data.user.id,isAdmin:allowed.data.is_admin===true}:null;
    },
    sign:async({path,method,headers,variant})=>{
      const cos=new COS({SecretId:env.SHIYE_COS_SECRET_ID,SecretKey:env.SHIYE_COS_SECRET_KEY});
      return new Promise((resolve,reject)=>cos.getObjectUrl({Bucket:env.SHIYE_COS_BUCKET,Region:env.SHIYE_COS_REGION,Key:path,Method:method,Protocol:'https:',Sign:true,Expires:60,Headers:headers,...(variant==='preview360'?{QueryString:'imageMogr2/thumbnail/360x360/format/webp'}:{})},(error,data)=>error?reject(error):resolve(data.Url)));
    },
  });
  const result=await run({method:req.method,origin:req.headers.origin,authorization:req.headers.authorization,body:req.body});
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Origin');
  res.status(result.status).json(result.body);
}
