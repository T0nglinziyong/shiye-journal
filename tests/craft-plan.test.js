import {compileAndImport} from './web-scene-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {project} from '../src/domain.js';
import {attachSceneV2} from '../src/scene-model.js';
import {applyToolCalls} from '../src/creative.js';
import {craftDigest,craftSceneHash,isManagedUnchanged} from '../src/craft-fingerprint.js';
import {assetSourceRevision,assetFromSourceSnapshot,materialSourceSnapshot} from '../src/material-anatomy.js';
import {rectangleGeometry,normalizeGeometry,geometryArea,geometryIntersection,geometryDifference,geometryUnion,expandGeometry} from '../src/craft-topology.js';
import {buildMaterialLedger} from '../src/material-ledger.js';
import {createOfflineHandoff,importEditableWork,importEditableWorkPackage} from './v3-test-handoff.mjs';
import {createNativeProjectPackage} from '../src/native-project-package.js';
import {taskFingerprint} from '../src/task-fingerprint.js';

const material=()=>({id:'plan-paper',title:'合成图案纸',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,blobId:'plan-source',supply:{quantity:1},updatedAt:'2026-10-03T00:00:00.000Z'});
const base=()=>project('工艺计划',{ratio:'a5'}).drafts[0];
const plannedPiece=(asset,id='p',extra={})=>({id,asset:'m1',sourceRevision:assetSourceRevision(asset),unit:0,extraction:{type:'whole'},centerMM:[65,80],...extra});
const plan=(draft,asset,pieces=[plannedPiece(asset)],extra={})=>({format:'shiye-craft-plan',version:2,commandId:'command-test',baseSceneHash:craftSceneHash(draft),pieces,...extra});
const run=(input,draft,asset,options={})=>applyToolCalls(input,draft,[asset],{m1:asset.id},{processing:'自由拆解',allowNoText:true,...options});
const successful=result=>{assert.equal(result.results.every(r=>r.ok),true,JSON.stringify(result.results));return result.draft;};

