import {ZipReader,BlobReader} from '@zip.js/zip.js';
import {sha256} from '@noble/hashes/sha2.js';
import {supportedSchema} from './storage-migrations.js';
import {BACKUP_BYTES_LIMIT,BACKUP_METADATA_LIMIT,BACKUP_ENTRY_LIMIT} from './backup-limits.js';
const STORES=['assets','blobs','series','projects','meta','trash'];
const safeName=name=>name==='manifest.json'||/^data\/(assets|series|projects|meta|trash|blobs)\.jsonl$/.test(name)||/^blobs\/[0-9]{8}\.bin$/.test(name);
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
// zip.js validates local/central headers, overlapping entries and CRC. Our
// manifest independently verifies SHA-256 and the six-table reference contract.
export async function readBackupZip(file,{directory=null,onProgress=()=>{}}={}){
 if(file.size>BACKUP_BYTES_LIMIT)throw Error('ZIP 备份超过当前 2 GB 上限；原有资料未修改');
 if(!directory&&file.size>256*1024*1024)throw Error('超过 256 MB 的 ZIP 需要流式暂存恢复');
 const reader=new ZipReader(new BlobReader(file),{useWebWorkers:false,strictness:'strict',checkOverlappingEntry:true,checkSignature:true,checkCrc32:true});
 try{
  const entries=new Map();let total=0,metadata=0;
  for await(const entry of reader.getEntriesGenerator()){
   if(!safeName(entry.filename)||entries.has(entry.filename)||entries.size>=BACKUP_ENTRY_LIMIT)
    throw Error('ZIP 包含非法、重复或过多的文件');
   if(entry.compressionMethod!==0||entry.encrypted||entry.directory)
    throw Error('ZIP 包含不受支持的压缩文件；请选择拾页导出的完整备份');
   total+=entry.uncompressedSize;
   if(!entry.filename.startsWith('blobs/'))metadata+=entry.uncompressedSize;
   if(!Number.isSafeInteger(total)||total>BACKUP_BYTES_LIMIT||metadata>BACKUP_METADATA_LIMIT)
    throw Error('ZIP 内容或元数据超过容量上限');
   entries.set(entry.filename,entry);
  }
  const extract=async(path,{type='application/octet-stream',expected=null}={})=>{
   const entry=entries.get(path);if(!entry)throw Error('ZIP 文件缺失：'+path);
   const isImage=path.startsWith('blobs/'),parts=[],hash=sha256.create();let bytes=0;
   const handle=isImage&&directory?await directory.getFileHandle(path.slice(6),{create:true}):null;
   const sink=handle?await handle.createWritable():null;
   try{
    await entry.getData(new WritableStream({async write(chunk){
     bytes+=chunk.length;if(bytes>entry.uncompressedSize)throw Error('ZIP 字节数超出清单');
     hash.update(chunk);if(sink)await sink.write(chunk);else parts.push(chunk.slice());
    }}));
    if(bytes!==entry.uncompressedSize||expected&&(expected.size!==bytes||expected.sha256!==hex(hash.digest())))
     throw Error('ZIP 文件 SHA-256 校验失败：'+path);
    if(sink)await sink.close();
    // Detach from the OPFS file before it can be removed: a File slice may
    // retain a live filesystem reference even after an IndexedDB put.
    return handle?await new Response((await handle.getFile()).stream(),{headers:{'Content-Type':type}}).blob():new Blob(parts,{type});
   }catch(error){await sink?.abort().catch(()=>{});throw error;}
  };
  const manifest=JSON.parse(await (await extract('manifest.json')).text());
  if(manifest.format!=='shiye-pwa-zip'||manifest.version!==2||!manifest.files||!manifest.tables||!Array.isArray(manifest.blobs))throw Error('不是拾页 ZIP 完整备份');
  supportedSchema(manifest.schemaVersion??1);
  if(entries.size!==Object.keys(manifest.files).length+1)throw Error('ZIP 文件清单数量不一致');
  for(const [path,info] of Object.entries(manifest.files)){
   if(!safeName(path)||path==='manifest.json'||!entries.has(path)||!Number.isSafeInteger(info?.size)||info.size!==entries.get(path).uncompressedSize||!/^[a-f0-9]{64}$/.test(info.sha256))
    throw Error('ZIP 文件清单不合法：'+path);
  }
  const stores={},used=new Set(['manifest.json']);
  for(const name of STORES){
   const path='data/'+name+'.jsonl',info=manifest.tables[name];
   if(info?.path!==path||!manifest.files[path])throw Error('备份缺少 '+name+' 表');
   const text=await (await extract(path,{expected:manifest.files[path]})).text();
   stores[name]=text.split('\n').filter(Boolean).map(line=>JSON.parse(line));used.add(path);
   if(stores[name].length!==info.count||stores[name].length>BACKUP_ENTRY_LIMIT)throw Error('备份记录数量不匹配：'+name);
  }
  const seen=new Set(),blobs=[];
  for(const row of stores.blobs){
   if(typeof row?.id!=='string'||!row.id||seen.has(row.id)||!safeName(row.path)||!row.path.startsWith('blobs/')||used.has(row.path)||row.meta?.id!==row.id||!manifest.files[row.path])throw Error('备份图片索引不合法');
   seen.add(row.id);used.add(row.path);
   blobs.push({...row.meta,data:await extract(row.path,{type:row.type||'application/octet-stream',expected:manifest.files[row.path]})});
   onProgress({current:blobs.length,total:stores.blobs.length});
  }
  if(blobs.length!==manifest.blobs.length||used.size!==entries.size)throw Error('备份图片目录不一致');
  stores.blobs=blobs;return stores;
 }catch(error){if(['Ambiguous archive','Unsafe filename'].includes(error.message))throw Error('ZIP 包含非法、重复或过多的文件');throw error;}finally{await reader.close();}
}
