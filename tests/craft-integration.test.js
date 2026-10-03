import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {project} from '../src/domain.js';
import {applyToolCalls} from '../src/creative.js';
import {offlineContract,schemaFingerprint,validateValue,directPageContract} from '../src/creative-contract.js';
import {createOfflineHandoff,importEditableWork,importEditableWorkPackage} from '../src/offline-creation.js';
import {createNativeProjectPackage} from '../src/native-project-package.js';
import {renderOfflinePreviewSVG} from '../src/offline-preview-svg.js';
import {materialMaskGeometry,materialMaskArea} from '../src/material-mask.js';
import {materialCraftGuide} from '../src/material-craft-guide.js';
import {creativeLayeringGuide} from '../src/creative-layering-guide.js';

const asset={id:'craft-paper',title:'合成图案纸',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,supply:{quantity:1}};
const piece=(id,operations,extra={})=>({asset:'m1',piece:id,unit:0,operations,placement:{x:.5,y:.5,rotation:0,z:10},...extra});
const page=items=>({version:3,style:'自由构图',intent:null,paper:{color:'#ffffff',pattern:'plain'},items,graphics:[],text_blocks:[]});
const execute=(items,options={})=>applyToolCalls(page(items),project('合成工艺').drafts[0],[asset],{m1:asset.id},{processing:'自由拆解',allowNoText:true,...options});
const edge={op:'edge',style:'torn',edges:['bottom'],depth_mm:1,period_mm:8,seed:42};

