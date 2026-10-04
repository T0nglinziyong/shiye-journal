import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,strFromU8,strToU8} from 'fflate';
import {project} from '../src/domain.js';
import {applyToolCalls} from '../src/creative.js';
import {craftSceneHash} from '../src/craft-fingerprint.js';
import {assetSourceRevision} from '../src/material-anatomy.js';
import {projectMaterialViews,compileTwoHoleWeaves,validateDisplaySlices,sceneRenderEntries} from '../src/craft-display.js';
import {geometryArea,geometryUnion} from '../src/craft-topology.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {offlinePlanContract,validateValue} from '../src/creative-contract.js';
import {creativeProtocol} from '../src/creative-delivery.js';
import {normalizeAISettings} from '../src/ai-settings.js';
import {renderOfflinePreviewSVG} from '../src/offline-preview-svg.js';
import {createNativeProjectPackage,importNativeProjectPackage} from '../src/native-project-package.js';

const asset=(id='paper')=>({id,blobId:id+'-image',title:'合成纹理纸',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,supply:{quantity:1}});
const observation=a=>({id:'word',asset:'m1',sourceRevision:assetSourceRevision(a),kind:'text',label:'图片上的词句',boundsRatio:[.1,.1,.4,.3]});
const plan=(d,a,extra={})=>({format:'shiye-craft-plan',version:2,commandId:'one-delivery',baseSceneHash:craftSceneHash(d),observations:[observation(a)],pieces:[{id:'words',asset:'m1',sourceRevision:assetSourceRevision(a),extraction:{type:'observed_region',observationId:'word',mode:'bounds'},centerMM:[60,60]}],...extra});
const run=(p,d,a,options={})=>applyToolCalls(p,d,[a],{m1:a.id},{processing:'自由拆解',allowNoText:true,visualAssetIDs:[a.id],...options});
const ok=r=>{assert.equal(r.results.every(r=>r.ok),true,JSON.stringify(r.results));return r.draft;};

