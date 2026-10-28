import test from 'node:test';
import assert from 'node:assert/strict';
import {loadModelImageSource} from '../src/model-image-source.js';

test('model recognition loads only the cover and never requests the original',async()=>{
  const cover=new Blob(['small-cover']),calls=[];
  const source=await loadModelImageSource({blobId:'material'}, {
    preview:async(id,edge)=>{calls.push(['cover',id,edge]);return cover;}
  },{edge:512});
  assert.equal(source,cover);
  assert.deepEqual(calls,[['cover','material',512]]);
});

test('missing recognition cover fails without fetching the original',async()=>{
  await assert.rejects(loadModelImageSource({blobId:'material'},{
    preview:async()=>undefined
  }),/封面无法读取/);
});
