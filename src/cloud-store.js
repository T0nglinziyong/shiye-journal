import {cloudClient,requireCloudUser} from './cloud-session.js';
import {privateCache} from './private-cache.js';
import {createProjectSync} from './project-sync.js';
import {runAccountBrowserLock,markSyncPhase} from './sync-browser-compat.js';
import {syncEnvelope,projectSyncRows,importSyncRows,latestEditedProject,syncAffectedKeys,foldLegacySyncRows} from './unified-sync-outbox.js';
import {readCloudDelta,canRebaseUnchangedKeys} from './cloud-delta.js';
import {planMetadataBatch,splitMetadataBatch} from './sync-metadata-batch.js';
import {compareRecordEdits} from './sync-last-write.js';
import {recordTombstones} from './sync-tombstones.js';
import {LARGE_PROJECT_BYTES,projectSummary,mergeProjectSummary,projectBlobText} from './project-document.js';
import {createCOSStore} from './cos-store.js';
import {imageVariant,DISPLAY_TIERS,COVER_EDGE} from './image-variants.js';
import {recoverImportOutbox} from './import-outbox-recovery.js';
import {recoverProjectOutbox,usableProjectSnapshot} from './project-outbox-recovery.js';
import {migrationPendingConflicts} from './migration-outbox-guard.js';
import {forkConflictingEditableWork} from './sync-conflict-copy.js';
import {mergeEditableSceneProjects} from './scene-field-merge.js';
import {isLegacySceneProject} from './scene-v2.js';
import {createBlobRevisionProof} from './blob-revision-proof.js';
import {createSyncDiagnostics} from './sync-diagnostics.js';
import {decodeImageBlob} from './image-blob-decoder.js';
export function createCloudStore({cloudClient,requireCloudUser,cache=null,namespace='cloud',projectPreview=()=>null,objectStorage=null}){
const BUCKET='shiye-private';
const writeProvider=()=>objectStorage?.enabled?'cos':'supabase';
const usableBlob=value=>value instanceof Blob&&value.size>0;
async function downloadObject(path,provider){if(provider==='cos'){if(!objectStorage)throw Error('COS 私有读取尚未配置');return objectStorage.download(path);}if(provider==='supabase')return checked(await cloudClient().storage.from(BUCKET).download(path));throw Error('云端对象缺少当前 storageProvider');}
async function uploadObject(path,blob,type,provider=writeProvider()){if(provider==='cos'){await objectStorage.upload(path,blob,type);return {error:null};}return cloudClient().storage.from(BUCKET).upload(path,blob,{upsert:false,contentType:type});}
let owner,revision,writesInFlight=0,activeDirect=null,resetInProgress=false,resetCleanupPending=false,resetEpochId=null;
let queue=Promise.resolve();
const images=new Map();
const imageSizes=new Map();
const uploads=new Map();
const thumbnailUploads=new Map();
const snapshots=new Map();
const documents=new Map();
const blobRecordRequests=new Map();
const blobRecords=new Map();
const blobRevisionProof=createBlobRevisionProof();
const syncDiagnostics=createSyncDiagnostics();
function retainBlobRecord(id,saved){
  blobRecords.delete(id);blobRecords.set(id,saved);
  if(blobRecords.size>256)blobRecords.delete(blobRecords.keys().next().value);
}
let blobRecordTimer=null;
function batchBlobRecord(id){
  if(blobRecordRequests.has(id))return blobRecordRequests.get(id).promise;
  let resolve,reject;
  const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
  blobRecordRequests.set(id,{promise,resolve,reject});
  if(blobRecordTimer===null)blobRecordTimer=setTimeout(async()=>{
    blobRecordTimer=null;
    const entries=[...blobRecordRequests];
    for(const [key] of entries)blobRecordRequests.delete(key);
    const atRevision=revision;
    for(let offset=0;offset<entries.length;offset+=120){
      // Up to three independent metadata queries can overlap, while each
      // request still stays below PostgREST's practical IN-list size.
      const groups=[0,40,80].map(start=>entries.slice(offset+start,offset+start+40)).filter(group=>group.length);
      await Promise.all(groups.map(async group=>{
        const ids=group.map(([key])=>key);
        try{
          const rows=checked(await cloudClient().from('shiye_records').select('id,record').eq('user_id',owner).eq('store','blobs').in('id',ids));
          const found=new Map(rows.map(row=>[row.id,row.record]));
          await Promise.all(group.map(async([key,waiter])=>{
            const record=found.get(key);
            if(record&&revision===atRevision){const saved={revision:atRevision,record};retainBlobRecord(key,saved);await remember('blob-record:'+key,saved);}
            waiter.resolve(record?structuredClone(record):undefined);
          }));
        }catch(error){for(const [,waiter] of group)waiter.reject(error);}
      }));
    }
  },0);
  return promise;
}
const editorBases=new Map();
// The editor must carry the revision of the document it actually opened.
// A later background sync cursor is not its editing baseline.
const withProjectBase=(store,record,base)=>{
  if(store!=='projects'||!record)return record;
  const session=crypto.randomUUID();editorBases.set(session,base);
  if(editorBases.size>300)editorBases.delete(editorBases.keys().next().value);
  return {...record,__cloudBaseRevision:base,__cloudSessionId:session};
};
function retainImage(path,data){images.set(path,Promise.resolve(data));imageSizes.delete(path);imageSizes.set(path,data.size);let bytes=[...imageSizes.values()].reduce((a,b)=>a+b,0);for(const [key,size] of imageSizes){if(bytes<=64*1024*1024&&imageSizes.size<=48)break;if(key===path)continue;images.delete(key);imageSizes.delete(key);bytes-=size;}}
// Old COS assets without thumbnail metadata are converted into a durable,
// immutable preview480 object exactly once. There is never a browser-side
// reconstruction of the original during ordinary catalog browsing.
const previewMaterialization=new Set();
function materializePreview480(record,preview){
  if(record.storageProvider!=='cos'||record.thumbnailPath?.endsWith('-preview480.webp')||!objectStorage?.upload||!usableBlob(preview))return;
  const path=record.storagePath+'-preview480.webp';
  if(previewMaterialization.has(path))return;
  previewMaterialization.add(path);
  void objectStorage.upload(path,preview,'image/webp')
    .catch(error=>{previewMaterialization.delete(path);console.warn('旧素材 COS 固定封面待补齐',error);});
}
let cacheDisabled=false;
let unifiedOutboxBefore=[],projectOutboxQuarantine=[],unifiedQuarantine=[];
// The merge guard needs only identity/version stamps, never image payloads.
// Keeping a second structured clone of every pending Blob made each import
// progressively more expensive on mobile Safari.
const outboxStamps=rows=>(rows||[]).map(row=>({
  record:{id:row.record.id},serial:row.serial,
  baseRevision:row.baseRevision,operationID:row.operationID
}));
const sessionTag=crypto.randomUUID();
let outboxChannel=null;
const channel=()=>{
  if(typeof window==='undefined'||typeof BroadcastChannel==='undefined')return null;
  if(outboxChannel)return outboxChannel;
  if(!owner)return null;
  const name='shiye-outbox:'+namespace+':'+owner;
  outboxChannel=new BroadcastChannel(name);
  // Outbox and committed-revision signals are tab-local optimizations:
  // Web Locks and versioned server CAS remain the source of truth. A successful
  // delete should become visible in another open tab immediately, not only on
  // the next remote poll (other physical devices still poll every 15 seconds).
  outboxChannel.onmessage=event=>{
    const msg=event.data;
    if(!msg||msg.source===sessionTag)return;
    if(msg.type==='pending')
      void unifiedSync.resume().catch(()=>{});
    if(msg.type==='committed')notifyCloudSuperseded();
  };
  return outboxChannel;
};
// All post-reset uploads go under a unique, immutable generation prefix.
// The background GC excludes this subtree even while deleting old objects,
// so file cleanup can never block login or wipe newly uploaded images.
function cloudSetResetCleanupPending(value,resetId=null){
  resetCleanupPending=!!value;
  if(resetId&&!/^[a-f0-9-]{36}$/i.test(resetId))throw Error('清空版本编号无效');
  resetEpochId=resetId||null;
}
async function objectRoot(){
  return (await identity())+'/' + (resetEpochId?'reset-'+resetEpochId+'/':'');
}
function assertAccountWritable(){
  if(resetInProgress)throw Error('账号清空中，不能保存新资料');
  if(resetCleanupPending&&!resetEpochId)
    throw Error('云端清空版本尚未核对完成，暂不能写入');
}
async function withAccountSyncLock(task){
  const id=await account();
  try{return await runAccountBrowserLock(id,task);}
  catch(error){throw markSyncPhase(error,'获取同步锁或执行同步任务');}
}
async function persistOutbox(kind,previous,rows,options={}){
  if(!cache||cacheDisabled)throw Error('无法安全保存待同步资料');
  const key=await account();
  if(typeof cache.putOutbox==='function')await cache.putOutbox(key,kind,previous,rows,options);
  else await cache.put(key,kind,rows);
  channel()?.postMessage({source:sessionTag,type:'pending'});
}
const account=async()=>`${namespace}:${await identity()}`;
function notifyCloudSuperseded(){
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('shiye-cloud-superseded'));
}
function reportSync(){if(typeof window!=='undefined'){const current=unifiedSync.status();window.dispatchEvent(new CustomEvent('shiye-project-sync',{detail:{pending:current.pending+writesInFlight,error:current.error,conflicts:current.conflicts,uploading:current.uploading||writesInFlight>0,progress:activeDirect?{phase:activeDirect.phase,done:activeDirect.done,total:activeDirect.total}:null}}));}}
// One durable account-scoped queue, one upload scheduler. The project and
// import accessors below are filtered facades; neither owns a second queue.
async function loadUnifiedOutbox(recover=false){
  if(!cache)return [];
  const user=await account();
  let result;
  if(recover&&typeof cache.migrateUnifiedOutbox==='function'){
    result=await cache.migrateUnifiedOutbox(user);
  }else{
    const previous=await cache.get(user,'unified-outbox');
    if(Array.isArray(previous))result={rows:previous,quarantine:await cache.get(user,'sync-quarantine')||[]};
    else{
      result=foldLegacySyncRows([],await cache.get(user,'project-outbox')||[],
        await cache.get(user,'import-outbox')||[]);
      await cache.put(user,'unified-outbox',result.rows);
      if(result.quarantine.length)await cache.put(user,'sync-quarantine',result.quarantine);
    }
  }
  if(recover&&result.rows.some(row=>row.record?.kind==='batch')){
    // Reuse the existing crash-recovery gate before the first upload. A
    // missing Safari Blob is not evidence that its COS source also vanished.
    const recovered=await recoverImportOutbox(importSyncRows(result.rows),async(asset,ids)=>{
      const userID=await identity();
      if(!ids.length)return false;
      const copies=checked(await cloudClient().from('shiye_records').select('id,record')
        .eq('user_id',userID).eq('store','blobs').in('id',ids)
        .abortSignal(AbortSignal.timeout(5000)));
      const available=[];
      for(const copy of copies){
        const metadata=copy.record;
        if(!metadata?.storagePath||!['cos','supabase'].includes(metadata.storageProvider))continue;
        if(!metadata.storagePath.startsWith(userID+'/'))throw Error('图片不属于当前账号');
        const localBlob=await cached('image:'+metadata.storagePath);
        if(usableBlob(localBlob)){available.push(copy.id);continue;}
        if(metadata.storageProvider==='cos'&&objectStorage?.probe){
          if(await objectStorage.probe(metadata.storagePath))available.push(copy.id);
          // A definite COS 404 is evidence that metadata alone cannot render
          // the card. Other probe failures throw and keep the outbox intact.
          continue;
        }
        try{if(usableBlob(await downloadObject(metadata.storagePath,metadata.storageProvider)))available.push(copy.id);}
        catch(error){if(!/\b404\b|NoSuchKey|Object not found/i.test(error?.message||''))throw error;}
      }
      return available;
    });
    if(recovered.changed){
      const byOperation=new Map(recovered.rows.map(row=>[row.operationID,row]));
      const held=[],updated=[];
      for(const row of result.rows){
        if(row.record?.kind!=='batch'){updated.push(row);continue;}
        const repair=byOperation.get(row.operationID);
        if(!repair){
          held.push({kind:'batch',reason:'unrecoverable-import',row:{
            ...row,record:row.record.payload
          }});
          continue;
        }
        if(repair.record!==row.record.payload){
          held.push({kind:'batch',reason:'original-before-import-recovery',row:{
            ...row,record:row.record.payload
          }});
          updated.push({...row,operationID:crypto.randomUUID(),record:{
            ...row.record,payload:repair.record
          }});
        }else updated.push(row);
      }
      if(typeof cache.repairUnifiedOutbox==='function'){
        result=await cache.repairUnifiedOutbox(user,result.rows,updated,held);
      }else{
        await cache.put(user,'sync-quarantine',[...result.quarantine,...held]);
        await cache.put(user,'unified-outbox',updated);
        result={rows:updated,quarantine:[...result.quarantine,...held]};
      }
    }
  }
  unifiedOutboxBefore=outboxStamps(result.rows);
  unifiedQuarantine=structuredClone(result.quarantine);
  projectOutboxQuarantine=unifiedQuarantine.filter(item=>item.kind==='project').map(item=>item.row);
  return result.rows;
}
const unifiedSync=createProjectSync({
  autoFlushDelayMs:10000,
  coalesce:planMetadataBatch,
  splitCoalesced:splitMetadataBatch,
  load:()=>loadUnifiedOutbox(true),
  reload:()=>loadUnifiedOutbox(false),
  write:async(rows,options={})=>{
    await persistOutbox('unified-outbox',unifiedOutboxBefore,rows,options);
    unifiedOutboxBefore=outboxStamps(rows);
  },
  commit:(envelope,operationID)=>{
    const payload=envelope.payload;
    if(envelope.kind==='project')
      return cloudTransaction(['projects'],tx=>tx.objectStore('projects').put(payload),operationID);
    if(envelope.kind!=='batch')throw Error('不支持的待同步操作类型');
    return payload.operations?
      cloudTransaction(payload.names,tx=>{for(const op of payload.operations){
        const store=tx.objectStore(op.store);
        if(op.action==='put')store.put(op.item);
        else if(op.action==='delete')store.delete(op.id);
        else store.clear();
      }},operationID):
      cloudTransaction(['assets','blobs','projects'],tx=>{
        for(const store of ['assets','blobs','projects'])
          for(const item of payload[store]||[])tx.objectStore(store).put(item);
      },operationID);
  },
  revision:()=>revision,
  reconcile:async(envelope,operationID,baseRevision)=>{
    if(envelope.kind==='batch')
      return reconcileImport(envelope.payload,operationID,baseRevision);
    if(envelope.kind!=='project')return 'conflict';
    if(await wasCommitted(operationID,baseRevision))return 'committed';
    if(await wasResetAfter(baseRevision))return 'remote';
    const latest=await version(),record=envelope.payload;
    if(latest===baseRevision)return 'rebase';
    if(await canRebaseUnchangedKeys({client:cloudClient(),owner:await identity(),
      before:baseRevision,after:latest,operations:[{store:'projects',action:'put',item:record}]}))return 'rebase';
    // User-selected policy: genuine simultaneous edits use the last explicit
    // edit timestamp. Ties keep cloud. Deletes and invalid dates remain safe.
    const remote=await cloudRecord('projects',record.id);
    if(!remote)return 'conflict';
    // Before LWW arbitration, capture both editable variants in the user's
    // private account cache. Even the losing snapshot remains recoverable
    // after the outbox entry is retired. Failure aborts arbitration: do not
    // discard a local version without first preserving the pair.
    const safetyKey='pre-conflict-scene:'+record.id+':'+operationID;
    const completeRemote=remote.projectDocumentPath?await cloudProjectDocument(remote):remote;
    if(!cache||cacheDisabled)
      throw Error('无法安全创建冲突前备份；保留待同步修改，请先检查本机存储');
    const userKey=await account(),savedAt=new Date().toISOString();
    const pair={kind:'shiye-pre-conflict-scene-pair',at:savedAt,
      local:structuredClone(record),remote:structuredClone(completeRemote),
      baseRevision,remoteRevision:latest};
    // Unlike disposable image thumbnails, conflict protection must never be
    // best-effort. Stop reconciliation if IndexedDB cannot persist the pair.
    await cache.put(userKey,safetyKey,pair);
    const savedList=await cache.get(userKey,'pre-conflict-scene-index')||[];
    if(!savedList.some(entry=>entry.key===safetyKey))
      await cache.put(userKey,'pre-conflict-scene-index',[
        {key:safetyKey,id:record.id,title:record.title||'未命名作品',at:savedAt},
        ...savedList
      ].slice(0,20));
    // Merge only provably replayable Scene v2 deltas. Different layers and
    // properties commute; same-property edits use their explicit timestamps.
    // Unsupported transforms fall back to the original guarded LWW decision.
    const merged=mergeEditableSceneProjects(record,completeRemote);
    if(merged)return {kind:'replace',record:syncEnvelope('project',merged)};
    const winner=latestEditedProject(record,remote);
    return winner==='local'?'rebase':winner==='remote'?'remote':'conflict';
  },
  onCommitted:(envelope,committedRevision)=>{
    const record=envelope.kind==='project'?envelope.payload:null;
    if(record?.__cloudSessionId)editorBases.set(record.__cloudSessionId,committedRevision);
  },
  onConflict:async()=>null,
  onSuperseded:()=>notifyCloudSuperseded(),
  onStatus:reportSync,
  onDiagnostic:event=>syncDiagnostics.record(event),
  runExclusive:withAccountSyncLock,
  prepare:async envelopes=>{
    const puts=[];
    for(const envelope of envelopes){
      if(envelope.kind!=='batch')continue;
      const batch=envelope.payload;
      const operations=batch.operations||['assets','blobs','projects'].flatMap(store=>(batch[store]||[])
        .map(item=>({action:'put',store,item})));
      const auxiliary=auxiliaryBlobIDs(operations);
      for(const op of operations)if(op.action==='put'&&op.store==='blobs')
        puts.push({item:op.item,makePreview:!auxiliary.has(op.item.id)});
    }
    // Preparation is opportunistic: one failed object must not stop another
    // record's bytes from uploading. Its own commit retries and reports the
    // precise error while leaving that record in the durable outbox.
    for(let offset=0;offset<puts.length;offset+=3)
      await Promise.allSettled(puts.slice(offset,offset+3).map(op=>
        encode('blobs',op.item,{makePreview:op.makePreview})));
  },
  recordKeys:syncAffectedKeys,
});
const selectedRows=async kind=>(await unifiedSync.pending())
  .filter(row=>row.record?.kind===kind).map(row=>({
    ...row,record:structuredClone(row.record.payload)
  }));
