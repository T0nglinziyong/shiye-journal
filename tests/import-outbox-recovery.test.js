import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverImportOutbox} from '../src/import-outbox-recovery.js';

const asset=(id,blobId)=>({id,blobId});
const row=(assets,blobs)=>({record:{id:'batch',assets,blobs,projects:[]},serial:1,baseRevision:2});

test('forced-close ghost is discarded only after all local bytes and cloud records are absent',async()=>{
  const input=[row([asset('lost','image')],[{id:'image',data:new Blob([])}])];
  const result=await recoverImportOutbox(input,async()=>false);
  assert.equal(result.removed,1);
  assert.deepEqual(result.rows,[]);
});

test('a metadata-only card with no image id is unrecoverable only after a definite cloud miss',async()=>{
  const missing=row([{id:'orphan'}],[]);
  assert.equal((await recoverImportOutbox([missing],async()=>false)).removed,1);
  assert.equal((await recoverImportOutbox([missing],async()=>{throw Error('offline');})).removed,0);
});

test('a surviving original, cloud copy or uncertain network preserves the import',async()=>{
  const withOriginal=row([{...asset('a','cutout'),originalCutoutBlobId:'original'}],[{id:'cutout',data:new Blob([])},{id:'original',data:new Blob(['bytes'])}]);
  assert.equal((await recoverImportOutbox([withOriginal],async()=>false)).removed,0);
  const missing=row([asset('b','cutout')],[{id:'cutout',data:new Blob([])}]);
  assert.equal((await recoverImportOutbox([missing],async()=>true)).removed,0);
  assert.equal((await recoverImportOutbox([missing],async()=>{throw Error('offline');})).removed,0);
});

test('partial loss retains other cards and only their referenced image records',async()=>{
  const first=asset('lost','missing'),second=asset('ok','good');
  const input=[row([first,second],[{id:'missing',data:new Blob([])},{id:'good',data:new Blob(['bytes'])}])];
  const result=await recoverImportOutbox(input,async()=>false);
  assert.equal(result.removed,1);
  assert.deepEqual(result.rows[0].record.assets,[second]);
  assert.deepEqual(result.rows[0].record.blobs.map(b=>b.id),['good']);
});
