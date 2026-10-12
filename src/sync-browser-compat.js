// Safari sometimes throws a generic DOMException SyntaxError for lock names
// containing URL punctuation. Never run an unlocked fallback merely because
// lock acquisition failed; all writers must retain the server CAS boundary.
const portableName=value=>{
  // FNV-1a / 32-bit stable label; retain the last UUID (if present) to avoid
  // hashing different user accounts into a shared queue lock.
  let hash=2166136261;
  for(const ch of String(value)){
    hash^=ch.charCodeAt(0);
    hash=Math.imul(hash,16777619);
  }
  const uid=/[a-f0-9]{8}-[a-f0-9-]{27,}/i.exec(String(value))?.[0]||'account';
  return 'shiye-sync-'+(hash>>>0).toString(16)+'-'+uid.replace(/[^a-z0-9-]/gi,'').slice(0,64);
};
export function isWebKitPatternError(error){
 return error?.name==='SyntaxError'&&
   /string did not match|expected pattern/i.test(error?.message||'');
}
export async function runAccountBrowserLock(account,callback,{
 locks=globalThis.navigator?.locks,
 abortAfterMs=45000
}={}){
 if(!locks?.request)return callback(); // Original API fallback: server CAS.
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),abortAfterMs);
 let entered=false;
 try{
   const request=async name=>locks.request(name,{
     mode:'exclusive',signal:controller.signal
   },async()=>{entered=true;return callback();});
   try{return await request('shiye-sync:'+account);}
   catch(error){
     if(entered||!isWebKitPatternError(error))throw error;
     // A different Web Locks label is still an exclusive browser-side lock,
     // not a blind unlocked commit. Existing older clients are protected by
     // optimistic server revisions and transactional IndexedDB merging.
     try{return await request(portableName(account));}
     catch(fallbackError){
       if(isWebKitPatternError(fallbackError)){
         fallbackError.syncPhase='浏览器同步锁参数格式错误';
       }
       throw fallbackError;
     }
   }
 }finally{clearTimeout(timer);}
}
export function markSyncPhase(error,phase){
 if(error&&typeof error==='object'&&!error.syncPhase)
   error.syncPhase=phase;
 return error;
}
export function describeSyncError(error){
 if(isWebKitPatternError(error))
   return 'iPhone/iPad Safari 返回参数格式错误'+(error.syncPhase?'（'+error.syncPhase+'）':'')+'；待同步数据仍保留。';
 const msg=String(error?.message||'同步暂不可用');
 return error?.syncPhase?'['+error.syncPhase+'] '+msg:msg;
}
