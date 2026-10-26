import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {inspectorSelection,applyGroupInspectorChange,applyInkInspectorChange} from '../src/editor-inspector-model.js';
import {findSceneNode,ungroupSceneLayers} from '../src/scene-v2.js';
import {worldBox} from '../src/scene-spatial.js';
import {beginSceneEditSession,commitSceneEditSession} from '../src/scene-edit-session.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
async function fixture(){
 const doc=await createCreationDocument({draft:draft(),assets:[]});
 return applyCreationTransaction(doc,{protocolVersion:2,transactionId:'group',baseSceneRevision:creationSceneRevision(doc),operations:[
  {op:'group.compose',id:'outer',layoutBox:{width:60,height:70,unit:'mm'},place:{reference:'page',at:[70,80],unit:'mm',rotationDeg:20},children:[
   {op:'graphic.add',id:'card',geometry:{kind:'rect'},size:{width:40,height:50,unit:'mm'},style:{fill:'#d4b076'},place:{reference:'parent',at:[.5,.5],unit:'ratio'}},
   {op:'group.compose',id:'inner',layoutBox:{width:30,height:20,unit:'mm'},place:{reference:'parent',at:[.5,.5],unit:'ratio'},children:[
    {op:'graphic.add',id:'ink',geometry:{kind:'stroke',points:[{x:0,y:0,pressure:.3},{x:12,y:4,pressure:.8}],unit:'mm'},style:{stroke:'#884433',strokeWidthMm:2},place:{reference:'parent',at:[.5,.5],unit:'ratio',behavior:'linked'}}
   ]}
  ]}
 ]},[]).document.page;
}
const render=async page=>(await renderSceneCanvas(page,{createCanvas,loadShapeImage:(uri,frame)=>loadImage(Buffer.from(decodeURIComponent(uri.split(',').slice(1).join(',')).replace('<svg ',`<svg width="${Math.ceil(frame.width)}" height="${Math.ceil(frame.height)}" `))),waitForFonts:false})).canvas.toBuffer('image/png');
test('group inspector changes appearance through shared kernel without rewriting nested children',async()=>{
 const page=await fixture(),group=findSceneNode(page,'outer'),children=JSON.stringify(group.children),frame=structuredClone(group.localTransform);
 const before=await render(page),box=worldBox(page,'ink');
 assert.equal(inspectorSelection(page,'outer').kind,'group');
 assert.deepEqual(inspectorSelection(page,'inner').parents.map(p=>p.id),['outer']);
 for(const [key,value] of [['inspector-group-name','照片与旁注'],['inspector-opacity','.65'],['inspector-blend-mode','multiply'],['inspector-group-shadow-enabled',true],['inspector-group-shadow-color','#64594a'],['inspector-group-shadow-blur','1.5'],['inspector-group-shadow-x','-1'],['inspector-group-shadow-y','2']])assert.equal(applyGroupInspectorChange(page,'outer',key,value),true);
 assert.equal(group.name,'照片与旁注');assert.equal(group.opacity,.65);assert.equal(group.blendMode,'multiply');assert.equal(group.shadow.color,'#64594a');
 assert.equal(group.shadow.offsetX,-page.canvas.height/page.physicalPageHeightMM);
 assert.equal(JSON.stringify(group.children),children);assert.deepEqual(group.localTransform,frame);assert.deepEqual(worldBox(page,'ink'),box);
 assert.notDeepEqual(await render(page),before);assert.deepEqual(await render(JSON.parse(JSON.stringify(page))),await render(page));
 for(const [key,value] of [['inspector-group-name','x'.repeat(101)],['inspector-opacity',''],['inspector-blend-mode','unknown'],['inspector-group-shadow-blur','-1'],['inspector-group-shadow-color','bad']]){
  const before=JSON.stringify(page);assert.throws(()=>applyGroupInspectorChange(page,'outer',key,value));assert.equal(JSON.stringify(page),before);
 }
 findSceneNode(page,'ink').isLocked=true;const saved=JSON.stringify(page);
 assert.throws(()=>applyGroupInspectorChange(page,'outer','inspector-opacity',.3),/锁定/);assert.equal(JSON.stringify(page),saved);
});
test('one group session stages group and child edits; discard and commit preserve atomicity',async()=>{
 const page=await fixture(),saved=JSON.stringify(page),session=beginSceneEditSession(page,{selectedID:'outer'});
 applyGroupInspectorChange(session.working,'outer','inspector-group-name','同一会话');
 applyInkInspectorChange(session.working,'ink','inspector-ink-color','#336699');
 assert.equal(JSON.stringify(page),saved);
 commitSceneEditSession(page,session,[],{policy:USER_SCENE_POLICY});
 assert.equal(findSceneNode(page,'outer').name,'同一会话');assert.equal(findSceneNode(page,'ink').color,'#336699');
 const discard=beginSceneEditSession(page,{selectedID:'outer'});
 applyGroupInspectorChange(discard.working,'inner','inspector-opacity',.3);
 assert.equal(findSceneNode(page,'inner').opacity,1);
});
test('ungroup refuses to silently lose group shadow',async()=>{
 const page=await fixture();applyGroupInspectorChange(page,'outer','inspector-group-shadow-enabled',true);
 const before=JSON.stringify(page);assert.throws(()=>ungroupSceneLayers(page,'outer'),/阴影/);assert.equal(JSON.stringify(page),before);
 applyGroupInspectorChange(page,'outer','inspector-group-shadow-enabled',false);
 assert.equal(ungroupSceneLayers(page,'outer'),true);
});
