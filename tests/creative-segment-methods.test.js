import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createCanvas} from 'canvas';
import {availableHarnessTools} from '../creative-agent/runtime/tools.mjs';
import {createMaterialSegmenter,compileSegmentationGroup} from '../creative-agent/runtime/segmentation.mjs';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {createCreativeHarness,initialHarnessState} from '../creative-agent/runtime/agent.mjs';
import {loadCreationSkills} from '../creative-agent/runtime/skills.mjs';

const square=(x,y,w,h)=>[[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]];
test('segment exposes extract, foreground and detect_all as one separate AI tool',()=>{
 const tools=availableHarnessTools({segmentMaterial:()=>{}});
 const segment=tools.find(tool=>tool.function.name==='segment');
 assert.ok(segment);
 assert.deepEqual(segment.function.parameters.oneOf.map(option=>option.properties.method.const),['extract','foreground','detect_all']);
 assert.ok(!tools.some(tool=>tool.function.name==='segment_material'));
});
test('segment methods request the correct SAM model mode',async()=>{
 const canvas=createCanvas(100,100),bytes=canvas.toBuffer('image/png');
 const hash='sha256:'+createHash('sha256').update(bytes).digest('hex');
 const requests=[];
 const daemon={run:async job=>{
  requests.push(job);
  await mkdir(join(job.output,'materials'),{recursive:true});
  const objects=job.scope==='material'?[{geometry:square(.1,.1,.3,.3),bbox_xyxy:[10,10,40,40]}]:[
   {geometry:square(0,0,.99,.99),bbox_xyxy:[0,0,99,99]},
   {geometry:square(.2,.2,.35,.35),bbox_xyxy:[20,20,55,55]},
   {geometry:square(.65,.65,.2,.2),bbox_xyxy:[65,65,85,85]}
  ];
  await writeFile(join(job.output,'materials/result.json'),JSON.stringify({version:2,width:100,height:100,model:'fake-sam',objects}));
 }};
 const segment=await createMaterialSegmenter({source:{materials:[{alias:'m1',assetID:'a'}],sourceSnapshots:[{assetID:'a',sourceRevision:'r'}]},images:{m1:bytes},imageHashes:{m1:hash},daemon});
 const extracted=await segment({method:'extract',alias:'m1',box:[.1,.1,.4,.4]});
 assert.equal(extracted.proposals.length,1);
 assert.deepEqual(requests[0].box,[10,10,40,40]);
 const foreground=await segment({method:'foreground',alias:'m1'});
 assert.equal(foreground.proposals.length,2);
 assert.deepEqual(foreground.proposal.box,[.2,.2,.55,.55]);
 assert.equal(requests[1].scope,'material-foreground');
 const detected=await segment({method:'detect_all',alias:'m1'});
 assert.equal(detected.proposals.length,2);
 assert.equal(requests[2].scope,'material-detect-all');
 assert.ok(detected.imageURL.startsWith('data:image/png;base64,'));
 await assert.rejects(segment({method:'foreground',alias:'m1',box:[0,0,1,1]}),/不接受 box/);
});
test('segment turns a source object into an editable group without duplicating overlapping SAM masks',async()=>{
 const asset={id:'paper',title:'纸',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,supply:{quantity:1}};
 const empty=await createCreationDocument({draft:draft(),assets:[asset],aliases:{m1:'paper'}});
 const transact=(document,operations,transactionId)=>applyCreationTransaction(document,{protocolVersion:2,transactionId,baseSceneRevision:creationSceneRevision(document),operations},[asset]).document;
 const placed=transact(empty,[{op:'material.add',id:'photo',asset:'m1',place:{reference:'page',at:[70,70],unit:'mm'}}],'placed');
 const revision=placed.source.sourceSnapshots[0].sourceRevision;
 const proposals=[
  {id:'carrier',alias:'m1',sourceRevision:revision,area:.98,geometry:square(.01,.01,.98,.98)},
  {id:'cat',alias:'m1',sourceRevision:revision,area:.09,geometry:square(.1,.1,.3,.3)},
  {id:'cat-duplicate',alias:'m1',sourceRevision:revision,area:.09,geometry:square(.11,.11,.3,.3)},
  {id:'flower',alias:'m1',sourceRevision:revision,area:.09,geometry:square(.6,.6,.3,.3)}
 ];
 const compiled=compileSegmentationGroup({document:placed,assets:[asset],target:'photo',method:'detect_all',proposals});
 assert.equal(compiled.members.filter(member=>member.role==='subject').length,2);
 const segmented=transact(placed,compiled.operations,'segmented');
 const group=segmented.page.layers.find(node=>node.id===compiled.groupId);
 assert.equal(group.type,'group');assert.ok(group.children.some(child=>child.type==='group'));assert.ok(group.children.some(child=>child.hidden));
 assert.ok(!segmented.page.layers.some(node=>node.id==='photo'));
 const changed=transact(segmented,[{op:'layer.update',target:compiled.members[0].id,place:{reference:'page',at:[100,100],unit:'mm'}}],'move-child');
 assert.ok(changed.page.layers.find(node=>node.id===compiled.groupId));
 const single=compileSegmentationGroup({document:placed,assets:[asset],target:'photo',method:'extract',proposals:[proposals[1]]});
 const oneGroup=transact(placed,single.operations,'single');
 assert.equal(oneGroup.page.layers.find(node=>node.id===single.groupId).children.length,2);
 const foreground=compileSegmentationGroup({document:placed,assets:[asset],target:'photo',method:'foreground',proposals:[proposals[1],proposals[3]]});
 const foregroundScene=transact(placed,foreground.operations,'foreground');
 assert.equal(foregroundScene.page.layers.find(node=>node.id===foreground.groupId).children.filter(child=>!child.hidden).length,2);
 const nested=compileSegmentationGroup({document:placed,assets:[asset],target:'photo',method:'detect_all',proposals:[
  {...proposals[1],groupPath:[1,1]},
  {...proposals[3],groupPath:[1,2]}
 ]});
 const nestedScene=transact(placed,nested.operations,'nested');
 const root=nestedScene.page.layers.find(node=>node.id===nested.groupId);
 assert.equal(root.children.find(child=>child.type==='group').children[0].children.length,2);
});
test('agent segment tool commits the new group and reports editable member IDs',async()=>{
 const asset={id:'photo',title:'照片',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,supply:{quantity:1}};
 const empty=await createCreationDocument({draft:draft(),assets:[asset],aliases:{m1:'photo'}});
 const placed=applyCreationTransaction(empty,{protocolVersion:2,transactionId:'place',baseSceneRevision:creationSceneRevision(empty),operations:[{op:'material.add',id:'picture',asset:'m1',place:{reference:'page',at:[70,70],unit:'mm'}}]},[asset]).document;
 const skills=await loadCreationSkills(undefined,{illustrationRoot:null});
 const proposal={id:'subject',alias:'m1',sourceRevision:placed.source.sourceSnapshots[0].sourceRevision,area:.09,geometry:square(.1,.1,.3,.3),milliseconds:5};
 const harness=createCreativeHarness({model:async()=>{throw Error('model not needed');},skills,render:async document=>({pngHash:creationSceneRevision(document),sceneRevision:creationSceneRevision(document),imageURL:'data:image/png;base64,dGVzdA=='}),segmentMaterial:async()=>({proposals:[proposal],imageURL:'data:image/png;base64,dGVzdA=='})});
 let state=initialHarnessState({document:placed,skills,brief:{}});
 const call=async(name,args)=>{state={...state,turns:state.turns+1};state=await harness.executeToolCalls({state,calls:[{id:`call-${state.turns}`,type:'function',function:{name,arguments:JSON.stringify(args)}}]});return state.results.at(-1);};
 assert.equal((await call('creation_plan',{intent:'保留照片主体，之后独立摆放'})).ok,true);
 const result=await call('segment',{method:'extract',target:'picture',box:[.1,.1,.4,.4]});
 assert.equal(result.ok,true);assert.equal(result.data.members[0].role,'subject');
 assert.ok(state.document.page.layers.some(node=>node.id===result.data.groupId));
});
