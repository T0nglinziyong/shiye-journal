// Read-only, out-of-band cloud snapshot. This module is never imported by
// the browser. All output is staged locally before becoming a valid snapshot.
import {createHash,randomUUID} from 'node:crypto';
import {open,mkdir,rename,rm,stat,readFile,readdir} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';

const TABLES=['shiye_accounts','shiye_revisions','shiye_records','shiye_changes','shiye_commits'];
const digest=data=>createHash('sha256').update(data).digest('hex');
const userPath=(owner,path)=>typeof path==='string'&&path.startsWith(owner+'/')&&!path.includes('..')&&!path.includes('\\');
const imageLink=/^project-cover:(cos|cloudbase):(.+)$/;
export function cloudObjectReferences(row){
  const refs=new Map(),owner=row?.user_id;
  if(!owner||!row?.record)return [];
  const add=(provider,path)=>{
    if(!provider&&!path)return;
    if(!['cos','cloudbase'].includes(provider)||!userPath(owner,path))
      throw Error('云端记录包含无效或跨账号的私有对象路径');
    refs.set(provider+':'+path,{provider,path});
  };
  const scan=(value,provider=null)=>{
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value)){value.forEach(x=>scan(x,provider));return;}
    const nextProvider=value.storageProvider||value.projectDocumentProvider||provider;
    if(value.storagePath)add(value.storageProvider||nextProvider,value.storagePath);
    if(value.thumbnailPath)add(value.storageProvider||nextProvider,value.thumbnailPath);
    if(value.projectDocumentPath)add(value.projectDocumentProvider||nextProvider,value.projectDocumentPath);
    if(typeof value.coverImageID==='string'){
      const match=imageLink.exec(value.coverImageID);
      if(match)add(match[1],match[2]);
    }
    for(const v of Object.values(value))if(v&&typeof v==='object')scan(v,nextProvider);
  };
  scan(row.record);
  return [...refs.values()];
}
const storageKey=({provider,path})=>provider+'|'+path;
const objectFile=ref=>'objects/'+digest(storageKey(ref))+'.bin';
const tableFile=name=>'tables/'+name+'.jsonl';
const safeLocation=(base,relative)=>{
  if(!/^(?:objects\/[a-f0-9]{64}\.bin|tables\/shiye_[a-z]+\.jsonl|manifest\.json)$/.test(relative))throw Error('非法备份路径');
  const file=resolve(base,relative);
  if(!file.startsWith(resolve(base)+sep))throw Error('非法备份路径');
  return file;
};
async function writeBytes(file,data){
  const fh=await open(file,'wx',0o600);
  try{await fh.writeFile(data);await fh.sync();}finally{await fh.close();}
}
async function writeObject(file,response){
  if(!response?.ok||!response.body)throw Error('私有对象读取失败，未生成完整备份');
  const fh=await open(file,'wx',0o600),hash=createHash('sha256');
  let bytes=0;
  try{
    for await(const chunk of response.body){
      hash.update(chunk);bytes+=chunk.byteLength;
      if(!chunk.byteLength)continue;
      await fh.write(chunk);
    }
    await fh.sync();
  }finally{await fh.close();}
  return {size:bytes,sha256:hash.digest('hex')};
}
const rowsEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const revisions=rows=>rows.map(r=>[r.user_id,String(r.revision)]).sort((a,b)=>a[0].localeCompare(b[0]));
export async function createCloudSnapshot({root,readTable,readObject,onProgress=()=>{}}){
  const destination=resolve(root),temporary=join(destination,'.incomplete-'+randomUUID());
  await mkdir(destination,{recursive:true,mode:0o700});
  await mkdir(join(temporary,'tables'),{recursive:true,mode:0o700});
  await mkdir(join(temporary,'objects'),{recursive:true,mode:0o700});
  const meta={format:'shiye-cloud-snapshot',version:1,createdAt:new Date().toISOString(),
    tables:{},objects:{},revisionConsistency:'verified'};
  try{
    const before=[];for await(const row of readTable('shiye_revisions'))before.push(row);
    const refs=new Map();
    for(const table of TABLES){
      const location=safeLocation(temporary,tableFile(table)),fh=await open(location,'wx',0o600);
      const hash=createHash('sha256');let count=0,bytes=0;
      try{
        for await(const row of readTable(table)){
          const line=Buffer.from(JSON.stringify(row)+'\n');
          hash.update(line);bytes+=line.length;await fh.write(line);count++;
          if(table==='shiye_records')for(const ref of cloudObjectReferences(row))refs.set(storageKey(ref),ref);
          if(count%500===0)onProgress({stage:'metadata',table,count});
        }
        await fh.sync();
      }finally{await fh.close();}
      meta.tables[table]={file:tableFile(table),count,size:bytes,sha256:hash.digest('hex')};
      onProgress({stage:'metadata',table,count});
    }
    for(const ref of [...refs.values()].sort((a,b)=>storageKey(a).localeCompare(storageKey(b)))){
      const file=objectFile(ref);
      const result=await writeObject(safeLocation(temporary,file),await readObject(ref));
      meta.objects[storageKey(ref)]={file,provider:ref.provider,path:ref.path,...result};
      onProgress({stage:'object',count:Object.keys(meta.objects).length,total:refs.size});
    }
    const after=[];for await(const row of readTable('shiye_revisions'))after.push(row);
    if(!rowsEqual(revisions(before),revisions(after)))throw Error('备份过程中数据库版本变化；没有发布不一致的备份');
    const manifest=JSON.stringify(meta,null,2)+'\n';
    await writeBytes(join(temporary,'manifest.json'),manifest);
    const final=join(destination,'snapshot-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));
    await rename(temporary,final);
    return {directory:final,manifest:meta};
  }catch(error){
    await rm(temporary,{force:true,recursive:true}).catch(()=>{});
    throw error;
  }
}
export async function verifyCloudSnapshot(directory){
  const root=resolve(directory),file=join(root,'manifest.json'),text=await readFile(file,'utf8'),meta=JSON.parse(text);
  if(meta.format!=='shiye-cloud-snapshot'||meta.version!==1||meta.revisionConsistency!=='verified')throw Error('无效备份清单');
  const items=[...Object.values(meta.tables),...Object.values(meta.objects)];
  for(const item of items){
    const path=safeLocation(root,item.file),handle=await open(path,'r');
    const hash=createHash('sha256');let bytes=0;
    try{
      for await(const chunk of handle.createReadStream()){hash.update(chunk);bytes+=chunk.length;}
    }finally{await handle.close().catch(()=>{});}
    if(bytes!==item.size||hash.digest('hex')!==item.sha256)throw Error('备份对象哈希不一致：'+item.file);
  }
  return {tables:Object.fromEntries(Object.entries(meta.tables).map(([key,v])=>[key,v.count])),objects:Object.keys(meta.objects).length,verified:true};
}
