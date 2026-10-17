// Rolling, local-only sync trace. Keep operational metadata; never record account/object IDs,
// names, payloads, URLs, raw server messages, tokens or complete stack traces.
const ACTIONS=new Set(['start','reconcile','retry','committed','remote-won','merged','conflict','failed','direct-commit','prepare-start','prepare-finished','lock-wait','lock-entered','lock-ended','main-thread-lag','split','cos-ticket','cos-ticket-failed','cos-put','cos-put-failed','cos-put-verified']);
const KINDS=new Set(['project','batch','direct','queue','lock','image']);
const CATEGORIES=new Set(['unconfirmed-response','revision-conflict','authorization','rate-limit','server','database-timeout','local-storage','image-upload','browser-lock','interrupted','network','unknown']);
const PHASES=new Set([
  '读取本机待同步队列','写入本机待同步队列','从 IndexedDB 刷新同步队列',
  '上传当前待同步记录','获取同步锁或执行同步任务','浏览器同步锁参数格式错误',
  '编码云端记录','云端提交事务','编码与上传 assets','编码与上传 blobs',
  '编码与上传 projects','编码与上传 series','编码与上传 trash','编码与上传 meta'
]);
const PREFIX='shiye-sync-trace-v2:';
const RETENTION_MS=24*60*60*1000;
const SWEEP_MS=60*60*1000;
const localTraceStorage=()=>{try{return globalThis.localStorage;}catch{return null;}};
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const errorName=value=>['Error','TypeError','SyntaxError','AbortError','QuotaExceededError','NetworkError','NotAllowedError',
  'TimeoutError','NotReadableError','InvalidStateError','DataError','EncodingError','OperationError','SecurityError'].includes(value)?value:'OtherError';
