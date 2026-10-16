// Merge two metadata edits only when their common base proves that the edited
// fields do not overlap. Image identity, cutout and physical geometry form one
// atomic field group: mixing values from two image versions would corrupt a
// material even when the changed property names differ.
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const imageField=key=>/blob|image|mask|crop|physical|source|frame|pixel|rotation|width|height/i.test(key);
const groupOf=key=>imageField(key)?'image':
  ['usageStatus','usageUpdatedAt'].includes(key)?'usage':key;
const absent=Symbol('absent');
const field=(record,key)=>Object.hasOwn(record,key)?record[key]:absent;
const equal=(a,b)=>a===absent||b===absent?a===b:same(a,b);
export function mergeDisjointMetadata(base,local,remote){
  if(!base||!local||!remote||base.id!==local.id||base.id!==remote.id||
    [base,local,remote].some(row=>typeof row!=='object'||Array.isArray(row)))return null;
  const keys=new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)]);
  const remoteGroups=new Set(),localKeys=[];
  for(const key of keys){
    if(['id','updatedAt','createdAt'].includes(key))continue;
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
  const localAt=Date.parse(local.updatedAt||''),remoteAt=Date.parse(remote.updatedAt||'');
  if(Number.isFinite(localAt)&&(!Number.isFinite(remoteAt)||localAt>remoteAt))
    merged.updatedAt=local.updatedAt;
  return {record:merged,changed:!same(merged,remote)};
}
