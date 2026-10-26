import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {applyInspectorLayout,inspectorLayoutModel,inspectorSizeRatios,inspectorPlacementControls,inspectorReference} from '../src/editor-layout-model.js';
import {applySceneWorldPatch} from '../src/scene-edit-kernel.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {worldBox} from '../src/scene-spatial.js';
import {findSceneNode} from '../src/scene-v2.js';
import {beginSceneEditSession,commitSceneEditSession} from '../src/scene-edit-session.js';

const refID='12345678-1111-4111-8111-123456789abc';
async function fixture(){
 const doc=await createCreationDocument({draft:draft(),assets:[]});
 return applyCreationTransaction(doc,{protocolVersion:2,transactionId:'layout',baseSceneRevision:creationSceneRevision(doc),operations:[
  {op:'graphic.add',id:refID,geometry:{kind:'rect'},size:{width:50,height:30,unit:'mm'},place:{reference:'page',at:[60,70],unit:'mm',rotationDeg:30}},
  {op:'group.compose',id:'nested',place:{reference:'page',at:[90,100],unit:'mm',rotationDeg:20},layoutBox:{width:50,height:50,unit:'mm'},children:[
   {op:'graphic.add',id:'mark',geometry:{kind:'ellipse'},size:{width:10,height:8,unit:'mm'},place:{reference:'parent',at:[.5,.5],unit:'ratio'}}
  ]}
 ]},[]).document.page;
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('native UUID reference, nested keep-position binding, moving/rotating, manual offset and detach',async()=>{
 const page=await fixture(),before=worldBox(page,'mark'),r=worldBox(page,refID);
 applyInspectorLayout(page,'mark',{action:'place',reference:'node:'+refID,followRotation:true});
 for(const k of ['cx','cy','rotation'])near(worldBox(page,'mark')[k],before[k]);
 applySceneWorldPatch(page,refID,{x:r.cx+20,y:r.cy+30},{policy:USER_SCENE_POLICY});
 near(worldBox(page,'mark').cx,before.cx+20);near(worldBox(page,'mark').cy,before.cy+30);
 applySceneWorldPatch(page,refID,{rotation:r.rotation+15},{policy:USER_SCENE_POLICY});near(worldBox(page,'mark').rotation,before.rotation+15);
 applySceneWorldPatch(page,'mark',{x:300,y:400},{policy:USER_SCENE_POLICY,linked:'offset'});
 near(worldBox(page,'mark').cx,300);near(worldBox(page,'mark').cy,400);
 applyInspectorLayout(page,'mark',{action:'detach',scope:'place'});const detached=worldBox(page,'mark');
 applySceneWorldPatch(page,refID,{x:500},{policy:USER_SCENE_POLICY});assert.deepEqual(worldBox(page,'mark'),detached);
});
test('size follows independently, cycles and locked edits rollback; material cannot bind size',async()=>{
 const page=await fixture(),before=worldBox(page,'mark'),ref='node:'+refID;
 applyInspectorLayout(page,'mark',{action:'size',reference:ref,...inspectorSizeRatios(page,'mark',ref)});
 near(worldBox(page,'mark').w,before.w);near(worldBox(page,'mark').h,before.h);
 const target=findSceneNode(page,refID);
 target.agentKey='material-label';assert.equal(inspectorReference(page,'node:material-label'),ref);
 assert.deepEqual(inspectorSizeRatios(page,'mark','node:material-label'),inspectorSizeRatios(page,'mark',ref));
 applySceneWorldPatch(page,refID,{width:target.width*2,height:target.height*3},{policy:USER_SCENE_POLICY});
 near(worldBox(page,'mark').w,before.w*2);near(worldBox(page,'mark').h,before.h*3);
 let saved=JSON.stringify(page);
 assert.throws(()=>applyInspectorLayout(page,refID,{action:'place',reference:'node:mark'}),/循环/);assert.equal(JSON.stringify(page),saved);
 findSceneNode(page,'mark').isLocked=true;saved=JSON.stringify(page);
 assert.throws(()=>applyInspectorLayout(page,'mark',{action:'detach',scope:'size'}),/锁定/);assert.equal(JSON.stringify(page),saved);
 findSceneNode(page,'mark').isLocked=false;findSceneNode(page,'mark').type='material';
 assert.equal(inspectorLayoutModel(page,'mark').canResize,false);
 assert.throws(()=>applyInspectorLayout(page,'mark',{action:'size',reference:ref,width:1,height:1}),/实体素材/);
});
test('relative anchors, save/discard and reload retain linked geometry',async()=>{
 const page=await fixture(),saved=JSON.stringify(page),session=beginSceneEditSession(page,{selectedID:'mark'});
 applyInspectorLayout(session.working,'mark',{action:'place',reference:'page',position:'center'});
 assert.equal(JSON.stringify(page),saved,'staging cannot mutate saved page');
 commitSceneEditSession(page,session,[],{policy:USER_SCENE_POLICY});
 near(worldBox(page,'mark').cx,page.canvas.width/2);near(worldBox(page,'mark').cy,page.canvas.height/2);
 assert.deepEqual(worldBox(JSON.parse(JSON.stringify(page)),'mark'),worldBox(page,'mark'));
 const discarded=beginSceneEditSession(page,{selectedID:'mark'});
 applyInspectorLayout(discarded.working,'mark',{action:'detach',scope:'all'});
 assert.ok(findSceneNode(page,'mark').layoutConstraint.place);
 const before=JSON.stringify(page);assert.throws(()=>applyInspectorLayout(page,'mark',{action:'place',reference:'node:mark'}),/有效/);assert.equal(JSON.stringify(page),before);
});

test('saved relative placement remains editable and unsafe Command ids remain rejected',async()=>{
 const {validateCreationV2Commands}=await import('../src/creation-v2-commands.js');
 const page=await fixture();
 applyInspectorLayout(page,'mark',{action:'place',reference:'node:'+refID,position:'right',gap:3,followRotation:true});
 assert.deepEqual(inspectorPlacementControls(findSceneNode(page,'mark').layoutConstraint.place),{position:'right',gap:'3'});
 const batch=target=>({protocolVersion:2,transactionId:'update',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[{op:'layer.update',target,style:{opacity:.5}}]});
 assert.doesNotThrow(()=>validateCreationV2Commands(batch(refID)));
 for(const id of ['../path','a/b','a b','<script>'])assert.throws(()=>validateCreationV2Commands(batch(id)));
});
