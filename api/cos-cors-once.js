import COS from 'cos-nodejs-sdk-v5';
import {verifyCloudBaseUser} from '../server/cloudbase-user.mjs';

const origin='https://shiye-pg-test-d1gg723f7fb356ccc-1498303035.tcloudbaseapp.com';
const corsRule={AllowedOrigin:[origin],AllowedMethod:['GET','HEAD','PUT'],
  AllowedHeader:['Content-Type','x-cos-forbid-overwrite','Range'],
  ExposeHeader:['ETag','Content-Length','Content-Range'],MaxAgeSeconds:'600'};
const call=(cos,method,options)=>new Promise((resolve,reject)=>
  cos[method](options,(error,data)=>error?reject(error):resolve(data)));
const toInput=rule=>({
  ...(rule.ID?{ID:rule.ID}:{}),
  AllowedOrigin:rule.AllowedOrigins||rule.AllowedOrigin,
  AllowedMethod:rule.AllowedMethods||rule.AllowedMethod,
  AllowedHeader:rule.AllowedHeaders||rule.AllowedHeader||[],
  ExposeHeader:rule.ExposeHeaders||rule.ExposeHeader||[],
  MaxAgeSeconds:String(rule.MaxAgeSeconds||600)
});

// One-time migration endpoint. Remove from .vercelignore and the repository
// immediately after the bucket rule has been verified.
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  const env=process.env;
  if(env.VERCEL_GIT_COMMIT_REF!=='test'||!env.VITE_SHIYE_CLOUDBASE_ENV_ID||
    !['GET','POST'].includes(req.method))return res.status(404).json({error:'not found'});
  const token=/^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(req.headers.authorization||'')?.[1];
  if(!token)return res.status(401).json({error:'unauthorized'});
  try{
    const user=await verifyCloudBaseUser(token,{envId:env.VITE_SHIYE_CLOUDBASE_ENV_ID});
    if(!user?.isAdmin)return res.status(403).json({error:'forbidden'});
    const cos=new COS({SecretId:env.SHIYE_COS_SECRET_ID,SecretKey:env.SHIYE_COS_SECRET_KEY});
    const target={Bucket:env.SHIYE_COS_BUCKET,Region:env.SHIYE_COS_REGION};
    let original=[];
    try{original=(await call(cos,'getBucketCors',target)).CORSRules||[];}
    catch(error){if(error.code!=='NoSuchCORSConfiguration')throw error;}
    const existing=original.some(rule=>(rule.AllowedOrigins||rule.AllowedOrigin||[]).includes(origin));
    if(req.method==='GET')return res.status(200).json({count:original.length,existing,
      rules:original.map(rule=>({origins:rule.AllowedOrigins||rule.AllowedOrigin,
        methods:rule.AllowedMethods||rule.AllowedMethod}))});
    if(req.headers['x-shiye-cors-migration']!=='2026-10-19')
      return res.status(400).json({error:'migration header required'});
    if(original.length>90)return res.status(409).json({error:'too many rules'});
    if(!existing)await call(cos,'putBucketCors',{...target,
      CORSRules:[...original.map(toInput),corsRule]});
    const updated=(await call(cos,'getBucketCors',target)).CORSRules||[];
    const verified=updated.some(rule=>(rule.AllowedOrigins||rule.AllowedOrigin||[]).includes(origin));
    return res.status(verified?200:503).json({verified,count:updated.length});
  }catch(error){console.error('COS CORS migration failed',error.code||error.name);
    return res.status(503).json({error:'COS CORS migration failed',code:error.code||null});}
}
