import test from 'node:test';
import assert from 'node:assert/strict';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from '../src/offline-creation.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {webSceneDocument} from '../src/web-scene-workbench.js';
import {applyCreationV2Batch,validateCreationV2Commands} from '../src/creation-v2-commands.js';
import {advancedCreationV2Names,creationV2RuntimeSchema} from '../src/creation-v2-contract.js';
import {tinyPNG} from './offline-canvas-test-support.mjs';
import {buildMaterialLedger} from '../src/material-ledger.js';
import {attachSceneV2} from '../src/scene-v2.js';
import {worldBox} from '../src/scene-spatial.js';

test('published protocol 2 schema exposes only executable geometry and placement',()=>{
 const base={protocolVersion:2,transactionId:'capabilities',baseSceneRevision:'sha256:'+'0'.repeat(64)};
 assert.throws(()=>validateCreationV2Commands({...base,operations:[{op:'layout.arrange',targets:['a'],rule:{type:'grid'},container:'page'}]}),/commands/);
 assert.throws(()=>validateCreationV2Commands({...base,operations:[{op:'page.update',physicalSizeMm:[100,200]}]}),/commands/);
 assert.throws(()=>validateCreationV2Commands({...base,operations:[{op:'shape.add',id:'a',kind:'rect',place:{reference:'page',at:[.5,.5],unit:'ratio',referenceBounds:'visible'},size:{width:10,height:10,unit:'mm'}}]}),/commands/);
});

test('protocol 2 page and relative commands create editable native Scene nodes',async()=>{
 const asset={id:'photo-1',title:'图片',kind:'sticker',physicalWidthMM:30,physicalHeightMM:20,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('统一命令'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const source=task.source,doc=webSceneDocument(source,source.baseDraft,'统一命令');
 const frozen=source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
 const batch={protocolVersion:2,transactionId:'new-layout',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'material.add',id:'photo',asset:'m1',place:{reference:'page',at:[.5,.4],unit:'ratio'}},
  {op:'text.add',id:'caption',content:'今天看见的一角',place:{reference:'node:photo',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,4],unit:'mm'}},size:{width:60,unit:'mm'},style:{fontSizePt:12,color:'#334d4a'}},
  {op:'text.update',target:'caption',content:'今天看见的一角。',style:{fontSizePt:14,lineHeight:1.45}},
  {op:'shape.add',id:'dot',kind:'ellipse',place:{reference:'page',at:[20,20],unit:'mm'},size:{width:5,height:5,unit:'mm'},style:{fill:'#aabbcc',shadow:{offsetMm:[1,2],blurMm:1,color:'#112233'}}}
 ]};
 const result=applyCreationV2Batch(doc,batch,frozen);
 const nodes=result.page.layers;
 const photo=nodes.find(n=>n.creativePieceID==='photo'),caption=nodes.find(n=>n.agentKey==='caption'),dot=nodes.find(n=>n.key==='dot');
 assert.ok(photo&&caption&&dot);
 assert.equal(caption.content,'今天看见的一角。');
 assert.ok(caption.fixedLineHeight>caption.fontSize);
 assert.ok(caption.y>photo.y);
 assert.equal(dot.kind,'ellipse');
 assert.equal(dot.shadow.color,'#112233');
 const revised=applyCreationV2Batch(result,{protocolVersion:2,transactionId:'group-and-revise',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'group.create',id:'note-group',targets:['caption','dot']},
  {op:'layer.reorder',target:'dot',order:{before:'caption'}},
  {op:'group.ungroup',target:'note-group'},
  {op:'page.update',paperColor:'#eeeeee'}
 ]},frozen);
 assert.equal(revised.page.paperColor,'#eeeeee');
 assert.ok(revised.page.layers.some(node=>node.agentKey==='caption'));
 assert.ok(revised.page.layers.some(node=>node.key==='dot'));
 assert.doesNotThrow(()=>applyCreationV2Batch(revised,{protocolVersion:2,transactionId:'detach',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'layout.detach',target:'caption'}
 ]},frozen));
});
test('group.compose creates true local children and linked caption follows its material after reopen',async()=>{
 const asset={id:'photo-local',title:'小照片',kind:'sticker',physicalWidthMM:30,physicalHeightMM:20,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('局部组合'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const frozen=task.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
 const doc=webSceneDocument(task.source,task.source.baseDraft,'局部组合');
 const batch={protocolVersion:2,transactionId:'compose-local',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'group.compose',id:'card',layoutBox:{width:90,height:100,unit:'mm'},place:{reference:'page',at:[.5,.5],unit:'ratio',rotationDeg:8},children:[
   {op:'material.add',id:'photo',asset:'m1',place:{reference:'parent',at:[.5,.35],unit:'ratio'}},
   {op:'text.add',id:'caption',content:'今天的照片',size:{width:45,unit:'mm'},place:{reference:'node:photo',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,4],unit:'mm'},behavior:'linked'}}
  ]}
 ]};
 const made=applyCreationV2Batch(doc,batch,frozen),group=made.page.layers.find(n=>n.id==='card');
 assert.ok(group?.localTransform&&group.children.length===2);
 assert.notEqual(group.children[0].x,worldBox(made.page,'photo').cx);
 const old=worldBox(made.page,'caption').cy;
 const reopened=structuredClone(made);
 const moved=applyCreationV2Batch(reopened,{protocolVersion:2,transactionId:'move-photo',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'layer.place',target:'photo',place:{reference:'parent',at:[.5,.5],unit:'ratio'}}
 ]},frozen);
 assert.ok(worldBox(moved.page,'caption').cy>old);
 assert.ok(moved.page.layers[0].children.some(n=>n.layoutConstraint?.place?.behavior==='linked'));
});