const resolveEnvelope=async(kind,id,serial,{record=null,baseRevision=null}={})=>
  unifiedSync.resolvePending((kind==='project'?'project:':'batch:')+id,serial,{
    record:record?syncEnvelope(kind,record):null,baseRevision
  });
const projectSync={
  stage:(record,opts)=>unifiedSync.stage(syncEnvelope('project',record),opts),
  pending:()=>selectedRows('project'),
  resolvePending:(id,serial,opts)=>resolveEnvelope('project',id,serial,opts),
  cancelPendingFor:ids=>unifiedSync.cancelPendingFor(ids.map(id=>'project:'+id)),
  status:()=>unifiedSync.status(),
};
const importSync={
  stage:(record,opts)=>unifiedSync.stage(syncEnvelope('batch',record),opts),
  pending:()=>selectedRows('batch'),
  resolvePending:(id,serial,opts)=>resolveEnvelope('batch',id,serial,opts),
  status:()=>unifiedSync.status(),
};
// A reset is a high-priority epoch barrier. Outboxes staged before a
// deliberate all-data reset must NEVER revive old artwork after reconnect.
async function wasResetAfter(baseRevision){
  const user=await identity();
  const {data,error}=await cloudClient().from('shiye_records')
    .select('record').eq('user_id',user).eq('store','meta')
    .eq('id','shiye-reset-barrier').maybeSingle();
  if(error)throw Error('无法核对账号清空版本，暂不上传旧资料');
  const resetRevision=Number(data?.record?.revision);
  return Number.isSafeInteger(resetRevision)&&resetRevision>baseRevision;
}
async function wasCommitted(operationID,baseRevision){
  if(!operationID)throw Error('待同步记录缺少 operationID');
  const row=checked(await cloudClient().from('shiye_commits').select('revision').eq('user_id',await identity()).eq('operation_id',operationID).maybeSingle());
  if(row)await version(); // Invalidate stale snapshots after a lost response.
  return !!row;
}
async function reconcileImport(batch,operationID,baseRevision){
  if(await wasCommitted(operationID,baseRevision))return 'committed';
  if(await wasResetAfter(baseRevision))return 'remote';
  const latest=await version();
  // If the server cursor never advanced, an aborted request is unconfirmed,
  // not remotely won. Do not drop a local delete or restore on a 404 lookup.
  if(latest===baseRevision)return 'rebase';
  // Edits/deletes rebase only over a complete, disjoint change log. An
  // append-only import may instead prove absence by its unique record IDs.
  if(batch.operations){
    const client=cloudClient(),user=await identity();
    const nonoverlap=await canRebaseUnchangedKeys({client,owner:user,before:baseRevision,after:latest,operations:batch.operations});
    if(nonoverlap)return 'rebase';
    // Resolve only the objects actually modified since our baseline. A batch
    // can contain disjoint assets and projects: a stale item must not block
    // independent updates or a newer item in the same transaction.
    const operations=[];
    // A queued explicit restore contains BOTH meta:tombstone delete and the
    // corresponding record PUT. It may follow an unacknowledged delete.
    const restorePairs=new Set(batch.operations.filter(op=>op.action==='put'&&['assets','series','projects'].includes(op.store))
      .filter(op=>batch.operations.some(marker=>marker.store==='meta'&&marker.action==='delete'&&marker.id==='tombstone:'+op.store+':'+op.item?.id))
      .map(op=>op.store+':'+op.item.id));
    for(const op of batch.operations){
      const sameKeyFree=await canRebaseUnchangedKeys({client,owner:user,before:baseRevision,after:latest,operations:[op]});
      if(sameKeyFree){operations.push(op);continue;}
      if(op.action==='clear')return 'conflict';
      const id=op.item?.id??op.id;
      // A paired restore also consumes its Recently Deleted card, regardless
      // of device timestamp skew or the original deletion's write time.
      if(op.store==='trash'&&op.action==='delete'){
        const card=await cloudRecord('trash',id);
        const liveStore=card?.kind==='project'?'projects':card?.kind==='asset'?'assets':null;
        if(liveStore&&restorePairs.has(liveStore+':'+card.item?.id)){operations.push(op);continue;}
      }
      if(op.store==='meta'&&op.action==='delete'&&typeof op.id==='string'){
        const pair=[...restorePairs].find(key=>op.id==='tombstone:'+key);
        if(pair&&await cloudRecord('meta',op.id)){operations.push(op);continue;}
      }
      if(op.action==='put'&&restorePairs.has(op.store+':'+id)){
        const marker=await cloudRecord('meta','tombstone:'+op.store+':'+id);
        const live=await cloudRecord(op.store,id);
        if(marker&&!live){operations.push(op);continue;}
      }
      // A real conflict is resolved only by the user's explicit selection.
      // Old generic-queue projects are reviewed with the same three options.
      // Deletes, malformed documents and other conflicting records must
      // remain pending for explicit recovery, never be silently dropped.
      return 'conflict';
    }
    if(!operations.length)return 'remote';
    return {kind:'replace',record:{...batch,operations}};
  }
  const records=['assets','blobs','projects'].flatMap(store=>(batch[store]||[]).map(item=>({store,id:item.id})));
  if(!records.length||!(batch.assets?.length||batch.projects?.length))return 'conflict';
  let present=0;
  for(let offset=0;offset<records.length;offset+=5){
    const found=await Promise.all(records.slice(offset,offset+5).map(async({store,id})=>{
      const result=cloudClient().from('shiye_records').select('record').eq('user_id',await identity()).eq('store',store).eq('id',id).maybeSingle();
      return checked(await result)?.record?.id===id;
    }));
    present+=found.filter(Boolean).length;
  }
  if(present===0)return 'rebase';
  // Legacy single-project import batches are not acknowledgements. A newer
  // copy may own the same ID; expose a deliberate version choice instead of
  // automatically keeping/overwriting either document.
  if(batch.projects?.length&&!batch.assets?.length&&!batch.blobs?.length)return 'conflict';
  // Mixed old imports can contain original blobs or source inventory. Until
  // their exact bytes are provably acknowledged, never silently drop them.
  return 'conflict';
}
// This durable, account-scoped outbox retains the complete batch, including
// original bytes. Only a successful cloud acknowledgement removes it.
async function pendingOperations(store){await identity();return unifiedSync.inspectPending(rows=>{const operations=[];for(const row of rows){if(row.record?.kind!=='batch')continue;const batch=row.record.payload;operations.push(...(batch.operations?.filter(op=>op.store===store)||(batch[store]||[]).map(item=>({action:'put',store,item}))));}return operations;});}
async function pendingOverride(store,id){await identity();return unifiedSync.inspectPending(rows=>{let result;for(const row of rows){if(row.record?.kind!=='batch')continue;const batch=row.record.payload;
  const operations=batch.operations|| (batch[store]||[]).map(item=>({action:'put',store,item}));
  for(const op of operations){if(op.store!==store)continue;if(op.action==='clear'||op.action==='delete'&&op.id===id)result={found:true};else if(op.action==='put'&&op.item.id===id)result={found:true,record:op.item};}
}return result;});}
async function overlayImports(store,records){const map=new Map(records.map(r=>[r.id,r]));for(const op of await pendingOperations(store)){if(op.action==='clear')map.clear();else if(op.action==='delete')map.delete(op.id);else map.set(op.item.id,op.item);}return [...map.values()];}
const cached=async key=>{try{const id=await account();return cacheDisabled?undefined:await cache?.get(id,key);}catch{return undefined;}};
const remember=async(key,value)=>{try{const id=await account();if(!cacheDisabled)await cache?.put(id,key,value);}catch{/* Cache quota/failure cannot fail a cloud operation. */}};
const checked=result=>{if(result.error){const failure=Error(result.error.message||'云端数据服务不可用');
  for(const key of ['code','status','statusCode'])if(result.error[key]!=null)failure[key]=result.error[key];
  throw failure;}return result.data;};
