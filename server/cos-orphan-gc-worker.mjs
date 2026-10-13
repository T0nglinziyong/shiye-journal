import {collectCOSReferencePaths,cosObjectKind} from './storage-usage.mjs';

const DAY=86400000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const MANAGED=/^[0-9a-f]{64}(?:-preview480\.webp|-project\.json(?:\.gz)?(?:-preview480\.webp)?)?$/;
const QUARANTINE='gc-quarantine/';
const age=(row,now)=>now-Date.parse(row?.LastModified||'');
const oldEnough=(row,now,days)=>Number.isFinite(age(row,now))&&age(row,now)>=days*DAY;
const etag=value=>String(typeof value==='object'?(value?.ETag??value?.headers?.etag??''):value||'').replaceAll('"','');
const size=value=>Number(value?.Size??value?.ContentLength??value?.['content-length']??value?.headers?.['content-length']);

export function reclaimableKey(user,key){
  if(!UUID.test(user)||typeof key!=='string'||!key.startsWith(user+'/'))return false;
  const relative=key.slice(user.length+1),parts=relative.split('/');
  return parts.length===1&&MANAGED.test(parts[0])||
    parts.length===2&&/^reset-[0-9a-f-]{36}$/i.test(parts[0])&&MANAGED.test(parts[1]);
}
export function originalKey(user,key){return reclaimableKey(user,key)&&HASH.test(key.split('/').at(-1));}
export function quarantineKey(user,key){
  if(!reclaimableKey(user,key))throw Error('拒绝隔离账号外或非受管文件');
  return user+'/'+QUARANTINE+key.slice(user.length+1);
}
export function sourceFromQuarantine(user,key){
  const prefix=user+'/'+QUARANTINE;
  if(!key?.startsWith(prefix))return null;
  const source=user+'/'+key.slice(prefix.length);
  return reclaimableKey(user,source)?source:null;
}

async function version(client,user){
  const {data,error}=await client.from('shiye_revisions').select('revision')
    .eq('user_id',user).single();
  if(error||!Number.isSafeInteger(Number(data?.revision)))throw Error('无法核对云端版本');
  return Number(data.revision);
}
async function snapshot(client,user,maxPages){
  const before=await version(client,user),records=[];
  for(let page=0;page<maxPages;page++){
    const {data,error}=await client.from('shiye_records').select('store,id,record')
      .eq('user_id',user).order('store').order('id').range(page*500,page*500+499);
    if(error||!Array.isArray(data))throw Error('云端引用读取不完整');
    records.push(...data);
    if(data.length<500){
      if(await version(client,user)!==before)throw Error('扫描期间云端版本变化');
      return {revision:before,records};
    }
  }
  throw Error('云端引用数量超过本次安全扫描上限');
}
async function inventory(cos,params,user,maxPages){
  const objects=[];let marker;
  for(let page=0;page<maxPages;page++){
    const result=await cos.getBucket({...params,Prefix:user+'/',MaxKeys:1000,
      ...(marker?{Marker:marker}:{})});
    const rows=result?.Contents??[];
    if(!Array.isArray(rows)||rows.some(row=>!row.Key?.startsWith(user+'/')))
      throw Error('COS 清单不完整或越过账号范围');
    objects.push(...rows);
    if(result.IsTruncated===undefined||result.IsTruncated===null)
      throw Error('COS 未确认分页结束');
    const more=['true','1'].includes(String(result.IsTruncated).toLowerCase());
    if(!more)return objects;
    const next=result.NextMarker||rows.at(-1)?.Key;
    if(!next||next===marker)throw Error('COS 分页游标未前进');
    marker=next;
  }
  throw Error('COS 对象数量超过本次安全扫描上限');
}
async function head(cos,params,key){
  try{return await cos.headObject({...params,Key:key});}
  catch(error){if(Number(error?.statusCode)===404||error?.code==='NoSuchKey')return null;throw error;}
}
async function copyVerified(cos,params,source,target,expected){
  const from=await head(cos,params,source);
  if(!from)throw Error('待隔离 COS 原图已不存在');
  if(expected&&etag(from)!==etag(expected))throw Error('COS 原图在扫描后发生变化');
  await cos.putObjectCopy({...params,Key:target,
    CopySource:`${params.Bucket}.cos.${params.Region}.myqcloud.com/${source}`});
  const saved=await head(cos,params,target);
  if(!saved||!Number.isSafeInteger(size(saved))||size(saved)!==size(from)||etag(saved)!==etag(from))
    throw Error('隔离副本与 COS 原图校验不一致；未删除原图');
}
async function remove(cos,params,key){await cos.deleteObject({...params,Key:key});}