test('craft hashes use the same SHA-256 as Web Crypto and are key-order independent',async()=>{
 const value={z:1,a:{b:2,a:3}},expected=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode('{"a":{"a":3,"b":2},"z":1}'))).toString('hex');
 assert.equal(craftDigest(value),'sha256:'+expected);assert.equal(craftDigest(value),craftDigest({a:{a:3,b:2},z:1}));
});
test('final scene hash includes actual ink coordinates, alpha and masks, not only item counts',()=>{
 const a=base();a.strokes=[{id:'s',points:[{x:1,y:2},{x:5,y:8}],width:3,color:'#000000'}];
 const h=craftSceneHash(a),b=attachSceneV2(structuredClone(a));b.strokes[0].points[0].x=2;assert.notEqual(craftSceneHash(b),h);
 const c=attachSceneV2(structuredClone(a));c.strokes[0].opacity=.4;assert.notEqual(craftSceneHash(c),h);
 const d=structuredClone(a);d.agentRun={status:'editing'};d.craftReceipts=[{fake:true}];assert.equal(craftSceneHash(d),h);
});
test('source snapshots reconstruct exact source identities without private asset extras',()=>{
 const a=material();a.privateNote='do not export irrelevant metadata';a.anatomy={legacy:'ignored'};
 const snapshot=materialSourceSnapshot(a);assert.equal(snapshot.privateNote,undefined);assert.equal(snapshot.anatomy,undefined);assert.equal(assetSourceRevision(assetFromSourceSnapshot(snapshot)),assetSourceRevision(a));
 assert.notEqual(assetSourceRevision({...a,physicalWidthMM:101}),assetSourceRevision(a));
 assert.equal(assetSourceRevision({...a,updatedAt:'new',title:'新名称',tags:['新标签']}),assetSourceRevision(a));
 assert.equal(assetSourceRevision({...a,supply:{kind:'single',quantity:1}}),assetSourceRevision(a));
 assert.equal(assetSourceRevision({...a,supply:{quantity:2}}),assetSourceRevision(a));
 assert.notEqual(assetSourceRevision({...a,kind:'tape'}),assetSourceRevision(a));
});
test('topology rejects self crossing and escaped holes rather than guessing physical intent',()=>{
 assert.throws(()=>normalizeGeometry([[[[0,0],[3,3],[0,3],[2,0]]]]),{code:'SELF_INTERSECTION'});
 assert.throws(()=>normalizeGeometry([[[[0,0],[10,0],[10,10],[0,10]],[[20,20],[21,20],[21,21],[20,21]]]]),{code:'HOLE_OUTSIDE_SOURCE'});
});
test('Boolean geometry preserves window and offcut exactly; margins are real source expansion',()=>{
 const original=rectangleGeometry(0,0,100,80),cut=rectangleGeometry(30,20,40,30),frame=geometryDifference(original,cut);
 assert.equal(geometryArea(frame),6800);assert.equal(geometryArea(geometryIntersection(frame,cut)),0);
 assert.equal(geometryArea(geometryUnion(frame,cut)),8000);
 const grown=expandGeometry(cut,2);assert.ok(geometryArea(grown)>1200);assert.equal(geometryArea(geometryDifference(cut,grown)),0);
});
test('an entire high-level plan executes through the real tool contract',()=>{
 const a=material(),d=base(),input=plan(d,a,[plannedPiece(a,'title',{extraction:{type:'rect_crop',boxMM:[10,8,40,24]},treatments:[{op:'edge',style:'torn',edges:['bottom'],depth_mm:1,period_mm:8,seed:42}]})]);
 const result=run(input,d,a),next=successful(result);assert.equal(next.items.length,1);assert.ok(next.items[0].materialMask);assert.ok(isManagedUnchanged(next.items[0]));
 assert.equal(next.craftLedger.units[0].pieces.length,1);assert.equal(next.craftReceipts[0].commandId,input.commandId);assert.equal(next.agentRun.status,'finished');
});
test('failed third material rolls back the whole compound plan, preserving source and earlier calls',()=>{
 const a=material(),d=base();const input=plan(d,a,[plannedPiece(a,'left',{extraction:{type:'rect_crop',boxMM:[0,0,30,80]}}),plannedPiece(a,'right',{extraction:{type:'rect_crop',boxMM:[30,0,30,80]}}),plannedPiece(a,'invalid',{extraction:{type:'rect_crop',boxMM:[99,0,20,80]}})]);
 const result=run(input,d,a);assert.equal(result.committed,false);assert.equal(result.draft.items.length,0);assert.equal(d.items.length,0);
});
test('a stale scene or source revision is rejected before changing existing layers',()=>{
 const a=material(),d=base(),input=plan(d,a);d.paperColor='#111111';const r=run(input,d,a);assert.equal(r.results[0].code,'STALE_SCENE_BASE');assert.equal(r.draft.paperColor,'#111111');
 const fresh=plan(d,a);fresh.pieces[0].sourceRevision=craftDigest('old source');assert.equal(run(fresh,d,a).results[0].code,'STALE_SOURCE');
});
test('replaying the same command creates no new material and rejects reused IDs with different plans',()=>{
 const a=material(),d=base(),input=plan(d,a);const first=successful(run(input,d,a));
 const again=run(input,first,a);successful(again);assert.equal(again.committed,false);assert.equal(again.draft.items[0].id,first.items[0].id);
 const other=structuredClone(input);other.summary='different';assert.equal(run(other,first,a).results[0].code,'COMMAND_ID_REUSED');
 first.items[0].x++;assert.equal(run(input,first,a).results[0].code,'STALE_REPLAY');
});
test('parent split consumes the parent, preserves descendants and parks the real remainder',()=>{
 const a=material(),d=base();const parent=successful(run(plan(d,a,[plannedPiece(a,'parent')]),d,a));
 const nextPlan=plan(parent,a,[plannedPiece(a,'child',{parentId:'parent',extraction:{type:'rect_crop',boxMM:[0,0,60,80]}})],{commandId:'split',consume:['parent']});
 const next=successful(run(nextPlan,parent,a));assert.equal(next.items.some(i=>i.creativePieceID==='parent'),false);assert.equal(next.items.length,2);
 const remainder=next.items.find(i=>i.isParked);assert.ok(remainder);assert.ok(Math.abs(remainder.cropRect.width-.4)<1e-9);
 const ledger=buildMaterialLedger(next,[a]);assert.equal(ledger.units[0].usedAreaMM2,8000);assert.equal(ledger.units[0].remainingAreaMM2,0);
 assert.equal(next.craftReceipts.at(-1).lineage[0].sourceAreaMM2,8000);
});
test('AI partitions one original image into two independent subjects and a reusable offcut in one plan',()=>{
 const a=material(),d=base(),revision=assetSourceRevision(a);
 const subjects=[
  {id:'person-left',boundsRatio:[.1,.1,.2,.5],outlineRatio:[[.1,.1],[.3,.1],[.3,.6],[.1,.6]],centerMM:[35,60]},
  {id:'person-right',boundsRatio:[.6,.1,.2,.5],outlineRatio:[[.6,.1],[.8,.1],[.8,.6],[.6,.6]],centerMM:[90,60]}
 ];
 const input=plan(d,a,subjects.map(({id,centerMM})=>plannedPiece(a,id,{centerMM,
  extraction:{type:'observed_region',observationId:id,mode:'outline'}})),{
  sourcePartitions:[{asset:'m1'}],observations:subjects.map(({id,boundsRatio,outlineRatio})=>({
   id,asset:'m1',sourceRevision:revision,kind:'focal',label:id,boundsRatio,outlineRatio
  }))
 });
 const next=successful(run(input,d,a,{visualAssetIDs:[a.id]}));
 assert.equal(next.items.length,3);
 assert.equal(next.items.filter(i=>!i.isParked).length,2);
 const leftover=next.items.find(i=>i.isParked);assert.ok(leftover);
 assert.equal(next.craftReceipts.at(-1).offcuts.length,1);
 assert.equal(next.craftReceipts.at(-1).lineage[0].parentId,null);
 assert.equal(next.craftReceipts.at(-1).lineage[0].remainingAreaMM2,6400);
 assert.equal(buildMaterialLedger(next,[a]).units[0].usedAreaMM2,8000);
 const reused=successful(run(plan(next,a,[plannedPiece(a,'new-label',{
  parentId:leftover.creativePieceID,extraction:{type:'rect_crop',boxMM:[0,0,8,80]}
 })],{commandId:'use-leftover',consume:[leftover.creativePieceID]}),next,a));
 assert.ok(reused.items.some(item=>item.creativePieceID==='new-label'));
 assert.equal(buildMaterialLedger(reused,[a]).units[0].usedAreaMM2,8000);
 leftover.isParked=false;leftover.x+=10;
 assert.equal(buildMaterialLedger(next,[a]).units[0].usedAreaMM2,8000);
});
test('source partition rejects overlapping subjects and already allocated source without changing the draft',()=>{
 const a=material(),d=base(),pieces=[
  plannedPiece(a,'first',{extraction:{type:'rect_crop',boxMM:[10,10,40,40]}}),
  plannedPiece(a,'second',{extraction:{type:'rect_crop',boxMM:[30,10,40,40]}})
 ];
 const input=plan(d,a,pieces,{sourcePartitions:[{asset:'m1'}]});
 const overlap=run(input,d,a);assert.equal(overlap.committed,false);
 assert.equal(overlap.results[0].code,'SOURCE_REGION_OVERLAP');
 assert.equal(d.items.length,0);
 const occupied=successful(run(plan(d,a,[plannedPiece(a,'existing')]),d,a));
 const retry=plan(occupied,a,[pieces[0]],{sourcePartitions:[{asset:'m1'}],commandId:'new-partition'});
 const rejected=run(retry,occupied,a);assert.equal(rejected.committed,false);
 assert.equal(rejected.results[0].code,'SOURCE_ALREADY_ALLOCATED');
 assert.equal(occupied.items.length,1);
});
test('window plan returns its exact core as a parked offcut instead of duplicating the source',()=>{
 const a=material(),d=base();const parent=successful(run(plan(d,a,[plannedPiece(a,'parent')]),d,a));
 const next=successful(run(plan(parent,a,[plannedPiece(a,'frame',{parentId:'parent',treatments:[{op:'window',shape:'rectangle',box:[.3,.25,.4,.375]}]})],{commandId:'window',consume:['parent']}),parent,a));
 assert.equal(next.items.length,2);assert.equal(next.items.filter(i=>i.isParked).length,1);assert.equal(buildMaterialLedger(next,[a]).units[0].usedAreaMM2,8000);
});
test('manual edits made before an AI request survive full-page replacement',()=>{
 const a=material(),d=base();const initial=successful(run({tools:[{name:'upsert_text',arguments:{items:[{key:'copy',content:'original',width:.5}]}}]},d,a));
 initial.textBlocks[0].content='user changed this before the request';
 const page={version:2,style:'自由构图',intent:null,paper:{color:'#ffffff',pattern:'plain'},layers:[]};
 const result=run(page,initial,a);successful(result);assert.equal(result.draft.textBlocks[0].content,'user changed this before the request');
 const attempt=run({tools:[{name:'upsert_text',arguments:{items:[{key:'copy',content:'overwritten',width:.5}]}}]},initial,a);
 assert.equal(attempt.results[0].code,'MANUAL_EDIT_PROTECTED');assert.equal(attempt.draft.textBlocks[0].content,initial.textBlocks[0].content);
});
test('global whole-only processing rejects cuts',()=>{
 const a=material(),d=base();successful(run(plan(d,a),d,a,{processing:'保留完整'}));
 const input=plan(d,a,[plannedPiece(a,'trimmed',{extraction:{type:'rect_crop',boxMM:[0,0,60,80]}})]);
 const result=run(input,d,a,{processing:'保留完整'});assert.equal(result.results[0].ok,false);assert.match(result.results[0].detail,/保留完整/);
});
test('offline task imports a plan using its original source and full creation brief',async()=>{
 const a=material();const p=project('source',{ratio:'a5'});p.processing='自由拆解';p.contentPolicy='original';p.userText='原文';p.providedFacts='事实';
 const handoff=await createOfflineHandoff({project:p,assets:[a],aliases:{m1:a.id},settings:{includeThumbnails:false,generationMode:'direct'}});
 const input=plan(handoff.source.baseDraft,a,[plannedPiece(a,'words',{extraction:{type:'rect_crop',boxMM:[10,8,40,24]}})]);
 const envelope={format:'shiye-editable-project',version:1,source:handoff.source,title:'plan',plan:input};
 const imported=compileAndImport(JSON.stringify(envelope),[a],{trustedSource:handoff.source});
 assert.equal(imported.contentPolicy,'original');assert.equal(imported.userText,'原文');assert.equal(imported.processing,p.processing);assert.equal(handoff.source.assetProcessing,undefined);
 assert.equal(imported.drafts[0].items.length,1);
 const updated={...a,kind:'tape',supply:{quantity:0},title:'新标题',role:'decoration'};
 const afterEdit=compileAndImport(JSON.stringify(envelope),[updated],{trustedSource:handoff.source});
 assert.equal(afterEdit.drafts[0].items.length,1);
 assert.equal(afterEdit.drafts[0].items[0].craftProvenance.sourceRevision,assetSourceRevision(a));
 const driftedSource=structuredClone(handoff.source),frozen='sha256:'+'f'.repeat(64);
 driftedSource.sourceSnapshots[0].sourceRevision=frozen;
 driftedSource.sourceVersionHash=craftDigest(driftedSource.sourceSnapshots);
 driftedSource.taskHash=await taskFingerprint(driftedSource);
 const driftedPlan=structuredClone(input);driftedPlan.pieces[0].sourceRevision=frozen;
 const drifted={...envelope,source:driftedSource,plan:driftedPlan};
 const stable=compileAndImport(JSON.stringify(drifted),[updated]);
 assert.equal(stable.drafts[0].items[0].craftProvenance.sourceRevision,frozen);
 assert.throws(()=>compileAndImport(JSON.stringify(envelope),[{...a,physicalWidthMM:101}],{trustedSource:handoff.source}),/已变化/);
});
test('native roundtrip preserves current scene and persistent craft geometry while dropping session undo',async()=>{
 const a=material(),p=project('native');const next=successful(run(plan(p.drafts[0],a,[plannedPiece(a,'cut',{treatments:[{op:'cut_shape',shape:'ellipse',mode:'remove',unit:'mm',box:[25,20,40,30]}]})]),p.drafts[0],a));
 p.drafts=[next];p.activeDraftID=next.id;p.editHistory={undo:[{id:'session-step'}],redo:[]};
 const bytes=new Uint8Array(await createNativeProjectPackage(p).arrayBuffer());const reopened=importEditableWorkPackage(bytes,[a]);
 assert.deepEqual(reopened.drafts[0].items[0].materialMask,next.items[0].materialMask);assert.equal(reopened.drafts[0].items[0].aiManaged,undefined);assert.equal(reopened.editHistory.undo.length,0);
});
