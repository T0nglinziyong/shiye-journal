import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudBaseStorage,SHIYE_STORAGE_BUCKET} from '../src/cloudbase-storage.js';

test('private storage uses the account bucket and original bytes',async()=>{
  const files=new Map(),buckets=[];
  const storage=()=>({from:id=>{buckets.push(id);return {
    upload:async(path,data)=>{files.set(path,data);return {data:{path},error:null};},
    download:async path=>files.has(path)?{data:files.get(path),error:null}:{data:null,error:{statusCode:404,message:'missing'}},
    exists:async path=>({data:files.has(path),error:null})
  };}});
  const store=createCloudBaseStorage({storage});
  const original=new Blob(['original'],{type:'image/png'});
  await store.upload('owner/hash',original);
  assert.equal(await (await store.download('owner/hash')).text(),'original');
  assert.equal(await (await store.preview('owner/hash')).text(),'original');
  assert.equal(await store.probe('owner/hash'),true);
  assert.ok(buckets.every(id=>id===SHIYE_STORAGE_BUCKET));
});

test('duplicate immutable upload succeeds only when the object exists',async()=>{
  let exists=true;
  const storage=()=>({from:()=>({
    upload:async()=>({error:{statusCode:409,message:'duplicate'}}),
    exists:async()=>({data:exists,error:null})
  })});
  const store=createCloudBaseStorage({storage});
  await store.upload('owner/hash',new Blob(['same']));
  exists=false;
  await assert.rejects(store.upload('owner/hash',new Blob(['missing'])),/上传失败/);
});