test('GPT can select and extract printed content from an image in a single atomic plan, with no manual annotation',()=>{
 const a=asset(),d=project().drafts[0],before=structuredClone(a),next=ok(run(plan(d,a),d,a));
 assert.equal(next.items.length,1);assert.equal(next.textBlocks.length,0);assert.equal(next.items[0].cropRect.x,.1);assert.equal(next.items[0].cropRect.width,.4);
 assert.equal(next.items[0].craftProvenance.observation.status,'proposed');assert.equal(next.items[0].craftProvenance.observation.provenance,'model');assert.deepEqual(a,before);
});
test('model observations cannot claim user confirmation, missing images, another source, or a stale revision',()=>{
 const a=asset(),d=project().drafts[0];
 const missing=run(plan(d,a),d,a,{visualAssetIDs:[]});assert.equal(missing.results[0].code,'IMAGE_NOT_PROVIDED');assert.equal(missing.draft.items.length,0);
 for(const change of [o=>o.status='confirmed',o=>o.preserve=false,o=>o.boundsRatio=[.9,0,.4,.3],o=>o.sourceRevision='sha256:'+'0'.repeat(64),o=>o.asset='other']){
  const p=plan(d,a);change(p.observations[0]);const result=run({tools:[{name:'apply_craft_plan',arguments:p}]},d,a);assert.equal(result.committed,false);assert.equal(result.draft.items.length,0);
 }
});
test('visual extraction obeys explicit per-asset processing but has no hidden saved-region restriction',()=>{
 const a=asset(),d=project().drafts[0],next=ok(run(plan(d,a),d,a));assert.equal(next.items.length,1);
 const b=asset('whole'),q=plan(d,b);assert.match(run(q,d,b,{assetProcessing:{whole:'保留完整'}}).results[0].detail,/保留完整/);
});
test('current default uses GPT vision and current provider settings only',()=>{
 assert.equal(normalizeAISettings().provider,'openai');assert.equal(normalizeAISettings().model,'gpt-4.1');assert.equal(normalizeAISettings().finalVisualReview,true);
 assert.equal(normalizeAISettings({provider:'deepseek',key:'value'}).provider,'deepseek');assert.equal(normalizeAISettings({key:'value'}).provider,'openai');
 assert.equal(normalizeAISettings({provider:'custom',endpoint:'https://example.invalid/chat',model:'mine',key:'value'}).endpoint,'https://example.invalid/chat');
 assert.equal(normalizeAISettings({finalVisualReview:false}).finalVisualReview,false);
});
test('direct JSON mode accepts the same full craft plan without a preliminary request',()=>{
 const a=asset(),d=project().drafts[0],p=plan(d,a),protocol=creativeProtocol({...normalizeAISettings(),generationMode:'direct'});
 const calls=protocol.calls({content:JSON.stringify(p)},1);assert.equal(calls.length,1);assert.equal(calls[0].function.name,'apply_craft_plan');
 ok(run({tools:calls},d,a));
});
test('the one current offline plan contract accepts multimodal observations',()=>{
 const a=asset(),d=project().drafts[0],p=plan(d,a);
 validateValue(p,offlinePlanContract());
});
test('one exported task carries images, exact versions, multimodal instructions and working runtime entry points',async()=>{
 const a=asset(),p=project('one delivery');p.processing='自由拆解';
 const png=Uint8Array.from([137,80,78,71,13,10,26,10]);
 const handoff=await createOfflineHandoff({project:p,assets:[a],aliases:{m1:a.id},previews:[{alias:'m1',bytes:png}],settings:{generationMode:'direct'}});
 const files=unzipSync(new Uint8Array(await handoff.blob.arrayBuffer()));
 assert.match(strFromU8(files['START_HERE.txt']),/observations/);assert.match(strFromU8(files['START_HERE.txt']),/一次交付/);
 assert.ok(files['runtime/glyphs.cjs']);assert.ok(files['schema/craft-plan.json']);assert.ok(files['materials/m1.png']);
 const envelope={format:'shiye-editable-project',version:1,source:handoff.source,plan:plan(handoff.source.baseDraft,a)};
 const imported=importEditableWork(JSON.stringify(envelope),[a],{trustedSource:handoff.source});assert.equal(imported.drafts[0].items.length,1);
 assert.equal(imported.processing,'自由拆解');assert.deepEqual(a.anatomy,undefined);
});
const weaveDraft=()=>({canvas:{width:300,height:200},physicalPageHeightMM:200,pageRatio:'custom:300x200',pageMode:'single',paperColor:'#fff',items:[
 {id:'strip',creativePieceID:'strip',assetID:'s',x:150,y:100,width:160,height:8,rotation:0,zIndex:1,materialMask:null,opacity:1},
 {id:'frame',creativePieceID:'frame',assetID:'f',x:150,y:100,width:140,height:80,rotation:0,zIndex:10,materialMask:{shape:'compound',outer:null,holes:[{shape:'rectangle',box:[.1,.2,.15,.6]},{shape:'rectangle',box:[.75,.2,.15,.6]}]}}
],textBlocks:[],primitives:[],strokes:[]});
test('two real apertures create front and back fragments of ONE physical piece with no scale change',()=>{
 const d=weaveDraft();compileTwoHoleWeaves(d,[{piece:'strip',target:'frame',holes:[0,1]}]);
 assert.equal(d.items.length,2);const views=projectMaterialViews(d.items[0]);assert.equal(views.length,3);assert.ok(views.every(v=>v.ownerID==='strip'&&v.width===160&&v.height===8));
 const area=views.reduce((n,v)=>n+geometryArea([[v.materialMask.outer,...v.materialMask.holes]]),0);assert.ok(Math.abs(area-1)<1e-9);
 assert.equal(sceneRenderEntries(d).length,4);assert.ok(views.some(v=>v.zIndex>10)&&views.some(v=>v.zIndex<10));
 const changed=structuredClone(d);changed.items[0].craftDisplaySlices[0].zOffset++;assert.notEqual(craftSceneHash(changed),craftSceneHash(d));
});
test('rotating both materials preserves the local two-hole weave; false openings and too-wide strips fail',()=>{
 const d=weaveDraft();d.items.forEach(i=>i.rotation=35);compileTwoHoleWeaves(d,[{piece:'strip',target:'frame',holes:[0,1]}]);assert.equal(projectMaterialViews(d.items[0]).length,3);
 const bad=weaveDraft();bad.items[0].height=70;assert.throws(()=>compileTwoHoleWeaves(bad,[{piece:'strip',target:'frame',holes:[0,1]}]),{code:'WEAVE_OPENING_TOO_NARROW'});
 const none=weaveDraft();none.items[1].materialMask=null;assert.throws(()=>compileTwoHoleWeaves(none,[{piece:'strip',target:'frame',holes:[0,1]}]),{code:'WEAVE_NEEDS_OPENINGS'});
});
test('a fragment cannot independently move, grow, duplicate or add pixels outside its physical owner',()=>{
 const d=weaveDraft();compileTwoHoleWeaves(d,[{piece:'strip',target:'frame',holes:[0,1]}]);const i=d.items[0];
 i.craftDisplaySlices[0].x=100;assert.throws(()=>validateDisplaySlices(i),{code:'INVALID_DISPLAY_FRAGMENT'});delete i.craftDisplaySlices[0].x;
 i.craftDisplaySlices.push({...i.craftDisplaySlices[0],id:'repeat'});assert.throws(()=>validateDisplaySlices(i),{code:'DISPLAY_FRAGMENT_OVERLAP'});
});
test('approximate SVG also uses shared fragments and flips source and mask together',()=>{
 const d=weaveDraft();compileTwoHoleWeaves(d,[{piece:'strip',target:'frame',holes:[0,1]}]);d.items[0].isFlippedHorizontally=true;
 const svg=renderOfflinePreviewSVG(d,{materials:[{assetID:'s',alias:'m1'},{assetID:'f',alias:'m2'}]});
 assert.match(svg,/scale\(-1 1\)/);assert.equal((svg.match(/opacity="1"><svg/g)||[]).length,4);
});
