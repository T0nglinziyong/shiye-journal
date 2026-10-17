import {trustedOrigins} from './trusted-origins.mjs';

// Only the existing v3 idempotent commit RPC may use this route. It forwards
// the user's own JWT and the public key; no service-role credential is used.
export function createSyncCommitRelay({env=process.env,fetcher=fetch}={}){
  return async(req,res)=>{
    const reply=(status,body)=>res.status(status).json(body);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('Vary','Origin');
    if(req.method!=='POST')return reply(405,{message:'Method not allowed'});
    if(req.headers.origin&&!trustedOrigins(env).includes(req.headers.origin))
      return reply(403,{message:'Origin not allowed'});
    const authorization=req.headers.authorization;
    if(typeof authorization!=='string'||!/^Bearer [A-Za-z0-9._~-]+$/.test(authorization))
      return reply(401,{message:'Authentication required'});
    const body=typeof req.body==='string'?(()=>{try{return JSON.parse(req.body);}catch{return null;}})():req.body;
    if(!body||typeof body!=='object'||!Array.isArray(body.operations)||
      body.operations.length<1||body.operations.length>100||
      !Number.isSafeInteger(body.base_revision)||body.base_revision<0||
      typeof body.operation_id!=='string'||!/^[-a-f0-9]{36}$/i.test(body.operation_id)||
      typeof body.expected_epoch!=='string'||!body.expected_epoch||
      body.sync_protocol_version!==3)return reply(400,{message:'Invalid sync commit'});
    const payload=JSON.stringify(body);
    if(Buffer.byteLength(payload)>3_500_000)return reply(413,{message:'Sync commit too large'});
    const url=env.VITE_SHIYE_SUPABASE_URL,key=env.VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY;
    if(!url||!key)return reply(503,{message:'Sync relay unavailable'});
    let target;try{target=new URL('/rest/v1/rpc/shiye_commit_v3_guarded',url);
      if(target.protocol!=='https:')throw Error('invalid target');
    }catch{return reply(503,{message:'Sync relay unavailable'});}
    try{
      const upstream=await fetcher(target,{method:'POST',headers:{
        apikey:key,Authorization:authorization,'Content-Type':'application/json',
        Prefer:'return=representation'
      },body:payload,signal:AbortSignal.timeout(25000)});
      const text=await upstream.text();
      res.status(upstream.status);
      res.setHeader('Content-Type','application/json; charset=utf-8');
      return res.send(text);
    }catch{return reply(502,{message:'Sync relay unavailable'});}
  };
}
