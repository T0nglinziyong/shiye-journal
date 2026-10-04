import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {syncCurrentExamples,CURRENT_EXAMPLE_SOURCE,CURRENT_EXAMPLE_PROJECT_IDS,CURRENT_EXAMPLE_SHAPES_URL,isCurrentExampleProject} from '../src/current-examples.js';

function memoryDB(){
  const names=['assets','projects','series','meta'],stores=Object.fromEntries(names.map(name=>[name,new Map()]));
  const transaction=async(names,fn)=>fn({objectStore:name=>({put:row=>stores[name].set(row.id,structuredClone(row))})});
  return {stores,get:async(name,id)=>stores[name].get(id),all:async name=>[...stores[name].values()].map(row=>structuredClone(row)),transaction};
}
test('current examples preserve the four visible sample works using current metadata',async()=>{
  const collection=JSON.parse(await readFile(new URL('../public/builtin-examples/cece/collection.json',import.meta.url),'utf8'));
  const oldFetch=globalThis.fetch,oldDocument=globalThis.document;
  globalThis.fetch=async url=>String(url).includes('/builtin-examples/cece/collection.json')?{ok:true,json:async()=>structuredClone(collection)}:{ok:false};
  globalThis.document={fonts:{load:async()=>[]},createElement:()=>({getContext:()=>({font:'',measureText:text=>({width:String(text).length})})})};
  try{
    const db=memoryDB(),result=await syncCurrentExamples({database:db});
    assert.equal(result.projects,4);assert.equal(db.stores.projects.size,4);
    assert.deepEqual(new Set(db.stores.projects.keys()),CURRENT_EXAMPLE_PROJECT_IDS);
    assert.ok([...db.stores.projects.values()].every(project=>project.sourceIdentifier===CURRENT_EXAMPLE_SOURCE&&project.examplePresetID==='cece'&&project.coverStaticPath.startsWith('/builtin-examples/cece/')));
    assert.ok([...db.stores.projects.values()].every(isCurrentExampleProject));
    assert.ok([...db.stores.assets.values()].every(asset=>asset.isProjectInternal&&asset.sourceIdentifier===CURRENT_EXAMPLE_SOURCE&&['used','unused'].includes(asset.usageStatus)));
    assert.equal(CURRENT_EXAMPLE_SHAPES_URL,'/builtin-examples/cece/shapes.json');
    const shapes=JSON.parse(await readFile(new URL('../public/builtin-examples/cece/shapes.json',import.meta.url),'utf8'));assert.ok(shapes.length>50);
    const again=await syncCurrentExamples({database:db});assert.equal(again.changed,false);
  }finally{globalThis.fetch=oldFetch;globalThis.document=oldDocument;}
});