async function identity(){
  const id=owner??=(await requireCloudUser()).id;
  // Read-only tabs must subscribe too. Otherwise the channel exists only
  // after that tab writes, and a second open page misses committed changes.
  channel();
  return id;
}
let versionRead;
async function version(){
  // The five collection reads at startup share one version request. A later
  // refresh still starts a new request after this one settles.
  if(versionRead)return versionRead;
  const task=(async()=>{
    const id=await identity();
    const row=checked(await cloudClient().from('shiye_revisions').select('revision').eq('user_id',id).single());
    revision=Number(row.revision);
    return revision;
  })();
  versionRead=task;
  try{return await task;}finally{if(versionRead===task)versionRead=null;}
}
async function cloudAll(store){
  await identity();
  // IndexedDB and the remote revision endpoint are independent reads. Start
  // the local snapshot immediately, then compare it only after the revision
  // arrives. This removes one network round trip from a cold account open.
  const savedTask=snapshots.has(store)
    ?Promise.resolve(snapshots.get(store)):cached('records:'+store);
  if(revision===undefined)await version();
  const saved=await savedTask;
  if(saved?.revision===revision){snapshots.set(store,saved);return overlayImports(store,await Promise.all(saved.records.map(async r=>withProjectBase(store,await decode(store,structuredClone(r)),saved.revision))));}
  // PostgREST pagination consists of several independent HTTP transactions.
  // Do not cache a mixed-revision library when another device edits mid-read.
  for(let attempt=0;attempt<3;attempt++){
    const readRevision=revision,rows=[];
    const pageAt=async offset=>checked(await cloudClient().from('shiye_records').select('record').eq('user_id',owner).eq('store',store).order('id').range(offset,offset+499));
    const first=await pageAt(0);rows.push(...first);
    // Most collections fit on one page. For larger ones, overlap only two
    // independent page reads, then verify the global revision below.
    if(first.length===500)for(let offset=500;;offset+=1000){
      const pages=await Promise.all([pageAt(offset),pageAt(offset+500)]);
      rows.push(...pages[0]);
      if(pages[0].length<500)break;
      rows.push(...pages[1]);
      if(pages[1].length<500)break;
    }
    const verified=Number(checked(await cloudClient().from('shiye_revisions').select('revision').eq('user_id',owner).single()).revision);
    if(verified!==readRevision){revision=verified;continue;}
    const snapshot={revision:readRevision,records:rows.map(row=>row.record)};
    snapshots.set(store,snapshot);await remember('records:'+store,snapshot);
    return overlayImports(store,await Promise.all(snapshot.records.map(async record=>withProjectBase(store,await decode(store,structuredClone(record)),snapshot.revision))));
  }
  throw Error('读取期间其他设备持续修改资料；未缓存不完整的结果，请重试');
}
// Explicit repair/read path for a saved image whose IndexedDB copy is
// corrupt or Safari cannot decode it. Do not trust the local cached bytes.
// A missing remote record remains missing; never synthesize an image or
// overwrite any Cloud record from the recovery path.
async function cloudReloadBlob(id){
  if(typeof id!=='string'||!id)return undefined;
  const user=await identity();
  const {data,error}=await cloudClient().from('shiye_records')
    .select('record').eq('user_id',user).eq('store','blobs')
    .eq('id',id).maybeSingle();
  if(error)throw Error('无法读取云端原始图片记录：'+error.message);
  const record=data?.record;
  if(!record)return undefined;
  if(!['cos','supabase'].includes(record.storageProvider)||
     !record.storagePath?.startsWith(user+'/'))
     throw Error('云端原始图片路径不属于当前账号');
  const blob=await downloadObject(record.storagePath,record.storageProvider);
  if(!usableBlob(blob))throw Error('云端原始图片尚未上传完整');
  images.set(record.storagePath,Promise.resolve(blob));
  await remember('image:'+record.storagePath,blob).catch(error=>
    console.warn('原图已重新下载，但本机缓存写入待重试',error?.message));
  return {id,data:blob};
}
async function cloudGet(store,id){
  const pending=await pendingOverride(store,id);
  if(pending&&!(store==='blobs'&&pending.record&&!usableBlob(pending.record.data)))return structuredClone(pending.record);
  // Safari can restore an outbox row without its Blob bytes after a forced
  // termination. A valid cloud copy takes precedence over that broken row.
  if(pending?.record){const remote=await cloudRecord(store,id);return remote?decode(store,remote):undefined;}
  if(store==='blobs'&&id.startsWith('project-cover:'))return {id,data:await cloudPreview(id)};
  const record=await cloudRecord(store,id);return record?store==='projects'?cloudProjectDocument(withProjectBase(store,record,revision)):decode(store,record):undefined;
}
// A recovery-only export of the exact legacy projects held aside by the v2
// reader. Never mutate v1 data; private full-size project documents are read
// through the existing account-authenticated COS/Supabase download route.
async function cloudLegacyProjectBackup(){
 const legacy=(await cloudAll('projects')).filter(isLegacySceneProject);
 if(!legacy.length)throw Error('当前账号没有待导出的旧版作品');
 const projects=[];
 for(const summary of legacy){
  const full=summary.projectDocumentPath?await cloudProjectDocument(summary):summary;
  const {__cloudBaseRevision,__cloudSessionId,...source}=full;
  projects.push(structuredClone(source));
 }
 return new Blob([JSON.stringify({format:'shiye-legacy-project-recovery',
  version:1,exportedAt:new Date().toISOString(),projects},null,2)],{type:'application/json'});
}
async function cloudProjectDocument(record){
  const path=record.projectDocumentPath;if(!path)return record;
  if(!['cos','supabase'].includes(record.projectDocumentProvider))throw Error('作品文档缺少当前存储服务标记');
  if(!path.startsWith((await identity())+'/'))throw Error('作品不属于当前账号');
  if(!documents.has(path)){
    const task=(async()=>{let blob=await cached('project-document:'+path);if(!(blob instanceof Blob)){blob=await downloadObject(path,record.projectDocumentProvider);await remember('project-document:'+path,blob);}const full=JSON.parse(await projectBlobText(blob,record.projectDocumentEncoding));if(full.id!==record.id||!Array.isArray(full.drafts))throw Error('作品完整数据损坏');return full;})().catch(error=>{documents.delete(path);throw error;});documents.set(path,task);if(documents.size>8)documents.delete(documents.keys().next().value);
  }
  return mergeProjectSummary(structuredClone(await documents.get(path)),record);
}
async function cloudRecord(store,id){
  await identity();if(revision===undefined)await version();
  if(store!=='blobs'){const saved=snapshots.get(store)||await cached('records:'+store);if(saved?.revision===revision){snapshots.set(store,saved);return structuredClone(saved.records.find(r=>r.id===id));}}
  if(store==='blobs'){
    const saved=blobRecords.get(id)||await cached('blob-record:'+id);
    if(saved&&(saved.revision===revision||blobRevisionProof.valid(id,saved.revision,revision))){
      if(saved.revision!==revision)retainBlobRecord(id,{revision,record:saved.record});
      else retainBlobRecord(id,saved);
      return structuredClone(saved.record);
    }
  }
  if(store==='blobs')return batchBlobRecord(id);
  const row=checked(await cloudClient().from('shiye_records').select('record').eq('user_id',owner).eq('store',store).eq('id',id).maybeSingle());
  return row?.record;
}
const variantBlobKey=(path,tier)=>(tier===COVER_EDGE?'thumbnail480':'preview'+tier)+':'+path;
async function rememberImageVariant(path,tier,blob){
  await remember(variantBlobKey(path,tier),blob);
  // A tiny persistent index lets a later browser session reuse a cached 960px
  // image for a 480px request without probing ten IndexedDB blobs or COS.
  const key='cached-image-variants:'+path;
  const old=await cached(key),tiers=[...new Set([
    ...(Array.isArray(old)?old.filter(n=>DISPLAY_TIERS.includes(n)):[]),tier
  ])].sort((a,b)=>a-b);
  await remember(key,tiers);
}
async function cachedSufficientVariant(path,required){
  const index=await cached('cached-image-variants:'+path);
  if(!Array.isArray(index))return null;
  for(const tier of index.filter(n=>DISPLAY_TIERS.includes(n)&&n>required).sort((a,b)=>a-b)){
    const blob=await cached(variantBlobKey(path,tier));
    if(usableBlob(blob))return blob;
  }
  return null;
}
async function cloudPreview(id,pixels=480,{allowRemoteOriginal=true}={}){
  const variant=imageVariant(pixels),edge=Number(variant.slice(7));
  const pending=await pendingOverride('blobs',id);if(pending&&(!pending.record||usableBlob(pending.record.data)))return pending.record?await makeThumbnail(pending.record.data,edge)||pending.record.data:undefined;
  if(id.startsWith('project-cover:')){const match=/^project-cover:(cos|supabase):(.+)$/.exec(id);if(!match)throw Error('作品封面标识不是当前格式');const [,provider,path]=match;if(!path.startsWith((await identity())+'/'))throw Error('作品封面不属于当前账号');const key='thumbnail:'+path,saved=await cached(key);if(usableBlob(saved))return saved;const blob=await downloadObject(path,provider);if(!usableBlob(blob))throw Error('作品封面为空');await remember(key,blob);return blob;}
  const record=await cloudRecord('blobs',id);if(!record)return undefined;
  if(!['cos','supabase'].includes(record.storageProvider))throw Error('图片缺少当前存储服务标记');
  if(!record.storagePath?.startsWith(owner+'/'))throw Error('图片不属于当前账号');
  const thumbnailKey=variantBlobKey(record.storagePath,edge),saved=await cached(thumbnailKey);
  // A previously loaded thumb must be a zero-network read. Materialization
  // happens only on the COS CI miss path, not repeatedly for every tab.
  if(usableBlob(saved))return saved;
  // On a cold cover miss these independent account-scoped cache lookups used
  // to run one after another for every visible card. Keep the hit-only fast
  // path above, then overlap the remaining reads before any network request.
  const [higher,localOriginal]=await Promise.all([
    cachedSufficientVariant(record.storagePath,edge),
    cached('image:'+record.storagePath)
  ]);
  if(usableBlob(higher)){
    const reduced=await makeThumbnail(higher,edge);
    if(usableBlob(reduced)){await rememberImageVariant(record.storagePath,edge,reduced);return reduced;}
    return higher;
  }
  // If this device already holds the full image, derive the small card cover
  // locally. Do not fetch the same bytes again just to request a thumbnail.
  if(usableBlob(localOriginal)){
    const reduced=await makeThumbnail(localOriginal,edge);
    if(usableBlob(reduced)){await rememberImageVariant(record.storagePath,edge,reduced);return reduced;}
  }
  if(variant==='preview480'&&record.thumbnailPath?.endsWith('-preview480.webp')){
    if(!record.thumbnailPath.startsWith(owner+'/'))throw Error('缩略图不属于当前账号');
    try{const thumbnail=await downloadObject(record.thumbnailPath,record.storageProvider);if(!usableBlob(thumbnail))throw Error('缩略图为空');await rememberImageVariant(record.storagePath,edge,thumbnail);return thumbnail;}
    catch(error){console.warn('缩略图暂不可读，尝试从原图恢复',error?.message);}
  }
  // Legacy COS originals can already have a deterministic immutable WebP
  // despite their metadata not carrying thumbnailPath. Prefer that file over
  // another image-processing request.
  if(variant==='preview480'&&record.storageProvider==='cos'&&!record.thumbnailPath?.endsWith('-preview480.webp')){
    try{const stored=await downloadObject(record.storagePath+'-preview480.webp','cos');
      if(usableBlob(stored)){await rememberImageVariant(record.storagePath,edge,stored);return stored;}
    }catch{/* One-time cache miss; COS CI can synthesize the derivative. */}
  }
  // COS handles CI remotely. Never download and decode a full original just
  // because a catalog snapshot is absent or corrupt.
  if(record.storageProvider==='cos'){
    if(!objectStorage?.preview)throw Error('COS 固定封面尚未可用，未下载原图');
    const preview=await objectStorage.preview(record.storagePath,variant);
    if(!usableBlob(preview))throw Error('COS 固定封面为空，未下载原图');
    await rememberImageVariant(record.storagePath,edge,preview);
    if(variant==='preview480')materializePreview480(record,preview);
    return preview;
  }
  // Model requests and AI packages must not download a remote original merely
  // because this storage provider has no cover/variant object available.
  if(!allowRemoteOriginal)throw Error('素材派生封面尚不可用，未下载云端原图');
  // Other readers may use the authenticated Supabase recovery path.
  const {data}=await decode('blobs',record);
  const blob=await makeThumbnail(data,edge);if(blob){await rememberImageVariant(record.storagePath,edge,blob);return blob;}return data;
}
async function makeThumbnail(data,edge=480){
  if(typeof document==='undefined')return null;
  const bitmap=await decodeImageBlob(data);
  try{
    const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));
    const width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
    if(typeof OffscreenCanvas==='function'){
      const canvas=new OffscreenCanvas(width,height);
      canvas.getContext('2d').drawImage(bitmap,0,0,width,height);
      return await canvas.convertToBlob({type:'image/webp',quality:.9});
    }
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    canvas.getContext('2d').drawImage(bitmap,0,0,width,height);
    return await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9));
  }finally{bitmap.close?.();}
}
async function decode(store,record){
  if(store!=='blobs')return record;
  const {storagePath,storageProvider,...metadata}=record;
  if(!['cos','supabase'].includes(storageProvider))throw Error('图片缺少当前存储服务标记');
  if(!storagePath?.startsWith((await identity())+'/'))throw Error('图片不属于当前账号');
  if(!images.has(storagePath)){const pending=(async()=>{const saved=await cached('image:'+storagePath);if(usableBlob(saved))return saved;const data=await downloadObject(storagePath,storageProvider);if(!usableBlob(data))throw Error('云端图片为空');await remember('image:'+storagePath,data);return data;})().catch(error=>{images.delete(storagePath);throw error;});images.set(storagePath,pending);}
  const data=await images.get(storagePath);imageSizes.delete(storagePath);imageSizes.set(storagePath,data.size);let bytes=[...imageSizes.values()].reduce((a,b)=>a+b,0);for(const [path,size] of imageSizes){if(bytes<=64*1024*1024&&imageSizes.size<=48)break;if(path===storagePath)continue;images.delete(path);imageSizes.delete(path);bytes-=size;}return {...metadata,data};
}
function auxiliaryBlobIDs(operations){
  const auxiliary=new Set(),display=new Set();
  const add=(set,id)=>{if(typeof id==='string'&&id)set.add(id);};
  for(const op of operations){
    if(op.action!=='put')continue;
    const item=op.item;
    if(op.store==='assets'){
      for(const key of ['candidateFrameBlobId','initialMaskBlobId','finalMaskBlobId','photoBlobId'])add(auxiliary,item[key]);
      for(const key of ['blobId','originalBlobId','originalCutoutBlobId'])add(display,item[key]);
    }else if(op.store==='projects'){
      add(auxiliary,item.originalImportPhotoBlobID);
      for(const key of ['snapshotBlobId','previewBlobId'])add(display,item[key]);
    }else if(op.store==='meta'){
      for(const key of ['templateBlobId','exampleBlobId'])add(display,item[key]);
    }
  }
  for(const id of display)auxiliary.delete(id);
  return auxiliary;
}
async function encode(store,record,{makePreview=true}={}){
  if(store==='projects'){
    if(record.projectDocumentPath)record=await cloudProjectDocument(record);
    const {__cloudBaseRevision,__cloudSessionId,...persisted}=record;record=persisted;
    const text=JSON.stringify(record);let blob=new Blob([text],{type:'application/json'}),encoding;
    const inline=blob.size<=LARGE_PROJECT_BYTES,provider=writeProvider();
    let path;
    if(!inline){
      if(typeof CompressionStream==='function'&&typeof DecompressionStream==='function'){blob=await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();encoding='gzip';}
      const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()),hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
      path=(await objectRoot())+hash+'-project.json'+(encoding?'.gz':'');
      const uploaded=await uploadObject(path,blob,encoding?'application/gzip':'application/json',provider);
      if(uploaded.error&&String(uploaded.error.statusCode)!=='409')throw Error('作品完整数据上传失败，未修改云端元数据');
    }
    const summary=inline?structuredClone(record):{...projectSummary(record,path,encoding),projectDocumentProvider:provider};
    // Store a separate small WebP even when the editable project fits inline.
    // The scene digest avoids re-rendering when only metadata changes.
    const active=record.drafts?.find(d=>d.id===record.activeDraftID)||record.drafts?.[0];
    const cover=summary.drafts?.find(d=>d.id===record.activeDraftID)||summary.drafts?.[0];
    if(active&&cover&&!record.isSnapshot){
      const {coverImageID,coverSceneHash,...scene}=active;
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(scene)));
      const sceneHash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
      if(coverImageID?.endsWith('-preview480.webp')&&coverSceneHash===sceneHash){cover.coverImageID=coverImageID;cover.coverSceneHash=sceneHash;}
      else{
        delete cover.coverImageID;delete cover.coverSceneHash;
        try{
          const preview=await projectPreview(record);
          if(usableBlob(preview)){
            const coverPath=(await objectRoot())+sceneHash+'-preview480.webp';
            const result=await uploadObject(coverPath,preview,preview.type||'image/webp',provider);
            if(!result.error||String(result.error.statusCode)==='409'||result.error.statusCode===409){
              cover.coverImageID='project-cover:'+provider+':'+coverPath;
              cover.coverSceneHash=sceneHash;
              await remember('thumbnail:'+coverPath,preview);
            }
          }
        }catch(error){console.warn('作品 COS 快照生成或上传失败；保留可编辑正文，下次同步重试',record.id,error);}
      }
    }
    if(!inline){await remember('project-document:'+path,blob);documents.set(path,Promise.resolve(structuredClone(record)));if(documents.size>8)documents.delete(documents.keys().next().value);}
    return summary;
  }
  if(store!=='blobs')return record;
  if(!usableBlob(record.data))throw Error('图片字节丢失或为空；云端元数据未修改');
  const bytes=await record.data.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
  const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const storagePath=`${await objectRoot()}${hash}`,provider=writeProvider();
  if(!uploads.has(storagePath)){const task=(async()=>{const uploaded=await uploadObject(storagePath,record.data,record.data.type||'application/octet-stream',provider);if(uploaded.error&&uploaded.error.statusCode!=='409'&&uploaded.error.statusCode!==409)throw Error('图片上传失败，未保存元数据');})().catch(error=>{uploads.delete(storagePath);throw error;});uploads.set(storagePath,task);}
  // The optional thumbnail is independent of the original PUT. Start both
  // together, but never commit metadata until the original is acknowledged.
  // This avoids serial upload latency without changing the safety boundary.
  if(makePreview&&!thumbnailUploads.has(storagePath)){
    const task=(async()=>{try{const thumbnail=await makeThumbnail(record.data);if(!thumbnail)return null;const path=storagePath+'-preview480.webp',result=await uploadObject(path,thumbnail,'image/webp',provider);if(result.error&&String(result.error.statusCode)!=='409')return null;await rememberImageVariant(storagePath,COVER_EDGE,thumbnail);return path;}catch{return null;}})();
    thumbnailUploads.set(storagePath,task);
    void task.then(path=>{if(!path)thumbnailUploads.delete(storagePath);});
  }
  const thumbnailTask=makePreview?thumbnailUploads.get(storagePath):Promise.resolve(null);
  let thumbnailPath;
  await uploads.get(storagePath);thumbnailPath=await thumbnailTask;
  await remember('image:'+storagePath,record.data);retainImage(storagePath,record.data);
  const {data,thumbnailPath:_oldThumbnail,...metadata}=record;return {...metadata,storagePath,storageProvider:provider,...(thumbnailPath?{thumbnailPath}:{})};
}
function cloudTransaction(names,fn,operationID=crypto.randomUUID()){
  assertAccountWritable();
  const operations=[];const result=fn({objectStore(store){if(!names.includes(store))throw Error('此表未加入事务');return {put:record=>operations.push({action:'put',store,item:structuredClone(record)}),delete:id=>operations.push({action:'delete',store,id}),clear:()=>operations.push({action:'clear',store})};}});
  if(result?.then)throw Error('事务回调必须同步');
  const run=async()=>{
    assertAccountWritable();
    writesInFlight++;activeDirect={startedAt:Date.now(),phase:'准备上传',done:0,total:operations.filter(op=>op.action==='put').length};reportSync();
    try{
    await identity();if(revision===undefined)await version();
    const previous=revision;
    operations.push(...recordTombstones(operations).slice(operations.length));
    const puts=operations.filter(op=>op.action==='put'),auxiliary=auxiliaryBlobIDs(operations);activeDirect.total=puts.length;activeDirect.phase='编码与上传';reportSync();
    for(let offset=0;offset<puts.length;offset+=3)try{
      await Promise.all(puts.slice(offset,offset+3).map(async op=>{
        try{op.item=await encode(op.store,op.item,{makePreview:op.store!=='blobs'||!auxiliary.has(op.item.id)});}
        catch(error){throw markSyncPhase(error,'编码与上传 '+op.store);}
      }));
      activeDirect.done=Math.min(puts.length,offset+3);reportSync();
    }catch(error){throw markSyncPhase(error,'编码云端记录');}
    assertAccountWritable();activeDirect.phase='提交事务';reportSync();
    let data;
    try{data=checked(await cloudClient().rpc('shiye_commit_v2',{
      operations,expected_revision:previous,operation_id:operationID
    }));}catch(error){throw markSyncPhase(error,'云端提交事务');}revision=Number(data);
    // A WebP cover becomes usable only after both its object PUT and the
    // metadata commit succeed. Update the current Works UI immediately rather
    // than waiting for a full collection reload (which recreated every card).
    if(typeof window!=='undefined')for(const op of operations){
      if(op.store!=='projects'||op.action!=='put'||op.item.isSnapshot)continue;
      const cover=op.item.drafts?.find(d=>d.id===op.item.activeDraftID)||op.item.drafts?.[0];
      if(!cover?.coverImageID)continue;
      window.dispatchEvent(new CustomEvent('shiye-project-cover-ready',{detail:{
        projectID:op.item.id,updatedAt:op.item.updatedAt,draftID:cover.id,
        coverImageID:cover.coverImageID,coverSceneHash:cover.coverSceneHash
      }}));
    }
    if(revision===previous+1)blobRevisionProof.accept(previous,revision,{
      blobIDs:operations.filter(op=>op.store==='blobs'&&op.action!=='clear').map(op=>op.item?.id||op.id),
      allBlobs:operations.some(op=>op.store==='blobs'&&op.action==='clear')
    });
    else{blobRevisionProof.clear();blobRecords.clear();}
    for(const op of operations)if(op.store==='blobs'&&op.action==='put'){
      const saved={revision,record:op.item};retainBlobRecord(op.item.id,saved);
      await remember('blob-record:'+op.item.id,saved);
    }
    // Patch only cached collections belonging to the committed base revision.
    // Remote conflicts never write to this cache or silently become local edits.
    for(const store of ['assets','series','projects','trash','meta','blobs']){
      const saved=snapshots.get(store)||await cached('records:'+store);if(saved?.revision!==previous)continue;
      const records=new Map(saved.records.map(r=>[r.id,r]));for(const op of operations.filter(o=>o.store===store)){if(op.action==='clear')records.clear();else if(op.action==='delete')records.delete(op.id);else records.set(op.item.id,op.item);}
      const next={revision,records:[...records.values()]};snapshots.set(store,next);await remember('records:'+store,next);
    }
    await unifiedSync.advance(previous,revision,operations);
    try{channel()?.postMessage({source:sessionTag,type:'committed',revision});}
    catch(error){console.warn('跨标签页同步通知暂不可用，云端提交仍已完成',error?.message);}
    }finally{writesInFlight--;activeDirect=null;reportSync();}
  };
  const pending=queue.then(run).catch(error=>{
    syncDiagnostics.record({action:'failed',kind:'direct',baseRevision:revision,pending:unifiedSync.status().pending,
      cloudRevision:revision,error});
    throw error;
  });queue=pending.catch(()=>{});return pending;
}
async function cloudCheckpoint(){
  await cloudFlushProjects();
  await identity();const current=Number(checked(await cloudClient().from('shiye_revisions').select('revision').eq('user_id',owner).single()).revision);
  if(revision!==undefined&&revision!==current)throw Error('另一设备已更新资料，请刷新后重试；未导出不一致的备份');
  return current;
}
async function cloudCachedCollections(){
  await identity();
  // Read all account-scoped snapshots in one IndexedDB burst. Metadata is
  // optional for older caches; the four catalog collections still form an
  // all-or-nothing verified view at one revision.
  const stores=['assets','series','projects','trash','meta'];
  const rows=await Promise.all(stores.map(store=>cached('records:'+store)));
  const base=rows[0]?.revision;
  if(base===undefined||rows.slice(0,4).some(row=>!row||row.revision!==base))return null;
  const result={};
  await Promise.all(stores.map(async(store,index)=>{
    const saved=rows[index];
    if(!saved||saved.revision!==base)return;
    result[store]=await overlayImports(store,structuredClone(saved.records).map(record=>withProjectBase(store,record,saved.revision)));
  }));
  blobRevisionProof.clear();blobRecords.clear();revision=base;
  return result;
}
async function cloudRefresh(){
  await queue;
  const before=revision;
  const missing=['assets','series','projects','trash','meta','blobs'].filter(store=>!snapshots.has(store));
  const [current,cachedRows]=await Promise.all([
    version(),Promise.all(missing.map(store=>cached('records:'+store)))
  ]);
  missing.forEach((store,index)=>{if(cachedRows[index])snapshots.set(store,cachedRows[index]);});
  // Reconciliation may already have read the latest global revision.
  // Download decisions MUST also compare the cached collection revisions:
  // otherwise a remote-won edit stays invisible until another change occurs.
  const stale=[...snapshots.values()].some(row=>row.revision!==current);
  const changed=(before!==undefined&&before!==current)||stale;
  if(!changed)return {revision:current,changed:false};
  const deltaBefore=snapshots.get('projects')?.revision??snapshots.get('assets')?.revision??before;
  const delta=await readCloudDelta({client:cloudClient(),owner,before:deltaBefore,after:current,snapshots});
  if(delta){blobRevisionProof.accept(deltaBefore,current,delta);for(const [store,snapshot] of delta.snapshots)snapshots.set(store,snapshot);
    await Promise.all([...delta.snapshots].map(([store,snapshot])=>remember('records:'+store,snapshot)));
    return {revision:current,changed:true,incremental:true,blobIDs:delta.blobIDs,allBlobs:delta.allBlobs};}
  blobRevisionProof.clear();blobRecords.clear();
  return {revision:current,changed:true,incremental:false,allBlobs:true};
}
// Migration is an explicit user action. Scan raw account records rather than
// cloudAll('blobs'), which would needlessly download every original image.
// Only known converters may produce write operations; unknown formats stay put.
async function cloudMigrationInventory(){
 await identity();
 const start=await version(),stores=['assets','series','projects','blobs','meta','trash'],collections={};
 for(const store of stores){
  const records=[];
  for(let offset=0;;offset+=250){
   const page=checked(await cloudClient().from('shiye_records').select('record')
    .eq('user_id',owner).eq('store',store).order('id').range(offset,offset+249));
   records.push(...page.map(row=>row.record));
   if(page.length<250)break;
  }
  collections[store]=records;
 }
 const end=await version();
 if(start!==end)throw Error('迁移扫描期间云端资料被修改，请重新扫描；尚未修改任何作品');
 return {account:owner,revision:start,collections};
}
async function cloudMigrationOriginalProject(record){
 await identity();
 if(!record?.projectDocumentPath)return structuredClone(record);
 const path=record.projectDocumentPath;
 if(!path.startsWith(owner+'/')||!['cos','supabase'].includes(record.projectDocumentProvider))
  throw Error('完整作品路径或存储服务不合法，不允许迁移');
 const blob=await downloadObject(path,record.projectDocumentProvider);
 const full=JSON.parse(await projectBlobText(blob,record.projectDocumentEncoding));
 if(full?.id!==record.id||!Array.isArray(full.drafts))throw Error('原始作品文档与摘要不一致');
 // Return the unmodified COS/Supabase document, NOT a summary merge that can
 // overwrite old leaf arrays with empty metadata placeholders.
 return full;
}
async function cloudMigrationCommit({expectedRevision,changes}){
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!Array.isArray(changes)||changes.length>200)
  throw Error('迁移计划不合法');
 if(!changes.length)return {updated:0,revision:expectedRevision};
 if(changes.some(change=>!['projects','trash'].includes(change.store)||
   !change.converted||change.id!==change.converted.id))throw Error('迁移写入目标不安全');
 await identity();await queue;
 const [pendingProjects,pendingImports]=await Promise.all([projectSync.pending(),importSync.pending()]);
 // A queued phone edit to work A must not block migration of unrelated work
 // B. Keep both outboxes durable and refuse overlapping records, deletes,
 // clears, tombstones or unknown corrupt queue entries.
 const conflicts=migrationPendingConflicts(changes,{projects:pendingProjects,imports:pendingImports,quarantined:projectOutboxQuarantine});
 if(conflicts.length)throw Error('有 '+conflicts.length+' 项本机待同步操作与拟转换资料重叠；原始备份和待同步数据均保留，请先处理对应项目');
 const current=await version();
 if(current!==expectedRevision)throw Error('迁移扫描后云端版本已变化，请重新扫描；未覆盖任何资料');
 const stores=[...new Set(changes.map(row=>row.store))];
 await cloudTransaction(stores,tx=>{
  for(const change of changes)tx.objectStore(change.store).put(change.converted);
 });
 return {updated:changes.length,revision};
}
async function cloudStageProject(record){
  assertAccountWritable();
  if(!usableProjectSnapshot(record))throw Error('作品编辑数据不完整；云端已保存版本未被覆盖');
  await identity();if(revision===undefined)await version();
  const known=(snapshots.get('projects')||await cached('records:projects'))?.records.some(item=>item.id===record.id);
  // Bind every newly created work to an editor session BEFORE staging it.
  // Otherwise its acknowledged first save cannot advance a reliable local
  // baseline and the very next save may be misclassified as a stale edit.
  // Existing untagged documents remain conservative (base revision zero).
  record.__cloudSessionId||=crypto.randomUUID();
  const registered=editorBases.get(record.__cloudSessionId);
  const baseRevision=registered!==undefined?registered:
    Number.isSafeInteger(record.__cloudBaseRevision)?record.__cloudBaseRevision:known?0:revision;
  if(registered===undefined)editorBases.set(record.__cloudSessionId,baseRevision);
  return projectSync.stage(record,{baseRevision});
}
async function cloudStageImport(batch){assertAccountWritable();await identity();if(revision===undefined)await version();await importSync.stage({...batch,id:crypto.randomUUID()});return {pending:true};}
async function cloudStageMutation(names,fn){
  assertAccountWritable();
  const operations=[],modifiedAt=new Date().toISOString(),result=fn({objectStore(store){if(!names.includes(store))throw Error('此表未加入事务');return {put:item=>operations.push({action:'put',store,item:structuredClone(item),modifiedAt}),delete:id=>operations.push({action:'delete',store,id,modifiedAt}),clear:()=>operations.push({action:'clear',store,modifiedAt})};}});
  if(result?.then)throw Error('事务回调必须同步');if(!operations.length)return;
  operations.push(...recordTombstones(operations).slice(operations.length));
  names=[...new Set([...names,...operations.map(op=>op.store)])];
  await identity();if(revision===undefined)await version();
  const deletedIDs=operations.filter(op=>op.store==='projects'&&op.action==='delete').map(op=>op.id);
  if(!deletedIDs.length){await importSync.stage({id:crypto.randomUUID(),names,operations});return;}
  // Persist the delete + full trash snapshot before touching older pending
  // saves. Waiting for the network-held account lock here made Delete appear
  // frozen while an unrelated upload retried. The unified outbox serializes
  // local stages; tombstones prevent an older PUT from reviving a later delete.
  await importSync.stage({id:crypto.randomUUID(),names,operations});
  try{await projectSync.cancelPendingFor(deletedIDs);}
  catch(error){console.warn('旧作品保存待后台清理；删除事务已安全暂存',error?.message);}
}
async function cloudPendingProjects(){await identity();return projectSync.pending();}
// Metadata-only lookup: do NOT download every full-resolution photo just to
// build the backup list. Fetch each Blob individually while ZIP is streamed.
async function cloudBackupBlobIDs(){
  await identity();
  for(let attempt=0;attempt<3;attempt++){
    const before=await version(),ids=[];
    for(let offset=0;;offset+=500){
      const page=checked(await cloudClient().from('shiye_records').select('id').eq('user_id',owner).eq('store','blobs').order('id').range(offset,offset+499));
      ids.push(...page.map(item=>item.id));if(page.length<500)break;
    }
    if(await version()===before)return ids;
  }
  throw Error('云端资料持续变化，请稍后重新导出；没有生成混合版本备份');
}

