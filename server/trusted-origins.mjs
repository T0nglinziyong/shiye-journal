const BASE=['https://shiye-journal-test.vercel.app','https://shiyejournal.vip',
  'https://shiye-pg-test-d1gg723f7fb356ccc-1498303035.tcloudbaseapp.com'];
export function trustedOrigins(env={}){
  const origins=new Set(BASE);
  for(const token of String(env.SHIYE_APP_ORIGINS||'').split(',')){
    const value=token.trim();if(!value)continue;
    let url;try{url=new URL(value);}catch{throw Error('可信来源配置不合法');}
    if(url.protocol!=='https:'||url.origin!==value||url.hostname.includes('*'))throw Error('可信来源必须是无路径的 HTTPS origin');
    origins.add(value);
  }
  const deployed=String(env.VERCEL_URL||'').trim();
  if(/^[a-z0-9-]+\.vercel\.app$/.test(deployed))origins.add('https://'+deployed);
  return [...origins];
}
