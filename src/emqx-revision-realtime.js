import {cloudApiRequest} from './cloud-api-origin.js';

// MQTT messages are only wake-up hints. The CloudBase revision and delta log
// are always reread, including after subscribe, reconnect and foregrounding.
export function startEmqxRevisionRealtime({userID,onChange,onReady=()=>{},onError=()=>{},
  request=cloudApiRequest,connect}={}){
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(userID||''))throw TypeError('账号编号无效');
  let closed=false,client=null;
  const expectedTopic='shiye/users/'+encodeURIComponent(userID)+'/sync';
  const seen=new Set();
  const wake=()=>{if(!closed)onChange();};
  const foreground=()=>{if(document.visibilityState==='visible')wake();};
  const online=()=>wake();
  document.addEventListener('visibilitychange',foreground);
  window.addEventListener('focus',wake);
  window.addEventListener('online',online);
  void (async()=>{
    const response=await request('/api/realtime-session',{method:'GET'});
    if(!response.ok)throw Error('实时订阅凭据暂不可用：'+response.status);
    const session=await response.json();
    if(closed)return;
    if(session.topic!==expectedTopic||session.endpoint!=='wss://g9eb1e1c.ala.cn-hangzhou.emqxsl.cn:8084/mqtt'||
      !/^shiye-user-[A-Za-z0-9_-]{1,64}$/.test(session.username||'')||typeof session.password!=='string')
      throw Error('实时订阅配置与当前账号不一致');
    const factory=connect||(await import('mqtt')).connect;
    if(closed)return;
    client=factory(session.endpoint,{username:session.username,password:session.password,
      clientId:'shiye-pwa-'+crypto.randomUUID(),clean:true,reconnectPeriod:3000,
      connectTimeout:10000,resubscribe:false,protocolVersion:4});
    client.on('connect',()=>{
      if(closed)return;
      client.subscribe(expectedTopic,{qos:1},error=>{
        if(closed)return;
        if(error){onError(error);return;}
        onReady();wake(); // closes the snapshot-to-subscribe race
      });
    });
    client.on('message',(topic,bytes)=>{
      if(closed||topic!==expectedTopic)return;
      try{
        const hint=JSON.parse(bytes.toString());
        if(!['sync_changed','job_completed','job_failed'].includes(hint.type)||typeof hint.eventId!=='string')return;
        if(seen.has(hint.eventId))return;
        seen.add(hint.eventId);
        if(seen.size>256)seen.delete(seen.values().next().value);
        if(hint.type==='sync_changed')wake();
        else window.dispatchEvent(new CustomEvent('shiye-compute-job-notice',{detail:{jobId:hint.jobId}}));
      }catch{/* Ignore malformed broker data; periodic reconciliation remains. */}
    });
    client.on('error',error=>{if(!closed)onError(error);});
    client.on('offline',()=>{if(!closed)onError(Error('实时连接已断开'));});
  })().catch(error=>{if(!closed)onError(error);});
  return ()=>{
    closed=true;
    document.removeEventListener('visibilitychange',foreground);
    window.removeEventListener('focus',wake);
    window.removeEventListener('online',online);
    client?.end(true);
  };
}
