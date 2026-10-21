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

test('protocol 2 page and relative commands create editable native Scene nodes',async()=>{
 const asset={id:'photo-1',title:'图片',kind:'sticker',physicalWidthMM:30,physicalHeightMM:20,supply:{quantity:1}};
 const task=await createOfflineHandoff({project:project('统一命令'),assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const source=task.source,doc=webSceneDocument(source,source.baseDraft,'统一命令');
 const frozen=source.sourceSnapshots.map(snapshot=>assetFromSourceSnapshot(snapshot,{frozenRevision:true}));
 const batch={protocolVersion:2,transactionId:'new-layout',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[
  {op:'material.add',id:'photo',asset:'m1',place:{reference:'page',at:[.5,.4],unit:'ratio'}},
  {op:'text.add',id:'caption',content:'今天看见的一角',place:{reference:'node:photo',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,4],unit:'mm'}},size:{width:60,unit:'mm'},style:{fontSizePt:12,color:'#334d4a'}},
  {op:'text.update',target:'caption',content:'今天看见的一角。',style:{fontSizePt:14}},
  {op:'shape.add',id:'dot',kind:'ellipse',place:{reference:'page',at:[20,20],unit:'mm'},size:{width:5,height:5,unit:'mm'},style:{fill:'#aabbcc'}}
 ]};
 const result=applyCreationV2Batch(doc,batch,frozen);
 const nodes=result.page.layers;
 const photo=nodes.find(n=>n.creativePieceID==='photo'),caption=nodes.find(n=>n.agentKey==='caption'),dot=nodes.find(n=>n.key==='dot');
 assert.ok(photo&&caption&&dot);
 assert.equal(caption.content,'今天看见的一角。');
 assert.ok(caption.y>photo.y);
 assert.equal(dot.kind,'ellipse');
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
});
test('one protocol 2 command file retains all 39 native advanced operations',async()=>{
 assert.equal(advancedCreationV2Names.length,39);
 assert.equal(creationV2RuntimeSchema.$defs.Operation.oneOf.length,64);
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
