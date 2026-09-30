// Durable edits are an explicit outbox, not a replacement for cloud records.
// Commit acknowledgement is the only point at which an entry is removed.
export function createProjectSync({load,write,commit,revision,reconcile=async()=> 'conflict',onStatus=()=>{}}){
  let initialized,staging=Promise.resolve(),network,serial=0,error;
  const entries=new Map();
  const initialize=()=>initialized??=(async()=>{for(const row of await load()||[]){entries.set(row.record.id,row);serial=Math.max(serial,row.serial);}report();})();
  const report=()=>onStatus({pending:entries.size,error});
  const persist=()=>write(structuredClone([...entries.values()]));
  async function acknowledge(row){
    const current=entries.get(row.record.id);
    const removed=current?.serial===row.serial;
    if(removed)entries.delete(row.record.id);
    try{await persist();}
    catch(e){if(removed&&!entries.has(row.record.id))entries.set(row.record.id,row);throw e;}
    report();
  }
  function stage(record){
    const task=staging.catch(()=>{}).then(async()=>{await initialize();const previous=entries.get(record.id),row={record:structuredClone(record),serial:++serial,baseRevision:revision(),operationID:crypto.randomUUID()};entries.set(record.id,row);try{await persist();}catch(e){if(previous)entries.set(record.id,previous);else entries.delete(record.id);throw e;}error=null;report();});
    staging=task.catch(()=>{});void task.then(()=>kick()).catch(()=>{});return task;
  }
  function kick(){
    if(network)return network;
    network=(async()=>{
      await initialize();await staging;
      while(entries.size){
        const row=[...entries.values()][0];
        // A restarted queue must not overwrite changes made by another device.
        if(row.baseRevision!==revision()){
          // The app may have closed after the server committed but before the
          // acknowledgement was removed from IndexedDB. Verify the exact
          // operation instead of replaying it or reporting a false conflict.
          const resolution=await reconcile(row.record,row.operationID);
          if(resolution==='committed'){
            await acknowledge(row);continue;
          }
          // An import batch consists only of new, globally unique IDs. If no
          // ID is present remotely, it can be retried after an unrelated edit.
          if(resolution==='rebase'){row.baseRevision=revision();await persist();}
          else throw Error('云端版本已变化；待同步作品已保留，未覆盖其他设备的资料');
        }
        try{await commit(row.record,row.operationID);}
        catch(failure){
          // The server may have committed before its response disappeared.
          // Confirm the exact durable operation ID before surfacing an error.
          let resolved;
          try{resolved=await reconcile(row.record,row.operationID);}catch{/* Keep the row if verification is offline. */}
          if(resolved==='committed'){await acknowledge(row);continue;}
          throw failure;
        }
        await staging;
        for(const pending of entries.values())if(pending.serial!==row.serial)pending.baseRevision=revision();
        await acknowledge(row);
      }
      error=null;report();
    })().catch(e=>{error=e;report();throw e;}).finally(()=>{network=null;});
    network.catch(()=>{});return network;
  }
  return {stage,async flush(){await initialize();await staging;await kick();},async pending(){await initialize();await staging;return structuredClone([...entries.values()]);},async advance(before,after){await initialize();await staging;for(const row of entries.values())if(row.baseRevision===before)row.baseRevision=after;if(entries.size)await persist();},resume:()=>kick(),status:()=>({pending:entries.size,error})};
}
