// Read-only COS inventory analysis. No delete tickets or COS DELETE actions
// are exposed. Storage inventory alone cannot prove an object is unreferenced
// by another device's durable outbox, a historical backup or external export.
const HASHED_OBJECT=/^[0-9a-f]{64}(?:-preview480\.webp|-project\.json(?:\.gz)?(?:-preview480\.webp)?)?$/;
const UUID_PREFIX=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\//i;

export function cosObjectKind(key){
  const name=String(key||'').split('/').at(-1);
  if(!HASHED_OBJECT.test(name||''))return 'other';
  if(name.endsWith('-preview480.webp'))return 'derivative';
  if(name.includes('-project.json'))return 'document';
  return 'original';
}

export function collectCOSReferencePaths(rows){
  const refs=new Set();
  const inspect=(value,depth=0)=>{
    if(!value||depth>24)return;
    if(Array.isArray(value)){for(const element of value)inspect(element,depth+1);return;}
    if(typeof value!=='object')return;
    for(const [key,item] of Object.entries(value)){
      if(typeof item==='string'&&['storagePath','thumbnailPath','projectDocumentPath'].includes(key)
        &&UUID_PREFIX.test(item))refs.add(item);
      if(typeof item==='string'&&key==='coverImageID'&&item.startsWith('project-cover:cos:')){
        const path=item.slice('project-cover:cos:'.length);
        if(UUID_PREFIX.test(path))refs.add(path);
      }
      if(item&&typeof item==='object')inspect(item,depth+1);
    }
  };
  for(const row of rows||[])inspect(row?.record??row);
  return refs;
}

export function summarizeCOSInventory(objects,{
  referencePaths=new Set(),inventoryComplete=false,referencesComplete=false,
  now=Date.now(),minCandidateDays=90
}={}){
  const groups=Object.fromEntries(['original','derivative','document','other'].map(kind=>[kind,{count:0,bytes:0}]));
  let totalBytes=0,oldUnreferencedCandidates=0,oldUnreferencedCandidateBytes=0;
  const ageLimit=now-minCandidateDays*24*60*60*1000;
  for(const object of objects||[]){
    const kind=cosObjectKind(object.Key);
    const size=Number(object.Size);
    if(!Number.isSafeInteger(size)||size<0)continue;
    groups[kind].count++;groups[kind].bytes+=size;totalBytes+=size;
    const modified=Date.parse(object.LastModified||'');
    if(kind!=='other'&&Number.isFinite(modified)&&modified<ageLimit&&!referencePaths.has(object.Key)){
      oldUnreferencedCandidates++;oldUnreferencedCandidateBytes+=size;
    }
  }
  const complete=Boolean(inventoryComplete&&referencesComplete);
  return {
    measuredAt:new Date(now).toISOString(),objectCount:(objects||[]).length,
    totalBytes,groups,inventoryComplete:Boolean(inventoryComplete),
    referencesComplete:Boolean(referencesComplete),
    oldUnreferencedCandidates:complete?oldUnreferencedCandidates:null,
    oldUnreferencedCandidateBytes:complete?oldUnreferencedCandidateBytes:null,
    candidateAgeDays:minCandidateDays,
    safelyDeletableBytes:0,
    warning:complete
      ?'待核对候选不是可安全删除量：可能仍被离线队列、历史备份或外部客户端引用；不会自动删除 COS。'
      :'枚举或引用检查不完整，无法判断无引用对象；禁止据此清理 COS。'
  };
}
