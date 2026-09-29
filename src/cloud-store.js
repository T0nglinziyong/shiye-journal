import {cloudClient,requireCloudUser} from './cloud-session.js';
export function createCloudStore({cloudClient,requireCloudUser}){
const BUCKET='shiye-private';
let owner,revision;
let queue=Promise.resolve();
const images=new Map();
const checked=result=>{if(result.error)throw Error(result.error.message||'云端数据服务不可用');return result.data;};
async function identity(){return owner??=(await requireCloudUser()).id;}
async function version(){const id=await identity();const row=checked(await cloudClient().from('shiye_revisions').select('revision').eq('user_id',id).single());revision=Number(row.revision);return revision;}
async function cloudAll(store){
  await identity();if(revision===undefined)await version();const rows=[];
  for(let offset=0;;offset+=500){const page=checked(await cloudClient().from('shiye_records').select('record').eq('user_id',owner).eq('store',store).order('id').range(offset,offset+499));rows.push(...page);if(page.length<500)break;}
  return Promise.all(rows.map(row=>decode(store,row.record)));
}
async function cloudGet(store,id){
  await identity();const row=checked(await cloudClient().from('shiye_records').select('record').eq('user_id',owner).eq('store',store).eq('id',id).maybeSingle());
  if(revision===undefined)await version();return row?decode(store,row.record):undefined;
}
async function decode(store,record){
  if(store!=='blobs')return record;
  const {storagePath,...metadata}=record;
  if(!images.has(storagePath)){const pending=cloudClient().storage.from(BUCKET).download(storagePath).then(checked).catch(error=>{images.delete(storagePath);throw error;});images.set(storagePath,pending);}
  const data=await images.get(storagePath);return {...metadata,data};
}
async function encode(store,record){
  if(store!=='blobs')return record;
  if(!(record.data instanceof Blob))throw Error('图片必须是完整 Blob');
  const bytes=await record.data.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
  const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const storagePath=`${await identity()}/${hash}`;
  const uploaded=await cloudClient().storage.from(BUCKET).upload(storagePath,record.data,{upsert:false,contentType:record.data.type||'application/octet-stream'});
  if(uploaded.error&&uploaded.error.statusCode!=='409'&&uploaded.error.statusCode!==409)throw Error('图片上传失败，未保存元数据');
  const {data,...metadata}=record;return {...metadata,storagePath};
}
function cloudTransaction(names,fn){
  const operations=[];const result=fn({objectStore(store){if(!names.includes(store))throw Error('此表未加入事务');return {put:record=>operations.push({action:'put',store,item:structuredClone(record)}),delete:id=>operations.push({action:'delete',store,id}),clear:()=>operations.push({action:'clear',store})};}});
  if(result?.then)throw Error('事务回调必须同步');
  const run=async()=>{
    await identity();if(revision===undefined)await version();
    for(const op of operations)if(op.action==='put')op.item=await encode(op.store,op.item);
    const data=checked(await cloudClient().rpc('shiye_commit',{operations,expected_revision:revision}));revision=Number(data);
  };
  const pending=queue.then(run);queue=pending.catch(()=>{});return pending;
}
async function cloudCheckpoint(){
  await identity();const current=Number(checked(await cloudClient().from('shiye_revisions').select('revision').eq('user_id',owner).single()).revision);
  if(revision!==undefined&&revision!==current)throw Error('另一设备已更新资料，请刷新后重试；未导出不一致的备份');
  return current;
}
return {cloudAll,cloudGet,cloudTransaction,cloudCheckpoint};
}
const current=createCloudStore({cloudClient,requireCloudUser});
export const cloudAll=(...args)=>current.cloudAll(...args);
export const cloudGet=(...args)=>current.cloudGet(...args);
export const cloudTransaction=(...args)=>current.cloudTransaction(...args);
export const cloudCheckpoint=(...args)=>current.cloudCheckpoint(...args);
