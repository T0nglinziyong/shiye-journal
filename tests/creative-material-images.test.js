import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {loadCreativeMaterialImages} from '../creative-agent/runtime/material-images.mjs';
import {materialSourceSnapshot} from '../src/material-anatomy.js';
import {creativePresetAssets} from '../src/creative-presets.js';

test('creative worker resolves account image by asset ID and prepares a bounded PNG',async()=>{
  const owner='10000000001',asset={id:'asset-one',blobId:'blob-one',kind:'sticker',title:'测试贴纸',physicalWidthMM:40,physicalHeightMM:20};
  const source={materials:[{alias:'m1',assetID:asset.id}],sourceSnapshots:[materialSourceSnapshot(asset)]};
  const canvas=createCanvas(1600,800);canvas.getContext('2d').fillRect(0,0,1600,800);
  const calls=[],lookupRecords=async(userID,store,ids)=>{
    calls.push([userID,store,ids]);
    return ids.map(id=>({id,record:store==='assets'?asset:{storageProvider:'cloudbase',storagePath:owner+'/0123456789abcdef'.repeat(4)}}));
  };
  const store={download:async path=>{assert.ok(path.startsWith(owner+'/'));return canvas.toBuffer('image/png');}};
  const result=await loadCreativeMaterialImages(source,{owner,store,lookupRecords});
  const image=await loadImage(result.images.m1);
  assert.equal(image.width,1280);assert.equal(image.height,640);
  assert.match(result.hashes.m1,/^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(calls,[[owner,'assets',[asset.id]],[owner,'blobs',[asset.blobId]]]);
  await assert.rejects(loadCreativeMaterialImages(source,{owner,store,lookupRecords:async(userID,kind,ids)=>
    ids.map(id=>({id,record:kind==='assets'?asset:{storageProvider:'cloudbase',storagePath:'10000000002/private.png'}}))}),/尚未同步/);
});

test('creative worker reads bundled presets without a cloud asset lookup',async()=>{
  const asset=creativePresetAssets[0],source={materials:[{alias:'m1',assetID:asset.id}],sourceSnapshots:[materialSourceSnapshot(asset)]};
  const result=await loadCreativeMaterialImages(source,{owner:'10000000001',lookupRecords:()=>{throw Error('unexpected cloud lookup');}});
  assert.ok((await loadImage(result.images.m1)).width>0);
});
