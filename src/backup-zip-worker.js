import {Zip,ZipPassThrough,Unzip} from 'fflate';
import {sha256} from '@noble/hashes/sha2.js';
import {supportedSchema,CURRENT_DATA_SCHEMA} from './storage-migrations.js';

const STORES=['assets','blobs','series','projects','meta','trash'];
const encoder=new TextEncoder(),decoder=new TextDecoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const hash=bytes=>hex(sha256(bytes));
const fail=error=>self.postMessage({type:'failure',error:String(error?.message||error)});
const MAX_ENTRIES=20000;
const MAX_UNPACKED=256*1024*1024;
let zip=null,manifest=null,sequence=0,acknowledged=0,waiters=[],nextImage=0,unpackedBytes=0;
const drain=async()=>{while(acknowledged<sequence)await new Promise(resolve=>waiters.push(resolve));};
function onZip(error,bytes){
  if(error){fail(error);return;}
  const copy=bytes.slice(),seq=++sequence;
  self.postMessage({type:'chunk',seq,bytes:copy},[copy.buffer]);
}
async function addEntry(path,bytes){
  if(!zip)throw Error('ZIP 尚未初始化');
  if(unpackedBytes+bytes.length>MAX_UNPACKED)throw Error('完整备份超过当前应用可恢复的 256 MB 解压上限');
  unpackedBytes+=bytes.length;
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
  if(unpackedBytes+data.size>MAX_UNPACKED)throw Error('完整备份超过当前应用可恢复的 256 MB 解压上限');
  unpackedBytes+=data.size;
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
  if(unpackedBytes+final.length>MAX_UNPACKED)throw Error('完整备份超过当前应用可恢复的 256 MB 解压上限');
  unpackedBytes+=final.length;
  const entry=new ZipPassThrough('manifest.json');zip.add(entry);
  entry.push(final,true);await drain();
  zip.end();await drain();
  self.postMessage({type:'done',entries:Object.keys(manifest.files).length+1});
}

const chunksToBytes=(chunks,size)=>{
  const out=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}
  return out;
};
const safeName=name=>name==='manifest.json'||/^data\/(assets|series|projects|meta|trash|blobs)\.jsonl$/.test(name)||/^blobs\/[0-9]{8}\.bin$/.test(name);
function parseLines(bytes){
  const text=decoder.decode(bytes);
  if(!text)return [];
  const rows=text.split('\n').filter(Boolean).map(line=>JSON.parse(line));
  if(rows.length>MAX_ENTRIES)throw Error('备份记录数量超限');
  return rows;
}
async function restore(file){
  if(file.size>MAX_UNPACKED)throw Error('ZIP 备份超过当前应用可安全恢复的 256 MB 上限；原有资料未修改');
  const files=new Map();let total=0,count=0,streamError=null;
  const unzip=new Unzip(entry=>{
    if(streamError)return;
    // Complete backups are emitted with ZIP store (method 0). Rejecting
    // deflate also prevents a tiny compressed input from consuming the whole
    // 256 MiB expansion budget before its manifest can be authenticated.
    if(entry.compression!==0){
      streamError=Error('ZIP 包含不受支持的压缩文件；请选择拾页导出的完整备份');
      entry.terminate();return;
    }
    if(!safeName(entry.name)||files.has(entry.name)||++count>MAX_ENTRIES){
      streamError=Error('ZIP 包含非法、重复或过多的文件');entry.terminate();return;
    }
    const chunks=[];let size=0;
    entry.ondata=(error,chunk,final)=>{
      if(streamError)return;
      if(error){streamError=error;return;}
      size+=chunk.length;total+=chunk.length;
      if(total>MAX_UNPACKED){streamError=Error('ZIP 解压大小超限');return;}
      chunks.push(chunk);
      if(final)files.set(entry.name,chunksToBytes(chunks,size));
    };
    entry.start();
  });
  const reader=file.stream().getReader();
  try{
    for(;;){
      const {value,done}=await reader.read();
      if(done){unzip.push(new Uint8Array(0),true);break;}
      // A single Blob stream chunk can contain thousands of empty ZIP files.
      // fflate invokes each entry callback recursively while parsing that
      // chunk, so feed bounded slices and enforce our count between slices.
      for(let offset=0;offset<value.length;offset+=4096){
        unzip.push(value.subarray(offset,offset+4096),false);
        if(streamError)throw streamError;
      }
    }
    if(streamError)throw streamError;
  }finally{reader.releaseLock();}
  const raw=files.get('manifest.json');
  if(!raw)throw Error('ZIP 不含完整清单，未修改现有资料');
  const manifest=JSON.parse(decoder.decode(raw));
  if(manifest.format!=='shiye-pwa-zip'||manifest.version!==2||!manifest.files||!manifest.tables||!Array.isArray(manifest.blobs))
    throw Error('不是拾页 ZIP 完整备份');
  supportedSchema(manifest.schemaVersion??1);
  if(files.size!==Object.keys(manifest.files).length+1)throw Error('ZIP 文件清单数量不一致');
  for(const [path,info] of Object.entries(manifest.files)){
    const content=files.get(path);
    if(!safeName(path)||!content||info.size!==content.length||info.sha256!==hash(content))
      throw Error('ZIP 文件 SHA-256 校验失败：'+path);
  }
  const stores={};
  for(const name of STORES){
    const info=manifest.tables[name],path='data/'+name+'.jsonl';
    if(!info||info.path!==path)throw Error('备份缺少 '+name+' 表');
    stores[name]=parseLines(files.get(path)||new Uint8Array(0));
    if(stores[name].length!==info.count)throw Error('备份记录数量不匹配：'+name);
  }
  const seen=new Set(),blobs=[];
  for(const row of stores.blobs){
    if(typeof row?.id!=='string'||!row.id||seen.has(row.id)||!safeName(row.path)||!row.path.startsWith('blobs/'))
      throw Error('备份图片索引不合法');
    seen.add(row.id);
    const info=manifest.files[row.path],bytes=files.get(row.path);
    if(!info||!bytes)throw Error('备份图片字节缺失');
    const meta=row.meta||{};
    if(meta.id!==row.id)throw Error('备份图片编号不匹配');
    blobs.push({...meta,data:new Blob([bytes],{type:row.type||'application/octet-stream'})});
  }
  if(blobs.length!==manifest.blobs.length)throw Error('备份图片目录不一致');
  stores.blobs=blobs;
  self.postMessage({type:'restored',stores});
}
self.onmessage=event=>{
  const {type}=event.data||{};
  if(type==='ack'){acknowledged=Math.max(acknowledged,event.data.seq);for(const go of waiters.splice(0))go();return;}
  const run=type==='begin'?()=>begin(event.data.records):
    type==='image'?()=>image(event.data.record):
    type==='finish'?finish:
    type==='restore'?()=>restore(event.data.file):null;
  if(run)void run().catch(fail);
};
