import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {imageProvenance,projectForReconstruction} from '../src/image-workflow.js';
import {createOfflineHandoff,verifyOfflineTaskPackage,importEditableWork} from '../src/offline-creation.js';
import {buildCreativeMessages} from '../src/creative-runner.js';
import {createMatchingSession} from '../src/matching-session.js';
import {tinyPNG} from './offline-canvas-test-support.mjs';
const a={id:'a',title:'Real source fixture',kind:'paper',blobId:'original',physicalWidthMM:30,physicalHeightMM:40,supply:{quantity:1}};
function setup(mode='hybrid'){const p=project('Mode fixture',{mode:'spread',ratio:'b6'});Object.assign(p,{candidateAssetIDs:['a'],requiredAssetIDs:[],processing:'自由拆解',creationMode:mode,contentPolicy:'visual'});return p;}
const decode=f=>JSON.parse(strFromU8(f));
async function handoff(mode,referencePreview){return createOfflineHandoff({project:setup(mode),assets:[a],aliases:{m9:a.id},previews:[{alias:'m9',bytes:tinyPNG}],referencePreview,settings:{key:'sk-never-in-package',keys:{openai:'sk-never-in-package'}}});}
test('exactly three outputs share original sources; image tasks cannot masquerade as editable',async()=>{
 for(const mode of ['edit','draw','hybrid']){
  const task=await handoff(mode),bytes=new Uint8Array(await task.blob.arrayBuffer()),files=unzipSync(bytes),context=decode(files['TASK.json']);
  assert.equal(context.sourceContext.creationMode,mode);assert.deepEqual(files['assets/m1.png'],tinyPNG);await verifyOfflineTaskPackage(bytes,task.source);
  assert.ok(!Object.values(files).map(strFromU8).join('').includes('sk-never-in-package'));
  if(mode==='draw'){assert.equal(files['scene.json'],undefined);assert.equal(files['runtime/shiye.cjs'],undefined);assert.equal(decode(files['image-request.json']).output.type,'raster');}
  else{assert.ok(files['scene.json']);assert.ok(files['runtime/graphics.cjs']);if(mode==='hybrid'){assert.equal(decode(files['image-request.json']).output.type,'editable-candidate');const imported=importEditableWork(strFromU8(files['scene.json']),[a]);assert.equal(imported.reconstruction.status,'candidate');}}
 }
});
test('hybrid reference is separate, hash-bound and never turns into physical inventory',async()=>{
 const task=await handoff('hybrid',tinyPNG),bytes=new Uint8Array(await task.blob.arrayBuffer()),files=unzipSync(bytes),q=decode(files['image-request.json']);
 assert.equal(q.reference.role,'generated-visual-reference-not-source');assert.equal(q.output.reference,q.reference.image);assert.equal(q.materials.length,1);assert.ok(files[q.reference.image]);await verifyOfflineTaskPackage(bytes,task.source);
 files[q.reference.image]=new Uint8Array([...tinyPNG.slice(0,-1),tinyPNG.at(-1)^1]);await assert.rejects(verifyOfflineTaskPackage(zipSync(files),task.source),/参考图/);
 await assert.rejects(handoff('edit',tinyPNG),/只有混合/);
});
test('reconstruction keeps original snapshot untouched and refuses changed source pixels or sizes',()=>{
 const original=setup('draw'),snapshot={id:'snapshot',title:'Reference',isSnapshot:true,imageCreation:imageProvenance(original,[a])},before=JSON.stringify(snapshot);
 const result=projectForReconstruction(snapshot,[a]);assert.notEqual(result.id,original.id);assert.equal(result.sourceSnapshotID,'snapshot');assert.equal(result.creationMode,'hybrid');assert.equal(result.drafts[0].layers.length,0);assert.equal(JSON.stringify(snapshot),before);
 assert.deepEqual(result.drafts[0].canvas,original.drafts[0].canvas);assert.deepEqual(result.candidateAssetIDs,['a']);assert.deepEqual(result.initialEditorSnapshot.drafts[0].canvas,result.drafts[0].canvas);assert.deepEqual(result.draftHistorySnapshots[result.activeDraftID],result.drafts[0]);
 assert.throws(()=>projectForReconstruction(snapshot,[{...a,blobId:'changed'}]),/改变/);assert.throws(()=>projectForReconstruction(snapshot,[{...a,physicalWidthMM:35}]),/改变/);assert.throws(()=>projectForReconstruction(null,[a]),/缺少/);
});
test('vision reconstruction prompt labels generated reference independently of the original material',()=>{
 const p=setup(),draft=p.drafts[0],reference='data:image/png;base64,'+Buffer.from(tinyPNG).toString('base64');
 const args={draft,assets:[a],aliases:{m1:'a'},referenceImage:reference,images:[{asset:'m1',url:reference}],transport:'json',generationMode:'agent',contentPolicy:'visual'};
 const messages=buildCreativeMessages(args),parts=messages[1].content;
 assert.equal(parts.filter(x=>x.type==='image_url').length,2);assert.match(JSON.stringify(parts),/不是真实素材库/);assert.match(JSON.stringify(parts),/素材 m1/);assert.throws(()=>buildCreativeMessages({...args,referenceImage:'https://example.com/reference.png'}),/不接受外链/);
});
function sessionFixture(mode,{failRebuild=false,changeAccount=false}={}){
 let savedImages=0,calledAgent=0,received;const p=setup(mode),records=new Map(),state={accountId:'A',route:'matching',projects:[],assets:[a],aiSettings:{key:'mock-key',keys:{openai:'mock-image-key'},model:'mock',transport:'json'},matchCreationMode:mode};
 const ctx={state,uid:()=>crypto.randomUUID(),toast:()=>{},db:{stageProject:async p=>records.set(p.id,structuredClone(p)),transaction:async(_,fn)=>fn({objectStore:()=>({put:p=>records.set(p.id,p)})})},deviceRecords:{get:async()=>null,put:async()=>{}},createProject:()=>p,supportsVision:()=>true,
 createAIRecorder:async()=>({request:()=>{},response:()=>{},finish:async()=>{},turn:async()=>{}}),
 generatePageImage:async()=>{if(changeAccount)state.accountId='B';return new Blob([tinyPNG],{type:'image/png'});},
 saveGeneratedImageSnapshot:async(_,source)=>{savedImages++;const s={id:'snapshot',title:'Reference',isSnapshot:true,snapshotBlobId:'pixels',imageCreation:imageProvenance(source,[a])};state.projects.push(s);records.set(s.id,s);return s;},
 modelImage:async()=> 'data:image/png;base64,'+Buffer.from(tinyPNG).toString('base64'),
 runCreativeAgent:async opts=>{calledAgent++;received=opts;if(failRebuild)throw Error('mock model unavailable');return {draft:opts.draft};}};
 return {ctx,records,session:createMatchingSession(ctx),read:()=>({savedImages,calledAgent,received})};
}
test('draw saves genuine image snapshot without running the editable agent',async()=>{
 const f=sessionFixture('draw');await f.session.restore();await f.session.generate();assert.equal(f.read().savedImages,1);assert.equal(f.read().calledAgent,0);assert.equal(f.session.variants()[0].project.isSnapshot,true);
});
test('hybrid preserves original and creates separate candidate with both reference and original images',async()=>{
 const f=sessionFixture('hybrid');await f.session.restore();await f.session.generate();const v=f.session.variants()[0];
 assert.equal(v.status,'completed',v.progress);assert.equal(f.read().savedImages,1);assert.equal(f.read().calledAgent,1);assert.ok(f.read().received.referenceImage);assert.equal(f.read().received.images.length,1);
 assert.equal(f.ctx.state.projects.find(p=>p.id==='snapshot').isSnapshot,true);assert.notEqual(v.project.id,'snapshot');assert.equal(v.project.sourceSnapshotID,'snapshot');assert.equal(v.project.reconstruction.status,'candidate');
});
test('hybrid failure keeps the saved image; account changes stop old results before saving',async()=>{
 const f=sessionFixture('hybrid',{failRebuild:true});await f.session.restore();await f.session.generate();assert.equal(f.session.variants()[0].status,'failed');assert.equal(f.ctx.state.projects[0].id,'snapshot');assert.equal(f.read().savedImages,1);
 const g=sessionFixture('hybrid',{changeAccount:true});await g.session.restore();await g.session.generate();assert.equal(g.read().savedImages,0);assert.equal(g.read().calledAgent,0);assert.equal(g.ctx.state.projects.length,0);
});
