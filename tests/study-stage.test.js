import test from 'node:test';
import assert from 'node:assert/strict';
import {assertStudySeedMatches,studyStageDefinitions,reissueStudySeed,studyVisualParts} from '../scripts/lib/study-stage.mjs';
import {createCreationDocument} from '../src/creation-document.js';
import {draft} from '../src/domain.js';
import {applyCreationV2Batch} from '../src/creation-v2-commands.js';
import {creationSceneRevision} from '../src/creation-transaction.js';
import {taskFingerprint} from '../src/task-fingerprint.js';

test('research continues the saved Scene while rejecting a different task, direction or paper',()=>{
 const expected={format:'shiye-scene',version:3,source:{materials:[{alias:'m1',assetID:'a'}],sourceSnapshots:[{assetID:'a',sha256:'abc'}],intent:'蓝色日记',styles:['丰富层叠'],textMode:'rich',contentPolicy:'original'},page:{canvas:{width:700,height:1000},physicalPageWidthMM:110,physicalPageHeightMM:157}};
 const seed=structuredClone(expected);seed.page.layers=[{id:'existing'}];seed.page.paperColor='#ABCDEF';
 assert.equal(assertStudySeedMatches(seed,expected),seed);
 for(const edit of [s=>s.source.materials[0].assetID='other',s=>s.source.intent='别的主题',s=>s.source.textMode='none',s=>s.page.physicalPageHeightMM=200]){
  const wrong=structuredClone(seed);edit(wrong);assert.throws(()=>assertStudySeedMatches(wrong,expected),/不一致/);
 }
 for(const stage of ['layout','title','writing','accents'])assert.ok(studyStageDefinitions[stage].skills.length);
});

test('explicit study re-export freezes existing layout into a new validated task without editing the seed',async()=>{
 const expected=await createCreationDocument({draft:draft(),assets:[],styles:['丰富层叠'],prompt:'蓝色日记',textMode:'rich'});
 const seed=applyCreationV2Batch(expected,{protocolVersion:2,transactionId:'seed',baseSceneRevision:creationSceneRevision(expected),operations:[{op:'graphic.add',id:'paper',geometry:{kind:'rect'},place:{reference:'page',at:[50,50],unit:'mm'},size:{width:50,height:80,unit:'mm'},style:{fill:'#ABCDEF'}}]},[]);
 // A changed command contract requires an explicit new task, not a silent
 // schemaHash replacement inside the original task.
 seed.source.schemaHash='sha256:'+'1'.repeat(64);seed.source.taskHash=await taskFingerprint(seed.source);
 const before=JSON.stringify(seed),next=await reissueStudySeed(seed,expected,[]);
 assert.equal(JSON.stringify(seed),before);
 assert.deepEqual(next.page,seed.page);
 assert.equal(next.source.schemaHash,expected.source.schemaHash);
 assert.notEqual(next.source.taskHash,seed.source.taskHash);
 assert.deepEqual(next.source.baseDraft.layers,seed.page.layers);
 const corrupt=structuredClone(seed);corrupt.source.taskHash='sha256:'+'0'.repeat(64);
 await assert.rejects(reissueStudySeed(corrupt,expected,[]),/指纹/);
});


test('compact inspection reports command points independent of canvas resolution',async()=>{
 const {inspectCreationDocument}=await import('../src/creation-inspection.js');
 const base=draft();
 for(const factor of [1,2]){
  const page=structuredClone(base);page.canvas.width*=factor;page.canvas.height*=factor;const doc=await createCreationDocument({draft:page,assets:[],prompt:'字效'});
  const next=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:'unit-'+factor,baseSceneRevision:creationSceneRevision(doc),operations:[{op:'text.add',id:'heading',content:'标题',place:{reference:'page',at:[30,30],unit:'mm'},size:{width:50,unit:'mm'},style:{fontSizePt:18}}]},[]);
  const compact=inspectCreationDocument(next).layers[0];assert.equal(compact.fontSizePt,18);assert.equal(compact.fontSize,undefined);
  const native=inspectCreationDocument(next,{full:true}).layers[0];assert.equal(native.fontSize,18*25.4/72*next.page.canvas.height/next.page.physicalPageHeightMM);
 }
});


test('continued study stops reattaching stale seed after a new preview but retains cross-case reference',()=>{
 const seedParts=[{type:'text',text:'起点'},{type:'image_url',image_url:{url:'seed'}}],referenceParts=[{type:'text',text:'其他案例'},{type:'image_url',image_url:{url:'reference'}}];
 const before=JSON.stringify({seedParts,referenceParts});
 assert.deepEqual(studyVisualParts({seedParts,referenceParts}),[...referenceParts,...seedParts]);
 assert.deepEqual(studyVisualParts({seedParts,referenceParts,hasNewPreview:true}),referenceParts);
 assert.deepEqual(studyVisualParts({seedParts,hasNewPreview:true}),[]);
 assert.equal(JSON.stringify({seedParts,referenceParts}),before);
});
