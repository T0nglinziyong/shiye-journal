import {readBackupZip} from './backup-zip-reader.js';
import {BACKUP_BYTES_LIMIT,BACKUP_METADATA_LIMIT,BACKUP_ENTRY_LIMIT} from './backup-limits.js';
import {Zip,ZipPassThrough} from 'fflate';
import {sha256} from '@noble/hashes/sha2.js';
import {CURRENT_DATA_SCHEMA} from './storage-migrations.js';

const STORES=['assets','blobs','series','projects','meta','trash'];
const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const hash=bytes=>hex(sha256(bytes));
const fail=error=>self.postMessage({type:'failure',error:String(error?.message||error)});
const MAX_UNPACKED=BACKUP_BYTES_LIMIT;
let zip=null,manifest=null,sequence=0,acknowledged=0,waiters=[],nextImage=0,unpackedBytes=0,metadataBytes=0;
const drain=async()=>{while(acknowledged<sequence)await new Promise(resolve=>waiters.push(resolve));};
function onZip(error,bytes){
  if(error){fail(error);return;}
  const copy=bytes.slice(),seq=++sequence;
  self.postMessage({type:'chunk',seq,bytes:copy},[copy.buffer]);
}
async function addEntry(path,bytes){
  if(!zip)throw Error('ZIP 尚未初始化');
  if(unpackedBytes+bytes.length>MAX_UNPACKED)throw Error('完整备份超过当前应用可恢复的 2 GB 解压上限');
  unpackedBytes+=bytes.length;
  metadataBytes+=bytes.length;if(metadataBytes>BACKUP_METADATA_LIMIT)throw Error('备份元数据超过 64 MB 上限');
  const entry=new ZipPassThrough(path);
  zip.add(entry);entry.push(bytes,true);
  await drain();
  manifest.files[path]={sha256:hash(bytes),size:bytes.length};
}
async function begin(records){
  if(zip)throw Error('ZIP 任务已启动');
  zip=new Zip(onZip);
  manifest={format:'shiye-pwa-zip',version:2,schemaVersion:CURRENT_DATA_SCHEMA,createdAt:new Date().toISOString(),
    tables:{},files:{},blobs:[],compression:'store'};
  for(const store of STORES.filter(name=>name!=='blobs')){
    const rows=records[store];
    if(rows?.length>BACKUP_ENTRY_LIMIT)throw Error('备份记录数量超限');
    if(!Array.isArray(rows))throw Error('备份数据表不完整：'+store);
    const text=rows.map(row=>JSON.stringify(row)).join('\n')+(rows.length?'\n':''),
      path='data/'+store+'.jsonl';
    await addEntry(path,encoder.encode(text));
    manifest.tables[store]={path,count:rows.length};
  }
  self.postMessage({type:'ready'});
}
async function image(record){
  const {data,...meta}=record||{};
  if(!(data instanceof Blob)||typeof meta.id!=='string'||!meta.id)throw Error('备份素材图片不完整');
  if(unpackedBytes+data.size>MAX_UNPACKED)throw Error('完整备份超过当前应用可恢复的 2 GB 解压上限');
  unpackedBytes+=data.size;
  if(nextImage+7>=BACKUP_ENTRY_LIMIT)throw Error('备份图片数量超限');
  const path='blobs/'+String(++nextImage).padStart(8,'0')+'.bin';
  const entry=new ZipPassThrough(path);zip.add(entry);
  const hashState=sha256.create(),reader=data.stream().getReader();
  let size=0;
  try{
    for(;;){
      const {value,done}=await reader.read();
      if(done)break;
      hashState.update(value);size+=value.length;
      // This awaits the browser's persistent output write before reading more
      // bytes. There is never an unbounded stream of ZIP chunks in memory.
      entry.push(value,false);await drain();
    }
    entry.push(new Uint8Array(0),true);await drain();
  }finally{reader.releaseLock();}
  const info={path,size,sha256:hex(hashState.digest())};
  manifest.files[path]=info;
  manifest.blobs.push({id:meta.id,path,type:data.type||'',meta});
  self.postMessage({type:'image-done',count:nextImage});
}
async function finish(){
  const text=manifest.blobs.map(x=>JSON.stringify(x)).join('\n')+(manifest.blobs.length?'\n':'');
  await addEntry('data/blobs.jsonl',encoder.encode(text));
  manifest.tables.blobs={path:'data/blobs.jsonl',count:manifest.blobs.length};
  const final=encoder.encode(JSON.stringify(manifest));
  if(unpackedBytes+final.length>MAX_UNPACKED)throw Error('完整备份超过当前应用可恢复的 2 GB 解压上限');
  unpackedBytes+=final.length;
  if(metadataBytes+final.length>BACKUP_METADATA_LIMIT)throw Error('备份元数据超过 64 MB 上限');
  const entry=new ZipPassThrough('manifest.json');zip.add(entry);
  entry.push(final,true);await drain();
  zip.end();await drain();
  self.postMessage({type:'done',entries:Object.keys(manifest.files).length+1});
}

async function restore(file,stagingName){
 const root=stagingName?await navigator.storage.getDirectory():null;
 const directory=root?await root.getDirectoryHandle(stagingName):null;
 const stores=await readBackupZip(file,{directory,onProgress:progress=>self.postMessage({type:'restore-progress',...progress})});
 self.postMessage({type:'restored',stores});
}
self.onmessage=event=>{
  const {type}=event.data||{};
  if(type==='ack'){acknowledged=Math.max(acknowledged,event.data.seq);for(const go of waiters.splice(0))go();return;}
  const run=type==='begin'?()=>begin(event.data.records):
    type==='image'?()=>image(event.data.record):
    type==='finish'?finish:
    type==='restore'?()=>restore(event.data.file,event.data.stagingName):null;
  if(run)void run().catch(fail);
};
