import {openDB} from 'idb';
import {foldLegacySyncRows} from './unified-sync-outbox.js';

// Account-scoped disposable read cache plus a protected durable outbox. 
// Outbox entries are NEVER evicted or erased on logout.

// Merge a tab's changes, not its whole in-memory snapshot. An unrelated tab's
// pending edit must survive; edits to the same row must fail, never overwrite.
const outboxID=row=>row?.record?.id;
const outboxStamp=row=>row?JSON.stringify([row.serial,row.baseRevision,row.operationID,
  row.attempt,row.nextAttemptAt,row.lastFailureClass]):null;
const isDisposablePreviewKey=key=>{
  try{return /^(?:thumbnail:|thumbnail480:|preview\d+:)/.test(JSON.parse(key)[1]);}
  catch{return false;}
};
const rowsByID=rows=>{
  const map=new Map();
  for(const row of rows||[]){
    const id=outboxID(row);
    if(typeof id!=='string'||!id||map.has(id))throw Error('待同步记录编号无效或重复');
    map.set(id,row);
  }
  return map;
};
export function mergeOutboxRows(currentRows,previousRows,nextRows,{strictRemoveIds=[]}={}){
  const current=rowsByID(currentRows),previous=rowsByID(previousRows),next=rowsByID(nextRows);
  const strict=new Set(strictRemoveIds);
  for(const [id,after] of next){
    const before=previous.get(id),existing=current.get(id);
    if(outboxStamp(before)===outboxStamp(after))continue;
    if(outboxStamp(existing)!==outboxStamp(before)){
      // A different tab already staged an edit for this exact document.
      if(!before||outboxStamp(existing)!==outboxStamp(after))
        throw Error('其他标签页已修改同一份待同步资料；未覆盖原稿，请刷新页面后解决冲突');
    }
    current.set(id,after);
  }
  for(const [id,before] of previous){
    if(next.has(id))continue;
    const existing=current.get(id);
    if(strict.has(id)&&outboxStamp(existing)!==outboxStamp(before))
      throw Error('其他标签页已修改待合并资料；未合并或覆盖原稿，请重试同步');
    if(outboxStamp(existing)===outboxStamp(before))current.delete(id);
    // Another tab may have replaced or acknowledged this row. Never delete it.
  }
  return [...current.values()];
}

