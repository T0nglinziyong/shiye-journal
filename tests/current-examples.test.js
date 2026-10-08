import test from 'node:test';
import assert from 'node:assert/strict';
import {
  syncCurrentExamples,CURRENT_EXAMPLE_SOURCE,CURRENT_EXAMPLE_PROJECT_IDS,
  isCurrentExampleProject,isUntouchedLegacyExample
} from '../src/current-examples.js';

function memoryDB(){
  const names=['assets','projects','series','meta'],stores=Object.fromEntries(names.map(name=>[name,new Map()]));
  const transaction=async(names,fn)=>fn({objectStore:name=>({put:row=>stores[name].set(row.id,structuredClone(row))})});
  return {stores,get:async(name,id)=>stores[name].get(id),all:async name=>[...stores[name].values()].map(row=>structuredClone(row)),transaction};
}
test('current works use editable stationery examples while preserving user edits',async()=>{
  const db=memoryDB();
  const titles=[
    '手作纸艺 · 蓝色方格便签','手作纸艺 · 蓝色相框','手作纸艺 · 绿点纹胶带',
    '韩系清新 · 棉纸横线书写页','韩系清新 · 主题图',
    '手作纸艺 · 撕边横线便签','韩系清新 · 点纹纤维纸胶带',
    '旅行票据 · 纹样书写底纸','旅行票据 · 主题图',
    '旅行票据 · 可写票据','旅行票据 · 纹样纸胶带'
  ];
  titles.forEach((title,i)=>db.stores.assets.set('asset-'+i,{
    id:'asset-'+i,title,physicalWidthMM:45,physicalHeightMM:60
  }));
  const old={id:'cece-p1-project',sourceIdentifier:'shiye-current-example-cece',
    updatedAt:'2025-01-01',coverBaselineUpdatedAt:'2025-01-01'};
  const edited={...old,id:'cece-p2-project',updatedAt:'2025-01-02'};
  db.stores.projects.set(old.id,old);db.stores.projects.set(edited.id,edited);
  const result=await syncCurrentExamples({database:db});
  assert.equal(result.projects,3);
  const fresh=['shiye-example-handmade','shiye-example-journal','shiye-example-travel']
    .map(id=>db.stores.projects.get(id));
  assert.ok(fresh.every(p=>p&&p.sourceIdentifier===CURRENT_EXAMPLE_SOURCE&&
    p.drafts[0].items.length>=3&&p.drafts[0].textBlocks.length===1));
  assert.ok(fresh.every(isCurrentExampleProject));
  assert.ok(fresh.every(p=>CURRENT_EXAMPLE_PROJECT_IDS.has(p.id)));
  assert.equal(isUntouchedLegacyExample(old),true);
  assert.equal(isUntouchedLegacyExample(edited),false);
  assert.equal((await syncCurrentExamples({database:db})).changed,false);
  assert.deepEqual(db.stores.projects.get(old.id),old);
  assert.deepEqual(db.stores.projects.get(edited.id),edited);
});
