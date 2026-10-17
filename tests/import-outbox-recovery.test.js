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

test('a source photo alone does not keep an unrenderable cutout card',async()=>{
  const input=[row([{id:'lost',blobId:'cutout',photoBlobId:'photo'}],[{id:'cutout',data:new Blob([])},{id:'photo',data:new Blob(['source photo'])}])];
  const result=await recoverImportOutbox(input,async()=>[]);
  assert.equal(result.removed,1);
  assert.deepEqual(result.rows,[]);
});

test('surviving cutout restores the display reference and removes empty pending bytes',async()=>{
  const input=[row([{id:'repair',blobId:'missing',originalCutoutBlobId:'original-cutout',photoBlobId:'photo'}],[{id:'missing',data:new Blob([])},{id:'original-cutout',data:new Blob(['visible'])},{id:'photo',data:new Blob(['source'])}])];
  const result=await recoverImportOutbox(input,async()=>[]);
  assert.equal(result.removed,0);
  assert.equal(result.rows[0].record.assets[0].blobId,'original-cutout');
  assert.deepEqual(result.rows[0].record.blobs.map(blob=>blob.id),['original-cutout','photo']);
});

test('a remote primary survives missing local bytes; uncertain network never deletes them',async()=>{
  const input=[row([{id:'remote',blobId:'cutout',photoBlobId:'photo'}],[{id:'cutout',data:new Blob([])}])];
  const available=await recoverImportOutbox(input,async()=>['cutout']);
  assert.equal(available.removed,0);
  assert.deepEqual(available.rows[0].record.blobs,[]);
  const uncertain=await recoverImportOutbox(input,async()=>{throw Error('AbortError');});
  assert.equal(uncertain.removed,0);
  assert.equal(uncertain.changed,false);
  assert.deepEqual(uncertain.rows,input);
});
test('an interrupted work import is atomic: a lost background removes the pending work',async()=>{
  const work={id:'work',activeDraftID:'page',drafts:[{id:'page',sceneVersion:2,canvas:{width:700,height:1000},layers:[]}]};
  const input=[{...row([asset('background','lost'),asset('cutout','good')],[{id:'lost',data:new Blob([])},{id:'good',data:new Blob(['visible'])}]),record:{id:'batch',assets:[asset('background','lost'),asset('cutout','good')],blobs:[{id:'lost',data:new Blob([])},{id:'good',data:new Blob(['visible'])}],projects:[work]}}];
  const result=await recoverImportOutbox(input,async()=>false);
  assert.deepEqual(result.rows,[]);assert.equal(result.removed,1);
  const uncertain=await recoverImportOutbox(input,async()=>{throw Error('offline');});
  assert.deepEqual(uncertain.rows,input);
});
test('a truncated queued edit is dropped instead of replaying an incomplete mutation',async()=>{
  const input=[{record:{id:'mutation',names:['assets'],operations:[{action:'put',store:'assets'}]},serial:1,baseRevision:2}];
  const result=await recoverImportOutbox(input,async()=>false);
  assert.equal(result.changed,true);assert.deepEqual(result.rows,[]);
});
test('a cutout edit missing its local image falls back to the acknowledged cloud asset',async()=>{
  const input=[{record:{id:'edit',names:['assets','blobs'],operations:[
    {action:'put',store:'assets',item:{id:'asset',title:'incomplete',blobId:'replacement'}},
    {action:'put',store:'blobs',item:{id:'replacement',data:new Blob([])}}
  ]},serial:1,baseRevision:2}];
  const result=await recoverImportOutbox(input,async()=>false);
  assert.equal(result.changed,true);assert.deepEqual(result.rows,[]);
});

test('a validated pending source blob protects its dependent cutouts after reopening',async()=>{
  const photo={id:'photo',data:new Blob(['source'])};
  const source={record:{id:'source',names:['blobs'],operations:[
    {store:'blobs',action:'put',item:photo}]},serial:1,baseRevision:2};
  const card={record:{id:'card',assets:[{id:'a',blobId:'photo'}],blobs:[],
    projects:[],dependsOnBlobIDs:['photo']},serial:2,baseRevision:2};
  const result=await recoverImportOutbox([source,card],async()=>false);
  assert.equal(result.changed,false);
  assert.deepEqual(result.rows,[source,card]);
});