test('concise create, update and reparent reuse parent-relative sizes and sibling order',async()=>{
 const asset={id:'ordered-asset',title:'纸',kind:'paper',physicalWidthMM:20,physicalHeightMM:20,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('层序'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const frozen=task.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
 const doc=webSceneDocument(task.source,task.source.baseDraft,'层序');
 const next=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:'ordered-local',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'group.compose',id:'frame',layoutBox:{width:100,height:80,unit:'mm'},place:{reference:'page',at:[.5,.5],unit:'ratio'},children:[
   {op:'shape.add',id:'back',kind:'rect',size:{reference:'parent',width:.5,height:.5,unit:'ratio'},place:{reference:'parent',at:[.5,.5],unit:'ratio'}},
   {op:'material.add',id:'photo',asset:'m1',place:{reference:'parent',at:[.5,.5],unit:'ratio'},order:{edge:'back'}},
   {op:'text.add',id:'note',content:'记录',size:{width:30,unit:'mm'},place:{reference:'parent',at:[.5,.5],unit:'ratio'},order:{after:'photo'}}
  ]},
  {op:'text.update',target:'note',content:'重新记录',order:{edge:'front'}},
  {op:'layer.reparent',target:'back',parent:null,order:{edge:'back'}}
 ]},frozen);
 const frame=next.page.layers.find(node=>node.id==='frame');
 assert.deepEqual(frame.children.map(node=>node.creativePieceID||node.agentKey||node.key),['photo','note']);
 assert.equal(next.page.layers[0].key,'back');
 assert.ok(Math.abs(next.page.layers[0].width/next.page.canvas.height*next.page.physicalPageHeightMM-50)<.01);
 assert.equal(frame.children.at(-1).content,'重新记录');
});
test('deleting a referenced layer requires explicit dependent link detachment',async()=>{
 const asset={id:'linked-delete',title:'贴纸',kind:'sticker',physicalWidthMM:20,physicalHeightMM:20,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('关联删除'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const frozen=task.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
 const doc=webSceneDocument(task.source,task.source.baseDraft,'关联删除');
 const created=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:'linked-delete-setup',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'material.add',id:'photo',asset:'m1',place:{reference:'page',at:[.5,.5],unit:'ratio'}},
  {op:'text.add',id:'note',content:'随图移动',size:{width:30,unit:'mm'},place:{reference:'node:photo',referenceAnchor:'bottom-center',anchor:'top-center',behavior:'linked'}}
 ]},frozen);
 const remove={protocolVersion:2,transactionId:'linked-delete-remove',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[{op:'layer.delete',target:'photo'}]};
 assert.throws(()=>applyCreationV2Batch(created,remove,frozen),/linked/);
 remove.operations[0].dependentLinks='detach';
 const next=applyCreationV2Batch(created,remove,frozen);
 const note=next.page.layers.find(n=>n.agentKey==='note');
 assert.ok(note&&!note.layoutConstraint);
 assert.equal(next.page.layers.some(n=>n.creativePieceID==='photo'),false);
});
test('linked ink keeps its path editable while following a moved reference',async()=>{
 const asset={id:'ink-anchor',title:'纸',kind:'paper',physicalWidthMM:20,physicalHeightMM:20,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('笔迹关联'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const frozen=task.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
 const doc=webSceneDocument(task.source,task.source.baseDraft,'笔迹关联');
 const created=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:'ink-link',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'material.add',id:'paper',asset:'m1',place:{reference:'page',at:[.4,.4],unit:'ratio'}},
  {op:'ink.add',id:'mark',unit:'mm',points:[{x:0,y:0},{x:20,y:2}],place:{reference:'node:paper',referenceAnchor:'bottom-center',anchor:'top-center',behavior:'linked'},style:{strokeWidthMm:2,color:'#ffb344',penStyle:'marker'}}
 ]},frozen);
 const old=worldBox(created.page,'mark');
 const moved=applyCreationV2Batch(created,{protocolVersion:2,transactionId:'ink-reference-move',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'layer.place',target:'paper',place:{reference:'page',at:[.6,.6],unit:'ratio'}}
 ]},frozen);
 assert.ok(worldBox(moved.page,'mark').cx>old.cx+10);
 assert.ok(moved.page.layers.find(n=>n.id==='mark').layoutConstraint);
});

