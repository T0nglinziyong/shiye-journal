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

test('CloudBase key-exists code without HTTP status resumes old photo uploads',async()=>{
  const uploaded=new Set(['owner/old-photo']);
  const storage=()=>({from:()=>({
    upload:async()=>({error:{code:'STORAGE_KEY_ALREADY_EXISTS',message:'The resource already exists'}}),
    exists:async path=>({data:uploaded.has(path),error:null})
  })});
  const store=createCloudBaseStorage({storage});
  await store.upload('owner/old-photo',new Blob(['old-photo']));
  await assert.rejects(store.upload('owner/missing-photo',new Blob(['missing'])),/上传失败/);
});

test('a thrown duplicate is verified, while unrelated upload failures remain visible',async()=>{
  let error=Object.assign(Error('The resource already exists'),{code:'STORAGE_KEY_ALREADY_EXISTS'});
  const storage=()=>({from:()=>({
    upload:async()=>{throw error;},
    exists:async()=>({data:true,error:null})
  })});
  const store=createCloudBaseStorage({storage});
  await store.upload('owner/old-photo',new Blob(['old-photo']));
  error=Object.assign(Error('permission denied'),{statusCode:403});
  await assert.rejects(store.upload('owner/old-photo',new Blob(['old-photo'])),/permission denied/);
});

test('a lost upload response is acknowledged only after the immutable object is found',async()=>{
  let committed=true,probes=0;
  const store=createCloudBaseStorage({storage:()=>({from:()=>({
    upload:async()=>{throw Object.assign(Error('network request failed'),{name:'TypeError'});},
    exists:async()=>{probes++;return {data:committed,error:null};}
  })})});
  await store.upload('owner/content-hash',new Blob(['bytes']));
  assert.equal(probes,1);
  committed=false;
  await assert.rejects(store.upload('owner/missing-hash',new Blob(['bytes'])),/network request failed/);
  assert.equal(probes,2);
});
