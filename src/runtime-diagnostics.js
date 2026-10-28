// Local-only, bounded and content-free runtime diagnostics. Persist only the
// already-redacted categories so a refresh cannot erase the failure trail.
// No requests, private photos, prompt strings, auth tokens or raw stack traces.
import {CURRENT_DATA_SCHEMA} from './storage-migrations.js';
const MAX=80,records=[];
const STORAGE_KEY='shiye-runtime-issues-v3',TTL=7*864e5,MAX_BYTES=64*1024;
let hydrated=false,build=null,installed=false;
function hydrate(){
  if(hydrated)return;hydrated=true;
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(saved?.version!==3||!Array.isArray(saved.records))return;
    const cutoff=Date.now()-TTL;
    records.push(...saved.records.filter(row=>row&&typeof row.at==='string'&&
      Date.parse(row.at)>=cutoff&&Date.parse(row.at)<=Date.now()+60_000).slice(-MAX)
      .map(row=>({at:new Date(row.at).toISOString(),
        kind:['error','unhandledrejection','handled'].includes(row.kind)?row.kind:'error',
        code:/^(?:AbortError|TypeError|RangeError|SyntaxError|ReferenceError|Error|NotAllowedError|QuotaExceededError)$/.test(row.code)?row.code:'Error',
        route:['series','library','matching','works','editor','import','settings'].includes(row.route)?row.route:'other',
        phase:['import','ai','action','sync-details','save','auth','background','general'].includes(row.phase)?row.phase:'general',
        reason:/^[a-z-]{2,40}$/.test(row.reason)?row.reason:'unknown',
        symbol:/^(?:supportsVision|blob|cv|Module|createImageBitmap|CompressionStream|DecompressionStream)$/.test(row.symbol)?row.symbol:null,
        httpStatus:Number.isInteger(row.httpStatus)&&row.httpStatus>=100&&row.httpStatus<=599?row.httpStatus:null,
        providerCode:/^(?:PGRST\d{3}|[0-9A-Z]{5}|ERR_[A-Z_]{2,24})$/.test(row.providerCode)?row.providerCode:null,
        frame:/^[A-Za-z0-9_.-]+\.js:\d+(?::\d+)?$/.test(row.frame)?row.frame:null})));
  }catch{/* Storage failures never obstruct normal actions. */}
}
function persist(){
  try{
    const cutoff=Date.now()-TTL;
    while(records.length&&(records.length>MAX||Date.parse(records[0].at)<cutoff))records.shift();
    let value=JSON.stringify({version:3,records});
    while(value.length>MAX_BYTES&&records.length){records.shift();value=JSON.stringify({version:3,records});}
    localStorage.setItem(STORAGE_KEY,value);
  }catch{/* Diagnostics must never turn a storage quota error into another failure. */}
}
const phases=new Set(['import','ai','action','sync-details','save','auth','background','general']);
const code=error=>{
  const name=typeof error?.name==='string'?error.name:'Error';
  return /^(?:AbortError|TypeError|RangeError|SyntaxError|ReferenceError|Error|NotAllowedError|QuotaExceededError)$/.test(name)?name:'Error';
};
const status=error=>{const value=Number(error?.status??error?.statusCode);return Number.isInteger(value)&&value>=100&&value<=599?value:null;};
const providerCode=error=>{const value=String(error?.code||'');return /^(?:PGRST\d{3}|[0-9A-Z]{5}|ERR_[A-Z_]{2,24})$/.test(value)?value:null;};
function reason(error){
  const message=String(error?.message||'');
  if(/本机待同步队列|IndexedDB/.test(error?.syncPhase||'')&&
    /^(?:AbortError|QuotaExceededError)$/.test(error?.name||''))return 'local-storage';
  if(/can't find variable|is not defined/i.test(message)||error?.name==='ReferenceError')return 'undefined-variable';
  if(/webassembly|wasm|opencv|expected magic word/i.test(message))return 'image-engine';
  if(/blob|createobjecturl|decode.*image|image.*decode/i.test(message))return 'image-read-or-decode';
  if(status(error)===401||status(error)===403||/unauthori[sz]ed|permission|jwt/i.test(message))return 'authorization';
  if(status(error)===402)return 'balance';
  if(status(error)===429)return 'rate-limit';
  if(status(error)>=500)return 'server';
  if(error?.name==='QuotaExceededError'||/quota|disk full/i.test(message))return 'local-storage';
  if(error?.name==='AbortError'||/abort|timed? ?out/i.test(message))return 'interrupted';
  if(/failed to fetch|network|load failed|offline/i.test(message))return 'network';
  if(error?.name==='SyntaxError')return 'invalid-data-or-browser';
  return 'unknown';
}
function symbol(error){
  if(reason(error)!=='undefined-variable')return null;
  const message=String(error?.message||'');
  const name=/(?:can't find variable:\s*|\b)(supportsVision|blob|cv|Module|createImageBitmap|CompressionStream|DecompressionStream)(?:\b|$)/i.exec(message)?.[1];
  return name||null;
}
function frame(error){
  const match=/(?:^|[/\\])([A-Za-z0-9_.-]+\.js):(\d+)(?::(\d+))?/m.exec(String(error?.stack||''));
  return match?`${match[1]}:${match[2]}${match[3]?':'+match[3]:''}`:null;
}
export function recordRuntimeIssue(kind,error,route,{phase='general'}={}){
  hydrate();
  records.push({at:new Date().toISOString(),kind:['error','unhandledrejection','handled'].includes(kind)?kind:'error',
    code:code(error),route:['series','library','matching','works','editor','import','settings'].includes(route)?route:'other',
    phase:phases.has(phase)?phase:'general',reason:reason(error),symbol:symbol(error),
    httpStatus:status(error),providerCode:providerCode(error),frame:frame(error)});
  if(records.length>MAX)records.shift();
  persist();
}
export function runtimeIssueSnapshot(){hydrate();return {format:'shiye-runtime-report',version:3,
  build,dataSchemaVersion:CURRENT_DATA_SCHEMA,diagnosticSchemaVersion:3,
  reasonGuide:{'undefined-variable':'代码引用了未定义的变量','image-engine':'图像识别组件加载或执行失败',
    'image-read-or-decode':'图片 Blob 读取或解码失败',authorization:'登录或权限验证失败',
    balance:'模型 API 账号余额不可用','rate-limit':'服务请求过于频繁',server:'远端服务返回 5xx',
    'local-storage':'本机存储空间或写入失败',interrupted:'请求中断或超时',
    network:'网络连接失败','invalid-data-or-browser':'数据格式或浏览器脚本语法异常',
    unknown:'仅凭安全摘要无法确定原因，需要结合复现步骤排查'},
  records:records.map(record=>({...record}))};}
export function runtimeIssueReport(){return JSON.stringify(runtimeIssueSnapshot(),null,2);}
export function clearRuntimeIssues(){records.length=0;hydrated=true;try{localStorage.removeItem(STORAGE_KEY);}catch{}}
export function installRuntimeDiagnostics(getRoute){
  if(typeof window==='undefined'||installed)return;installed=true;hydrate();
  void fetch('/version.json',{cache:'no-store'}).then(response=>response.ok?response.json():null)
    .then(info=>{if(info?.app==='shiyejournal')build={commit:/^[a-f0-9]{40}$/.test(info.commit||'')?info.commit:null,
      builtAt:typeof info.buildAt==='string'?info.buildAt:null};}).catch(()=>{});
  window.addEventListener('error',event=>recordRuntimeIssue('error',event.error,getRoute()));
  window.addEventListener('unhandledrejection',event=>recordRuntimeIssue('unhandledrejection',event.reason,getRoute()));
}
