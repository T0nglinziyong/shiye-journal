import test from 'node:test';
import assert from 'node:assert/strict';
import {mapOfflineExportLimited,offlineExportCacheKey,prepareOfflineMaterialPreview,OFFLINE_EXPORT_SOURCE_EDGE} from '../src/offline-export-assets.js';

const WEBP=new Uint8Array([82,73,70,70,16,0,0,0,87,69,66,80,86,80,56,32]);
const mkAsset=(extra={})=>({id:'asset-a',blobId:'cutout-01',title:'透明贴纸',kind:'sticker',
  physicalWidthMM:22,physicalHeightMM:30,updatedAt:'2026-10-11T00:00:00Z',...extra});
const fakeCache=()=>{const rows=new Map();return {
  rows,async get(account,key){return rows.get(JSON.stringify([account,key]));},
  async put(account,key,blob){rows.set(JSON.stringify([account,key]),blob);}
};};

test('GPT export reuses account-and-source-revision scoped transparent preview',async()=>{
  const cache=fakeCache(),asset=mkAsset();let reads=0,encodes=0;
  const opts={asset,account:'alice',cache,
    loadVariant:async(_asset,edge)=>{reads++;assert.equal(edge,OFFLINE_EXPORT_SOURCE_EDGE);return new Blob([WEBP]);},
    loadOriginal:()=>{throw Error('must not fetch original');},
    encode:async()=>{encodes++;return WEBP;}};
  const first=await prepareOfflineMaterialPreview(opts);
  const second=await prepareOfflineMaterialPreview(opts);
  assert.equal(first.source,'variant');assert.equal(first.cacheHit,false);
  assert.equal(second.cacheHit,true);assert.deepEqual(second.bytes,WEBP);
  assert.equal(reads,1);assert.equal(encodes,1);
  assert.equal(cache.rows.size,1);
});

test('account and updated source revision cannot reuse another material preview',async()=>{
  const cache=fakeCache(),asset=mkAsset();let loads=0;
  const opts={asset,cache,account:'alice',loadVariant:async()=>{loads++;return new Blob([WEBP]);},
    loadOriginal:()=>{throw Error('unexpected');},encode:async()=>WEBP};
  await prepareOfflineMaterialPreview(opts);
  await prepareOfflineMaterialPreview({...opts,account:'bob'});
  const newer=mkAsset({updatedAt:'2026-10-12T00:00:00Z'});
  assert.notEqual(offlineExportCacheKey(asset),offlineExportCacheKey(newer));
  await prepareOfflineMaterialPreview({...opts,asset:newer});
  assert.equal(loads,3);assert.equal(cache.rows.size,3);
});

test('unavailable COS derivative preserves original-based PNG/WebP fallback',async()=>{
  const cache=fakeCache(),asset=mkAsset();let original=0;
  const result=await prepareOfflineMaterialPreview({asset,account:'alice',cache,
    loadVariant:async()=>{throw Error('variant unavailable');},
    loadOriginal:async()=>{original++;return new Blob([WEBP]);},
    encode:async()=>WEBP});
  assert.equal(original,1);assert.equal(result.source,'original');
  assert.equal(result.cacheHit,false);
});

test('corrupt cached bytes never enter a ZIP',async()=>{
  const cache=fakeCache(),asset=mkAsset();let calls=0;
  await cache.put('alice',offlineExportCacheKey(asset),new Blob([Uint8Array.from([0,1,2])]));
  const result=await prepareOfflineMaterialPreview({asset,account:'alice',cache,
    loadVariant:async()=>{calls++;return new Blob([WEBP]);},
    loadOriginal:async()=>{throw Error('unexpected');},encode:async()=>WEBP});
  assert.equal(calls,1);assert.equal(result.cacheHit,false);
});

test('dynamic task pool respects concurrency and preserves original order',async()=>{
  let running=0,maxRunning=0;
  const indices=Array.from({length:12},(_,i)=>i),completed=[];
  const result=await mapOfflineExportLimited(indices,3,async index=>{
    running++;maxRunning=Math.max(maxRunning,running);
    await new Promise(resolve=>setTimeout(resolve,(index%3)*2));
    running--;
    return index*2;
  },{onDone:(done,total)=>completed.push([done,total])});
  assert.deepEqual(result,indices.map(i=>i*2));
  assert.equal(maxRunning,3);
  assert.equal(completed.length,12);
  assert.equal(completed.at(-1)[0],12);
});

test('cancellation prevents pending tasks from starting',async()=>{
  const controller=new AbortController();let launched=0;
  await assert.rejects(mapOfflineExportLimited([1,2,3,4,5],1,async i=>{
    launched++;
    if(i===1)controller.abort(Error('stopped'));
    return i;
  },{signal:controller.signal}),/stopped/);
  assert.equal(launched,1);
});
