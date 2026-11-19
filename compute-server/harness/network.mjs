import {Agent,fetch as undiciFetch} from 'undici';
import {lookup as systemLookup} from 'node:dns';
import {isIP} from 'node:net';

// Optional per-service encrypted DNS. TLS still verifies api.deepseek.com;
// neither credentials nor model content are sent to the DNS resolver.
export function createCreativeNetwork({dns='system',resolveFetch=fetch,clock=Date.now}={}){
  if(dns==='system')return {fetcher:fetch,close:async()=>{}};
  if(dns!=='google-doh')throw Error('不支持的创作 DNS 配置');
  let cached=null,inflight=null;
  const addresses=async()=>{
    if(cached&&cached.expires>clock())return cached.addresses;
    if(inflight)return inflight;
    inflight=(async()=>{
      const response=await resolveFetch('https://dns.google/resolve?name=api.deepseek.com&type=A',{signal:AbortSignal.timeout(5000),redirect:'error'});
      if(!response.ok)throw Error('创作 DNS 查询失败');
      const result=await response.json();
      const rows=(result.Answer||[]).filter(x=>x.type===1&&isIP(x.data)===4);
      if(result.Status!==0||!rows.length)throw Error('创作 DNS 未返回地址');
      const addresses=rows.map(x=>({address:x.data,family:4}));
      cached={addresses,expires:clock()+Math.max(1,Math.min(300,...rows.map(x=>Number(x.TTL)||1)))*1000};
      return addresses;
    })();
    try{return await inflight;}finally{inflight=null;}
  };
  const dispatcher=new Agent({connect:{lookup(host,options,callback){
    if(host!=='api.deepseek.com')return systemLookup(host,options,callback);
    addresses().then(values=>options.all?callback(null,values):callback(null,values[0].address,4),callback);
  }}});
  return {fetcher:(url,options)=>undiciFetch(url,{...options,dispatcher}),close:()=>dispatcher.close()};
}
