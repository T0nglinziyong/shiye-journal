import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePrivateCollection,importPrivateCollection} from '../src/private-collection.js';
const fixture=()=>({format:'shiye-private-collection',version:1,namespace:'cece-native-goodnotes-v1',series:{id:'cece-sample-series'},assets:[],blobs:[],projects:Array.from({length:4},(_,i)=>({id:`cece-p${i+1}-project`,sourceIdentifier:'cece-native-goodnotes-v1',activeDraftID:'d'+i,drafts:[{id:'d'+i,canvas:{width:1544,height:1092},items:[],primitives:[],textBlocks:[],strokes:[]}]}))});
test('private collection requires all four native works and complete local image references',()=>{
  const data=fixture();assert.equal(validatePrivateCollection(data).projects.length,4);
  data.projects.pop();assert.throws(()=>validatePrivateCollection(data),/四份完整/);
  const broken=fixture();broken.projects[0].drafts[0].items.push({assetID:'missing'});assert.throws(()=>validatePrivateCollection(broken),/缺失素材/);
});
test('scoped Goodnotes replacement preserves unrelated works and their shared old materials',async()=>{
  const data=fixture(),stores={assets:[{id:'old-shared',seriesID:'cece-sample-series',blobId:'shared'},{id:'old-unused',seriesID:'cece-sample-series',blobId:'unused'}],blobs:[],projects:[{id:'cece-p1-project'},{id:'personal',drafts:[{items:[{assetID:'old-shared'}]}]}],series:[],meta:[],trash:[]};
  const ops=[],db={flushProjects:async()=>{},createBackup:async()=>new Blob([JSON.stringify({format:'shiye-pwa',stores})]),transaction:async(_names,fn)=>fn({objectStore:store=>({put:item=>ops.push({store,put:item}),delete:id=>ops.push({store,delete:id})})})};
  const result=await importPrivateCollection(new Blob([JSON.stringify(data)]),{db});assert.equal(result.projects,4);assert.ok(ops.some(o=>o.delete==='old-unused'));assert.ok(!ops.some(o=>['personal','old-shared','shared'].includes(o.delete)));assert.ok(ops.some(o=>o.put?.id==='cece-native-goodnotes-v1'));
});
test('unreadable pre-migration snapshot never invokes replacement',async()=>{
  let invoked=false;await assert.rejects(importPrivateCollection(new Blob([JSON.stringify(fixture())]),{db:{createBackup:async()=>new Blob(['{}']),transaction:async()=>{invoked=true;}}}),/未替换任何资料/);assert.equal(invoked,false);
});