test('v2 parameterized cut executes through direct page, not just a new enum',()=>{
  const result=execute([piece('cut',[edge])]);
  assert.equal(result.results[0].ok,true,result.results[0].detail);assert.equal(result.committed,true);
  const item=result.draft.items[0];
  assert.equal(item.materialSteps[0].style,'torn');assert.equal(item.materialMask.shape,'polygon');
  assert.ok(materialMaskArea(item.materialMask)<1);assert.equal(item.width,100*result.draft.canvas.height/result.draft.physicalPageHeightMM);
});
test('v2 parameterized cut executes through agent edit_materials and replace is reproducible',()=>{
  const original=execute([piece('cut',[{op:'whole'}])]).draft;
  const call={tools:[{name:'edit_materials',arguments:{items:[{piece:'cut',mode:'replace',operations:[edge]}]}}]};
  const a=applyToolCalls(call,original,[asset],{m1:asset.id},{processing:'自由拆解'});
  const b=applyToolCalls(call,a.draft,[asset],{m1:asset.id},{processing:'自由拆解'});
  assert.equal(a.results[0].ok,true,a.results[0].detail);assert.equal(b.results[0].ok,true,b.results[0].detail);
  assert.deepEqual(a.draft.items[0].materialMask,b.draft.items[0].materialMask);
  assert.deepEqual(original.items[0].materialMask,null);
});
test('whole-only and cumulative small-trim rules still block new edge operations',()=>{
  const denied=execute([piece('cut',[edge])],{processing:'AI 自主加工',assetProcessing:{[asset.id]:'保留完整'}});
  assert.equal(denied.results[0].ok,false);assert.match(denied.results[0].detail,/保留完整/);assert.equal(denied.draft.items.length,0);
  const reduced=execute([piece('cut',[{op:'crop',box:{unit:'ratio',mode:'keep',values:[0,0,.6,1]}},edge])],{processing:'少量裁剪'});
  assert.equal(reduced.results[0].ok,false);assert.match(reduced.results[0].detail,/60%/);
});
test('real frame and offcut share a physical unit without false rectangle conflict',()=>{
  const result=execute([
    piece('frame',[{op:'window',shape:'rectangle',box:[.3,.25,.4,.375]}]),
    piece('offcut',[{op:'crop',box:{unit:'ratio',mode:'keep',values:[.3,.25,.4,.375]}}],{placement:{x:.7,y:.75,rotation:17,z:12}})
  ]);
  assert.equal(result.results[0].ok,true,result.results[0].detail);assert.equal(result.draft.items.length,2);
  assert.equal(materialMaskGeometry(result.draft.items[0].materialMask).holes.length,1);
});
test('a real overlapping offcut fails atomically even if hidden or transparent',()=>{
  for(const opacity of [0,1]){
    const result=execute([piece('frame',[{op:'window',shape:'rectangle',box:[.3,.25,.4,.375]}]),piece('offcut',[{op:'crop',box:{unit:'ratio',mode:'keep',values:[.3,.25,.41,.375]}}],{opacity})]);
    assert.equal(result.results[0].ok,false);assert.match(result.results[0].detail,/重叠|重复/);assert.equal(result.draft.items.length,0);
  }
});
test('rotated peek relation executes in a real direct page without material scaling',()=>{
  const other={...asset,id:'craft-photo',title:'合成照片',physicalWidthMM:60,physicalHeightMM:80};
  const input=page([piece('photo',[{op:'whole'}],{asset:'m2',placement:{x:.5,y:.5,rotation:30,z:10}}),piece('paper',[edge],{relation:{kind:'peek',target:'photo',edge:'right',exposed_mm:8}})]);
  const result=applyToolCalls(input,project('旋转').drafts[0],[asset,other],{m1:asset.id,m2:other.id},{processing:'自由拆解',allowNoText:true});
  assert.equal(result.results[0].ok,true,result.results[0].detail);assert.equal(result.draft.items[1].rotation,30);
  assert.equal(result.draft.items[1].width,100*result.draft.canvas.height/result.draft.physicalPageHeightMM);
});
test('current offline package advertises v2 while exact prior schema fingerprints remain readable',async()=>{
  const legacy=JSON.parse(await readFile(new URL('./fixtures/craft-v2-legacy-schema-hashes.json',import.meta.url),'utf8'));
  assert.equal(schemaFingerprint(offlineContract('agent')),legacy.agent);
  assert.equal(schemaFingerprint(offlineContract('direct')),legacy.direct);
  const p=project('网页工艺');p.processing='自由拆解';
  const handoff=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},settings:{generationMode:'direct',includeThumbnails:false}});
  assert.equal(handoff.source.capabilities.craftV2,true);
  const envelope={format:'shiye-editable-project',version:1,source:handoff.source,title:'几何撕边',page:page([piece('paper',[edge])])};
  const imported=importEditableWork(JSON.stringify(envelope),[asset],{trustedSource:handoff.source});
  assert.equal(imported.drafts[0].items[0].materialMask.shape,'polygon');
  assert.throws(()=>validateValue(envelope.page,offlineContract('direct')),/合同|未知|缺少/);
  validateValue(envelope.page,directPageContract);
});
test('old bound task accepts old operations but cannot silently request v2 operations',async()=>{
  const p=project('旧任务');p.processing='自由拆解';
  const result=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},settings:{generationMode:'direct',includeThumbnails:false}});
  const source=structuredClone(result.source);delete source.capabilities.craftV2;delete source.capabilities.craftPlanV2;delete source.capabilities.multimodalCraftV2;source.schemaHash=schemaFingerprint(offlineContract('direct',source.capabilities));
  const envelope={format:'shiye-editable-project',version:1,source,title:'旧任务',page:page([piece('paper',[{op:'whole'}])])};
  assert.ok(importEditableWork(JSON.stringify(envelope),[asset],{trustedSource:source}));
  envelope.page.items[0].operations=[edge];
  assert.throws(()=>importEditableWork(JSON.stringify(envelope),[asset],{trustedSource:source}));
});
test('new craft survives native ZIP and approximate preview uses the actual cut polygon',async()=>{
  const p=project('合成往返'),result=execute([piece('paper',[edge])]);p.drafts[0]=result.draft;p.activeDraftID=result.draft.id;
  const bytes=new Uint8Array(await createNativeProjectPackage(p).arrayBuffer());
  const restored=importEditableWorkPackage(bytes,[asset]);
  assert.deepEqual(restored.drafts[0].items[0].materialSteps,result.draft.items[0].materialSteps);
  assert.deepEqual(restored.drafts[0].items[0].materialMask,result.draft.items[0].materialMask);
  const svg=renderOfflinePreviewSVG(result.draft,{materials:[{assetID:asset.id,alias:'m1'}]});
  assert.match(svg,/<clipPath/);assert.match(svg,/clip-rule="evenodd"/);
});
test('shared guide describes actual tools and does not make process counts mandatory',()=>{
  assert.ok(creativeLayeringGuide.includes(materialCraftGuide));
  for(const token of ['torn','ticket_notch','postage','fringe','partial_tear','peek','underlay','bridge'])assert.ok(materialCraftGuide.includes(token));
  assert.match(materialCraftGuide,/不要求每页/);assert.match(materialCraftGuide,/目前没有/);
});
