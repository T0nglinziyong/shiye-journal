// A bounded, in-memory account-session trace. Never record record IDs, names,
// payloads, URLs, raw server messages, tokens or complete stack traces.
const ACTIONS=new Set(['start','reconcile','retry','committed','remote-won','merged','conflict','failed','direct-commit']);
const KINDS=new Set(['project','batch','direct','queue']);
const PHASES=new Set([
  '读取本机待同步队列','写入本机待同步队列','从 IndexedDB 刷新同步队列',
  '上传当前待同步记录','获取同步锁或执行同步任务','浏览器同步锁参数格式错误',
  '编码云端记录','云端提交事务','编码与上传 assets','编码与上传 blobs',
  '编码与上传 projects','编码与上传 series','编码与上传 trash','编码与上传 meta'
]);
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const errorName=value=>['Error','TypeError','SyntaxError','AbortError','QuotaExceededError','NetworkError','NotAllowedError'].includes(value)?value:'OtherError';
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
  if(/云端版本已变化|另一设备已更新|\bconflict\b/i.test(message)||status===409)return 'revision-conflict';
  if(status===401||status===403||/unauthori[sz]ed|permission|jwt|认证|登录/i.test(message))return 'authorization';
  if(status===429||/rate.limit|too many requests/i.test(message))return 'rate-limit';
  if(status!==null&&status>=500)return 'server';
  if(error?.name==='QuotaExceededError'||/quota|disk full|存储空间/i.test(message))return 'local-storage';
  if(/blob|图片上传|object storage|COS/i.test(message))return 'image-upload';
  if(/web.?lock|string did not match|expected pattern/i.test(message))return 'browser-lock';
  if(error?.name==='AbortError'||/abort|timed? ?out/i.test(message))return 'interrupted';
  if(/failed to fetch|network|load failed|offline/i.test(message))return 'network';
  return 'unknown';
}
function failure(error){
  if(!error)return null;
  return {category:category(error),name:errorName(error.name),status:errorStatus(error),code:errorCode(error),
    phase:PHASES.has(error.syncPhase)?error.syncPhase:null,
    causeCategory:error.cause?category(error.cause):null};
}
export function createSyncDiagnostics({limit=60,clock=()=>new Date().toISOString()}={}){
  const events=[];
  let lastFailure=null;
  return {
    record({action,kind,baseRevision,cloudRevision,pending,error}={}){
      const event={at:clock(),action:ACTIONS.has(action)?action:'failed',kind:KINDS.has(kind)?kind:'queue',
        baseRevision:count(baseRevision),cloudRevision:count(cloudRevision),pending:count(pending),
        failure:failure(error)};
      if(event.failure)lastFailure={...event};
      events.push(event);if(events.length>limit)events.shift();
    },
    report({pending=0,conflicts=0,uploading=false,revision=null,writesInFlight=0,quarantined=0,online=null,active=null}={}){
      return {format:'shiye-sync-diagnostics',version:1,createdAt:clock(),scope:'当前登录会话；仅安全元数据，不含原始错误或私人资料',
        categoryGuide:{'unconfirmed-response':'云端版本未变化，但上传响应未获确认；数据留在本机待重试',
          'revision-conflict':'云端版本或同一资料发生冲突；该项保留，其他项可继续',
          authorization:'登录或权限验证失败','rate-limit':'请求频率受限',server:'云端服务返回 5xx',
          'local-storage':'本机持久队列读写失败','image-upload':'图片读取或对象上传失败',
          'browser-lock':'浏览器同步锁异常',interrupted:'请求中断或超时',network:'网络连接失败',
          unknown:'仅凭安全摘要无法确定原因，需要结合发生阶段和复现步骤排查'},
        state:{pending:count(pending),conflicts:count(conflicts),uploading:!!uploading,
          cloudRevision:count(revision),writesInFlight:count(writesInFlight),quarantined:count(quarantined),
          online:typeof online==='boolean'?online:null},
        active:active&&['准备上传','编码与上传','提交事务'].includes(active.phase)?{phase:active.phase,
          completed:count(active.done),total:count(active.total),elapsedMs:count(active.elapsedMs)}:null,
        lastFailure:lastFailure?{...lastFailure}:null,
        events:events.map(event=>({...event}))};
    },
    clear(){events.length=0;lastFailure=null;}
  };
}
