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
    body=typeof req.body==='string'?req.body:req.body==null?undefined:JSON.stringify(req.body);
    if(body&&Buffer.byteLength(body)>4_000_000)return res.status(413).json({error:'Payload too large'});
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
