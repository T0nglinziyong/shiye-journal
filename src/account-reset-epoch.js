// The server's reset marker is immutable in identity (resetId) and persists
// after the files have been removed. A device checks it before reading any
// cached artwork or starting its outbox. Unknown/offline status is fail-closed.
export const observedResetKey=userId=>'shiye-reset-observed:'+userId;

export function resetMarkerToken(record){
 if(!record||record.id!=='shiye-reset-barrier')return null;
 if(typeof record.resetId==='string'&&record.resetId.length>0)return record.resetId;
 // The original 2026-10-12 reset endpoint stored only a revision.
 return Number.isSafeInteger(record.revision)&&record.revision>=0
   ?'legacy:'+record.revision:null;
}

export async function checkAccountResetEpoch({client,userId,storage,erase,onProgress=()=>{}}){
 if(!userId||!client||!storage||typeof erase!=='function')
   throw Error('账号重置核查缺少参数');
 const {data,error}=await client.from('shiye_records').select('record')
   .eq('user_id',userId).eq('store','meta').eq('id','shiye-reset-barrier')
   .maybeSingle();
 if(error)throw Error('无法核对云端账号清空标记；没有打开旧本地资料');
 const marker=data?.record??null,token=resetMarkerToken(marker);
 if(marker&&!token)throw Error('云端清空标记无效；没有打开旧本地资料');
 const key=observedResetKey(userId);
 let wiped=false;
 if(token&&storage.getItem(key)!==token){
   onProgress('检测到云端账号已清空，正在删除本设备旧资料…');
   await erase();
   // Write only AFTER the deletion succeeded; a blocked IndexedDB deletion
   // must be retried on next login, never marked as completed.
   storage.setItem(key,token);
   wiped=true;
 }
 return {wiped,resetId:token,phase:marker?.phase||'complete',
   pending:marker?.phase==='deleting'};
}

/** Resume an already-authorized deletion after a browser closed mid-cleanup.
 * Only an existing server marker is accepted; this CANNOT start a new reset. */
export async function finishPendingAccountReset({client,resetId,fetchRequest=fetch,
  onProgress=()=>{}}){
 if(typeof resetId!=='string'||!resetId)throw Error('没有可恢复的清空任务');
 const {data,error}=await client.auth.getSession();
 if(error||!data.session?.access_token)throw Error('登录已失效，请重新登录');
 let removed=0;
 for(let page=0;page<1000;page++){
   const response=await fetchRequest('/api/account-reset',{
     method:'POST',cache:'no-store',
     headers:{'Content-Type':'application/json',
       Authorization:'Bearer '+data.session.access_token},
     body:JSON.stringify({mode:'delete',resetId,confirm:'RESET_MY_DATA'}),
     signal:AbortSignal.timeout(35000)
   });
   const payload=await response.json();
   if(!response.ok)throw Error(payload.error||'未能继续清空云端文件');
   removed+=(payload.cosDeleted||0)+(payload.supabaseDeleted||0);
   onProgress('正在继续删除账号原有私有文件 · 已清理 '+removed+' 个');
   if(payload.reset)return {deleted:removed,complete:true};
   if(!payload.more)throw Error('云端清理状态不完整');
 }
 throw Error('待删除文件超过安全上限；下次登录会继续清理');
}