const hash=value=>{let n=2166136261;for(const char of String(value||'')){n^=char.charCodeAt(0);n=Math.imul(n,16777619);}return (n>>>0).toString(16).padStart(8,'0');};
const dayOf=value=>{const date=new Date(value);if(!Number.isFinite(date.getTime()))return 'unknown';return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');};
function errorCode(error){
  const code=String(error?.code||'');
  return /^(?:PGRST\d{3}|[0-9A-Z]{5}|ERR_[A-Z_]{2,24})$/.test(code)?code:null;
}
function errorStatus(error){
  const status=Number(error?.status??error?.statusCode);
  return Number.isInteger(status)&&status>=100&&status<=599?status:null;
}
function category(error){
  const message=String(error?.message||'');
  const status=errorStatus(error);
  if(/云端版本未变化|unconfirmed/i.test(message))return 'unconfirmed-response';
  if(/云端版本已变化|另一设备已更新|\bconflict\b/i.test(message)||status===409||['PT409','40001'].includes(errorCode(error)))return 'revision-conflict';
  if(status===401||status===403||/unauthori[sz]ed|permission|jwt|认证|登录/i.test(message))return 'authorization';
  if(status===429||/rate.limit|too many requests/i.test(message))return 'rate-limit';
  if(errorCode(error)==='57014')return 'database-timeout';
  if(status!==null&&status>=500)return 'server';
  if(error?.syncPhase==='编码与上传 blobs'||error?.name==='NotReadableError')return 'image-upload';
  if(error?.name==='QuotaExceededError'||/quota|disk full|存储空间/i.test(message))return 'local-storage';
  if(/blob|图片上传|object storage|COS/i.test(message))return 'image-upload';
  if(/web.?lock|string did not match|expected pattern/i.test(message))return 'browser-lock';
  if(error?.name==='AbortError'||/abort|timed? ?out/i.test(message))return 'interrupted';
  if(/failed to fetch|network|load failed|offline/i.test(message))return 'network';
  return 'unknown';
}
function failure(error){
  if(!error)return null;
  const cause=error.cause;
  return {category:category(error),name:errorName(error.name),status:errorStatus(error),code:errorCode(error),
    phase:PHASES.has(error.syncPhase)?error.syncPhase:null,
    causeCategory:cause?category(cause):null,causeStatus:cause?errorStatus(cause):null,
    causeCode:cause?errorCode(cause):null,
    rpcDurationMs:count(error.rpcDurationMs??cause?.rpcDurationMs)};
}
function safeFrame(error){
  const matches=String(error?.stack||'').match(/(?:^|[/\\])([A-Za-z0-9_.-]+\.js):(\d+)(?::\d+)?/m);
  return matches?matches[1]+':'+matches[2]:null;
}
function safeTransfer(value){
  if(!value||typeof value!=='object')return null;
  return {bytes:count(value.bytes),loaded:count(value.loaded),
    phase:['connecting','uploading','response'].includes(value.phase)?value.phase:null,
    status:errorStatus(value),requestId:/^[a-zA-Z0-9_-]{1,160}$/.test(value.requestId||'')?value.requestId:null};
}
function savedEvent(event){
  if(!event||typeof event!=='object')return null;
  const at=typeof event.at==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:/.test(event.at)?event.at:null;
  if(!at)return null;
  const detail=event.failure;
  return {at,action:ACTIONS.has(event.action)?event.action:'failed',kind:KINDS.has(event.kind)?event.kind:'queue',
    baseRevision:count(event.baseRevision),cloudRevision:count(event.cloudRevision),pending:count(event.pending),
    failure:detail&&CATEGORIES.has(detail.category)?{
      category:detail.category,name:errorName(detail.name),status:errorStatus(detail),code:errorCode(detail),
      phase:PHASES.has(detail.phase)?detail.phase:null,causeCategory:CATEGORIES.has(detail.causeCategory)?detail.causeCategory:null,
      causeStatus:errorStatus({status:detail.causeStatus}),causeCode:errorCode({code:detail.causeCode}),
      rpcDurationMs:count(detail.rpcDurationMs)
    }:null,
    transfer:safeTransfer(event.transfer),durationMs:count(event.durationMs),online:typeof event.online==='boolean'?event.online:null,
    visibility:['visible','hidden','prerender'].includes(event.visibility)?event.visibility:null,
    fingerprint:/^[0-9a-f]{8}$/.test(event.fingerprint||'')?event.fingerprint:null,
    frame:/^[A-Za-z0-9_.-]+\.js:\d+$/.test(event.frame||'')?event.frame:null};
}
export function createSyncDiagnostics({limit=500,clock=()=>new Date().toISOString(),storage=localTraceStorage(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
  const events=[];
  const session=(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)).replace(/[^a-z0-9-]/gi,'');
  let currentDay=dayOf(clock()),timer=null,sweepTimer=null,lastSweepAt=0,dirty=false;
  const key=()=>PREFIX+currentDay+':'+session;
  const cutoff=()=>Date.parse(clock())-RETENTION_MS;
  const recent=(event,minimum)=>Number.isFinite(Date.parse(event?.at))&&Date.parse(event.at)>=minimum;
  const sweep=()=>{
    if(!storage)return;
    const minimum=cutoff();if(!Number.isFinite(minimum))return;
    lastSweepAt=Date.parse(clock());
    try{for(let i=storage.length-1;i>=0;i--){
      const item=storage.key(i);if(!item?.startsWith(PREFIX)||item===key())continue;
      const rows=JSON.parse(storage.getItem(item)||'[]');
      if(!Array.isArray(rows)){storage.removeItem(item);continue;}
      const kept=rows.filter(event=>recent(event,minimum)).slice(-limit);
      if(!kept.length)storage.removeItem(item);
      else if(kept.length!==rows.length)storage.setItem(item,JSON.stringify(kept));
    }}catch{/* Old diagnostics must never interrupt sync. */}
  };
  const scheduleSweep=()=>{
    if(!storage||sweepTimer!==null)return;
    lastSweepAt=Date.parse(clock());
    // Expiration is housekeeping, never part of the critical upload path.
    sweepTimer=setTimer(()=>{sweepTimer=null;sweep();},15000);
    sweepTimer?.unref?.();
  };
  const flush=()=>{
    if(timer!==null){clearTimer(timer);timer=null;}
    if(!dirty)return;
    const minimum=cutoff();
    if(Number.isFinite(minimum))while(events.length&&!recent(events[0],minimum))events.shift();
    try{storage?.setItem(key(),JSON.stringify(events));dirty=false;}
    catch{/* Diagnostics never block sync. */}
  };
  const schedule=()=>{if(!storage||timer!==null)return;timer=setTimer(flush,3000);timer?.unref?.();};
  return {
    record({action,kind,baseRevision,cloudRevision,pending,error,durationMs,transfer}={}){
      const at=clock(),day=dayOf(at);
      if(day!==currentDay){flush();currentDay=day;events.length=0;scheduleSweep();}
      else if(Date.parse(at)-lastSweepAt>=SWEEP_MS)scheduleSweep();
      const event=savedEvent({at,action,kind,baseRevision,cloudRevision,pending,
        failure:failure(error),durationMs,transfer,online:globalThis.navigator?.onLine,
        visibility:globalThis.document?.visibilityState,
        fingerprint:error?hash(error.name+'|'+error.message):null,frame:safeFrame(error)});
      events.push(event);if(events.length>limit)events.shift();dirty=true;schedule();
    },
    report({pending=0,conflicts=0,retrying=0,nextAttemptAt=null,uploading=false,revision=null,writesInFlight=0,quarantined=0,online=null,active=null}={}){
      flush();sweep();
      const day=currentDay,all=[];let sessions=0,currentStored=false;
      try{if(storage)for(let i=0;i<storage.length;i++){
        const item=storage.key(i);if(!item?.startsWith(PREFIX))continue;
        sessions++;if(item===key())currentStored=true;
        for(const entry of JSON.parse(storage.getItem(item)||'[]')){
          const safe=savedEvent(entry);if(safe&&recent(safe,cutoff()))all.push(safe);
        }
      }}catch{/* Keep the current session when storage is unavailable. */}
      if(!currentStored)all.push(...events);
      all.sort((a,b)=>a.at.localeCompare(b.at));
      const exported=all.slice(-5000),lastFailure=[...exported].reverse().find(event=>event.failure)||null;
      return {format:'shiye-sync-diagnostics',version:2,syncProtocolVersion:3,createdAt:clock(),day,scope:'本机最近 24 小时的安全运行元数据；不含作品、图片、账号标识、密钥或原始报错',
        categoryGuide:{'unconfirmed-response':'云端版本未变化，但上传响应未获确认；数据留在本机待重试',
          'revision-conflict':'同一资料存在冲突；该项保留，其他项可继续',
          authorization:'登录或权限验证失败','rate-limit':'请求频率受限',server:'云端服务返回 5xx',
          'database-timeout':'数据库语句超过服务器执行时限',
          'local-storage':'本机持久队列读写失败','image-upload':'图片读取或对象上传失败',
          'browser-lock':'浏览器同步锁异常',interrupted:'请求中断或超时',network:'网络连接失败',
          unknown:'需要结合阶段、时间与错误指纹进一步排查'},
        state:{pending:count(pending),conflicts:count(conflicts),retrying:count(retrying),
          nextAttemptAt:Number.isFinite(nextAttemptAt)&&nextAttemptAt>0?
            new Date(nextAttemptAt).toISOString():null,uploading:!!uploading,
          cloudRevision:count(revision),writesInFlight:count(writesInFlight),quarantined:count(quarantined),
          online:typeof online==='boolean'?online:null},
        active:active&&['准备上传','编码与上传','提交事务'].includes(active.phase)?{phase:active.phase,
          completed:count(active.done),total:count(active.total),elapsedMs:count(active.elapsedMs)}:null,
        sessionCount:sessions+(currentStored?0:1),eventCount:all.length,lastFailure,events:exported};
    },
    clear(){
      if(timer!==null){clearTimer(timer);timer=null;}
      if(sweepTimer!==null){clearTimer(sweepTimer);sweepTimer=null;}
      try{if(storage)for(let i=storage.length-1;i>=0;i--){
        const item=storage.key(i);if(item?.startsWith(PREFIX))storage.removeItem(item);
      }}catch{}
      events.length=0;
      dirty=false;
    }
  };
}