export function createPrivateCache({name='shiye-private-read-cache-v2',limit=160*1024*1024}={}){
  let connection;
  const db=()=>connection??=openDB(name,1,{upgrade(d){
    d.createObjectStore('entries',{keyPath:'key'});
    d.createObjectStore('sizes',{keyPath:'key'});
  }});
  const key=(account,id)=>JSON.stringify([account,id]);
  // Keep the current logical outbox rows, but journal changed rows separately.
  // An imported batch can contain many Blobs; rewriting the aggregate entry
  // for every later edit exhausted/aborted Safari's IndexedDB transaction.
  const rowKey=(account,id,recordID)=>JSON.stringify([account,id,recordID]);
  const rowRange=(account,id)=>{
    const prefix=JSON.stringify([account,id]).slice(0,-1)+',';
    return IDBKeyRange.bound(prefix,prefix+'\uffff');
  };
  const readOutbox=async(tx,account,id)=>{
    const entries=tx.objectStore('entries');
    const [base,overlays]=await Promise.all([
      entries.get(key(account,id)),entries.getAll(rowRange(account,id))
    ]);
    const rows=rowsByID(base?.value||[]);
    for(const entry of overlays){
      const recordID=JSON.parse(entry.key)[2];
      if(entry.value?.deleted)rows.delete(recordID);
      else rows.set(recordID,entry.value);
    }
    return {rows:[...rows.values()],base:base?.value||[],overlays,present:!!base||overlays.length>0};
  };
  return {
    async get(account,id){
      const d=await db();
      if(['project-outbox','import-outbox','unified-outbox'].includes(id)){
        const tx=d.transaction('entries','readonly');
        const result=await readOutbox(tx,account,id);await tx.done;
        return result.present?result.rows:undefined;
      }
      return d.get('entries',key(account,id)).then(row=>row?.value);
    },
    // The logical queue is merged atomically across tabs. Only changed rows
    // are written; the pre-existing aggregate remains read-only until its
    // final row is acknowledged. This preserves pending imports without a
    // large, risky one-shot migration or another full Blob rewrite.
    async putOutbox(account,id,previousRows,nextRows,options={}){
      if(!['project-outbox','import-outbox','unified-outbox'].includes(id))throw Error('不是待同步队列');
      const d=await db(),tx=d.transaction('entries','readwrite');
      try{
        const entries=tx.objectStore('entries');
        const aggregate=await entries.get(key(account,id));
        // Current queues use one IndexedDB row per pending document. Reading
        // every image Blob merely to acknowledge one completed item made
        // Safari repeatedly clone the whole batch on its main thread.
        if(!aggregate?.value?.length){
          const before=rowsByID(previousRows),after=rowsByID(nextRows);
          const strict=new Set(options.strictRemoveIds||[]);
          for(const recordID of new Set([...before.keys(),...after.keys()])){
            const old=before.get(recordID),current=after.get(recordID);
            if(outboxStamp(old)===outboxStamp(current))continue;
            const saved=await entries.get(rowKey(account,id,recordID));
            const existing=saved?.value?.deleted?undefined:saved?.value;
            if(outboxStamp(existing)!==outboxStamp(old)){
              if(strict.has(recordID)||!old||outboxStamp(existing)!==outboxStamp(current))
                throw Error('其他标签页已修改同一份待同步资料；未覆盖原稿，请刷新页面后解决冲突');
            }
            if(current)entries.put({key:rowKey(account,id,recordID),account,
              time:Date.now(),bytes:0,value:current});
            else if(outboxStamp(existing)===outboxStamp(old))entries.delete(rowKey(account,id,recordID));
          }
          if(!nextRows.length)entries.put({key:key(account,id),account,time:Date.now(),bytes:0,value:[]});
          await tx.done;
          return nextRows;
        }
        const saved=await readOutbox(tx,account,id),
          merged=mergeOutboxRows(saved.rows,previousRows,nextRows,options),
          before=rowsByID(saved.rows),after=rowsByID(merged),
          overlays=new Map(saved.overlays.map(entry=>[JSON.parse(entry.key)[2],entry])),
          baseIDs=new Set(saved.base.map(outboxID));
        for(const recordID of new Set([...before.keys(),...after.keys()])){
          const old=before.get(recordID),current=after.get(recordID);
          if(outboxStamp(old)===outboxStamp(current))continue;
          if(!current&&!baseIDs.has(recordID)){
            entries.delete(rowKey(account,id,recordID));overlays.delete(recordID);
            continue;
          }
          const row={key:rowKey(account,id,recordID),account,time:Date.now(),bytes:0,
            value:current||{deleted:true}};
          entries.put(row);overlays.set(recordID,row);
        }
        // Once every aggregate row has an overlay, it no longer protects any
        // data. Remove it and obsolete tombstones in this same transaction.
        if(!merged.length){
          entries.put({key:key(account,id),account,time:Date.now(),bytes:0,value:[]});
          for(const recordID of overlays.keys())entries.delete(rowKey(account,id,recordID));
        }else if(saved.base.length&&saved.base.every(row=>overlays.has(outboxID(row)))){
          entries.delete(key(account,id));
          for(const [recordID,entry] of overlays)if(entry.value?.deleted)
            entries.delete(rowKey(account,id,recordID));
        }
        await tx.done;
        return merged;
      }catch(error){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw error;}
    },
    // Fold both retired queues into one transactional, account-scoped outbox.
    // The source keys are consumed only after the new active queue and all
    // quarantined bytes have been stored in the very same IDB transaction.
    async repairUnifiedOutbox(account,previousRows,nextRows,quarantineRows){
      const d=await db(),tx=d.transaction(['entries','sizes'],'readwrite');
      try{
        const queueKey=key(account,'unified-outbox'),heldKey=key(account,'sync-quarantine');
        const saved=await readOutbox(tx,account,'unified-outbox');
        const rows=mergeOutboxRows(saved.rows,previousRows,nextRows);
        const old=await tx.objectStore('entries').get(heldKey);
        const quarantine=[...(old?.value||[]),...quarantineRows];
        for(const [k,value] of [[queueKey,rows],[heldKey,quarantine]]){
          const row={key:k,account,time:Date.now(),bytes:0};
          tx.objectStore('entries').put({...row,value});tx.objectStore('sizes').put(row);
        }
        for(const entry of saved.overlays)tx.objectStore('entries').delete(entry.key);
        await tx.done;return {rows,quarantine};
      }catch(error){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw error;}
    },
    async migrateUnifiedOutbox(account){
      const d=await db(),tx=d.transaction(['entries','sizes'],'readwrite');
      const read=async id=>(await tx.objectStore('entries').get(key(account,id)))?.value;
      try{
        const oldProjects=(await readOutbox(tx,account,'project-outbox')).rows;
        const oldImports=(await readOutbox(tx,account,'import-outbox')).rows;
        const active=await readOutbox(tx,account,'unified-outbox');
        const original=active.rows,oldQuarantine=await read('sync-quarantine')||[];
        const merged=foldLegacySyncRows(original,oldProjects,oldImports,oldQuarantine);
        if(oldProjects.length||oldImports.length){
          const put=(id,value)=>{
            const k=key(account,id),row={key:k,account,time:Date.now(),bytes:0};
            tx.objectStore('entries').put({...row,value});tx.objectStore('sizes').put(row);
          };
          put('unified-outbox',merged.rows);
          for(const entry of active.overlays)tx.objectStore('entries').delete(entry.key);
          if(merged.quarantine.length)put('sync-quarantine',merged.quarantine);
          for(const id of ['project-outbox','import-outbox']){
            tx.objectStore('entries').delete(key(account,id));
            tx.objectStore('sizes').delete(key(account,id));
            for(const entry of (await readOutbox(tx,account,id)).overlays)
              tx.objectStore('entries').delete(entry.key);
          }
        }
        await tx.done;
        return merged;
      }catch(error){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw error;}
    },
    // Emergency restore adds only non-colliding records; it cannot overwrite
    // a newer operation already present in the active durable queue.
    async restoreUnifiedOutboxes(account,projects,imports){
      const d=await db(),tx=d.transaction(['entries','sizes'],'readwrite');
      try{
        const k=key(account,'unified-outbox'),saved=await readOutbox(tx,account,'unified-outbox'),
          qkey=key(account,'sync-quarantine'),held=await tx.objectStore('entries').get(qkey);
        const combined=foldLegacySyncRows(saved.rows,projects,imports,held?.value||[]);
        if(combined.quarantine.some(item=>item.reason==='duplicate-legacy-row'))
          throw Error('应急包与现有队列有重复操作；没有覆盖已有修改');
        for(const [id,value] of [['unified-outbox',combined.rows],['sync-quarantine',combined.quarantine]]){
          const row={key:key(account,id),account,time:Date.now(),bytes:0};
          tx.objectStore('entries').put({...row,value});tx.objectStore('sizes').put(row);
        }
        for(const entry of saved.overlays)tx.objectStore('entries').delete(entry.key);
        await tx.done;return [projects.length,imports.length];
      }catch(error){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw error;}
    },
    async close(){if(connection){const connectionToClose=connection;connection=undefined;(await connectionToClose).close();}},
    async purgeAccount(account){
      const d=await db(),tx=d.transaction(['entries','sizes'],'readwrite');
      try{
        const entries=await tx.objectStore('entries').getAll();
        for(const row of entries)if(row.account===account){
          tx.objectStore('entries').delete(row.key);
          tx.objectStore('sizes').delete(row.key);
        }
        await tx.done;return entries.filter(row=>row.account===account).length;
      }catch(error){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw error;}
    },
    // Restore both queues as one transaction. A collision with a newer
    // pending operation aborts EVERYTHING, including the other queue.
    async restoreOutboxes(account,projects,imports){
      const d=await db(),tx=d.transaction(['entries','sizes'],'readwrite');
      try{
        const inputs=[['project-outbox',projects],['import-outbox',imports]],updates=[];
        for(const [id,rows] of inputs){
          const k=key(account,id),stored=await readOutbox(tx,account,id);
          const merged=mergeOutboxRows(stored.rows,[],rows);
          updates.push({key:k,account,time:Date.now(),bytes:0,value:merged});
          for(const entry of stored.overlays)tx.objectStore('entries').delete(entry.key);
        }
        for(const row of updates){
          tx.objectStore('entries').put(row);
          const {value,...size}=row;tx.objectStore('sizes').put(size);
        }
        await tx.done;return updates.map(x=>x.value.length);
      }catch(error){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw error;}
    },
    async put(account,id,value){
      const d=await db(),row={key:key(account,id),account,time:Date.now(),bytes:value instanceof Blob?value.size:0};
      const write=d.transaction(['entries','sizes'],'readwrite');write.objectStore('entries').put({...row,value});write.objectStore('sizes').put(row);await write.done;
      // Read the small accounting records, not every cached image Blob.
      if(value instanceof Blob){const rows=(await d.getAll('sizes')).filter(r=>r.bytes).sort((a,b)=>{
        // Originals can be fetched on demand. Keep the much smaller card
        // previews resident so a large edited page cannot evict the library.
        const priority=r=>{
          const id=JSON.parse(r.key)[1];
          return /^(?:thumbnail:|thumbnail480:)/.test(id)?2:/^preview\d+:/.test(id)?1:0;
        };
        return priority(a)-priority(b)||a.time-b.time;
      });let size=rows.reduce((n,r)=>n+r.bytes,0);const tx=d.transaction(['entries','sizes'],'readwrite');for(const r of rows){if(size<=limit)break;tx.objectStore('entries').delete(r.key);tx.objectStore('sizes').delete(r.key);size-=r.bytes;}await tx.done;}
    },
    async previewBytes(account){
      const rows=await (await db()).getAll('sizes');
      return rows.filter(row=>row.account===account&&isDisposablePreviewKey(row.key))
        .reduce((sum,row)=>sum+(Number(row.bytes)||0),0);
    },
    async clearPreviews(account){
      const d=await db(),rows=(await d.getAll('sizes')).filter(row=>
        row.account===account&&isDisposablePreviewKey(row.key));
      if(!rows.length)return {count:0,bytes:0};
      const tx=d.transaction(['entries','sizes'],'readwrite');
      for(const row of rows){tx.objectStore('entries').delete(row.key);tx.objectStore('sizes').delete(row.key);}
      await tx.done;
      return {count:rows.length,bytes:rows.reduce((sum,row)=>sum+(Number(row.bytes)||0),0)};
    },
    // Logout clears disposable reads, never unacknowledged edits or their Blob
    // payloads. The explicit outbox discard flow owns deletion of these keys.
    async clear(account){const d=await db(),rows=await d.getAll('sizes'),tx=d.transaction(['entries','sizes'],'readwrite');for(const r of rows)if(r.account===account&&!['project-outbox','import-outbox','unified-outbox','sync-quarantine'].includes(JSON.parse(r.key)[1])){tx.objectStore('entries').delete(r.key);tx.objectStore('sizes').delete(r.key);}await tx.done;},
  };
}
export const privateCache=createPrivateCache();