test('protocol 2 split consumes one real parent and retains its source offcut',async()=>{
 const asset={id:'sheet-1',title:'纸张',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('分片账本'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const frozen=task.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
 const doc=webSceneDocument(task.source,task.source.baseDraft,'分片账本');
 const next=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:'split-parent-v2',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'material.add',id:'parent',asset:'m1',place:{reference:'page',at:[.5,.5],unit:'ratio'}},
  {op:'material.split',target:'parent',pieces:[
   {id:'left',region:{shape:'rect',space:'source',unit:'ratio',box:[0,0,.3,1]}},
   {id:'middle',region:{shape:'rect',space:'source',unit:'ratio',box:[.4,0,.3,1]}}
  ]}
 ]},frozen);
 attachSceneV2(next.page);
 assert.equal(next.page.items.some(item=>item.creativePieceID==='parent'),false);
 assert.equal(next.page.items.filter(item=>!item.isParked).length,2);
 assert.ok(next.page.items.some(item=>item.isParked));
 const ledger=buildMaterialLedger(next.page,frozen);
 assert.equal(ledger.units[0].sourceAreaMM2,8000);
 assert.equal(ledger.units[0].remainingAreaMM2,0);
 assert.equal(ledger.units[0].allocations.filter(row=>!row.parked).length,2);
});
test('physical split inside a rotated local group keeps new pieces in the same frame',async()=>{
 const asset={id:'group-sheet',title:'组内纸张',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('组内分片'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const frozen=task.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
 const doc=webSceneDocument(task.source,task.source.baseDraft,'组内分片');
 const next=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:'group-split',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'group.compose',id:'paper-group',layoutBox:{width:120,height:120,unit:'mm'},place:{reference:'page',at:[.5,.5],unit:'ratio',rotationDeg:15},children:[
   {op:'material.add',id:'parent',asset:'m1',place:{reference:'parent',at:[.5,.5],unit:'ratio'}},
   {op:'shape.add',id:'mark',kind:'ellipse',size:{width:4,height:4,unit:'mm'},place:{reference:'parent',at:[.8,.8],unit:'ratio'}}
  ]},
  {op:'material.split',target:'parent',pieces:[
   {id:'left',region:{shape:'rect',space:'source',unit:'ratio',box:[0,0,.4,1]}},
   {id:'right',region:{shape:'rect',space:'source',unit:'ratio',box:[.5,0,.4,1]}}
  ]}
 ]},frozen);
 const group=next.page.layers.find(n=>n.id==='paper-group');
 assert.ok(group.children.some(n=>n.creativePieceID==='left'));
 assert.ok(group.children.some(n=>n.creativePieceID==='right'));
 assert.equal(group.children.some(n=>n.creativePieceID==='parent'),false);
 assert.ok(buildMaterialLedger(next.page,frozen).units[0].allocations.filter(n=>!n.parked).length===2);
});
test('polygon and SVG path split remain physically disjoint source pieces',async()=>{
 const asset={id:'path-sheet',title:'图案纸',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('轮廓分片'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const frozen=task.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
 const doc=webSceneDocument(task.source,task.source.baseDraft,'轮廓分片');
 const next=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:'nonrect-split',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'material.add',id:'paper',asset:'m1',place:{reference:'page',at:[.5,.5],unit:'ratio'}},
  {op:'material.split',target:'paper',pieces:[
   {id:'left',region:{shape:'polygon',space:'source',unit:'ratio',points:[[0,0],[.4,0],[.35,1],[0,1]]}},
   {id:'right',region:{shape:'path',space:'source',unit:'ratio',d:'M .6 0 L 1 0 L 1 1 L .65 1 Z'}}
  ]}
 ]},frozen);
 attachSceneV2(next.page);
 assert.equal(next.page.items.filter(n=>!n.isParked).length,2);
 assert.equal(buildMaterialLedger(next.page,frozen).units[0].allocations.filter(n=>!n.parked).length,2);
});
test('concise crop retains an offcut and named window keeps its physical cutout',async()=>{
 const asset={id:'window-sheet',title:'开窗纸',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('裁切开窗'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const frozen=task.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
 const doc=webSceneDocument(task.source,task.source.baseDraft,'裁切开窗');
 const cropped=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:'crop-with-offcut',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'material.add',id:'paper',asset:'m1',place:{reference:'page',at:[.5,.5],unit:'ratio'}},
  {op:'material.crop',target:'paper',resultId:'main',keepRemainder:true,region:{shape:'rect',space:'source',unit:'ratio',box:[.1,.1,.8,.8]}}
 ]},frozen);
 attachSceneV2(cropped.page);
 assert.ok(cropped.page.items.some(node=>node.creativePieceID==='main'));
 assert.ok(cropped.page.items.some(node=>node.isParked));
 const windowed=applyCreationV2Batch(cropped,{protocolVersion:2,transactionId:'window-with-core',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'material.window',target:'main',windowId:'hole-a',resultId:'frame',cutoutId:'core',keepRemainder:true,
   region:{shape:'ellipse',space:'source',unit:'ratio',box:[.35,.3,.3,.4]}}
 ]},frozen);
 attachSceneV2(windowed.page);
 assert.ok(windowed.page.items.some(node=>node.creativePieceID==='frame'&&node.craftWindowIDs?.includes('hole-a')));
 assert.ok(windowed.page.items.some(node=>node.creativePieceID==='core'));
 assert.equal(buildMaterialLedger(windowed.page,frozen).units[0].sourceAreaMM2,8000);
});
test('SVG path crop, polygon window and display mask use one region parser',async()=>{
 const asset={id:'region-sheet',title:'区域纸',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('多种轮廓'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const frozen=task.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
 const doc=webSceneDocument(task.source,task.source.baseDraft,'多种轮廓');
 const next=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:'region-paths',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'material.add',id:'paper',asset:'m1',place:{reference:'page',at:[.5,.5],unit:'ratio'}},
  {op:'material.crop',target:'paper',region:{shape:'path',space:'source',unit:'ratio',d:'M .1 .1 L .9 .1 L .9 .9 L .1 .9 Z'}},
  {op:'material.window',target:'paper',windowId:'triangle',region:{shape:'polygon',space:'local',unit:'ratio',points:[[.35,.35],[.65,.35],[.5,.65]]}},
  {op:'material.mask',target:'paper',mode:'intersect',region:{shape:'path',space:'local',unit:'ratio',d:'M .05 .05 L .95 .05 L .95 .95 L .05 .95 Z'}}
 ]},frozen);
 attachSceneV2(next.page);
 const paper=next.page.items.find(n=>n.creativePieceID==='paper');
 assert.ok(paper.materialMask?.holes?.length===1);
 assert.ok(paper.vectorMask?.outer?.length>=4);
 assert.deepEqual(paper.craftWindowIDs,['triangle']);
});
test('protocol 2 tape makes a physical strip from one placement and length',async()=>{
 const asset={id:'tape-1',title:'蓝色胶带',kind:'tape',physicalWidthMM:60,physicalHeightMM:8,supply:{quantity:0}};
 const task=await createOfflineHandoff({project:project('胶带'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const frozen=task.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
 const doc=webSceneDocument(task.source,task.source.baseDraft,'胶带');
 const next=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:'tape-v2',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'material.tape',id:'blue-strip',asset:'m1',lengthMm:35,place:{reference:'page',at:[.5,.5],unit:'ratio',rotationDeg:30}}
 ]},frozen);
 attachSceneV2(next.page);
 assert.equal(next.page.items.length,1);
 assert.equal(next.page.items[0].creativePieceID,'blue-strip');
 assert.ok(Math.abs(next.page.items[0].tapeStrip.pathLengthMM-35)<.01);
 assert.equal(buildMaterialLedger(next.page,frozen).rolls[0].pieces.length,1);
});
test('protocol 2 torn edge alters physical material mask with a stable seed',async()=>{
 const asset={id:'edge-1',title:'边缘纸',kind:'paper',physicalWidthMM:80,physicalHeightMM:60,supply:{quantity:1}};
 const p=project('撕边');p.processing='自由拆解';
 const task=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const frozen=task.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
 const doc=webSceneDocument(task.source,task.source.baseDraft,'撕边');
 const next=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:'edge-v2',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'material.add',id:'paper',asset:'m1',place:{reference:'page',at:[.5,.5],unit:'ratio'}},
  {op:'material.edge',target:'paper',edge:{style:'torn',roughness:.2,seed:42}}
 ]},frozen);
 attachSceneV2(next.page);
 assert.equal(next.page.items[0].materialMask.shape,'polygon');
 assert.equal(next.page.items[0].materialSteps.at(-1).seed,42);
 assert.ok(buildMaterialLedger(next.page,frozen).units[0].usedAreaMM2<4800);
 const cleaned=applyCreationV2Batch(next,{protocolVersion:2,transactionId:'edge-clean-v2',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'material.edge',target:'paper',edge:{style:'clean'}}
 ]},frozen);
 attachSceneV2(cleaned.page);
 assert.equal(cleaned.page.items[0].materialSteps.some(step=>step.op==='edge'),false);
});
test('one protocol 2 command file retains all 39 native advanced operations',async()=>{
 assert.equal(advancedCreationV2Names.length,39);
 assert.equal(creationV2RuntimeSchema.$defs.Operation.oneOf.length,63);
 const asset={id:'advanced-1',title:'纸片',kind:'paper',physicalWidthMM:30,physicalHeightMM:20,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('高级命令'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const frozen=task.source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
 const doc=webSceneDocument(task.source,task.source.baseDraft,'高级命令');
 const command={protocolVersion:2,transactionId:'advanced-v2',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'advanced.v1.material.add',id:'paper',asset:'m1',placement:{xMm:40,yMm:50}},
  {op:'text.add',id:'caption',content:'仍可用统一命令继续创作',place:{reference:'node:paper',referenceAnchor:'bottom-center',anchor:'top-center'},size:{width:60,unit:'mm'}}
 ]};
 validateCreationV2Commands(command);
 const next=applyCreationV2Batch(doc,command,frozen);
 assert.ok(next.page.layers.some(node=>node.creativePieceID==='paper'));
 assert.ok(next.page.layers.some(node=>node.agentKey==='caption'));
});
