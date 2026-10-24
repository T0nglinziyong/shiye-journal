import test from 'node:test';
import assert from 'node:assert/strict';
import {hiddenAssetCopy,visibleMaterials} from '../src/asset-retention.js';
import {changeTrash} from '../src/trash-actions.js';

test('deleted material stays addressable after its recovery card is permanently removed',async()=>{
  const original={id:'material',blobId:'image',title:'私有素材'};
  const hidden=hiddenAssetCopy(original,'2026-10-13T00:00:00.000Z');
  const state={assets:[hidden],projects:[{drafts:[{layers:[{type:'material',assetID:'material'}]}]}],
    trash:[{id:'trash',kind:'asset',item:original,date:'2026-10-13'}]};
  const operations=[];
  const db={transaction:async(names,fn)=>{assert.deepEqual(names,['trash']);fn({objectStore:store=>({delete:id=>operations.push([store,id])})});}};
  assert.deepEqual(visibleMaterials(state.assets),[]);
  await changeTrash({db,state,ids:['trash']});
  assert.deepEqual(operations,[['trash','trash']]);
  assert.deepEqual(state.assets,[hidden]);
  assert.equal(state.assets[0].blobId,'image');
  assert.deepEqual(state.trash,[]);
});

test('restoring a material makes its card visible again',async()=>{
  const original={id:'material',blobId:'image'};
  const state={assets:[hiddenAssetCopy(original)],projects:[],
    trash:[{id:'trash',kind:'asset',item:original,date:'2026-10-13'}]};
  const db={transaction:async(_names,fn)=>fn({objectStore:()=>({put(){},delete(){}})})};
  await changeTrash({db,state,ids:['trash'],recover:true});
  assert.deepEqual(state.assets,[original]);
  assert.deepEqual(visibleMaterials(state.assets),[original]);
});
