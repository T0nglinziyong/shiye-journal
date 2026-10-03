import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {seedBundledExamples} from '../src/cece-seed.js';
test('current bundled CeCe examples seed only missing records and never rewrite an edited copy',async()=>{
 const c=JSON.parse(await readFile(new URL('../public/cece/collection.json',import.meta.url),'utf8'));
 assert.ok(c.projects.length===4&&c.projects.every(p=>p.drafts[0].paperRuling.rowPositions.length===29));
 assert.ok(c.projects.flatMap(p=>p.drafts[0].textBlocks).every(t=>t.sourceGroup&&!t.content.includes('\n')));
 const p=c.projects[0],tables=Object.fromEntries(['assets','projects','series','meta'].map(k=>[k,new Map()]));
 const edited={...structuredClone(p),updatedAt:'edited',drafts:[{id:'private-edit'}]};tables.projects.set(p.id,edited);
 const db={get:async(s,id)=>tables[s].get(id),all:async s=>[...tables[s].values()],transaction:async(_,fn)=>fn({objectStore:s=>({put:r=>tables[s].set(r.id,structuredClone(r))})})};
 const oldFetch=globalThis.fetch,oldDocument=globalThis.document;
 globalThis.fetch=async()=>new Response(JSON.stringify(c),{headers:{'Content-Type':'application/json'}});
 globalThis.document={fonts:{load:async()=>{}},createElement:()=>({getContext:()=>({measureText:s=>({width:s.length*5})})})};
 try{
   await seedBundledExamples({db});
   assert.deepEqual(tables.projects.get(p.id),edited);
   assert.equal(tables.projects.size,4);
   assert.ok(tables.meta.has('cece-samples-current'));
   await seedBundledExamples({db});assert.equal(tables.projects.size,4);
 }finally{globalThis.fetch=oldFetch;globalThis.document=oldDocument;}
});
