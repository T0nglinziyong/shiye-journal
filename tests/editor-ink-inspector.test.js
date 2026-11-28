import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from 'canvas';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {inspectorSelection,applyInkInspectorChange,inkInspectorStyle} from '../src/editor-inspector-model.js';
import {findSceneNode} from '../src/scene-v2.js';
import {beginSceneEditSession,commitSceneEditSession} from '../src/scene-edit-session.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';

async function fixture(){
 const doc=await createCreationDocument({draft:draft(),assets:[]});
 return applyCreationTransaction(doc,{protocolVersion:2,transactionId:'ink',baseSceneRevision:creationSceneRevision(doc),operations:[
  {op:'group.compose',id:'group',place:{reference:'page',at:[50,60],unit:'mm',rotationDeg:30},layoutBox:{width:60,height:50,unit:'mm'},children:[
   {op:'graphic.add',id:'stroke',geometry:{kind:'stroke',unit:'mm',points:[{x:0,y:0,pressure:.2},{x:10,y:3,pressure:.9},{x:22,y:0,pressure:.4}]},style:{stroke:'#224466',strokeWidthMm:1,penStyle:'pressure'},size:{reference:'page',unit:'ratio',width:.2,behavior:'linked'},place:{reference:'parent',at:[.5,.5],unit:'ratio',behavior:'linked'}}
  ]}
 ]},[]).document.page;
}
test('ink inspector selects nested ink and edits style without rewriting pressure points or layout bindings',async()=>{
 const page=await fixture(),node=findSceneNode(page,'stroke');
 const before=structuredClone(node),entry=inspectorSelection(page,'stroke');
 assert.equal(entry.kind,'ink');assert.equal(entry.parents[0].id,'group');
 for(const [id,value] of [['inspector-ink-color','#aabbcc'],['inspector-ink-width-mm','2.5'],['inspector-opacity','.45'],['inspector-blend-mode','multiply'],['inspector-ink-style','marker']])
  assert.equal(applyInkInspectorChange(page,'stroke',id,value),true);
 assert.equal(node.color,'#aabbcc');assert.ok(Math.abs(node.width-2.5*page.canvas.height/page.physicalPageHeightMM)<1e-10);
 assert.equal(node.opacity,.45);assert.equal(node.blendMode,'multiply');assert.equal(node.penStyle,'marker');
 assert.deepEqual(node.points,before.points);assert.deepEqual(node.layoutConstraint,before.layoutConstraint);
 assert.equal(applyInkInspectorChange(page,'stroke','inspector-width','100'),false,'box width is not a pen width alias');
 for(const [id,value] of [['inspector-ink-width-mm',0],['inspector-opacity',2],['inspector-ink-style','unknown'],['inspector-ink-color','javascript:bad']]){
  const saved=JSON.stringify(page);assert.throws(()=>applyInkInspectorChange(page,'stroke',id,value));assert.equal(JSON.stringify(page),saved);
 }
 node.isLocked=true;assert.throws(()=>applyInkInspectorChange(page,'stroke','inspector-opacity',.3),/锁定/);
 assert.equal(node.opacity,.45);assert.equal(inspectorSelection(page,'missing'),null);
});
test('ink inspector uses isolated save/discard and real Canvas changes survive reopen',async()=>{
 const page=await fixture(),before=JSON.stringify(page);
 const render=async p=>(await renderSceneCanvas(p,{createCanvas,waitForFonts:false})).canvas.toBuffer('image/png');
 const original=await render(page),discarded=beginSceneEditSession(page,{selectedID:'stroke'});
 applyInkInspectorChange(discarded.working,'stroke','inspector-opacity',.2);
 assert.equal(JSON.stringify(page),before);
 const session=beginSceneEditSession(page,{selectedID:'stroke'});
 applyInkInspectorChange(session.working,'stroke','inspector-ink-color','#cc5533');
 applyInkInspectorChange(session.working,'stroke','inspector-ink-width-mm',2);
 applyInkInspectorChange(session.working,'stroke','inspector-opacity',.5);
 commitSceneEditSession(page,session,[],{policy:USER_SCENE_POLICY});
 const reopened=JSON.parse(JSON.stringify(page));
 assert.equal(findSceneNode(reopened,'stroke').opacity,.5);
 assert.notDeepEqual(await render(reopened),original);
 assert.deepEqual(await render(reopened),await render(page));
 assert.equal(inkInspectorStyle('unknown',''),null);
});