// Read the shared durable queue, not just this tab's in-memory status. This
// intentionally does not contact the server, so logout remains possible when
// the network is unavailable after local staging succeeds.
async function cloudPendingLocalSummary(){const rows=await unifiedSync.pending();return {projects:projectSyncRows(rows).length,imports:importSyncRows(rows).length,quarantined:unifiedQuarantine.length};}
// Manual conflict handling is separate from ordinary synchronization. No
// pending bytes are discarded until an explicit comparison/backup and choice.
async function reviewedConflict(kind,id){
 if(!['project','batch'].includes(kind)||typeof id!=='string'||!id)throw Error('冲突记录标识无效');
 await identity();
 const sync=kind==='project'?projectSync:importSync;
 const row=(await sync.pending()).find(item=>item.record?.id===id);
 if(!row)throw Error('待同步记录已改变或已完成，请重新打开同步详情');
 if(await wasCommitted(row.operationID,row.baseRevision))
   throw Error('服务器已经确认这次保存，请重新打开同步详情刷新作品');
 let local;
 if(kind==='project')local=row.record;
 else{
  const ops=row.record?.operations;
  if(Array.isArray(ops)&&ops.length===1&&ops[0]?.store==='projects'&&ops[0]?.action==='put')
    local=ops[0].item;
  else if(!ops&&Array.isArray(row.record?.projects)&&row.record.projects.length===1&&
    !(row.record.assets||[]).length&&!(row.record.blobs||[]).length)
    local=row.record.projects[0];
  else throw Error('此批次有多条不同操作，请先保留应急备份，不能只选择一个作品的版本');
 }
 if(!usableProjectSnapshot(local))throw Error('本机可编辑作品结构不完整，请先保留应急备份');
 const current=await version();
 if(current<=row.baseRevision)throw Error('云端没有比本机基线更新的版本，可直接尝试同步');
 const untouched=await canRebaseUnchangedKeys({client:cloudClient(),owner:await identity(),
  before:row.baseRevision,after:current,operations:[{store:'projects',action:'put',item:local}]});
 if(untouched)throw Error('云端变化与此作品无关，请先尝试正常同步');
 const stored=await cloudRecord('projects',local.id);
 const remote=stored?(stored.projectDocumentPath?await cloudProjectDocument(stored):stored):null;
 const summary=project=>({id:project?.id||null,title:project?.title||'未命名作品',
  updatedAt:project?.updatedAt||null,drafts:project?.drafts?.length||0,
  layers:(project?.drafts||[]).reduce((n,d)=>n+(Array.isArray(d.layers)?d.layers.length:0),0)});
 return {kind,id,serial:row.serial,baseRevision:row.baseRevision,
  revision:current,local:structuredClone(local),remote:remote?structuredClone(remote):null,
  overview:{local:summary(local),remote:remote?summary(remote):null}};
}
// Offline recoveries are never uploaded implicitly: the user selects a
// copy, which is staged under a NEW project ID so the current cloud scene
// cannot be overwritten by a stale pre-conflict version.
async function cloudListPreConflictScenes(){
 await identity();return structuredClone(await cached('pre-conflict-scene-index')||[]);
}
async function cloudRestorePreConflictScene(key){
 await identity();
 const index=await cloudListPreConflictScenes();
 if(!index.some(entry=>entry.key===key))throw Error('找不到可恢复的冲突前画布');
 const pair=await cached(key);
 if(pair?.kind!=='shiye-pre-conflict-scene-pair'||!usableProjectSnapshot(pair.local))
   throw Error('冲突前存档内容不完整，不能恢复');
 const copy=forkConflictingEditableWork(pair.local);
 if(!copy)throw Error('无法建立独立恢复作品');
 copy.title=String(pair.local.title||'作品').slice(0,60)+' · 冲突前恢复';
 copy.__cloudSessionId=crypto.randomUUID();
 await cloudStageProject(copy);
 return {id:copy.id,title:copy.title};
}
async function cloudConflictReview(kind,id){
 const {kind:k,id:key,serial,baseRevision,revision,overview}=await reviewedConflict(kind,id);
 return {kind:k,id:key,serial,baseRevision,revision,overview};
}
async function cloudConflictBackup(kind,id){
 const review=await reviewedConflict(kind,id);
 const {kind:k,serial,baseRevision,revision,local,remote}=review;
 const payload={format:'shiye-scene-conflict-backup',version:1,account:await identity(),
  savedAt:new Date().toISOString(),queueKind:k,pendingID:id,serial,baseRevision,
  cloudRevision:revision,local,remote};
 const bytes=new TextEncoder().encode(JSON.stringify(payload,null,2));
 if(bytes.byteLength>36*1024*1024)throw Error('冲突双方备份超过 36 MB，请先使用待同步应急备份');
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 return {blob:new Blob([bytes],{type:'application/json'}),sha256:hash,
  kind:k,id,serial,revision,localID:local.id};
}
async function cloudResolveProjectConflict({kind,id,serial,expectedRevision,choice}={}){
 if(!['project','batch'].includes(kind)||!['cloud','local','both'].includes(choice)||
    !Number.isSafeInteger(serial)||!Number.isSafeInteger(expectedRevision))
   throw Error('冲突选择参数不合法');
 return withAccountSyncLock(async()=>{
  const review=await reviewedConflict(kind,id);
  if(review.serial!==serial||review.revision!==expectedRevision)
   throw Error('确认期间云端或本机版本发生变化；请重新下载双方备份');
  const sync=kind==='project'?projectSync:importSync;
  const {local,remote}=review;
  const pending=(await sync.pending()).find(item=>item.record?.id===id);
  if(!pending||pending.serial!==serial)throw Error('本机作品又被编辑，请重新检查版本');
  if(choice==='cloud'){
   if(!remote)throw Error('云端没有这份作品，不能选择保留云端版本');
   await sync.resolvePending(id,serial);
   notifyCloudSuperseded();
   return {choice,originalID:local.id,remoteID:remote?.id||null};
  }
  if(choice==='both'){
   const copy=forkConflictingEditableWork(local);
   if(!copy)throw Error('本机旧稿无法安全复制，原始数据保持不变');
   copy.__cloudSessionId=crypto.randomUUID();
   editorBases.set(copy.__cloudSessionId,expectedRevision);
   const replacement=kind==='project'?copy:
     {...pending.record,id:crypto.randomUUID(),names:['projects'],
       operations:[{store:'projects',action:'put',item:copy}]};
   await sync.resolvePending(id,serial,{record:replacement,baseRevision:expectedRevision});
   if(kind==='project'&&typeof window!=='undefined')
    window.dispatchEvent(new CustomEvent('shiye-project-conflict-copy',{detail:{
     originalId:local.id,copyId:copy.id,title:copy.title,
     originalSessionId:local.__cloudSessionId,newSessionId:copy.__cloudSessionId
    }}));
   return {choice,originalID:local.id,copyID:copy.id};
  }
  // Choosing local explicitly keeps the remote document under a distinct
  // recoverable ID BEFORE replacing the remote project's original ID. These
  // two writes form ONE revision-CAS transaction, never timestamp overwrite.
  if(!remote||!usableProjectSnapshot(remote))
   throw Error('云端原稿缺失或无法校验，不能直接覆盖；可以选择保留双方');
  const retained=forkConflictingEditableWork(remote);
  if(!retained)throw Error('无法安全保存云端旧版，未覆盖任何作品');
  retained.title=String(remote.title||'未命名作品').slice(0,60)+' · 覆盖前云端备份';
  const fresh=structuredClone(local);
  delete fresh.__cloudBaseRevision;delete fresh.__cloudSessionId;
  // The pending operation ID makes a lost acknowledgement idempotent.
  await cloudTransaction(['projects'],tx=>{
   tx.objectStore('projects').put(retained);
   tx.objectStore('projects').put(fresh);
  },pending.operationID);
  await sync.resolvePending(id,serial);
  if(local.__cloudSessionId)editorBases.set(local.__cloudSessionId,revision);
  notifyCloudSuperseded();
  return {choice,originalID:local.id,remoteBackupID:retained.id};
 });
}
async function cloudRunExclusiveReset(task){
  if(typeof task!=='function')throw Error('账号清理任务无效');
  await identity();
  // Freeze immediately, BEFORE acquiring a lock. Previously we drained an
  // arbitrarily large backlog, so emptying an account could appear hung.
  resetInProgress=true;
  unifiedSync.pause();
  return withAccountSyncLock(async()=>{
    // Only transactions already in progress may finish; enqueued old tasks
    // fail fast against resetInProgress. Server revision CAS protects races. 
    await queue;
    // No automatic retry or resumption of old edits after a partial purge.
    // The caller is responsible for explicit recovery or finishing the reset.
    return task();
  });
}
async function cloudCloseCacheBeforeRemoteReset(){
  resetInProgress=true;
  unifiedSync.pause();
  cacheDisabled=true;
  await cache?.close?.();
}
async function cloudPurgeLocalAfterReset(){
  const user=await account();
  // Disable reads and background upload at this instance before erasing the
  // durable outbox. Caller has already stopped editing and received reset:true.
  cacheDisabled=true;
  images.clear();imageSizes.clear();documents.clear();snapshots.clear();blobRecords.clear();blobRevisionProof.clear();
  uploads.clear();thumbnailUploads.clear();editorBases.clear();
  if(typeof cache?.purgeAccount!=='function')throw Error('浏览器不支持完整账号本地清理');
  const count=await cache.purgeAccount(user);
  await cache.close?.();
  syncDiagnostics.clear();
  return count;
}
async function cloudPendingDetails(){await identity();const [projects,imports]=await Promise.all([projectSync.pending(),importSync.pending()]);return {projects:projects.map(row=>({id:row.record.id,title:row.record.title||'未命名作品',baseRevision:row.baseRevision})),batches:imports.map(row=>({id:row.record.id,baseRevision:row.baseRevision,items:row.record.operations?.map(op=>({store:op.store,action:op.action,title:op.item?.title||op.item?.name||op.id||'',id:op.item?.id||op.id||''}))||['assets','projects','blobs'].flatMap(store=>(row.record[store]||[]).map(item=>({store,action:'put',title:item.title||'',id:item.id})))})),error:unifiedSync.status().error?.message||null,quarantined:unifiedQuarantine.length};}
function cloudSyncDiagnosticReport({online=null}={}){
  const status=unifiedSync.status();
  return syncDiagnostics.report({pending:status.pending+writesInFlight,conflicts:status.conflicts,uploading:status.uploading||writesInFlight>0,
    revision,writesInFlight,quarantined:unifiedQuarantine.length,online,active:activeDirect?{...activeDirect,elapsedMs:Date.now()-activeDirect.startedAt}:null});
}
async function cloudDiscardPending(){await identity();if(writesInFlight||!unifiedSync.canDiscard())throw Error('上传正在进行，请等待当前请求结束');const count=await unifiedSync.discard();reportSync();return count;}
async function cloudFlushProjects({background=false}={}){
  await identity();if(revision===undefined)await version();
  if(background)return unifiedSync.resumeScheduled();
  return unifiedSync.flush();
}
async function cloudClearCache(){const id=await account();cacheDisabled=true;try{images.clear();imageSizes.clear();documents.clear();snapshots.clear();blobRecords.clear();blobRevisionProof.clear();editorBases.clear();await cache?.clear(id);syncDiagnostics.clear();}catch(error){cacheDisabled=false;throw error;}}
function cloudResumeCache(){cacheDisabled=false;}
async function cloudEmergencySnapshot(){
  if(!owner||!cache)throw Error('尚无已验证的本机账号缓存，无法离线导出待同步数据');
  const key=await account(),rows=await unifiedSync.pending();
  return {account:key,projects:projectSyncRows(rows),imports:importSyncRows(rows)};
}
async function cloudRestoreEmergency(snapshot){
  if(!owner||!cache||cacheDisabled)throw Error('请先登录目标账号，再恢复应急资料');
  const key=await account();if(snapshot.account!==key)throw Error('应急资料不属于当前账号，未改动本机数据');
  if(typeof cache.restoreUnifiedOutboxes!=='function')throw Error('当前浏览器不支持原子恢复唯一同步队列');
  return cache.restoreUnifiedOutboxes(key,snapshot.projects,snapshot.imports);
}
return {cloudListPreConflictScenes,cloudRestorePreConflictScene,cloudReloadBlob,cloudCloseCacheBeforeRemoteReset,cloudSetResetCleanupPending,cloudRunExclusiveReset,cloudPurgeLocalAfterReset,cloudConflictReview,cloudConflictBackup,cloudResolveProjectConflict,cloudMigrationInventory,cloudMigrationOriginalProject,cloudMigrationCommit,cloudLegacyProjectBackup,cloudAll,cloudGet,cloudPreview,cloudTransaction,cloudStageMutation,cloudCheckpoint,cloudCachedCollections,cloudRefresh,cloudClearCache,cloudResumeCache,cloudStageProject,cloudStageImport,cloudPendingProjects,cloudPendingLocalSummary,cloudPendingDetails,cloudSyncDiagnosticReport,cloudDiscardPending,cloudFlushProjects,cloudProjectDocument,cloudEmergencySnapshot,cloudRestoreEmergency,cloudBackupBlobIDs};
}
let projectPreview=()=>null;
export const setCloudProjectPreview=producer=>{projectPreview=producer;};
const current=createCloudStore({cloudClient,requireCloudUser,cache:privateCache,namespace:import.meta.env?.VITE_SHIYE_SUPABASE_URL||'cloud',projectPreview:record=>projectPreview(record),objectStorage:createCOSStore({client:cloudClient,enabled:import.meta.env?.VITE_SHIYE_OBJECT_STORAGE==='cos'})});
export const cloudCloseCacheBeforeRemoteReset=()=>current.cloudCloseCacheBeforeRemoteReset();
export const cloudSetResetCleanupPending=(...args)=>current.cloudSetResetCleanupPending(...args);
export const cloudRunExclusiveReset=(...args)=>current.cloudRunExclusiveReset(...args);
export const cloudPurgeLocalAfterReset=(...args)=>current.cloudPurgeLocalAfterReset(...args);
export const cloudConflictReview=(...args)=>current.cloudConflictReview(...args);
export const cloudListPreConflictScenes=()=>current.cloudListPreConflictScenes();
export const cloudRestorePreConflictScene=(key)=>current.cloudRestorePreConflictScene(key);
export const cloudConflictBackup=(...args)=>current.cloudConflictBackup(...args);
export const cloudResolveProjectConflict=(...args)=>current.cloudResolveProjectConflict(...args);
export const cloudLegacyProjectBackup=(...args)=>current.cloudLegacyProjectBackup(...args);
export const cloudMigrationInventory=(...args)=>current.cloudMigrationInventory(...args);
export const cloudMigrationOriginalProject=(...args)=>current.cloudMigrationOriginalProject(...args);
export const cloudMigrationCommit=(...args)=>current.cloudMigrationCommit(...args);
export const cloudAll=(...args)=>current.cloudAll(...args);
export const cloudGet=(...args)=>current.cloudGet(...args);
export const cloudReloadBlob=(...args)=>current.cloudReloadBlob(...args);
export const cloudTransaction=(...args)=>current.cloudTransaction(...args);
export const cloudCheckpoint=(...args)=>current.cloudCheckpoint(...args);
export const cloudCachedCollections=(...args)=>current.cloudCachedCollections(...args);
export const cloudRefresh=(...args)=>current.cloudRefresh(...args);
export const cloudClearCache=(...args)=>current.cloudClearCache(...args);
export const cloudResumeCache=(...args)=>current.cloudResumeCache(...args);
export const cloudPreview=(...args)=>current.cloudPreview(...args);
export const cloudStageProject=(...args)=>current.cloudStageProject(...args);
export const cloudStageImport=(...args)=>current.cloudStageImport(...args);
export const cloudStageMutation=(...args)=>current.cloudStageMutation(...args);
export const cloudPendingProjects=(...args)=>current.cloudPendingProjects(...args);
export const cloudPendingLocalSummary=(...args)=>current.cloudPendingLocalSummary(...args);
export const cloudPendingDetails=(...args)=>current.cloudPendingDetails(...args);
export const cloudSyncDiagnosticReport=(...args)=>current.cloudSyncDiagnosticReport(...args);
export const cloudDiscardPending=(...args)=>current.cloudDiscardPending(...args);
export const cloudFlushProjects=(...args)=>current.cloudFlushProjects(...args);
export const cloudProjectDocument=(...args)=>current.cloudProjectDocument(...args);
export const cloudEmergencySnapshot=(...args)=>current.cloudEmergencySnapshot(...args);
export const cloudRestoreEmergency=(...args)=>current.cloudRestoreEmergency(...args);
export const cloudBackupBlobIDs=(...args)=>current.cloudBackupBlobIDs(...args);