// No client-selected paths, no partial scans, no original deletion without a
// verified private copy. A changed revision aborts and the next cron retries.
export async function sweepCosOrphans({client,cos,user,bucket,region,now=Date.now(),
  maxPages=20,maxActions=5,deleteEnabled=false}={}){
  if(!UUID.test(user)||!bucket||!region)throw Error('COS 回收范围无效');
  const params={Bucket:bucket,Region:region};
  const {revision,records}=await snapshot(client,user,maxPages);
  const reset=records.find(row=>row.store==='meta'&&row.id==='shiye-reset-barrier')?.record;
  if(reset?.phase==='deleting')return {skipped:'account-reset',scanned:0,actions:0};
  const expired=records.filter(row=>row.store==='trash'&&
    ['asset','project'].includes(row.record?.kind)&&
    Number.isFinite(Date.parse(row.record?.date))&&
    now-Date.parse(row.record.date)>=30*DAY);
  if(expired.length&&deleteEnabled){
    if(await version(client,user)!==revision)throw Error('最近删除清理前云端版本变化');
    const {error}=await client.rpc('shiye_gc_prune_trash',{
      p_user:user,p_trash_id:expired[0].id,p_expected_revision:revision});
    if(error)throw Error('最近删除到期复核失败；未继续清理 COS');
    return {scanned:0,actions:1,trashPruned:1,expiredTrashCandidates:expired.length,
      dryRun:false};
  }
  const objects=await inventory(cos,params,user,maxPages),byKey=new Map(objects.map(row=>[row.Key,row]));
  const refs=collectCOSReferencePaths(records),nonBlob=JSON.stringify(records.filter(row=>row.store!=='blobs'));
  const blobs=records.filter(row=>row.store==='blobs'&&row.record?.storageProvider==='cos');
  const blobByPath=new Map();
  for(const row of blobs){const path=row.record.storagePath;if(!blobByPath.has(path))blobByPath.set(path,[]);blobByPath.get(path).push(row);}
  const result={scanned:objects.length,actions:0,quarantined:0,metadataPruned:0,
    objectsDeleted:0,recovered:0,quarantinePurged:0,eligibleCandidates:0,
    expiredTrashCandidates:expired.length,dryRun:!deleteEnabled};
  for(const backup of objects.filter(row=>sourceFromQuarantine(user,row.Key))){
    if(result.actions>=maxActions)break;
    const source=sourceFromQuarantine(user,backup.Key);
    const parent=cosObjectKind(source)==='derivative'
      ?source.slice(0,-'-preview480.webp'.length):null;
    const protectedSource=refs.has(source)||!!parent&&refs.has(parent);
    if(protectedSource&&!byKey.has(source)){
      if(!deleteEnabled)continue;
      if(await version(client,user)!==revision)throw Error('恢复前云端版本变化');
      await copyVerified(cos,params,backup.Key,source,backup);
      result.recovered++;result.actions++;continue;
    }
    if(!protectedSource&&!byKey.has(source)&&oldEnough(backup,now,180)){
      if(!deleteEnabled)continue;
      if(await version(client,user)!==revision)throw Error('最终清理前云端版本变化');
      await remove(cos,params,backup.Key);
      result.quarantinePurged++;result.actions++;
    }
  }
  for(const object of objects){
    if(result.actions>=maxActions)break;
    const key=object.Key;
    if(!reclaimableKey(user,key)||!oldEnough(object,now,90))continue;
    const kind=cosObjectKind(key);
    const backupKey=quarantineKey(user,key),backup=byKey.get(backupKey);
    const owners=kind==='original'?blobByPath.get(key)||[]:[];
    const inUse=owners.some(row=>nonBlob.includes(row.id)||nonBlob.includes(key));
    const parent=kind==='derivative'?key.slice(0,-'-preview480.webp'.length):null;
    if(inUse||(!owners.length&&refs.has(key))||parent&&refs.has(parent))continue;
    result.eligibleCandidates++;
    if(!backup){
      if(!deleteEnabled)continue;
      if(await version(client,user)!==revision)throw Error('隔离前云端版本变化');
      await copyVerified(cos,params,key,backupKey,object);
      result.quarantined++;result.actions++;continue;
    }
    if(!oldEnough(backup,now,30))continue;
    if(owners.length){
      if(!deleteEnabled)continue;
      if(await version(client,user)!==revision)throw Error('元数据清理前云端版本变化');
      const {error}=await client.rpc('shiye_gc_prune_blob',{
        p_user:user,p_blob_id:owners[0].id,p_expected_revision:revision});
      if(error)throw Error('孤立图片元数据核验失败；未删 COS 原图');
      result.metadataPruned++;result.actions++;
      break; // The RPC advanced revision; discard this scan before further work.
    }
    if(refs.has(key)||!oldEnough(backup,now,60)||!deleteEnabled)continue;
    if(await version(client,user)!==revision)throw Error('删除前云端版本变化');
    const current=await head(cos,params,key);
    const protectedCopy=await head(cos,params,backupKey);
    if(!current||!protectedCopy||etag(current)!==etag(object)||
      etag(protectedCopy)!==etag(current)||size(protectedCopy)!==size(current))
      throw Error('隔离副本与当前原图不一致；未删除原图');
    await remove(cos,params,key);
    // A concurrent restore is recoverable from quarantine, including if it
    // landed during the small window between final revision check and DELETE.
    if(await version(client,user)!==revision){
      await copyVerified(cos,params,backupKey,key,backup);
      throw Error('删除期间云端版本变化；已从隔离副本恢复原图');
    }
    result.objectsDeleted++;result.actions++;
  }
  return result;
}
