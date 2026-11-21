// User-controlled offline rescue of durable edits that have NOT reached cloud.
// This is distinct from a complete synced-data backup. No network is required.
const FORMAT='shiye-pending-recovery',VERSION=1,MAX_FILE=128*1024*1024;
const bytesToBase64=bytes=>{
  let out='';for(let offset=0;offset<bytes.length;offset+=0x8000)
    out+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
  return btoa(out);
};
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
async function encode(value){
  if(value instanceof Blob){
    const bytes=new Uint8Array(await value.arrayBuffer());
    return {__shiyePendingBlob:true,type:value.type,size:bytes.length,sha256:await digest(bytes),base64:bytesToBase64(bytes)};
  }
  if(Array.isArray(value))return Promise.all(value.map(encode));
  if(value&&typeof value==='object'){
    const entries=await Promise.all(Object.entries(value).map(async([k,v])=>[k,await encode(v)]));
    return Object.fromEntries(entries);
  }
  return value;
}
async function decode(value){
  if(Array.isArray(value))return Promise.all(value.map(decode));
  if(value&&typeof value==='object'){
    if(value.__shiyePendingBlob===true){
      if(!/^[A-Za-z0-9+/]*={0,2}$/.test(value.base64||'')||value.base64.length>MAX_FILE*2)throw Error('恢复包图片编码无效');
      const raw=atob(value.base64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
      if(bytes.length!==value.size||await digest(bytes)!==value.sha256)throw Error('恢复包图片校验失败');
      return new Blob([bytes],{type:value.type||'application/octet-stream'});
    }
    const entries=await Promise.all(Object.entries(value).map(async([k,v])=>[k,await decode(v)]));
    return Object.fromEntries(entries);
  }
  return value;
}
function validateRows(rows){
  if(!Array.isArray(rows)||rows.length>5000)throw Error('待同步记录数量异常');
  const ids=new Set();
  for(const row of rows){
    if(!row||typeof row.record?.id!=='string'||!row.record.id
      ||ids.has(row.record.id)||!Number.isSafeInteger(row.serial)||row.serial<1
      ||!Number.isSafeInteger(row.baseRevision)||row.baseRevision<0
      ||typeof row.operationID!=='string'||!row.operationID)throw Error('应急恢复包包含不完整的待同步记录');
    ids.add(row.record.id);
  }
}
export async function createPendingRecovery(snapshot){
  if(typeof snapshot?.account!=='string'||!snapshot.account)throw Error('缺少当前账号信息');
  validateRows(snapshot.projects);validateRows(snapshot.imports);
  const data=await encode({format:FORMAT,version:VERSION,createdAt:new Date().toISOString(),
    account:snapshot.account,projects:snapshot.projects,imports:snapshot.imports});
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  if(blob.size>MAX_FILE)throw Error('待同步资料超过 128 MB；请勿清理浏览器数据，先分批完成同步或导出素材');
  return blob;
}
export async function parsePendingRecovery(file){
  if(file.size>MAX_FILE)throw Error('应急恢复包超过 128 MB');
  const parsed=JSON.parse(await file.text());
  if(parsed?.format!==FORMAT||parsed.version!==VERSION||typeof parsed.account!=='string'
    ||!Array.isArray(parsed.projects)||!Array.isArray(parsed.imports))throw Error('不是拾页现行待同步应急包');
  // Check the envelope before unpacking any file payload.
  validateRows(parsed.projects);validateRows(parsed.imports);
  const restored=await decode(parsed);
  validateRows(restored.projects);validateRows(restored.imports);
  return {account:restored.account,projects:restored.projects,imports:restored.imports};
}
