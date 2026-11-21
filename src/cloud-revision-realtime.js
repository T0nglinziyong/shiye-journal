// A realtime message is only a hint that the account revision advanced.
// The existing versioned delta reader remains the source of truth.
export function startCloudRevisionRealtime({realtime,userID,onChange,onReady=()=>{},onError=()=>{}}){
  if(!realtime||typeof realtime.channel!=='function'||typeof realtime.removeChannel!=='function')
    throw TypeError('CloudBase Realtime 客户端不可用');
  if(typeof userID!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(userID))
    throw TypeError('账号编号不适合订阅修订');
  if(typeof onChange!=='function')throw TypeError('缺少修订通知处理器');
  let closed=false;
  const channel=realtime.channel('shiye-account-revision-'+userID,{
    config:{postgres_changes_options:{wait:true,timeout:15000}}
  });
  channel.on('postgres_changes',{
    event:'UPDATE',schema:'public',table:'shiye_revisions',
    filter:'user_id=eq.'+userID,select:['user_id','revision']
  },payload=>{
    if(closed||payload?.new?.user_id!==userID)return;
    const revision=Number(payload.new.revision);
    if(Number.isSafeInteger(revision)&&revision>=0)onChange(revision);
  });
  channel.subscribe((status,error)=>{
    if(closed)return;
    if(status==='SUBSCRIBED')onReady(); // close the snapshot-to-subscribe race
    else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')onError(error||Error(status));
  });
  return ()=>{
    if(closed)return;
    closed=true;
    void Promise.resolve(realtime.removeChannel(channel)).catch(onError);
  };
}
