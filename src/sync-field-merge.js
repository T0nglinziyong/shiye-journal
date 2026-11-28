// Merge two metadata edits only when their common base proves that the edited
// fields do not overlap. Image identity, cutout and physical geometry form one
// atomic field group: mixing values from two image versions would corrupt a
// material even when the changed property names differ.
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const imageField=key=>/blob|image|mask|crop|physical|source|frame|pixel|rotation|width|height/i.test(key);
const groupOf=key=>imageField(key)?'image':
  ['usageStatus','usageUpdatedAt'].includes(key)?'usage':key;
const STAMPS='__syncFieldStamps';
const absent=Symbol('absent');
const field=(record,key)=>Object.hasOwn(record,key)?record[key]:absent;
const equal=(a,b)=>a===absent||b===absent?a===b:same(a,b);
const validStamp=value=>Number.isSafeInteger(value?.counter)&&value.counter>0&&
  value.counter<1000000000&&typeof value.id==='string'&&value.id.length>0&&value.id.length<200;
const stampOf=(record,group)=>validStamp(record?.[STAMPS]?.[group])?record[STAMPS][group]:null;
const changedGroups=(base,record)=>new Set([...new Set([...Object.keys(base),...Object.keys(record)])]
  .filter(key=>!['id','updatedAt','createdAt',STAMPS].includes(key)&&
    !equal(field(base,key),field(record,key))).map(groupOf));

// The counter follows the acknowledged base. Concurrent offline edits use a
// stable operation ID to break a tie, independent of device clocks or retry
// time. This metadata travels with the record so later edits stay causal.
export function stampMetadataEdit(base,record,operationID){
  if(!base||!record||base.id!==record.id||typeof operationID!=='string'||!operationID)return record;
  const groups=changedGroups(base,record);
  if(!groups.size)return record;
  const stamps={...(base[STAMPS]||{}),...(record[STAMPS]||{})};
  for(const group of groups){
    const before=stampOf(base,group)?.counter||0;
    const carried=stampOf(record,group)?.counter||0;
    stamps[group]={counter:Math.min(999999999,Math.max(before,carried)+1),id:operationID};
  }
  return {...record,[STAMPS]:stamps};
}
const carryStamp=(merged,source,group)=>{
  const stamp=stampOf(source,group),current=stampOf(merged,group);
  if(stamp&&(!current||stamp.counter>current.counter||
    stamp.counter===current.counter&&stamp.id>current.id))
    merged[STAMPS]={...(merged[STAMPS]||{}),[group]:structuredClone(stamp)};
};
export function mergeDisjointMetadata(base,local,remote){
  if(!base||!local||!remote||base.id!==local.id||base.id!==remote.id||
    [base,local,remote].some(row=>typeof row!=='object'||Array.isArray(row)))return null;
  const keys=new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)]);
  const remoteGroups=new Set(),localKeys=[];
  for(const key of keys){
    if(['id','updatedAt','createdAt',STAMPS].includes(key))continue;
    const before=field(base,key),mine=field(local,key),theirs=field(remote,key);
    if(!equal(mine,before))localKeys.push(key);
    if(!equal(theirs,before))remoteGroups.add(groupOf(key));
  }
  if(!localKeys.length)return {record:structuredClone(remote),changed:false};
  if(localKeys.some(key=>remoteGroups.has(groupOf(key))&&
    !equal(field(local,key),field(remote,key))))return null;
  const merged=structuredClone(remote);
  for(const key of localKeys){
    const value=field(local,key);
    if(value===absent)delete merged[key];
    else merged[key]=structuredClone(value);
  }
  for(const group of new Set(localKeys.map(groupOf)))carryStamp(merged,local,group);
  const localAt=Date.parse(local.updatedAt||''),remoteAt=Date.parse(remote.updatedAt||'');
  if(Number.isFinite(localAt)&&(!Number.isFinite(remoteAt)||localAt>remoteAt))
    merged.updatedAt=local.updatedAt;
  return {record:merged,changed:!same(merged,remote)};
}

// Only concurrent edits from the same proven base reach this function. A
// later causally based save never compares timestamps with an older branch.
// Whole image/usage groups move together so an image cannot inherit the other
// branch's dimensions or mask. Retry time is deliberately absent here.
const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&
  !Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const editOrder=(local,remote)=>{
  const a=Date.parse(local.updatedAt||''),b=Date.parse(remote.updatedAt||'');
  if(Number.isFinite(a)&&Number.isFinite(b)&&a!==b)return Math.sign(a-b);
  if(Number.isFinite(a)!==Number.isFinite(b))return Number.isFinite(a)?1:-1;
  const left=stable(local),right=stable(remote);
  return left===right?0:left>right?1:-1;
};
const groupOrder=(local,remote,group)=>{
  const a=stampOf(local,group),b=stampOf(remote,group);
  if(a&&b){
    if(a.counter!==b.counter)return Math.sign(a.counter-b.counter);
    if(a.id!==b.id)return a.id>b.id?1:-1;
  }else if(a||b)return a?1:-1;
  return editOrder(local,remote);
};
export function mergeConcurrentMetadata(base,local,remote){
  const disjoint=mergeDisjointMetadata(base,local,remote);
  if(disjoint)return disjoint;
  if(!base||!local||!remote||base.id!==local.id||base.id!==remote.id)return null;
  const keys=new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)]);
  const groups=new Map();
  for(const key of keys){
    if(['id','updatedAt','createdAt',STAMPS].includes(key))continue;
    const group=groupOf(key),entry=groups.get(group)||{keys:[],local:false,remote:false};
    entry.keys.push(key);
    entry.local||=!equal(field(local,key),field(base,key));
    entry.remote||=!equal(field(remote,key),field(base,key));
    groups.set(group,entry);
  }
  const merged=structuredClone(remote);
  for(const entry of groups.values()){
    const group=groupOf(entry.keys[0]);
    if(!entry.local||entry.remote&&groupOrder(local,remote,group)<=0)continue;
    for(const key of entry.keys){
      const value=field(local,key);
      if(value===absent)delete merged[key];
      else merged[key]=structuredClone(value);
    }
    carryStamp(merged,local,group);
  }
  const localAt=Date.parse(local.updatedAt||''),remoteAt=Date.parse(remote.updatedAt||'');
  if(Number.isFinite(localAt)&&(!Number.isFinite(remoteAt)||localAt>remoteAt))
    merged.updatedAt=local.updatedAt;
  return {record:merged,changed:!same(merged,remote)};
}
