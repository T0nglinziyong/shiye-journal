// Durable edits are an explicit outbox, not a replacement for cloud records.
// Commit acknowledgement is the only point at which an entry is removed.
export function createProjectSync({load,write,commit,revision,reconcile=async()=> 'conflict',recordKeys=record=>[{store:'projects',id:record.id}],onCommitted=()=>{},onConflict=async()=>null,onSuperseded=()=>{},onStatus=()=>{},runExclusive=fn=>fn(),reload=load,autoFlushDelayMs=0,setTimer=setTimeout,clearTimer=clearTimeout,clock=()=>Date.now()}){
  let initialized,staging=Promise.resolve(),network,serial=0,error;
  // Durable local staging is immediate; only the remote commit is batched.
  const flushWindow=Math.max(0,Number(autoFlushDelayMs)||0);
  let autoTimer=null,lastNetworkAt=null;
  const cancelAuto=()=>{if(autoTimer!==null){clearTimer(autoTimer);autoTimer=null;}};
  function scheduleAuto(){
    if(network||autoTimer!==null)return;
    if(!flushWindow){void kick();return;}
    // First remote upload waits one window to coalesce several small edits.
    // Further uploads cannot start sooner than a window after the previous one.
    const elapsed=lastNetworkAt===null?0:Math.max(0,clock()-lastNetworkAt);
    autoTimer=setTimer(()=>{autoTimer=null;void kick();},Math.max(flushWindow,flushWindow-elapsed));
  }
  const entries=new Map();
  // A transient IndexedDB/auth read failure must not poison this instance for
  // the rest of the session: the resumer will retry the durable outbox later.
  const initialize=()=>initialized??=(async()=>{for(const row of await load()||[]){entries.set(row.record.id,row);serial=Math.max(serial,row.serial);}report();})().catch(failure=>{initialized=undefined;throw failure;});
  const report=()=>onStatus({pending:entries.size,error});
  const persist=()=>write(structuredClone([...entries.values()]));
  // The durable queue is shared by tabs. A tab may have opened before another
  // wrote pending edits, so refresh it AFTER acquiring the cross-tab sync lock.
  // Only replace in-memory state when no new local staging occurred meanwhile.
  async function refreshFromDisk(){
    for(;;){
      const checkpoint=staging;
      await checkpoint;
      const saved=await reload()||[];
      if(checkpoint!==staging)continue;
      entries.clear();
      for(const row of saved){
        entries.set(row.record.id,row);
        serial=Math.max(serial,row.serial);
      }
      report();
      return;
    }
  }
  const overlaps=(a,b)=>a.some(left=>b.some(right=>left.store===right.store&&(left.id===right.id||left.id===undefined||right.id===undefined)));
  async function acknowledge(row,{confirmedHere=false}={}){
    // A confirmed operation advanced exactly one revision. Newer local edits
    // based on its old revision can follow it; never jump across an unrelated
    // remote edit (which would silently overwrite another device).
    if(revision()===row.baseRevision+1)for(const pending of entries.values())if(pending.serial>row.serial&&pending.baseRevision===row.baseRevision&&overlaps(recordKeys(row.record),recordKeys(pending.record)))pending.baseRevision=revision();
    const current=entries.get(row.record.id);
    const removed=current?.serial===row.serial;
    if(removed)entries.delete(row.record.id);
    try{await persist();}
    catch(e){if(removed&&!entries.has(row.record.id))entries.set(row.record.id,row);throw e;}
    if(confirmedHere)onCommitted(row.record,revision());
    report();
  }
  function stage(record,{baseRevision=revision()}={}){
    const task=staging.catch(()=>{}).then(async()=>{await initialize();if(!Number.isSafeInteger(baseRevision)||baseRevision<0)throw Error('作品编辑基线无效，未上传旧稿');const previous=entries.get(record.id),row={record:structuredClone(record),serial:++serial,baseRevision:previous?Math.min(previous.baseRevision,baseRevision):baseRevision,operationID:crypto.randomUUID()};entries.set(record.id,row);try{await persist();}catch(e){if(previous)entries.set(record.id,previous);else entries.delete(record.id);throw e;}error=null;report();});
    staging=task.catch(()=>{});void task.then(()=>scheduleAuto()).catch(()=>{});return task;
  }
  function kick({force=false}={}){
    cancelAuto();
    if(network)return network;
    network=(async()=>runExclusive(async()=>{
      lastNetworkAt=clock();
      await initialize();await refreshFromDisk();
      // Drain all documents already queued at the start of this upload window.
      // A newer edit arriving while an HTTP request is in flight belongs to
      // the next window, avoiding two rapid uploads of the same document.
      const windowSerial=flushWindow&&!force
        ?Math.max(0,...[...entries.values()].map(item=>item.serial))
        :Infinity;
      const blocked=new Set();
      while(entries.size){
        const row=[...entries.values()].find(item=>!blocked.has(item.record.id)&&item.serial<=windowSerial);
        if(!row)break;
        if(!row)break;
        try {
        // A restarted queue must not overwrite changes made by another device.
        if(row.baseRevision!==revision()){
          // The app may have closed after the server committed but before the
          // acknowledgement was removed from IndexedDB. Verify the exact
          // operation instead of replaying it or reporting a false conflict.
          const resolution=await reconcile(row.record,row.operationID,row.baseRevision);
          if(resolution==='committed'){
            await acknowledge(row);continue;
          }
          if(resolution==='remote'){
            await acknowledge(row);
            onSuperseded(row.record);
            continue;
          }
          if(resolution?.kind==='replace'){
            if(!resolution.record)throw Error('同步合并结果不完整');
            if(!resolution.record.operations?.length){
              await acknowledge(row);
              onSuperseded(row.record);
              continue;
            }
            row.record=structuredClone(resolution.record);
            row.baseRevision=revision();
            row.operationID=crypto.randomUUID();
            await persist();
            onSuperseded(row.record);
            continue;
          }
          // An import batch consists only of new, globally unique IDs. If no
          // ID is present remotely, it can be retried after an unrelated edit.
          if(resolution==='rebase'){row.baseRevision=revision();await persist();}
          else {
            // A genuinely conflicting editable project becomes a separate
            // recoverable copy. Never overwrite the other device's original
            // project, and never silently drop locally staged work.
            const current=entries.get(row.record.id);
            if(current&&current.serial!==row.serial)continue;
            const copy=await onConflict(row.record,row.baseRevision);
            if(!copy||!copy.id||copy.id===row.record.id)
              throw Error('云端版本已变化；待同步作品已保留，未覆盖其他设备的资料');
            const next={record:structuredClone(copy),serial:++serial,
              baseRevision:revision(),operationID:crypto.randomUUID()};
            entries.delete(row.record.id);
            entries.set(copy.id,next);
            try{await persist();}
            catch(failure){entries.delete(copy.id);entries.set(row.record.id,row);throw failure;}
            report();continue;
          }
        }
        try{await commit(row.record,row.operationID);}
        catch(failure){
          // The server may have committed before its response disappeared.
          // Confirm the exact durable operation ID before surfacing an error.
          let resolved;
          try{resolved=await reconcile(row.record,row.operationID,row.baseRevision);}catch{/* Keep the row if verification is offline. */}
          if(resolved==='committed'){await acknowledge(row);continue;}
          if(resolved==='remote'){await acknowledge(row);onSuperseded(row.record);continue;}
          if(resolved?.kind==='replace'){
            if(!resolved.record?.operations?.length){await acknowledge(row);onSuperseded(row.record);continue;}
            row.record=structuredClone(resolved.record);
            row.baseRevision=revision();row.operationID=crypto.randomUUID();
            await persist();onSuperseded(row.record);continue;
          }
          if(resolved==='rebase'&&revision()>row.baseRevision){row.baseRevision=revision();await persist();continue;}
          throw failure;
        }
        await staging;
        await acknowledge(row,{confirmedHere:true});
        }catch(failure){
          if(!/云端版本已变化|另一设备已更新|\\bconflict\\b/i.test(failure?.message||''))throw failure;
          blocked.add(row.record.id);
        }
      }
      if(blocked.size)throw Error('云端版本已变化；已继续同步其他资料，冲突项目仍安全保留');
      error=null;report();
    }))().catch(e=>{error=e;report();throw e;}).finally(()=>{
      network=null;
      if(entries.size&&!error)scheduleAuto();
    });
    network.catch(()=>{});return network;
  }
  // Only the UI reviewer can invoke this under the per-account sync lock.
  // Recheck the exact serial before replacing or discarding a local draft.
  async function resolvePending(id,expectedSerial,{record=null,baseRevision=null}={}){
    await initialize();await refreshFromDisk();
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
    error=null;report();
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
    report();
    return removed.length;
  }
  async function discard(){cancelAuto();await initialize();await staging;if(network)throw Error('上传正在进行，请等待请求结束后再放弃待同步修改');const previous=[...entries.values()];entries.clear();try{await persist();}catch(failure){for(const row of previous)entries.set(row.record.id,row);throw failure;}error=null;report();return previous.length;}
  return {stage,
    async flush(){
      await initialize();await staging;
      // Manual sync / editor completion bypasses the automatic interval, but
      // still uses the same durable outbox, lock and server-side revision CAS.
      await kick({force:true});
      if(entries.size)await kick({force:true});
    },
    async resumeScheduled(){await initialize();await staging;if(entries.size)scheduleAuto();},
    async pending(){await initialize();await staging;return structuredClone([...entries.values()]);},async advance(before,after,operations=[]){await initialize();await staging;if(!operations.length)return;let changed=false;for(const row of entries.values()){
    const keys=recordKeys(row.record);
    const touched=operations.some(operation=>keys.some(key=>key.store===operation.store&&(key.id===undefined||operation.action==='clear'||key.id===(operation.item?.id??operation.id))));
    if(row.baseRevision===before&&!touched){row.baseRevision=after;changed=true;}
  }if(changed)await persist();},resolvePending,cancelPendingFor,discard,canDiscard:()=>!network,resume:()=>kick({force:true}),status:()=>({pending:entries.size,error,uploading:!!network})};
}
