import test from 'node:test';
import assert from 'node:assert/strict';
import {splitIndependentAssetImport,splitWideMetadataMutation,splitPendingAssetImportRows,reconcileInterruptedAssetImport} from '../src/import-sync-batches.js';

test('independent library materials become independent cloud batches',()=>{
  let id=0;
  const batch={id:'original',assets:[
    {id:'a',blobId:'a-cutout',initialMaskBlobId:'a-mask',finalMaskBlobId:'a-mask'},
    {id:'b',blobId:'b-cutout',candidateFrameBlobId:'b-frame'}
  ],blobs:[
    {id:'a-cutout',data:'a'},{id:'a-mask',data:'am'},
    {id:'b-cutout',data:'b'},{id:'b-frame',data:'bf'}
  ],projects:[]};
  const parts=splitIndependentAssetImport(batch,{newID:()=>`part-${++id}`});
  assert.deepEqual(parts.map(part=>part.id),['part-1','part-2']);
  assert.deepEqual(parts.map(part=>part.assets.map(asset=>asset.id)),[['a'],['b']]);
  assert.deepEqual(parts.map(part=>part.blobs.map(blob=>blob.id)),[['a-cutout','a-mask'],['b-cutout','b-frame']]);
});

test('materials sharing source bytes publish the source first, then bounded independent cards',()=>{
  const batch={id:'shared',assets:[
    {id:'a',blobId:'a-cutout',photoBlobId:'photo'},
    {id:'b',blobId:'b-cutout',photoBlobId:'photo'},
    {id:'c',blobId:'c-cutout'}
  ],blobs:['a-cutout','b-cutout','c-cutout','photo'].map(id=>({id,data:id})),projects:[]};
  const parts=splitIndependentAssetImport(batch,{newID:(()=>{let id=0;return()=>String(++id);})()});
  assert.equal(parts.length,4);
  assert.deepEqual(parts[0].operations.map(op=>op.item.id),['photo']);
  assert.deepEqual(parts.slice(1).map(part=>part.assets[0].id),['a','b','c']);
  assert.deepEqual(parts[1].blobs.map(blob=>blob.id),['a-cutout']);
  assert.deepEqual(parts[2].blobs.map(blob=>blob.id),['b-cutout']);
  assert.deepEqual(parts.slice(1).map(part=>part.dependsOnBlobIDs),[['photo'],['photo'],[]]);
});

test('shared-source recovery splits an old durable row only after checking its receipt',async()=>{
  const batch={id:'old',assets:[{id:'a',blobId:'a-cut',photoBlobId:'photo'},
    {id:'b',blobId:'b-cut',photoBlobId:'photo'}],blobs:['a-cut','b-cut','photo']
    .map(id=>({id,data:new Blob([id])})),projects:[]};
  const row={record:{id:'batch:old',kind:'batch',payload:batch},serial:10,
    baseRevision:50,operationID:'old-operation'};
  const pending=await splitPendingAssetImportRows([row],{
    isCommitted:async()=>false,newID:(()=>{let id=0;return()=>`part-${++id}`;})(),
    newOperationID:(()=>{let id=0;return()=>`op-${++id}`;})()});
  assert.deepEqual(pending.map(item=>item.serial),[10,11,12]);
  assert.deepEqual(pending.map(item=>item.record.payload.id),['part-1','part-2','part-3']);
  assert.ok(pending.every(item=>item.operationID!==row.operationID));
  assert.equal(await splitPendingAssetImportRows([row],{isCommitted:async()=>true}),null);
});

test('wide independent metadata PUTs use bounded durable transactions',async()=>{
  const batch={id:'bulk',names:['assets'],operations:Array.from({length:58},(_,i)=>({
    store:'assets',action:'put',item:{id:'a'+i,title:'updated'}}))};
  let id=0;
  const parts=splitWideMetadataMutation(batch,{newID:()=>`chunk-${++id}`});
  assert.equal(parts.length,8);
  assert.deepEqual(parts.map(part=>part.operations.length),[8,8,8,8,8,8,8,2]);
  assert.deepEqual(parts.flatMap(part=>part.operations),batch.operations);
  const row={record:{id:'batch:bulk',kind:'batch',payload:batch},serial:3,
    baseRevision:40,operationID:'bulk-operation'};
  const recovered=await splitPendingAssetImportRows([row],{
    isCommitted:async()=>false,newID:()=>`recovered-${++id}`,
    newOperationID:()=>`operation-${id}`});
  assert.equal(recovered.length,8);
  assert.deepEqual(recovered.flatMap(item=>item.record.payload.operations),batch.operations);
  assert.equal(await splitPendingAssetImportRows([row],{isCommitted:async()=>true}),null);
});

