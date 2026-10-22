import test from 'node:test';
import assert from 'node:assert/strict';
import {project} from '../src/domain.js';
import {createOfflineHandoff,importEditableWork} from '../src/offline-creation.js';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import {webSceneDocument} from '../src/web-scene-workbench.js';
import {applyCreationV2Batch,validateCreationV2Commands} from '../src/creation-v2-commands.js';
import {creationCommandRegistry,describeCreationCommand} from '../src/creation-v2-contract.js';
import {creationNode} from '../src/creation-scene-core.js';
import {findSceneNode,attachSceneV2} from '../src/scene-v2.js';
import {worldBox} from '../src/scene-spatial.js';
import {solveSceneLayout} from '../src/scene-layout.js';
import {applySceneNodeChange,applySceneNodePatch} from '../src/scene-edit-kernel.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {itemSourceGeometry} from '../src/craft-region-ops.js';
import {geometryArea} from '../src/craft-topology.js';
import {buildMaterialLedger} from '../src/material-ledger.js';
import {tinyPNG} from './offline-canvas-test-support.mjs';
const at=(x=60,y=60)=>({reference:'page',at:[x,y],unit:'mm'});
const size=(width=40,height=30)=>({width,height,unit:'mm'});
const rect=(box,space='source')=>({shape:'rect',space,unit:'ratio',box});
const shape=(id='a',extra={})=>({op:'graphic.add',id,geometry:{kind:'rect'},size:size(),place:at(),style:{fill:'#334455'},...extra});
const text=(id='text',extra={})=>({op:'text.add',id,content:'hello',size:{width:40,unit:'mm'},place:at(),style:{fontSizePt:12},...extra});
const linked=(id,extra={})=>({reference:'node:'+id,width:1.2,height:1.2,unit:'ratio',behavior:'linked',...extra});
const follow=id=>({reference:'node:'+id,referenceAnchor:'center',rotationSpace:'reference',rotationDeg:0,behavior:'linked'});
const batch=operations=>({protocolVersion:2,transactionId:'tax',baseSceneRevision:'sha256:'+'0'.repeat(64),operations});
const paper=id=>({id,title:id,kind:'paper',physicalWidthMM:80,physicalHeightMM:60,supply:{quantity:1}});
async function fixture(){
 const p=project('taxonomy',{mode:'spread',ratio:'a5'});p.processing='自由拆解';const list=[paper('paper'),paper('other'),paper('third')];
 const task=await createOfflineHandoff({project:p,assets:list,aliases:{m1:'paper',m2:'other',m3:'third'},previews:list.map((_,i)=>({alias:'m'+(i+1),bytes:tinyPNG}))});
 const doc=webSceneDocument(task.source,task.source.baseDraft),assets=task.source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
 const run=(ops,base=doc)=>applyCreationV2Batch(base,batch(ops),assets);return {doc,assets,run};
}
const node=creationNode,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const failed=(run,base,ops,pattern)=>{const before=JSON.stringify(base);assert.throws(()=>run(ops,base),pattern);assert.equal(JSON.stringify(base),before);};
test('taxonomy has no alias endpoints, and compact help does not expose recursive operation trees',()=>{
 for(const op of ['text.update','layer.place','layer.reorder','material.mask','material.crop','material.trim','material.diagonal','layer.repeat','layout.reuse','draw.decorate']){
  assert.equal(creationCommandRegistry[op],undefined);assert.throws(()=>validateCreationV2Commands(batch([{op}])),/未知操作/);
 }
 for(const op of Object.keys(creationCommandRegistry))assert.ok(Buffer.byteLength(JSON.stringify(describeCreationCommand(op)))<12000,op);
 assert.equal(Object.keys(creationCommandRegistry).length,30);
 assert.throws(()=>validateCreationV2Commands(batch([{op:'text.reflow',target:'title',place:at()}])),/commands/);
});
test('linked sizes are solved before anchors, persist through import and are idempotent',async()=>{
 const {run,assets}=await fixture();let d=run([text(),shape('ring',{geometry:{kind:'ellipse'},size:linked('text'),place:follow('text')}),shape('next',{size:linked('ring',{height:.5}),place:{...follow('ring'),referenceAnchor:'bottom-center',anchor:'top-center'}})]);
 d=run([{op:'layer.update',target:'text',size:{width:25,unit:'mm'},content:'new paragraph '.repeat(12)}],d);
 near(node(d,'ring').width,node(d,'text').width*1.2);near(node(d,'ring').height,node(d,'text').height*1.2);near(node(d,'next').height,node(d,'ring').height*.5);
 const before=JSON.stringify(d.page);for(let i=0;i<5;i++)solveSceneLayout(d.page);assert.equal(JSON.stringify(d.page),before);
 const result=importEditableWork(JSON.stringify(d),assets);assert.ok(findSceneNode(result.drafts[0],'ring').layoutConstraint.size);
});
test('size-only dependencies do not change position, once sizing detaches only size and supports scoped detach',async()=>{
 const {run}=await fixture();let d=run([shape(),shape('b',{size:linked('a'),place:at(130,100)})]);const before=worldBox(d.page,'b');
 d=run([{op:'layer.update',target:'a',size:size(55,40)}],d);near(worldBox(d.page,'b').cx,before.cx);near(node(d,'b').width,node(d,'a').width*1.2);
 d=run([{op:'layer.update',target:'b',place:follow('a')},{op:'layer.update',target:'b',size:size(10,12)}],d);assert.ok(node(d,'b').layoutConstraint.place);assert.equal(node(d,'b').layoutConstraint.size,undefined);
 d=run([{op:'layer.update',target:'b',size:linked('a')},{op:'layout.detach',target:'b',scope:'place'}],d);assert.ok(node(d,'b').layoutConstraint.size);assert.equal(node(d,'b').layoutConstraint.place,undefined);
 d=run([{op:'layout.detach',target:'b',scope:'size'}],d);assert.equal(node(d,'b').layoutConstraint,undefined);
});
test('mixed position/size cycles, self links and physical resizing fail atomically',async()=>{
 const {run}=await fixture();const d=run([shape(),shape('b',{size:linked('a')}),{op:'material.add',id:'paper',asset:'m1',place:at()}]);
 failed(run,d,[{op:'layer.update',target:'a',place:follow('b')}],/循环/);
 failed(run,d,[{op:'layer.update',target:'a',size:linked('a')}],/循环/);
 failed(run,d,[{op:'layer.update',target:'paper',size:linked('a')}],/确认|实体|持续尺寸/);
 failed(run,d,[{op:'layer.delete',target:'a'}],/linked/);
 const detached=run([{op:'layer.delete',target:'a',dependentLinks:'detach'}],d);assert.equal(node(detached,'b').layoutConstraint,undefined);
});
test('stable parent boxes update linked child sizes without implicit group/material scaling',async()=>{
 const {run}=await fixture();let d=run([{op:'group.compose',id:'g',layoutBox:{width:80,height:70,unit:'mm'},place:{...at(),rotationDeg:30},children:[shape('a',{place:{reference:'parent',at:[.5,.5],unit:'ratio'},size:{reference:'parent',width:.5,height:.5,unit:'ratio',behavior:'linked'}})]}]);
 d=run([{op:'layer.update',target:'g',layoutBox:{width:100,height:80,unit:'mm'}}],d);const s=d.page.canvas.height/d.page.physicalPageHeightMM;near(node(d,'a').width,50*s);near(node(d,'a').height,40*s);
 failed(run,d,[{op:'layer.update',target:'g',size:linked('a')}],/组合|循环/);
});
test('locked or manually protected size followers cannot be changed indirectly',async()=>{
 const {run}=await fixture();const d=run([shape(),shape('b',{size:linked('a')})]);
 node(d,'b').isLocked=true;failed(run,d,[{op:'layer.update',target:'a',size:size(60,50)}],/锁定/);
 node(d,'b').isLocked=false;applySceneNodePatch(d.page,'b',{fill:'#AA0000'},{policy:USER_SCENE_POLICY});
 failed(run,d,[{op:'layer.update',target:'a',size:size(60,50)}],/手动|用户接管/);
});
test('manual resize detaches size but preserves its independent position relation',async()=>{
 const {run}=await fixture(),d=run([shape(),shape('b',{size:linked('a'),place:follow('a')})]);const b=node(d,'b');
 applySceneNodePatch(d.page,'b',{width:b.width*1.4},{policy:USER_SCENE_POLICY,linked:'offset',place:at(100,100)});
 assert.equal(b.layoutConstraint.size,undefined);assert.ok(b.layoutConstraint.place);const width=b.width;
 applySceneNodeChange(d.page,'a',{size:size(60,50)},{policy:USER_SCENE_POLICY});near(b.width,width);
});
test('stroke linked resizing keeps pressure and independent nib width',async()=>{
 const {run}=await fixture();let d=run([shape(),{op:'graphic.add',id:'line',geometry:{kind:'stroke',points:[{x:0,y:0,pressure:.2},{x:10,y:3,pressure:.8}],unit:'mm'},size:linked('a',{width:.7,height:.3}),place:at(),style:{stroke:'#334455',strokeWidthMm:1,penStyle:'pressure'}}]);
 const width=node(d,'line').width;d=run([{op:'layer.update',target:'a',size:size(60,50)}],d);assert.equal(node(d,'line').width,width);assert.deepEqual(node(d,'line').points.map(p=>p.p),[.2,.8]);
});
test('material cut keep/remove and unified masks distinguish physical and visible area',async()=>{
 const {run,assets}=await fixture();let d=run([{op:'material.add',id:'paper',asset:'m1',place:at()},{op:'material.cut',target:'paper',mode:'remove',region:{shape:'edge',edge:'left',amount:.25,space:'source',unit:'ratio'}}]);
 near(geometryArea(itemSourceGeometry(node(d,'paper'),assets[0])),80*60*.75);const ledger=JSON.stringify(buildMaterialLedger(attachSceneV2(d.page),assets));
 d=run([{op:'layer.mask',target:'paper',mode:'replace',region:rect([.5,0,.5,1])}],d);assert.ok(node(d,'paper').vectorMask);assert.equal(JSON.stringify(buildMaterialLedger(attachSceneV2(d.page),assets)),ledger);
 d=run([{op:'layer.mask',target:'paper',mode:'clear'}],d);assert.equal(node(d,'paper').vectorMask,undefined);near(geometryArea(itemSourceGeometry(node(d,'paper'),assets[0])),80*60*.75);
 failed(run,d,[{op:'material.cut',target:'paper',mode:'keep',region:rect([0,0,.1,.1])}],/没有|有效|为空/);
 failed(run,d,[{op:'material.cut',target:'paper',mode:'keep',region:rect([.3,0,.7,1]),keepRemainder:true}],/resultId/);
});
test('half-plane through source corners produces valid connected material, named windows stay distinct',async()=>{
 const {run,assets}=await fixture();let d=run([{op:'material.add',id:'paper',asset:'m1',place:at()},{op:'material.cut',target:'paper',mode:'keep',region:{shape:'halfPlane',from:[0,0],to:[1,1],side:'left',space:'source',unit:'ratio'}}]);
 near(geometryArea(itemSourceGeometry(node(d,'paper'),assets[0])),2400);
 const named=run([{op:'material.add',id:'frame',asset:'m1',place:at()},{op:'material.window',target:'frame',windowId:'hole',region:rect([.4,.4,.2,.2])}]);
 failed(run,named,[{op:'material.cut',target:'frame',mode:'keep',region:rect([0,0,.8,1])}],/命名|开窗/);
});
test('general digital duplication preserves geometry and copies do not overwrite originals',async()=>{
 const {run}=await fixture();const d=run([text(),{op:'graphic.add',id:'ink',geometry:{kind:'stroke',points:[{x:0,y:0,pressure:.2},{x:12,y:3,pressure:.8}],unit:'mm'},place:at(),style:{stroke:'#112233',strokeWidthMm:1}}]);
 const original=JSON.stringify(node(d,'text')),before=JSON.stringify(d);
 const c=run([{op:'layer.duplicate',target:'text',id:'text2',place:at(90,80)},{op:'layer.duplicate',target:'ink',id:'ink2',place:at(90,120)}],d);
 assert.equal(JSON.stringify(d),before);assert.equal(JSON.stringify(node(c,'text')),original);assert.equal(node(c,'text2').content,node(d,'text').content);assert.deepEqual(node(c,'ink2').points.map(p=>p.p),[.2,.8]);
});
test('duplicate group remaps internal size/position and title slots, detaches external dependencies',async()=>{
 const {run}=await fixture();const d=run([shape('outside'),{op:'group.compose',id:'g',layoutBox:{width:100,height:100,unit:'mm'},place:at(),children:[shape('a',{size:linked('outside'),place:{reference:'parent',at:[.3,.3],unit:'ratio'}}),shape('b',{size:linked('a'),place:follow('a')})]}]);
 const c=run([{op:'layer.duplicate',target:'g',id:'copy',place:at(180,80)}],d);assert.equal(node(c,'copy-a').layoutConstraint,undefined);assert.equal(node(c,'copy-b').layoutConstraint.size.reference,'node:copy-a');assert.equal(node(c,'copy-b').layoutConstraint.place.reference,'node:copy-a');
 failed(run,d,[{op:'layer.duplicate',target:'g',id:'g',place:at()}],/重复|存在/);
});
test('material duplicates require per-node new sources and never copy original source masks',async()=>{
 const {run,assets}=await fixture();const d=run([{op:'material.add',id:'p',asset:'m1',place:at()},{op:'material.cut',target:'p',mode:'keep',region:rect([0,0,.6,1])}]);
 failed(run,d,[{op:'layer.duplicate',target:'p',id:'p2',place:at(100,100)}],/materialMap/);
 failed(run,d,[{op:'layer.duplicate',target:'p',id:'p2',place:at(100,100),materialMap:{p:'m1'}}],/重复|来源|重叠|实体/);
 const c=run([{op:'layer.duplicate',target:'p',id:'p2',place:at(100,100),materialMap:{p:'m2'}}],d);assert.equal(node(c,'p2').assetID,assets[1].id);near(geometryArea(itemSourceGeometry(node(c,'p2'),assets[1])),4800);assert.ok(!node(c,'p2').manualVisualCopy);
});
test('art title reflow grows and shrinks stable editable slots, preserves per-letter appearance and placement',async()=>{
 const {run,assets}=await fixture();let d=run([{op:'text.lettering',id:'title',content:'去玩',place:{...at(),rotationDeg:15},style:{fontSizePt:20},letters:[{index:1,style:{color:'#AA0000',outline:{widthMm:.5,color:'#EEEEEE'}},rotationDeg:5}]}]);
 const old=node(d,'title').children.map(n=>n.id),before=worldBox(d.page,'title');
 d=run([{op:'text.reflow',target:'title',content:'去看看吧',gapMm:2}],d);
 assert.deepEqual(node(d,'title').children.slice(0,2).map(n=>n.id),old);assert.equal(node(d,'title-g2').color,'#AA0000');assert.equal(node(d,'title-g2').rotation,5);assert.ok(node(d,'title-g2').textOutline);near(worldBox(d.page,'title').cx,before.cx);near(worldBox(d.page,'title').rotation,15);
 d=run([{op:'text.reflow',target:'title',content:'出发'},{op:'text.reflow',target:'title',content:'出发啦'}],d);assert.equal(node(d,'title').children[2].id,'title-g5');
 const imported=importEditableWork(JSON.stringify(d),assets);assert.equal(findSceneNode(imported.drafts[0],'title').lettering.slots.length,3);
});
test('title reflow refuses protected children, externally linked removals and ordinary groups',async()=>{
 const {run}=await fixture();const d=run([{op:'text.lettering',id:'title',content:'去玩',place:at()},shape('ring',{size:linked('title-g2'),place:follow('title-g2')})]);
 failed(run,d,[{op:'text.reflow',target:'title',content:'去'}],/linked/);
 node(d,'title-g1').isLocked=true;failed(run,d,[{op:'text.reflow',target:'title',content:'看看'}],/锁定/);
 node(d,'title-g1').isLocked=false;applySceneNodePatch(d.page,'title-g1',{color:'#FF0000'},{policy:USER_SCENE_POLICY});failed(run,d,[{op:'text.reflow',target:'title',content:'看看'}],/手动|接管/);
});
test('outline/gradient have identical create and update fields for graphics and pressure ink',async()=>{
 const {run}=await fixture(),style={gradient:{angleDeg:0,stops:[{offset:0,color:'#FF0000'},{offset:1,color:'#0000FF'}]},outline:{color:'#00FF00',widthMm:1,offsetMm:[1,1]}};
 let d=run([shape('a',{style:{fill:'#FFFFFF',...style}}),shape('b')]);d=run([{op:'layer.update',target:'b',style:{fill:'#FFFFFF',...style}}],d);
 assert.deepEqual(node(d,'a').graphicGradient,node(d,'b').graphicGradient);assert.deepEqual(node(d,'a').graphicOutline,node(d,'b').graphicOutline);
 d=run([{op:'layer.update',target:'a',style:{outline:null,gradient:null}}],d);assert.equal(node(d,'a').graphicGradient,null);assert.equal(node(d,'a').graphicOutline,null);
});
