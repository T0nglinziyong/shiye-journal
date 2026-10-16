import test from 'node:test';
import assert from 'node:assert/strict';
import {splitIndependentAssetImport} from '../src/import-sync-batches.js';

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

test('materials sharing source bytes remain in one cloud component',()=>{
  const batch={id:'shared',assets:[
    {id:'a',blobId:'a-cutout',photoBlobId:'photo'},
    {id:'b',blobId:'b-cutout',photoBlobId:'photo'},
    {id:'c',blobId:'c-cutout'}
  ],blobs:['a-cutout','b-cutout','c-cutout','photo'].map(id=>({id,data:id})),projects:[]};
  const parts=splitIndependentAssetImport(batch,{newID:(()=>{let id=0;return()=>String(++id);})()});
  assert.equal(parts.length,2);
  assert.deepEqual(parts[0].assets.map(asset=>asset.id),['a','b']);
  assert.deepEqual(parts[0].blobs.map(blob=>blob.id),['a-cutout','b-cutout','photo']);
  assert.deepEqual(parts[1].assets.map(asset=>asset.id),['c']);
});

test('projects and unknown batch bytes preserve the original atomic import',()=>{
  const projectBatch={id:'work',assets:[{id:'a',blobId:'a'},{id:'b',blobId:'b'}],
    blobs:[{id:'a'},{id:'b'}],projects:[{id:'work'}]};
  assert.deepEqual(splitIndependentAssetImport(projectBatch),[projectBatch]);
  const unknown={...projectBatch,projects:[],blobs:[...projectBatch.blobs,{id:'batch-source'}]};
  assert.deepEqual(splitIndependentAssetImport(unknown),[unknown]);
});
