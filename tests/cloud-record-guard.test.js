import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudMetadataRecord,assertCloudCommitSize} from '../src/cloud-record-guard.js';
test('historical import source pixels stay local; COS blob references reach SQL',()=>{
 const original={id:'a',blobId:'cutout',candidateFrameBlobId:'frame',sourceRegion:{x:.4,sourcePixels:[1,2,3]},sourcePixels:[5,6]};
 const output=cloudMetadataRecord('assets',original);
 assert.deepEqual(output,{id:'a',blobId:'cutout',candidateFrameBlobId:'frame'});
 assert.equal(original.sourceRegion.sourcePixels.length,3);
 assertCloudCommitSize([{action:'put',store:'assets',item:output}]);
});
test('rejects RGBA arrays, image Data URLs, nested binary fields in metadata',()=>{
 for(const row of [
  {id:'x',rawPixels:[1]}, {id:'x',extra:{imageData:[0,1]}},
  {id:'x',preview:'data:image/png;base64,aGVsbG8='},
  {id:'x',extra:{data:new Uint8Array([1,2])}}
 ])assert.throws(()=>cloudMetadataRecord('assets',row),/像素字段|Data URL|二进制/);
 assert.equal(cloudMetadataRecord('blobs',{id:'b',data:new Blob(['image'])}).id,'b');
});
test('rejects oversized transactions before sending HTTP',()=>{
 assert.throws(()=>assertCloudCommitSize([{action:'put',store:'assets',item:{id:'a',title:'x'.repeat(100)}}],{limit:50}),/超|字节/);
});

test('recently deleted asset strips redundant recognition RGB only from upload copy',()=>{
 const original={id:'card',kind:'asset',date:'2026-10-19',item:{id:'a',blobId:'cutout',title:'preserved',sourceRegion:{sourcePixels:Array(200000).fill(0)},sourcePixels:[1]}};
 const safe=cloudMetadataRecord('trash',original);
 assert.equal(safe.item.blobId,'cutout');assert.equal(safe.item.title,'preserved');
 assert.equal(safe.item.sourceRegion,undefined);assert.equal(safe.item.sourcePixels,undefined);
 assert.ok(original.item.sourceRegion.sourcePixels.length===200000);
 assertCloudCommitSize([{store:'trash',action:'put',item:safe}]);
});
test('oversized deleted projects are held safely rather than truncated',()=>{
 const item={id:'p',text:'x'.repeat(520000)};
 assert.throws(()=>cloudMetadataRecord('trash',{id:'card',kind:'project',item}),{status:413});
 assert.equal(item.text.length,520000);
});
