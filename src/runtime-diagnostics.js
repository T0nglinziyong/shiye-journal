// Local-only, nonpersistent and content-free runtime diagnostics.
// No requests, private photos, prompt strings, auth tokens or stack traces.
const MAX=80,records=[];
const code=error=>{
  const name=typeof error?.name==='string'?error.name:'Error';
  return /^(?:AbortError|TypeError|RangeError|SyntaxError|Error|NotAllowedError|QuotaExceededError)$/.test(name)?name:'Error';
};
export function recordRuntimeIssue(kind,error,route){
  records.push({at:new Date().toISOString(),kind:kind==='unhandledrejection'?'unhandledrejection':'error',
    code:code(error),route:['series','library','matching','works','editor','import','settings'].includes(route)?route:'other'});
  if(records.length>MAX)records.shift();
}
export function runtimeIssueReport(){return JSON.stringify({format:'shiye-runtime-report',version:1,records:[...records]},null,2);}
export function installRuntimeDiagnostics(getRoute){
  if(typeof window==='undefined')return;
  window.addEventListener('error',event=>recordRuntimeIssue('error',event.error,getRoute()));
  window.addEventListener('unhandledrejection',event=>recordRuntimeIssue('unhandledrejection',event.reason,getRoute()));
}
