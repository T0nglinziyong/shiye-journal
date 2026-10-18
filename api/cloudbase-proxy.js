// Same-origin bridge for existing test PWAs. The upstream is fixed to the
// configured CloudBase environment, so this endpoint cannot proxy arbitrary URLs.
export const config={maxDuration:30};

const METHODS=new Set(['GET','POST','PUT','PATCH','DELETE']);
const FORWARD_HEADERS=new Set([
  'accept','authorization','content-type','x-cloudbase-accesskey',
  'x-cloudbase-session','x-client-info','x-request-id',
]);

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  const envId=process.env.VITE_SHIYE_CLOUDBASE_ENV_ID;
  const path=Array.isArray(req.query.path)?req.query.path.join('/'):
    String(req.query.path||'');
  if(!envId||!METHODS.has(req.method)||!/^[-a-z0-9]+$/.test(envId)||
    !/^(?:auth\/v1\/|v1\/rdb\/)/.test(path)||path.includes('..'))
    return res.status(404).json({error:'Not found'});
  const url=new URL(req.url,'https://localhost');
  const query=new URLSearchParams(url.search);
  query.delete('path');
  const target=`https://${envId}.api.tcloudbasegateway.com/${path}${query.size?'?'+query:''}`;
  const headers={};
  for(const [name,value] of Object.entries(req.headers))
    if(FORWARD_HEADERS.has(name)&&typeof value==='string')headers[name]=value;
  let body;
  if(!['GET','HEAD'].includes(req.method)){
    // Vercel's lazy req.body parser rejects the SDK's RPC media type before
    // the handler can forward it. Stream the original bytes unchanged.
    const parts=[];let size=0;
    try{for await(const chunk of req){size+=chunk.length;
      if(size>4_000_000)return res.status(413).json({error:'Payload too large'});
      parts.push(chunk);
    }}catch{return res.status(400).json({error:'Invalid request body'});}
    body=Buffer.concat(parts);
  }
  try{
    const upstream=await fetch(target,{method:req.method,headers,body,
      redirect:'manual',signal:AbortSignal.timeout(22000)});
    const contentType=upstream.headers.get('content-type');
    if(contentType)res.setHeader('Content-Type',contentType);
    const payload=Buffer.from(await upstream.arrayBuffer());
    if(payload.length>5_000_000)return res.status(502).json({error:'Upstream response too large'});
    return res.status(upstream.status).send(payload);
  }catch{
    return res.status(503).json({error:'CloudBase temporarily unavailable'});
  }
}
