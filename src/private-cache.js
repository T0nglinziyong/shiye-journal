import {openDB} from 'idb';

// Account-scoped disposable read cache plus a protected durable outbox. 
// Outbox entries are NEVER evicted or erased on logout.

// Merge a tab's changes, not its whole in-memory snapshot. An unrelated tab's
// pending edit must survive; edits to the same row must fail, never overwrite.
const outboxID=row=>row?.record?.id;
const outboxStamp=row=>row?JSON.stringify([row.serial,row.baseRevision,row.operationID]):null;
const rowsByID=rows=>{
  const map=new Map();
  for(const row of rows||[]){
    const id=outboxID(row);
    if(typeof id!=='string'||!id||map.has(id))throw Error('待同步记录编号无效或重复');
    map.set(id,row);
  }
  return map;
};
export function mergeOutboxRows(currentRows,previousRows,nextRows){
  const current=rowsByID(currentRows),previous=rowsByID(previousRows),next=rowsByID(nextRows);
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
  return {
    async get(account,id){return (await db()).get('entries',key(account,id)).then(row=>row?.value);},
    // Atomic read/merge/write in ONE IndexedDB transaction. Uses the existing
    // cache DB/schema and stores the queue under its old key for compatibility.
    async putOutbox(account,id,previousRows,nextRows){
      if(id!=='project-outbox'&&id!=='import-outbox')throw Error('不是待同步队列');
      const d=await db(),tx=d.transaction(['entries','sizes'],'readwrite');
      try{
        const k=key(account,id),saved=await tx.objectStore('entries').get(k),
          merged=mergeOutboxRows(saved?.value||[],previousRows,nextRows),
          row={key:k,account,time:Date.now(),bytes:0};
        tx.objectStore('entries').put({...row,value:merged});
        tx.objectStore('sizes').put(row);
        await tx.done;
        return merged;
      }catch(error){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw error;}
    },
    // Restore both queues as one transaction. A collision with a newer
    // pending operation aborts EVERYTHING, including the other queue.
    async restoreOutboxes(account,projects,imports){
      const d=await db(),tx=d.transaction(['entries','sizes'],'readwrite');
      try{
        const inputs=[['project-outbox',projects],['import-outbox',imports]],updates=[];
        for(const [id,rows] of inputs){
          const k=key(account,id),stored=await tx.objectStore('entries').get(k);
          const merged=mergeOutboxRows(stored?.value||[],[],rows);
          updates.push({key:k,account,time:Date.now(),bytes:0,value:merged});
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
        const priority=r=>JSON.parse(r.key)[1].startsWith('thumbnail:')?1:0;
        return priority(a)-priority(b)||a.time-b.time;
      });let size=rows.reduce((n,r)=>n+r.bytes,0);const tx=d.transaction(['entries','sizes'],'readwrite');for(const r of rows){if(size<=limit)break;tx.objectStore('entries').delete(r.key);tx.objectStore('sizes').delete(r.key);size-=r.bytes;}await tx.done;}
    },
    // Logout clears disposable reads, never unacknowledged edits or their Blob
    // payloads. The explicit outbox discard flow owns deletion of these keys.
    async clear(account){const d=await db(),rows=await d.getAll('sizes'),tx=d.transaction(['entries','sizes'],'readwrite');for(const r of rows)if(r.account===account&&!['project-outbox','import-outbox'].includes(JSON.parse(r.key)[1])){tx.objectStore('entries').delete(r.key);tx.objectStore('sizes').delete(r.key);}await tx.done;},
  };
}
export const privateCache=createPrivateCache();