test('wide deletes, restores and repeated keys retain their atomic batch',()=>{
  const puts=Array.from({length:9},(_,i)=>({store:'assets',action:'put',item:{id:'a'+i}}));
  for(const operations of [[...puts,{store:'assets',action:'delete',id:'x'}],
    [...puts,{store:'assets',action:'put',item:{id:'a0'}}],
    [...puts,{store:'meta',action:'put',item:{id:'marker'}}]]){
    const batch={id:'atomic',names:['assets','meta'],operations};
    assert.deepEqual(splitWideMetadataMutation(batch),[batch]);
  }
});

test('projects and unknown batch bytes preserve the original atomic import',()=>{
  const projectBatch={id:'work',assets:[{id:'a',blobId:'a'},{id:'b',blobId:'b'}],
    blobs:[{id:'a'},{id:'b'}],projects:[{id:'work'}]};
  assert.deepEqual(splitIndependentAssetImport(projectBatch),[projectBatch]);
  const unknown={...projectBatch,projects:[],blobs:[...projectBatch.blobs,{id:'batch-source'}]};
  assert.deepEqual(splitIndependentAssetImport(unknown),[unknown]);
});

test('an old pending recognition batch is losslessly converted unless already committed',async()=>{
  const payload={id:'old-batch',assets:[{id:'a',blobId:'a'},{id:'b',blobId:'b'}],
    blobs:[{id:'a',data:'a'},{id:'b',data:'b'}],projects:[]};
  const row={record:{id:'batch:old-batch',kind:'batch',payload},serial:4,baseRevision:9,
    operationID:'old-operation',attempt:2,lastFailureClass:'transient'};
  let id=0,operation=0;
  const split=await splitPendingAssetImportRows([row],{
    newID:()=>`part-${++id}`,newOperationID:()=>`operation-${++operation}`});
  assert.equal(split.length,2);
  assert.deepEqual(split.map(item=>item.record.payload.assets[0].id),['a','b']);
  assert.deepEqual(split.map(item=>item.serial),[4,5]);
  assert.deepEqual(split.map(item=>item.operationID),['operation-1','operation-2']);
  assert.ok(split.every(item=>!('attempt' in item)&&!('lastFailureClass' in item)));
  assert.equal(await splitPendingAssetImportRows([row],{isCommitted:async()=>true}),null);
});

test('splitting an old import keeps both image batches before its later AI rename',async()=>{
  const batch={id:'old',assets:[{id:'a',blobId:'a'},{id:'b',blobId:'b'}],
    blobs:[{id:'a',data:'a'},{id:'b',data:'b'}],projects:[]};
  const rows=[
    {record:{id:'batch:old',kind:'batch',payload:batch},serial:4,baseRevision:1,operationID:'import'},
    {record:{id:'batch:rename',kind:'batch',payload:{id:'rename',names:['assets'],
      operations:[{store:'assets',action:'put',item:{id:'b',title:'renamed'}}]}},
    serial:5,baseRevision:1,operationID:'rename'}
  ];
  let id=0;
  const result=await splitPendingAssetImportRows(rows,{newID:()=>`split-${++id}`,
    newOperationID:()=>`split-operation-${id}`});
  assert.deepEqual(result.map(row=>row.serial),[4,5,6]);
  assert.deepEqual(result.map(row=>row.record.payload.id),['split-1','split-2','rename']);
});

test('interrupted image import keeps newer cloud description and missing local bytes',async()=>{
  const batch={id:'old',assets:[{id:'a',title:'素材 1',blobId:'cutout',
    candidateFrameBlobId:'frame',initialMaskBlobId:'mask',finalMaskBlobId:'mask',imageHash:'sha256:abc'}],
  blobs:['cutout','frame','mask'].map(id=>({id,data:new Blob([id])})),projects:[]};
  const remoteAsset={...batch.assets[0],title:'米色圆角卡片'};
  const operations=await reconcileInterruptedAssetImport(batch,async(store,id)=>
    store==='assets'&&id==='a'?remoteAsset:null);
  assert.deepEqual(operations.map(op=>op.store),['blobs','blobs','blobs']);
  assert.deepEqual(operations.map(op=>op.item.id),['cutout','frame','mask']);
  assert.equal(await reconcileInterruptedAssetImport(batch,async(store,id)=>
    store==='assets'?{...remoteAsset,blobId:'different'}:null),null);
  assert.deepEqual((await reconcileInterruptedAssetImport(batch,async(store,id)=>
    store==='assets'?remoteAsset:id==='frame'?{id}:null)).map(op=>op.item.id),
    ['cutout','frame','mask']);
});
