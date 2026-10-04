import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {syncCurrentMaterials,currentMaterialDefinitions,CURRENT_MATERIAL_SOURCE,CURRENT_MATERIAL_REVISION,CURRENT_MATERIAL_SERIES_ID,isCurrentBuiltinAsset,filterCurrentCollections} from '../src/current-materials.js';

function memoryDB(seed={}){
  const names=['assets','blobs','series','projects','meta','trash'];
  const stores=Object.fromEntries(names.map(name=>[name,new Map((seed[name]||[]).map(row=>[row.id,structuredClone(row)]))]));
  const transaction=async(names,fn)=>fn({objectStore:name=>({
    put:row=>stores[name].set(row.id,structuredClone(row)),
    delete:id=>stores[name].delete(id)
  })});
  return {stores,all:async name=>[...stores[name].values()].map(row=>structuredClone(row)),transaction,confirmedTransaction:transaction};
}
test('current material sync removes only retired system records and seeds the current catalog',async()=>{
  const currentId='B7000000-0000-4000-8000-000000009001';
  const userAsset={id:'user-a',title:'我的纸片',sourceIdentifier:'camera-import',usageStatus:'used'};
  const db=memoryDB({
    assets:[
      {id:'legacy-starter',sourceIdentifier:'built-in-starter-style',blobId:'legacy-blob'},
      {id:'cece-p1-m2',seriesID:'cece-sample-series',blobId:'cece-blob'},
      {id:currentId,sourceIdentifier:'original-journal-motif',usageStatus:'used',isFavorite:true}
    ],
    blobs:[{id:'legacy-blob',data:'x'},{id:'cece-blob',data:'y'},{id:'user-blob',data:'z'}],
    series:[{id:'cece-sample-series',title:'CeCe'},{id:'B7000000-0000-4000-8000-000000000100',title:'旧内置系列'}],
    projects:[{id:'cece-p1-project',title:'旧样例'},{id:'user-project',title:'我的作品'}],
    meta:[{id:'starter-styles-current'},{id:'swift-bundled-materials-current'},{id:'cece-samples-current'},{id:'keep-meta'}],
    trash:[{id:'trash-old',kind:'asset',item:{id:'cece-trash',seriesID:'cece-sample-series'}},{id:'trash-user',kind:'asset',item:userAsset}]
  });
  db.stores.assets.set(userAsset.id,userAsset);
  const result=await syncCurrentMaterials({database:db});
  assert.equal(result.retired.assets,2);assert.equal(result.retired.projects,1);assert.equal(result.retired.series,2);assert.equal(result.retired.meta,3);assert.equal(result.retired.trash,1);assert.equal(result.retired.blobs,2);
  assert.ok(db.stores.assets.has('user-a'));assert.ok(db.stores.projects.has('user-project'));assert.ok(db.stores.meta.has('keep-meta'));assert.ok(db.stores.trash.has('trash-user'));assert.ok(db.stores.blobs.has('user-blob'));
  assert.equal(db.stores.assets.size,currentMaterialDefinitions.length+1);
  const current=[...db.stores.assets.values()].filter(isCurrentBuiltinAsset);
  assert.equal(current.length,currentMaterialDefinitions.length);
  assert.ok(current.every(asset=>asset.sourceIdentifier===CURRENT_MATERIAL_SOURCE&&asset.builtinRevision===CURRENT_MATERIAL_REVISION&&['used','unused'].includes(asset.usageStatus)));
  assert.equal(db.stores.assets.get(currentId).usageStatus,'used');assert.equal(db.stores.assets.get(currentId).isFavorite,true);
  assert.ok([...db.stores.assets.values()].filter(asset=>asset.kind==='tape'&&isCurrentBuiltinAsset(asset)).every(asset=>asset.supply.kind==='tapeRoll'&&asset.tapeRepeatMode==='repeatablePattern'&&asset.supply.availableLengthMM>0));
  assert.equal(db.stores.series.get(CURRENT_MATERIAL_SERIES_ID).builtinRevision,CURRENT_MATERIAL_REVISION);
  const again=await syncCurrentMaterials({database:db});assert.equal(again.changed,false);assert.equal(db.stores.assets.size,currentMaterialDefinitions.length+1);
});

test('current catalog contains varied editable material roles without retired identifiers',()=>{
  assert.ok(currentMaterialDefinitions.length>=16);
  assert.ok(new Set(currentMaterialDefinitions.map(item=>item.kind)).size>=3);
  assert.ok(new Set(currentMaterialDefinitions.map(item=>item.role)).size>=4);
  assert.ok(currentMaterialDefinitions.every(item=>!String(item.path).includes('/cece/')&&!String(item.path).includes('/style-expansion/')));
});

test('visible collections reject retired system records before persistence cleanup',()=>{
  const visible=filterCurrentCollections({
    assets:[{id:'old',sourceIdentifier:'built-in-style-expansion'},{id:'user'}],
    series:[{id:'cece-sample-series'},{id:'user-series'}],
    projects:[{id:'cece-p2-project'},{id:'user-project'}],
    trash:[{id:'old-trash',kind:'asset',item:{id:'cece-x'}},{id:'user-trash',kind:'project',item:{id:'user-project'}}]
  });
  assert.deepEqual(visible.assets.map(x=>x.id),['user']);assert.deepEqual(visible.series.map(x=>x.id),['user-series']);assert.deepEqual(visible.projects.map(x=>x.id),['user-project']);assert.deepEqual(visible.trash.map(x=>x.id),['user-trash']);
});

test('every current built-in material points to a shipped current static asset',async()=>{
  for(const item of currentMaterialDefinitions){
    assert.match(item.path,/^\/current-materials\/[a-z0-9-]+\.svg$/);
    const svg=await readFile(new URL('../public'+item.path,import.meta.url),'utf8');assert.match(svg,/^<svg\b/);assert.match(svg,/<\/svg>$/);
  }
});
