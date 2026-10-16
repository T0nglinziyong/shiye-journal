import {markSyncPhase} from './sync-browser-compat.js';
const failureCode=error=>String(error?.code??error?.status??error?.statusCode??error?.cause?.code??'');
function failureClass(error){
  const code=failureCode(error);
  if(code==='40001'||code==='409')return 'conflict';
  if(code==='401'||code==='403'||code==='28000')return 'auth';
  if(code==='P0001'||code.startsWith('22')||code.startsWith('23')||code==='413'||code==='507')return 'invalid';
  if(code==='429')return 'rate-limit';
  return 'transient';
}
function retryDelay(attempt,operationID){
  let hash=2166136261;
  for(const character of String(operationID||''))hash=Math.imul(hash^character.charCodeAt(0),16777619);
  return Math.min(60000,2000*2**Math.min(attempt-1,5))+(hash>>>0)%997;
}
// Durable edits are an explicit outbox, not a replacement for cloud records.
// Commit acknowledgement is the only point at which an entry is removed.
export function createProjectSync({load,write,commit,revision,reconcile=async()=> 'conflict',recordKeys=record=>[{store:'projects',id:record.id}],coalesce=()=>null,splitCoalesced=()=>null,onCommitted=()=>{},onConflict=async()=>null,onForked=()=>{},onReplaced=()=>{},onSuperseded=()=>{},onStatus=()=>{},onDiagnostic=()=>{},runExclusive=fn=>fn(),prepare=async()=>{},reload=load,authoritativeCommit=false,autoFlushDelayMs=0,setTimer=setTimeout,clearTimer=clearTimeout,clock=()=>Date.now()}){
  let initialized,staging=Promise.resolve(),network,serial=0,error,paused=false,rebuilding=false;
  let persistedRows=new Map();
  let conflicts=new Set();
  // Durable local staging is immediate; only the remote commit is batched.
  const flushWindow=Math.max(0,Number(autoFlushDelayMs)||0);
  let autoTimer=null,lastNetworkAt=null;
  const cancelAuto=()=>{if(autoTimer!==null){clearTimer(autoTimer);autoTimer=null;}};
  function scheduleAuto(){
    if(paused||network||rebuilding||autoTimer!==null)return;
    const candidates=[...entries.values()].filter(row=>!conflicts.has(row.record.id)&&
      row.lastFailureClass!=='invalid');
    if(!candidates.length)return;
    // First remote upload waits one window to coalesce several small edits.
    // Further uploads cannot start sooner than a window after the previous one.
    const elapsed=lastNetworkAt===null?0:Math.max(0,clock()-lastNetworkAt);
    const due=Math.min(...candidates.map(row=>Number(row.nextAttemptAt)||0));
    const fresh=candidates.some(row=>!row.nextAttemptAt);
    const wait=Math.max(due-clock(),fresh?Math.max(flushWindow,flushWindow-elapsed):0);
    autoTimer=setTimer(()=>{autoTimer=null;void kick();},Math.max(0,wait));
  }
  const entries=new Map();
  // A transient IndexedDB/auth read failure must not poison this instance for
  // the rest of the session: the resumer will retry the durable outbox later.
  const rowStamp=row=>JSON.stringify([row.serial,row.baseRevision,row.operationID,
    row.attempt,row.nextAttemptAt,row.lastFailureClass]);
  const rememberPersisted=rows=>{persistedRows=new Map(rows.map(row=>[row.record.id,{stamp:rowStamp(row),row}]));};
  const initialize=()=>initialized??=(async()=>{const rows=await load()||[];for(const row of rows){entries.set(row.record.id,row);serial=Math.max(serial,row.serial);if(row.lastFailureClass==='conflict'||row.lastFailureClass==='invalid')conflicts.add(row.record.id);}rememberPersisted(rows);report();})().catch(failure=>{initialized=undefined;throw markSyncPhase(failure,'读取本机待同步队列');});
  const report=()=>onStatus({pending:entries.size,error,conflicts:conflicts.size});
  const starts=new Map();
  const diagnose=(action,row,failure,durationMs=null)=>{
    const id=row?.operationID;
    if(action==='start'&&id)starts.set(id,clock());
    if(id&&['committed','failed','conflict','remote-won'].includes(action)){
      durationMs=Math.max(0,clock()-(starts.get(id)||clock()));starts.delete(id);
    }
    try{onDiagnostic({action,kind:row?.record?.kind||'queue',baseRevision:row?.baseRevision,
      cloudRevision:revision(),pending:entries.size,error:failure,durationMs:Math.round(durationMs||0)});
    }catch{/* Diagnostics must not block a durable sync. */}
  };
  const persist=async(options={})=>{
    // IndexedDB already journals changed rows. Clone only those rows here as
    // well: a queued import may carry many large Blobs that did not change.
    const snapshot=[...entries.values()].map(row=>{
      const previous=persistedRows.get(row.record.id);
      return previous?.stamp===rowStamp(row)?previous.row:structuredClone(row);
    });
    try{await write(snapshot,options);rememberPersisted(snapshot);}
    catch(error){throw markSyncPhase(error,'写入本机待同步队列');}
  };
  // The durable queue is shared by tabs. A tab may have opened before another
  // wrote pending edits, so refresh it AFTER acquiring the cross-tab sync lock.
  // Only replace in-memory state when no new local staging occurred meanwhile.
  async function refreshFromDisk(){
    for(;;){
      const checkpoint=staging;
      await checkpoint;
      let saved;
      try{saved=await reload()||[];}
      catch(error){throw markSyncPhase(error,'从 IndexedDB 刷新同步队列');}
      if(checkpoint!==staging)continue;
      entries.clear();
      for(const row of saved){
        entries.set(row.record.id,row);
        serial=Math.max(serial,row.serial);
      }
      rememberPersisted(saved);
      conflicts=new Set([...entries.values()].filter(row=>
        row.lastFailureClass==='conflict'||row.lastFailureClass==='invalid')
        .map(row=>row.record.id));
      report();
      return;
    }
  }
  const overlaps=(a,b)=>a.some(left=>b.some(right=>left.store===right.store&&(left.id===right.id||left.id===undefined||right.id===undefined)));
  const validReplacement=(previous,candidate)=>{
    if(!candidate?.id||candidate.id!==previous.id||previous.kind&&
      (candidate.kind!==previous.kind||!candidate.payload||
        candidate.payload.id!==previous.payload?.id))return false;
    try{return Array.isArray(recordKeys(candidate));}catch{return false;}
  };
  const orderedRows=()=>[...entries.values()].sort((a,b)=>a.serial-b.serial);
  const clearFailure=row=>{delete row.attempt;delete row.nextAttemptAt;delete row.lastFailureClass;};
  const replaceRows=rows=>{entries.clear();for(const row of rows.sort((a,b)=>a.serial-b.serial))entries.set(row.record.id,row);};
  async function coalesceReady(windowSerial){
    const task=staging.catch(()=>{}).then(async()=>{
      const before=orderedRows(),next=[...before],strictRemoveIds=[];
      for(;;){
        const plan=coalesce(next,revision(),windowSerial);
        if(!plan)break;
        const sourceIDs=new Set(plan.sourceRows.map(row=>row.record.id));
        const first=plan.sourceRows[0];
        if(sourceIDs.size!==plan.sourceRows.length||next.some(row=>row.record.id===plan.record.id))
          throw Error('待同步批次编号重复，未修改本机队列');
        strictRemoveIds.push(...sourceIDs);
        const merged={record:plan.record,serial:first.serial,baseRevision:first.baseRevision,operationID:crypto.randomUUID()};
        next.splice(0,next.length,...next.filter(row=>!sourceIDs.has(row.record.id)),merged);
        next.sort((a,b)=>a.serial-b.serial);
      }
      if(!strictRemoveIds.length)return;
      replaceRows(next);
      try{await persist({strictRemoveIds});}
      catch(error){replaceRows(before);throw error;}
      report();
    });
    staging=task.catch(()=>{});
    return task;
  }
  async function splitConflictingBatch(row){
    const pieces=splitCoalesced(row.record);
    if(!pieces)return false;
    const task=staging.catch(()=>{}).then(async()=>{
      if(entries.get(row.record.id)?.serial!==row.serial)return false;
      const before=orderedRows(),next=before.filter(item=>item.record.id!==row.record.id);
      const existing=new Set(next.map(item=>item.record.id));
      for(const piece of pieces){
        if(existing.has(piece.record.id))return false;
        existing.add(piece.record.id);next.push(structuredClone(piece));
      }
      replaceRows(next);
      try{await persist({strictRemoveIds:[row.record.id]});}
      catch(error){replaceRows(before);throw error;}
      report();diagnose('split',row);return true;
    });
    staging=task.catch(()=>{});
    return task;
  }
  async function acknowledge(row,{confirmedHere=false,advanceDependents=true}={}){
    // A confirmed operation advanced exactly one revision. Newer local edits
    // based on its old revision can follow it; never jump across an unrelated
    // remote edit (which would silently overwrite another device).
    // A v3 commit may skip account cursor values written by unrelated keys.
    // Its success proves that this key had no competing write since the base.
    if(advanceDependents)for(const pending of entries.values())if(pending.serial>row.serial&&pending.baseRevision===row.baseRevision&&overlaps(recordKeys(row.record),recordKeys(pending.record)))pending.baseRevision=revision();
    const current=entries.get(row.record.id);
    const removed=current?.serial===row.serial;
    if(removed)entries.delete(row.record.id);
    try{await persist();}
    catch(e){if(removed&&!entries.has(row.record.id))entries.set(row.record.id,row);throw e;}
    if(confirmedHere){onCommitted(row.record,revision());diagnose('committed',row);}
    report();
    return removed;
  }
  function stage(record,{baseRevision=revision()}={}){
    const task=staging.catch(()=>{}).then(async()=>{await initialize();if(!Number.isSafeInteger(baseRevision)||baseRevision<0)throw Error('作品编辑基线无效，未上传旧稿');const previous=entries.get(record.id),row={record:structuredClone(record),serial:++serial,baseRevision:previous?Math.min(previous.baseRevision,baseRevision):baseRevision,operationID:crypto.randomUUID()};entries.set(record.id,row);try{await persist();}catch(e){if(previous)entries.set(record.id,previous);else entries.delete(record.id);throw e;}conflicts.delete(record.id);error=null;report();});
    staging=task.catch(()=>{});void task.then(()=>scheduleAuto()).catch(failure=>diagnose('failed',{record,baseRevision},failure));return task;
  }
  function kick({force=false}={}){
    cancelAuto();
    if(paused)return Promise.resolve();
    if(network)return network;
    if(rebuilding)return Promise.resolve();
    network=(async()=>{
      await initialize();await staging;await refreshFromDisk();
      const readyRows=orderedRows().filter(row=>force||
        !conflicts.has(row.record.id)&&row.lastFailureClass!=='invalid'&&
        (!row.nextAttemptAt||row.nextAttemptAt<=clock()));
      if(!readyRows.length){report();return;}
      // Immutable object bytes can transfer before the account revision lock.
      // Only reconciliation and the versioned metadata commit need that lock.
      const prepareAt=clock();diagnose('prepare-start');
      await prepare(readyRows.map(row=>row.record));
      diagnose('prepare-finished',null,null,clock()-prepareAt);
      const lockAt=clock();diagnose('lock-wait');
      return runExclusive(async()=>{
      diagnose('lock-entered',null,null,clock()-lockAt);
      lastNetworkAt=clock();
      if(paused)return;
      await initialize();await refreshFromDisk();
      if(paused)return;
      // Drain all documents already queued at the start of this upload window.
      // A newer edit arriving while an HTTP request is in flight belongs to
      // the next window, avoiding two rapid uploads of the same document.
      const windowSerial=flushWindow&&!force
        ?Math.max(0,...[...entries.values()].map(item=>item.serial))
        :Infinity;
      // A confirmed conflict keeps its original identity for manual review.
      // Never fold it into a newer batch during a background pass.
      if(force||!conflicts.size)await coalesceReady(windowSerial);
      // Once a row has been confirmed as a real conflict, background retries
      // must not replay the same stale revision forever. An explicit flush or
      // queue rebuild can recheck it; independent rows continue normally.
      const blocked=force?new Set():new Set(orderedRows().filter(row=>
        conflicts.has(row.record.id)||row.lastFailureClass==='invalid'||
        row.nextAttemptAt>clock()).map(row=>row.record.id));
      // Old conflict rows cannot hold unrelated newer records hostage. Each
      // newer row still runs through its own revision reconciliation/CAS.
      const blockedKeys=[];
      const conflictIDs=force?new Set():new Set(conflicts);
      let firstFailure=null;
      while(entries.size&&!paused){
        const row=orderedRows().find(item=>!blocked.has(item.record.id)&&item.serial<=windowSerial&&
          !blockedKeys.some(keys=>overlaps(keys,recordKeys(item.record))));
        if(!row)break;
        diagnose('start',row);
        try {
        // A restarted queue must not overwrite changes made by another device.
        if(!authoritativeCommit&&row.baseRevision!==revision()){
          diagnose('reconcile',row);
          // The app may have closed after the server committed but before the
          // acknowledgement was removed from IndexedDB. Verify the exact
          // operation instead of replaying it or reporting a false conflict.
          const resolution=await reconcile(row.record,row.operationID,row.baseRevision);
          if(resolution==='committed'){
            await acknowledge(row);diagnose('committed',row);continue;
          }
          if(resolution==='remote'){
            const removed=await acknowledge(row,{advanceDependents:false});
            diagnose('remote-won',row);
            if(removed)onSuperseded(row.record);
            continue;
          }
          if(resolution?.kind==='replace'){
            if(entries.get(row.record.id)?.serial!==row.serial)continue;
            if(!validReplacement(row.record,resolution.record))
              throw Error('同步合并结果不完整；原始待同步记录已保留');
            if(resolution.record.kind==='batch'&&
              !resolution.record.payload?.operations?.length){
              await acknowledge(row);
              onSuperseded(row.record);
              continue;
            }
            const sourceRecord=row.record;
            row.record=structuredClone(resolution.record);
            row.baseRevision=revision();
            row.operationID=crypto.randomUUID();
            clearFailure(row);
            await persist();
            diagnose('merged',row);
            try{onReplaced(sourceRecord,row.record);}catch{/* The durable outbox remains authoritative. */}
            onSuperseded(row.record);
            continue;
          }
          // An import batch consists only of new, globally unique IDs. If no
          // ID is present remotely, it can be retried after an unrelated edit.
          if(resolution==='rebase'){row.baseRevision=revision();clearFailure(row);await persist();diagnose('retry',row);}
          else {
            if(await splitConflictingBatch(row))continue;
            // A genuinely conflicting editable project becomes a separate
            // recoverable copy. Never overwrite the other device's original
            // project, and never silently drop locally staged work.
            const current=entries.get(row.record.id);
            if(current&&current.serial!==row.serial)continue;
            const copy=await onConflict(row.record,row.baseRevision,row.operationID);
            if(!copy||!copy.id||copy.id===row.record.id)
              throw Error('云端版本已变化；待同步作品已保留，未覆盖其他设备的资料');
            const next={record:structuredClone(copy),serial:++serial,
              baseRevision:revision(),operationID:crypto.randomUUID()};
            entries.delete(row.record.id);
            entries.set(copy.id,next);
            try{await persist();}
            catch(failure){entries.delete(copy.id);entries.set(row.record.id,row);throw failure;}
            try{onForked(row.record,copy);}catch{/* UI notification never rolls back a durable fork. */}
            report();continue;
          }
        }
        try{await commit(row.record,row.operationID,row.baseRevision);}
        catch(failure){
          markSyncPhase(failure,'上传当前待同步记录');
          // The server may have committed before its response disappeared.
          // Confirm the exact durable operation ID before surfacing an error.
          let resolved;
          try{resolved=await reconcile(row.record,row.operationID,row.baseRevision);}catch{/* Keep the row if verification is offline. */}
          if(resolved==='committed'){await acknowledge(row);diagnose('committed',row);continue;}
          if(resolved==='remote'){
            const removed=await acknowledge(row,{advanceDependents:false});diagnose('remote-won',row);
            if(removed)onSuperseded(row.record);continue;
          }
          if(resolved?.kind==='replace'){
            if(entries.get(row.record.id)?.serial!==row.serial)continue;
            if(!validReplacement(row.record,resolved.record))
              throw Error('同步合并结果不完整；原始待同步记录已保留');
            if(resolved.record.kind==='batch'&&
              !resolved.record.payload?.operations?.length){await acknowledge(row);onSuperseded(row.record);continue;}
            const sourceRecord=row.record;
            row.record=structuredClone(resolved.record);
            row.baseRevision=revision();row.operationID=crypto.randomUUID();
            clearFailure(row);
            await persist();diagnose('merged',row);
            try{onReplaced(sourceRecord,row.record);}catch{/* The durable outbox remains authoritative. */}
            onSuperseded(row.record);continue;
          }
          if(resolved==='rebase'){
            if(revision()>row.baseRevision){row.baseRevision=revision();clearFailure(row);await persist();diagnose('retry',row);continue;}
            // A PL/pgSQL validation error is a confirmed rejection, even
            // though the revision stayed put. Preserve its code and message
            // instead of misreporting a lost network acknowledgement.
            if(failure?.code==='P0001'){
              if(await splitConflictingBatch(row))continue;
              throw failure;
            }
            // Unchanged server revision means an unconfirmed upload, not a
            // competing edit. Retain the row for the normal retry path.
            throw markSyncPhase(new Error('云端版本未变化，本次上传未获确认；本机修改已保留，将自动重试',{cause:failure}),failure.syncPhase||'上传当前待同步记录');
          }
          if(resolved==='conflict'&&await splitConflictingBatch(row))continue;
          if(resolved==='conflict'&&row.record.kind==='project'){
            const current=entries.get(row.record.id);
            if(current&&current.serial!==row.serial)continue;
            const copy=await onConflict(row.record,row.baseRevision,row.operationID);
            if(!copy||!copy.id||copy.id===row.record.id)
              throw Error('云端作品已变化；本机完整作品仍保留在待同步队列');
            const next={record:structuredClone(copy),serial:++serial,
              baseRevision:revision(),operationID:crypto.randomUUID()};
            entries.delete(row.record.id);entries.set(copy.id,next);
            try{await persist();}
            catch(error){entries.delete(copy.id);entries.set(row.record.id,row);throw error;}
            try{onForked(row.record,copy);}catch{/* UI notification does not own the fork. */}
            report();continue;
          }
          throw failure;
        }
        await staging;
        await acknowledge(row,{confirmedHere:true});
        }catch(failure){
          blocked.add(row.record.id);
          blockedKeys.push(recordKeys(row.record));
          const category=failureClass(failure);
          const manual=category==='conflict'||category==='invalid'||
            /账号已清空|云端版本已变化|另一设备已更新|\bconflict\b/i.test(failure?.message||'');
          const current=entries.get(row.record.id);
          if(current?.serial===row.serial){
            current.lastFailureClass=manual?category==='invalid'?'invalid':'conflict':category;
            if(manual)delete current.nextAttemptAt;
            else{
              current.attempt=(Number.isSafeInteger(current.attempt)?current.attempt:0)+1;
              current.nextAttemptAt=clock()+retryDelay(current.attempt,current.operationID);
            }
            try{await persist();}catch(saveFailure){firstFailure??=saveFailure;}
          }
          if(manual){
            conflictIDs.add(row.record.id);
            diagnose('conflict',row,failure);
            // A server-reported conflict must still reach callers that open
            // the manual review flow. Other queued records can commit first.
            if(category==='invalid'||category==='conflict'||/\bconflict\b/i.test(failure?.message||''))firstFailure??=failure;
          }else{
            firstFailure??=failure;
            diagnose('failed',row,failure);
          }
        }
      }
      conflicts=conflictIDs;
      error=null;report();
      if(firstFailure)throw firstFailure;
    });})().catch(e=>{diagnose('failed',null,e);error=e;report();throw e;}).finally(()=>{
      network=null;
      // The last acknowledgement reports while this promise is still active.
      // Publish the idle transition too, or the shell can show “上传中” with an
      // empty outbox until some unrelated edit causes another status event.
      report();
      if(entries.size)scheduleAuto();
    });
    network.catch(()=>{});return network;
  }
  // Only the UI reviewer can invoke this under the per-account sync lock.
  // Recheck the exact serial before replacing or discarding a local draft.
  async function resolvePending(id,expectedSerial,{record=null,baseRevision=null}={}){
    // Only the conflict UI may call this after acquiring the account lock.
    // A concurrent HTTP request could otherwise acknowledge the row while it
    // is being replaced by an obsolete modal confirmation.
    if(network)throw Error('同步正在进行，请等待当前请求结束');
    await initialize();await staging;await refreshFromDisk();
    if(network)throw Error('同步正在进行，请等待当前请求结束');
    const previous=entries.get(id);
    if(!previous||previous.serial!==expectedSerial)
      throw Error('冲突作品在确认期间发生了新修改；请重新检查并备份');
    if(record&&(typeof record.id!=='string'||!record.id||
      !Number.isSafeInteger(baseRevision)||baseRevision<0||
      (record.id!==id&&entries.has(record.id))))
      throw Error('冲突解决目标无效；没有修改待同步数据');
    const before=new Map(entries);
    entries.delete(id);
    if(record)entries.set(record.id,{record:structuredClone(record),serial:++serial,
      baseRevision,operationID:crypto.randomUUID()});
    try{await persist();}
    catch(failure){entries.clear();for(const [key,value] of before)entries.set(key,value);throw failure;}
    conflicts.delete(id);error=null;report();
    if(entries.size)scheduleAuto();
    return {id:record?.id||id,retained:!!record};
  }
  async function cancelPendingFor(ids){
    await initialize();
    await refreshFromDisk();
    const selected=new Set(ids),before=[...entries.values()],removed=before.filter(row=>selected.has(row.record.id));
    if(!removed.length)return 0;
    for(const id of selected)entries.delete(id);
    try{await persist();}
    catch(failure){entries.clear();for(const row of before)entries.set(row.record.id,row);throw failure;}
    for(const id of selected)conflicts.delete(id);
    report();
    return removed.length;
  }
  async function discard(){cancelAuto();await initialize();await staging;if(network)throw Error('上传正在进行，请等待请求结束后再放弃待同步修改');const previous=[...entries.values()];entries.clear();try{await persist();}catch(failure){for(const row of previous)entries.set(row.record.id,row);throw failure;}conflicts.clear();error=null;report();return previous.length;}
  async function rebuild(factory){
    if(typeof factory!=='function')throw Error('需要提供本机同步数据重建器');
    if(rebuilding)throw Error('本机同步队列正在重建，请等待当前操作完成');
    rebuilding=true;cancelAuto();
    try{
      if(network)await network.catch(()=>{});
      const task=staging.catch(()=>{}).then(()=>runExclusive(async()=>{
        await initialize();
        // No staged edit can pass this task. Re-read under the account lock so
        // another tab's durable row is included in the replacement.
        const saved=await reload()||[];
        replaceRows(saved);rememberPersisted(saved);
        serial=Math.max(serial,...saved.map(row=>row.serial));
        const before=orderedRows();
        // The factory receives these rows read-only. Cloning the whole input
        // would duplicate every queued image Blob before IndexedDB writes it.
        const result=await factory(before);
        const replacementRows=result?.rows;
        if(!Array.isArray(replacementRows))
          throw Error('本机同步数据重建结果无效；原队列未修改');
        const ids=new Set(),next=[];
        for(const item of replacementRows){
          const {record}=item;
          if(!record?.id||ids.has(record.id))throw Error('重建队列存在重复编号；原队列未修改');
          if(!Number.isSafeInteger(item.baseRevision)||item.baseRevision<0)
            throw Error('重建队列缺少原始编辑基线；原队列未修改');
          if(typeof item.operationID!=='undefined'&&
            (typeof item.operationID!=='string'||!item.operationID))
            throw Error('重建队列操作编号无效；原队列未修改');
          ids.add(record.id);
          next.push({record,serial:++serial,
            baseRevision:item.baseRevision,operationID:item.operationID||crypto.randomUUID()});
        }
        replaceRows(next);
        try{await persist({strictRemoveIds:before.map(row=>row.record.id)});}
        catch(failure){replaceRows(before);throw failure;}
        conflicts.clear();error=null;report();
        diagnose('rebuilt',null,null);
        return {replaced:before.length,pending:next.length};
      }));
      staging=task.catch(()=>{});
      return await task;
    }finally{rebuilding=false;if(entries.size&&!paused)scheduleAuto();}
  }
  return {stage,
    pause(){paused=true;cancelAuto();},
    async flush(){
      await initialize();await staging;
      // Manual sync / editor completion bypasses the automatic interval, but
      // still uses the same durable outbox, lock and server-side revision CAS.
      await kick({force:true});
      if(entries.size&&!conflicts.size)await kick({force:true});
    },
    async resumeScheduled(){await initialize();await staging;if(entries.size)scheduleAuto();},
    async pending(){await initialize();await staging;return structuredClone([...entries.values()]);},
    // Image reads need one pending override, not a clone of every queued
    // import (which may contain many original image Blobs).
    async inspectPending(select){await initialize();await staging;return structuredClone(select(entries.values()));},
    async advance(before,after,operations=[]){await initialize();await staging;if(!operations.length)return;let changed=false;for(const row of entries.values()){
    const keys=recordKeys(row.record);
    const touched=operations.some(operation=>keys.some(key=>key.store===operation.store&&(key.id===undefined||operation.action==='clear'||key.id===(operation.item?.id??operation.id))));
    if(row.baseRevision===before&&!touched){row.baseRevision=after;changed=true;}
    }if(changed)await persist();},resolvePending,cancelPendingFor,discard,rebuild,canDiscard:()=>!network&&!rebuilding,
    resume:()=>{paused=false;return kick();},
    status:()=>{
      const retryRows=[...entries.values()].filter(row=>
        Number.isFinite(row.nextAttemptAt)&&row.nextAttemptAt>0&&
        !conflicts.has(row.record.id));
      return {pending:entries.size,error,conflicts:conflicts.size,
        uploading:!!network||rebuilding,retrying:retryRows.length,
        nextAttemptAt:retryRows.length?Math.min(...retryRows.map(row=>row.nextAttemptAt)):null};
    }};
}
