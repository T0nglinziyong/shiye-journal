import {openDB} from 'idb';

// Disposable read cache, never an alternative write destination.
export function createPrivateCache({name='shiye-private-read-cache-v1',limit=160*1024*1024}={}){
  let connection;
  const db=()=>connection??=openDB(name,2,{async upgrade(d,oldVersion,_newVersion,tx){
    if(!oldVersion)d.createObjectStore('entries',{keyPath:'key'});
    d.createObjectStore('sizes',{keyPath:'key'});
    if(oldVersion){let cursor=await tx.objectStore('entries').openCursor();while(cursor){const {key,account,time,bytes}=cursor.value;tx.objectStore('sizes').put({key,account,time,bytes});cursor=await cursor.continue();}}
  }});
  const key=(account,id)=>JSON.stringify([account,id]);
  return {
    async get(account,id){return (await db()).get('entries',key(account,id)).then(row=>row?.value);},
    async put(account,id,value){
      const d=await db(),row={key:key(account,id),account,time:Date.now(),bytes:value instanceof Blob?value.size:0};
      const write=d.transaction(['entries','sizes'],'readwrite');write.objectStore('entries').put({...row,value});write.objectStore('sizes').put(row);await write.done;
      // Read the small accounting records, not every cached image Blob.
      if(value instanceof Blob){const rows=(await d.getAll('sizes')).filter(r=>r.bytes).sort((a,b)=>a.time-b.time);let size=rows.reduce((n,r)=>n+r.bytes,0);const tx=d.transaction(['entries','sizes'],'readwrite');for(const r of rows){if(size<=limit)break;tx.objectStore('entries').delete(r.key);tx.objectStore('sizes').delete(r.key);size-=r.bytes;}await tx.done;}
    },
    async clear(account){const d=await db(),rows=await d.getAll('sizes'),tx=d.transaction(['entries','sizes'],'readwrite');for(const r of rows)if(r.account===account){tx.objectStore('entries').delete(r.key);tx.objectStore('sizes').delete(r.key);}await tx.done;},
  };
}
export const privateCache=createPrivateCache();
