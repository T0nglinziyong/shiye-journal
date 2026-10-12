import {supportedSchema} from './storage-migrations.js';
// Validation happens before restoring a complete six-store backup. In
// particular, do not clear a real account because a JSON file parses.
const STORES=['assets','blobs','series','projects','meta','trash'];
export function validateRestoredRecords(stores){
  if(!stores||STORES.some(name=>!Array.isArray(stores[name])))throw Error('ZIP 缺少完整六表，未修改现有资料');
  const keys=new Map();
  for(const store of STORES){
    const seen=new Set();
    for(const row of stores[store]){
      if(!row||typeof row.id!=='string'||!row.id.trim()||seen.has(row.id))throw Error('ZIP 含非法或重复记录：'+store);
      if(store==='blobs'&&(!(row.data instanceof Blob)||!row.data.size))throw Error('ZIP 图片字节丢失');
      seen.add(row.id);
    }
    keys.set(store,seen);
  }
  for(const asset of stores.assets){
    for(const ref of ['blobId','candidateFrameBlobId','initialMaskBlobId','finalMaskBlobId']){
      if(asset[ref]&&!asset.staticPath&&!keys.get('blobs').has(asset[ref]))
        throw Error('ZIP 素材缺少必要图片或蒙版：'+asset.id+' / '+ref);
    }
  }
  return true;
}
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
const bytes=blob=>blob.arrayBuffer();
export async function buildBlobIntegrity(records){
  const manifest={};
  for(const row of records){
    if(typeof row?.id!=='string'||!(row.data instanceof Blob))throw Error('备份图片数据不完整');
    manifest[row.id]=await hash(await bytes(row.data));
  }
  return manifest;
}
export async function validateBackupData(data){
  if(data?.format!=='shiye-pwa'||data.version!==1||!data.stores
    ||STORES.some(s=>!Array.isArray(data.stores[s])))throw Error('不是拾页 PWA 完整备份');
  supportedSchema(data.schemaVersion??1);
  const ids={};
  for(const store of STORES){
    const seen=new Set();
    for(const row of data.stores[store]){
      if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id.trim()||seen.has(row.id))
        throw Error('完整备份包含无效或重复的 '+store+' 记录');
      seen.add(row.id);
    }
    ids[store]=seen;
  }
  const checksum=data.integrity?.blobs;
  if(data.integrity&&(data.integrity.algorithm!=='SHA-256'||!checksum||typeof checksum!=='object'||Object.keys(checksum).length!==ids.blobs.size))
    throw Error('备份哈希清单无效');
  for(const record of data.stores.blobs){
    if(typeof record.data!=='string'||!/^data:[^;,]+;base64,[A-Za-z0-9+/]*={0,2}$/.test(record.data))
      throw Error('备份图片编码格式无效');
    const encoded=record.data.slice(record.data.indexOf(',')+1);
    if(encoded.length%4===1)throw Error('备份图片编码已损坏');
    if(checksum){
      const actual=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),expected=checksum[record.id];
      if(!/^[a-f0-9]{64}$/.test(expected||'')||await hash(actual)!==expected)
        throw Error('备份图片 SHA-256 校验失败：'+record.id);
    }
  }
  // Built-in resources can be referenced by staticPath; otherwise a material
  // should never be restored with a missing primary cutout Blob.
  for(const asset of data.stores.assets){
    for(const ref of ['blobId','candidateFrameBlobId','initialMaskBlobId','finalMaskBlobId']){
      if(asset[ref]&&!asset.staticPath&&!ids.blobs.has(asset[ref]))
        throw Error('备份素材缺少图片或蒙版：'+asset.id+' / '+ref);
    }
  }
  return true;
}
