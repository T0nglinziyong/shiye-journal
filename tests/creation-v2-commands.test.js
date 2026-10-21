import test from 'node:test';
import assert from 'node:assert/strict';
import {project} from '../src/domain.js';
import {createOfflineHandoff} from '../src/offline-creation.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {webSceneDocument} from '../src/web-scene-workbench.js';
import {applyCreationV2Batch,validateCreationV2Commands} from '../src/creation-v2-commands.js';
import {creationCommandRegistry,creationV2RuntimeSchema} from '../src/creation-v2-contract.js';
import {tinyPNG} from './offline-canvas-test-support.mjs';
import {buildMaterialLedger} from '../src/material-ledger.js';
import {attachSceneV2} from '../src/scene-v2.js';
import {worldBox} from '../src/scene-spatial.js';
const at={reference:'page',at:[.5,.5],unit:'ratio'};
const local={reference:'parent',at:[.5,.5],unit:'ratio'};
const paper=(id='paper',w=100,h=80)=>({id,title:id,kind:'paper',physicalWidthMM:w,physicalHeightMM:h,supply:{quantity:1}});
const add=(id='paper',place=at)=>({op:'material.add',id,asset:'m1',place});
const rect=box=>({shape:'rect',space:'source',unit:'ratio',box});
const batch=operations=>({protocolVersion:2,transactionId:'test',baseSceneRevision:'sha256:'+'0'.repeat(64),operations});
async function setup(asset=paper(),p=project('统一命令')){
 const task=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},previews:[{alias:'m1',bytes:tinyPNG}],settings:{includeThumbnails:true}});
 const assets=task.source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
 const doc=webSceneDocument(task.source,task.source.baseDraft,'测试');
 return {doc,assets,run:(operations,input=doc)=>applyCreationV2Batch(input,batch(operations),assets)};
}
test('published schema exposes current capabilities and rejects deferred geometry',()=>{
 assert.throws(()=>validateCreationV2Commands(batch([{op:'layout.arrange',targets:['a'],rule:{type:'grid'},container:'page'}])),/commands|操作/);
 assert.throws(()=>validateCreationV2Commands(batch([{op:'page.update',physicalSizeMm:[100,200]}])),/commands/);
 assert.throws(()=>validateCreationV2Commands(batch([{op:'shape.add',id:'a',kind:'rect',place:{...at,referenceBounds:'visible'},size:{width:10,height:10,unit:'mm'}}])),/commands/);
 validateCreationV2Commands(batch([{op:'layout.arrange',targets:['a','b'],rule:{direction:'horizontal',gapMm:4},container:'page'}]));
});
test('page and relative commands create editable native Scene nodes',async()=>{
 const {run}=await setup(paper('photo-1',30,20));
 const result=run([add('photo',{...at,at:[.5,.4]}),{op:'text.add',id:'caption',content:'今天看见的一角',place:{reference:'node:photo',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,4],unit:'mm'}},size:{width:60,unit:'mm'},style:{fontSizePt:12,color:'#334d4a'}},
  {op:'text.update',target:'caption',content:'今天看见的一角。',style:{fontSizePt:14,lineHeight:1.45}},
  {op:'shape.add',id:'dot',kind:'ellipse',place:{reference:'page',at:[20,20],unit:'mm'},size:{width:5,height:5,unit:'mm'},style:{fill:'#aabbcc',shadow:{offsetMm:[1,2],blurMm:1,color:'#112233'}}}]);
 const nodes=result.page.layers,photo=nodes.find(n=>n.creativePieceID==='photo'),caption=nodes.find(n=>n.agentKey==='caption'),dot=nodes.find(n=>n.id==='dot');
 assert.ok(photo&&caption&&dot);assert.equal(caption.content,'今天看见的一角。');assert.ok(caption.fixedLineHeight>caption.fontSize);assert.ok(caption.y>photo.y);assert.equal(dot.kind,'ellipse');assert.equal(dot.shadow.color,'#112233');
 const revised=run([{op:'group.create',id:'note-group',targets:['caption','dot']},{op:'layer.reorder',target:'dot',order:{before:'caption'}},{op:'group.ungroup',target:'note-group'},{op:'page.update',paperColor:'#eeeeee'}],result);
 assert.equal(revised.page.paperColor,'#eeeeee');assert.ok(revised.page.layers.some(n=>n.agentKey==='caption'));assert.ok(revised.page.layers.some(n=>n.id==='dot'));assert.doesNotThrow(()=>run([{op:'layout.detach',target:'caption'}],revised));
});
test('group.compose creates local children and linked captions survive reopen',async()=>{
 const {run}=await setup(paper('photo-local',30,20));
 const made=run([{op:'group.compose',id:'card',layoutBox:{width:90,height:100,unit:'mm'},place:{...at,rotationDeg:8},children:[add('photo',{...local,at:[.5,.35]}),{op:'text.add',id:'caption',content:'今天的照片',size:{width:45,unit:'mm'},place:{reference:'node:photo',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,4],unit:'mm'},behavior:'linked'}}]}]);
 const group=made.page.layers.find(n=>n.id==='card');assert.ok(group?.localTransform&&group.children.length===2);assert.notEqual(group.children[0].x,worldBox(made.page,'photo').cx);
 const old=worldBox(made.page,'caption').cy,moved=run([{op:'layer.place',target:'photo',place:local}],structuredClone(made));
 assert.ok(worldBox(moved.page,'caption').cy>old);assert.ok(moved.page.layers[0].children.some(n=>n.layoutConstraint?.place?.behavior==='linked'));
});
test('create update and reparent share parent-relative sizes and sibling order',async()=>{
 const {run}=await setup(paper('ordered',20,20));
 const next=run([{op:'group.compose',id:'frame',layoutBox:{width:100,height:80,unit:'mm'},place:at,children:[
  {op:'shape.add',id:'back',kind:'rect',size:{reference:'parent',width:.5,height:.5,unit:'ratio'},place:local},
  {...add('photo',local),order:{edge:'back'}},{op:'text.add',id:'note',content:'记录',size:{width:30,unit:'mm'},place:local,order:{after:'photo'}}
 ]},{op:'text.update',target:'note',content:'重新记录',order:{edge:'front'}},{op:'layer.reparent',target:'back',parent:null,order:{edge:'back'}}]);
 const frame=next.page.layers.find(n=>n.id==='frame');assert.deepEqual(frame.children.map(n=>n.creativePieceID||n.agentKey||n.key),['photo','note']);assert.equal(next.page.layers[0].id,'back');assert.ok(Math.abs(next.page.layers[0].width/next.page.canvas.height*next.page.physicalPageHeightMM-50)<.01);assert.equal(frame.children.at(-1).content,'重新记录');
});
test('deleting a referenced layer requires explicit link detachment',async()=>{
 const {run}=await setup(paper('linked-delete',20,20));
 const made=run([add('photo'),{op:'text.add',id:'note',content:'随图移动',size:{width:30,unit:'mm'},place:{reference:'node:photo',referenceAnchor:'bottom-center',anchor:'top-center',behavior:'linked'}}]);
 assert.throws(()=>run([{op:'layer.delete',target:'photo'}],made),/linked/);
 const next=run([{op:'layer.delete',target:'photo',dependentLinks:'detach'}],made),note=next.page.layers.find(n=>n.agentKey==='note');assert.ok(note&&!note.layoutConstraint);assert.equal(next.page.layers.some(n=>n.creativePieceID==='photo'),false);
});
test('linked ink stays editable while following a moved reference',async()=>{
 const {run}=await setup(paper('ink-anchor',20,20));
 const made=run([add('paper',{...at,at:[.4,.4]}),{op:'ink.add',id:'mark',unit:'mm',points:[{x:0,y:0},{x:20,y:2}],place:{reference:'node:paper',referenceAnchor:'bottom-center',anchor:'top-center',behavior:'linked'},style:{strokeWidthMm:2,color:'#ffb344',penStyle:'marker'}}]);
 const old=worldBox(made.page,'mark'),next=run([{op:'layer.place',target:'paper',place:{...at,at:[.6,.6]}}],made);assert.ok(worldBox(next.page,'mark').cx>old.cx+10);assert.ok(next.page.layers.find(n=>n.id==='mark').layoutConstraint);
});
test('split consumes the real parent and allocates its offcut',async()=>{
 const {run,assets}=await setup();const next=run([add('parent'),{op:'material.split',target:'parent',pieces:[{id:'left',region:rect([0,0,.3,1])},{id:'middle',region:rect([.4,0,.3,1])}]}]);
 attachSceneV2(next.page);assert.equal(next.page.items.some(n=>n.creativePieceID==='parent'),false);assert.equal(next.page.items.filter(n=>!n.isParked).length,2);assert.ok(next.page.items.some(n=>n.isParked));
 const ledger=buildMaterialLedger(next.page,assets);assert.equal(ledger.units[0].sourceAreaMM2,8000);assert.equal(ledger.units[0].remainingAreaMM2,0);assert.equal(ledger.units[0].allocations.filter(n=>!n.parked).length,2);
});
test('split inside rotated group preserves the local frame and occupancy',async()=>{
 const {run,assets}=await setup();const next=run([{op:'group.compose',id:'paper-group',layoutBox:{width:120,height:120,unit:'mm'},place:{...at,rotationDeg:15},children:[add('parent',local),{op:'shape.add',id:'mark',kind:'ellipse',size:{width:4,height:4,unit:'mm'},place:{...local,at:[.8,.8]}}]},
  {op:'material.split',target:'parent',pieces:[{id:'left',region:rect([0,0,.4,1])},{id:'right',region:rect([.5,0,.4,1])}]}]);
 const group=next.page.layers.find(n=>n.id==='paper-group');assert.ok(group.children.some(n=>n.creativePieceID==='left'));assert.ok(group.children.some(n=>n.creativePieceID==='right'));assert.equal(group.children.some(n=>n.creativePieceID==='parent'),false);assert.equal(buildMaterialLedger(next.page,assets).units[0].allocations.filter(n=>!n.parked).length,2);
});
test('polygon and SVG split remain disjoint physical source pieces',async()=>{
 const {run,assets}=await setup();const next=run([add(),{op:'material.split',target:'paper',pieces:[{id:'left',region:{shape:'polygon',space:'source',unit:'ratio',points:[[0,0],[.4,0],[.35,1],[0,1]]}},{id:'right',region:{shape:'path',space:'source',unit:'ratio',d:'M .6 0 L 1 0 L 1 1 L .65 1 Z'}}]}]);
 attachSceneV2(next.page);assert.equal(next.page.items.filter(n=>!n.isParked).length,2);assert.equal(buildMaterialLedger(next.page,assets).units[0].allocations.filter(n=>!n.parked).length,2);
});
test('crop offcut and named window physical core stay in the material ledger',async()=>{
 const {run,assets}=await setup();const cropped=run([add(),{op:'material.crop',target:'paper',resultId:'main',keepRemainder:true,region:rect([.1,.1,.8,.8])}]);
 attachSceneV2(cropped.page);assert.ok(cropped.page.items.some(n=>n.creativePieceID==='main'));assert.ok(cropped.page.items.some(n=>n.isParked));
 const next=run([{op:'material.window',target:'main',windowId:'hole-a',resultId:'frame',cutoutId:'core',keepRemainder:true,region:{shape:'ellipse',space:'source',unit:'ratio',box:[.35,.3,.3,.4]}}],cropped);
 attachSceneV2(next.page);assert.ok(next.page.items.some(n=>n.creativePieceID==='frame'&&n.craftWindowIDs?.includes('hole-a')));assert.ok(next.page.items.some(n=>n.creativePieceID==='core'));assert.equal(buildMaterialLedger(next.page,assets).units[0].sourceAreaMM2,8000);
});
test('SVG crop polygon window and display mask share the same region parser',async()=>{
 const {run}=await setup();const next=run([add(),{op:'material.crop',target:'paper',region:{shape:'path',space:'source',unit:'ratio',d:'M .1 .1 L .9 .1 L .9 .9 L .1 .9 Z'}},{op:'material.window',target:'paper',windowId:'triangle',region:{shape:'polygon',space:'local',unit:'ratio',points:[[.35,.35],[.65,.35],[.5,.65]]}},{op:'material.mask',target:'paper',mode:'intersect',region:{shape:'path',space:'local',unit:'ratio',d:'M .05 .05 L .95 .05 L .95 .95 L .05 .95 Z'}}]);
 attachSceneV2(next.page);const p=next.page.items.find(n=>n.creativePieceID==='paper');assert.equal(p.materialMask?.holes?.length,1);assert.ok(p.vectorMask?.outer?.length>=4);assert.deepEqual(p.craftWindowIDs,['triangle']);
});
test('tape retains physical path length and one roll allocation',async()=>{
 const {run,assets}=await setup({...paper('tape',60,8),kind:'tape',supply:{quantity:0}});const next=run([{op:'material.tape',id:'blue-strip',asset:'m1',lengthMm:35,place:{...at,rotationDeg:30}}]);
 attachSceneV2(next.page);assert.equal(next.page.items.length,1);assert.equal(next.page.items[0].creativePieceID,'blue-strip');assert.ok(Math.abs(next.page.items[0].tapeStrip.pathLengthMM-35)<.01);assert.equal(buildMaterialLedger(next.page,assets).rolls[0].pieces.length,1);
});
test('torn edge uses stable seed and clean removes the edge treatment',async()=>{
 const p=project('撕边');p.processing='自由拆解';const {run,assets}=await setup(paper('edge',80,60),p);
 const next=run([add(),{op:'material.edge',target:'paper',edge:{style:'torn',roughness:.2,seed:42}}]);attachSceneV2(next.page);assert.equal(next.page.items[0].materialMask.shape,'polygon');assert.equal(next.page.items[0].materialSteps.at(-1).seed,42);assert.ok(buildMaterialLedger(next.page,assets).units[0].usedAreaMM2<4800);
 const cleaned=run([{op:'material.edge',target:'paper',edge:{style:'clean'}}],next);attachSceneV2(cleaned.page);assert.equal(cleaned.page.items[0].materialSteps.some(step=>step.op==='edge'),false);
});
test('public registry is unified and old native operations are rejected',()=>{
 assert.equal(creationV2RuntimeSchema.$defs.Operation.oneOf.length,Object.keys(creationCommandRegistry).length);
 assert.ok(Object.keys(creationCommandRegistry).every(name=>!name.startsWith('native.')));
 assert.throws(()=>validateCreationV2Commands(batch([{op:'native.material.add',id:'p',asset:'m1',placement:{xMm:40,yMm:50}}])),/未知操作/);
});
