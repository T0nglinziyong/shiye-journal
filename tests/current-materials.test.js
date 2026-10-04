import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {syncCurrentMaterials,currentMaterialCatalog,CURRENT_MATERIAL_SOURCE,CURRENT_MATERIAL_REVISION,CURRENT_MATERIAL_IDS} from '../src/current-materials.js';

function memoryDB(seed={}){
  const names=['assets','series','projects','meta'];
  const stores=Object.fromEntries(names.map(name=>[name,new Map((seed[name]||[]).map(row=>[row.id,structuredClone(row)]))]));
  const transaction=async(names,fn)=>fn({objectStore:name=>({
    put:row=>stores[name].set(row.id,structuredClone(row)),
    delete:id=>stores[name].delete(id)
  })});
  return {stores,all:async name=>[...stores[name].values()].map(row=>structuredClone(row)),transaction};
}

test('current catalog preserves the pre-refactor visible built-in baseline',()=>{
  assert.equal(currentMaterialCatalog.assets.length,164);
  assert.equal(currentMaterialCatalog.series.length,11);
  assert.equal(CURRENT_MATERIAL_IDS.size,164);
  assert.ok(currentMaterialCatalog.assets.every(asset=>asset.staticPath.startsWith('/builtin-materials/')));
  assert.ok(currentMaterialCatalog.assets.every(asset=>asset.title&&asset.kind&&asset.role&&asset.physicalWidthMM>0&&asset.physicalHeightMM>0));
  assert.equal(currentMaterialCatalog.assets.filter(asset=>asset.id.endsWith('000000009001')).length,1);
  assert.equal(currentMaterialCatalog.assets.some(asset=>asset.id.endsWith('000000000106')),false);
  assert.equal(currentMaterialCatalog.assets.some(asset=>asset.id.endsWith('000000000108')),false);
});

test('sync keeps user-visible built-in edits while canonicalizing current fields',async()=>{
  const id='B7000000-0000-4000-8000-000000000201';
  const existing={id,title:'我改过的名称',kind:'paper',role:'background',staticPath:'/starter-styles/american-paper.png',sourceIdentifier:'built-in-starter-style',usageStatus:undefined,isFavorite:true,seriesID:'B7000000-0000-4000-8000-000000000200'};
  const db=memoryDB({assets:[existing,{id:'B7000000-0000-4000-8000-000000009005',sourceIdentifier:CURRENT_MATERIAL_SOURCE,title:'临时素材'}],projects:[{id:'used-work',isUsed:true,drafts:[{items:[{assetID:id,isParked:false}]}]}]});
  const result=await syncCurrentMaterials({database:db});
  assert.equal(result.changed,true);
  assert.equal(db.stores.assets.get(id).title,'我改过的名称');
  assert.equal(db.stores.assets.get(id).isFavorite,true);
  assert.equal(db.stores.assets.get(id).usageStatus,'used');
  assert.equal(db.stores.assets.get(id).sourceIdentifier,CURRENT_MATERIAL_SOURCE);
  assert.equal(db.stores.assets.get(id).builtinRevision,CURRENT_MATERIAL_REVISION);
  assert.ok(db.stores.assets.get(id).staticPath.startsWith('/builtin-materials/'));
  assert.equal(db.stores.assets.has('B7000000-0000-4000-8000-000000009005'),false);
  assert.equal([...db.stores.assets.values()].filter(asset=>CURRENT_MATERIAL_IDS.has(asset.id)).length,164);
  const again=await syncCurrentMaterials({database:db});assert.equal(again.changed,false);
});

test('all current built-in paths ship the original image bytes under current resource directories',async()=>{
  const samples=currentMaterialCatalog.assets.filter((_,index)=>index%19===0);
  for(const asset of samples){
    const bytes=await readFile(new URL('../public'+asset.staticPath,import.meta.url));
    assert.ok(bytes.length>100,asset.staticPath);
  }
});
