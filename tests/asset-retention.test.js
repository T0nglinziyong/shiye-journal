import test from 'node:test';
import assert from 'node:assert/strict';
import {hiddenAssetCopy,visibleMaterials,pruneUnreferencedHiddenAssets} from '../src/asset-retention.js';
import {changeTrash} from '../src/trash-actions.js';

test('a library deletion leaves a hidden image record resolvable by a work',async()=>{
 const asset={id:'material',blobId:'image',title:'私有素材'};
 const hidden=hiddenAssetCopy(asset,'2026-10-13T00:00:00.000Z');
 const state={assets:[hidden],projects:[],trash:[{id:'trash',kind:'asset',item:asset,date:'2026-10-13'}]};
 assert.deepEqual(visibleMaterials(state.assets),[]);
 assert.equal(state.assets.find(row=>row.id==='material').blobId,'image');
 const db={transaction:async(_names,fn)=>fn({objectStore:()=>({put(){},delete(){}})})};
 await changeTrash({db,state,ids:['trash'],recover:true});
 assert.deepEqual(state.assets,[asset]);
 assert.deepEqual(visibleMaterials(state.assets),[asset]);
});
test('periodic local sweep waits for trash expiry and never removes a referenced source',async()=>{
 const at='2026-10-01T00:00:00.000Z';
 const state={assets:[hiddenAssetCopy({id:'a',blobId:'image'},at)],trash:[]};
 const deleted=[];
 const db={all:async()=>[{drafts:[{items:[{assetID:'a'}]}]}],completeProject:async p=>p,
   transaction:async(_names,fn)=>fn({objectStore:()=>({delete:id=>deleted.push(id)})})};
 assert.equal(await pruneUnreferencedHiddenAssets({db,state,now:Date.parse('2026-10-13')}),0);
 assert.deepEqual(deleted,[]);
 db.all=async()=>[];
 assert.equal(await pruneUnreferencedHiddenAssets({db,state,now:Date.parse('2026-10-13')}),1);
 assert.deepEqual(deleted,['a']);
});
test('legacy trash-only material becomes hidden when a work still uses it',async()=>{
 const state={assets:[],projects:[],trash:[{id:'t',kind:'asset',item:{id:'a',blobId:'image'},date:'2026-10-01'}]};
 const writes=[];
 const db={all:async()=>[{drafts:[{items:[{assetID:'a'}]}]}],completeProject:async p=>p,
   transaction:async(_names,fn)=>fn({objectStore:store=>({put:item=>writes.push([store,'put',item.id]),delete:id=>writes.push([store,'delete',id])})})};
 await changeTrash({db,state,ids:['t']});
 assert.equal(state.trash.length,0);assert.equal(state.assets[0].blobId,'image');
 assert.deepEqual(visibleMaterials(state.assets),[]);
 assert.deepEqual(writes,[['trash','delete','t'],['assets','put','a']]);
});
test('permanent trash removal retains referenced source and removes unused hidden metadata',async()=>{
 const make=used=>{
  const asset={id:'a',blobId:'image',hiddenFromLibraryAt:'2026-10-01',isProjectInternal:true};
  const state={assets:[asset],projects:[],trash:[{id:'t',kind:'asset',item:{id:'a',blobId:'image'},date:'2026-10-01'}]};
  const operations=[];
  const db={all:async()=>used?[{id:'work',drafts:[{items:[{assetID:'a'}]}]}]:[],
    completeProject:async p=>p,pendingProjects:async()=>[],pendingSyncDetails:async()=>({batches:[],quarantined:0}),
    transaction:async(_names,fn)=>fn({objectStore:store=>({put(){},delete:id=>operations.push([store,id])})})};
  return {state,db,operations};
 };
 const used=make(true);await changeTrash({db:used.db,state:used.state,ids:['t']});
 assert.equal(used.state.assets.length,1);assert.deepEqual(used.operations,[['trash','t']]);
 const unused=make(false);await changeTrash({db:unused.db,state:unused.state,ids:['t']});
 assert.equal(unused.state.assets.length,0);assert.deepEqual(unused.operations,[['trash','t'],['assets','a']]);
});
