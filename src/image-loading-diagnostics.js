// Session-only, content-free image pipeline telemetry for exported diagnostics.
const MAX_EVENTS=60;
const events=[];
const counts={queued:0,started:0,loaded:0,failed:0,'decoded-failed':0};
const phases=new Set(['queued','started','loaded','failed','decoded-failed']);
const tiers=new Set(['cover','display','original']);
const contexts=new Set(['detail','visible','background']);
const sources=new Set(['memory','store']);
const reasons=new Set(['authorization','network','server','rate-limit','interrupted','missing','decode','unknown']);
function reason(error){
  const status=Number(error?.status??error?.statusCode);
  const message=String(error?.message||'');
  if(status===401||status===403||/授权|权限|登录/.test(message))return 'authorization';
  if(status===429)return 'rate-limit';
  if(status>=500&&status<=599)return 'server';
  if(error?.name==='AbortError'||/超时|timeout|abort/i.test(message))return 'interrupted';
  if(/尚未同步|不存在|not found|404/.test(message))return 'missing';
  if(/decode|解码|格式/.test(message))return 'decode';
  if(/network|failed to fetch|load failed|网络/i.test(message))return 'network';
  return 'unknown';
}
const milliseconds=value=>Number.isFinite(value)?Math.min(120000,Math.max(0,Math.round(value))):null;
export function recordImageLoading(event){
  const phase=phases.has(event?.phase)?event.phase:'failed';
  counts[phase]++;
  events.push({at:new Date().toISOString(),phase,
    tier:tiers.has(event?.tier)?event.tier:'cover',
    context:contexts.has(event?.context)?event.context:'background',
    source:sources.has(event?.source)?event.source:null,
    waitMs:milliseconds(event?.waitMs),durationMs:milliseconds(event?.durationMs),
    reason:phase==='failed'||phase==='decoded-failed'?reasons.has(event?.reason)?event.reason:reason(event?.error):null});
  if(events.length>MAX_EVENTS)events.shift();
}
export function imageLoadingSnapshot(){
  return {format:'shiye-image-loading',version:1,scope:'仅本次打开应用；不含图片、素材标识、网址或原始错误',counts:{...counts},
    events:events.map(event=>({...event}))};
}
export function clearImageLoadingDiagnostics(){events.length=0;for(const phase of phases)counts[phase]=0;}
