import {tinyPNG} from './offline-canvas-test-support.mjs';
import {assetFromSourceSnapshot} from '../src/material-anatomy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fabric from 'fabric/node';
import {applySceneNodeChange,applySceneNodePatch,applySceneWorldPatch,applyScenePatchBatch,insertSceneLayer,applyScenePagePatch} from '../src/scene-edit-kernel.js';
import {AI_SCENE_POLICY,USER_SCENE_POLICY,confirmSceneCapability} from '../src/scene-edit-policy.js';
import {groupEditableScene,moveEditableScene,removeEditableScene,editSceneStructure,copyEditableScene,sceneStructureTransaction} from '../src/scene-structure-edit.js';
import {eraseSceneInk} from '../src/scene-ink-edit.js';
import {appendInkStroke} from '../src/ink-groups.js';
import {createFabricSceneBridge} from '../src/fabric-scene-bridge.js';
import {layerFingerprint} from '../src/craft-fingerprint.js';
import {applyScenePlacement,solveSceneLayout} from '../src/scene-layout.js';
import {rigidMatrix,worldBox} from '../src/scene-spatial.js';
import {findSceneNode,sceneLayerEntries} from '../src/scene-v2.js';
import {transformSceneLasso} from '../src/scene-lasso.js';
import {beginSceneEditSession,acceptSceneEditStep,sceneEditSessionChanged,commitSceneEditSession} from '../src/scene-edit-session.js';
import {project,itemFromAsset} from '../src/domain.js';
import {editMaterialGeometry,replaceEditableMaterial} from '../src/scene-material-edit.js';
import {createOfflineHandoff} from '../src/offline-creation.js';
import {webSceneDocument} from '../src/web-scene-workbench.js';
import {applyCreationV2Batch} from '../src/creation-v2-commands.js';
const shape=(id='shape',extra={})=>({id,type:'shape',kind:'rectangle',x:100,y:100,width:40,height:20,rotation:0,fill:'#334455',...extra});
const text=(extra={})=>({id:'text',type:'text',content:'初始文字',x:100,y:100,width:120,height:50,fontSize:20,style:'serif',color:'#334455',rotation:0,textLayout:{minimumHeight:50,lineHeightRatio:1.4},...extra});
const material=(id='paper')=>({id,type:'material',assetID:'source',sourceBlobId:'immutable-source',materialUnitIndex:0,x:200,y:200,width:60,height:80,rotation:0});
const page=(layers=[])=>({id:'shared',sceneVersion:2,canvas:{width:600,height:800},physicalPageHeightMM:200,layers});
const user={policy:USER_SCENE_POLICY};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('public AI commands and manual common changes use identical complete text geometry',async()=>{
 const p=project('shared update');const handoff=await createOfflineHandoff({project:p,assets:[{id:'source',title:'unused paper',kind:'paper',physicalWidthMM:20,physicalHeightMM:30}],aliases:{m1:'source'},previews:[{alias:'m1',bytes:tinyPNG}]});
 const assets=handoff.source.sourceSnapshots.map(s=>assetFromSourceSnapshot(s,{frozenRevision:true}));
 const initial=webSceneDocument(handoff.source,handoff.source.baseDraft),batch=ops=>({protocolVersion:2,transactionId:'shared',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:ops});
 const created=applyCreationV2Batch(initial,batch([{op:'text.add',id:'text',content:'初始中文 English',size:{width:70,height:20,unit:'mm'},style:{fontSizePt:12,lineHeight:1.4},place:{reference:'page',unit:'mm',at:[90,90]}}]),assets);
 for(const change of [{content:'新的中文和英文内容 '.repeat(6)},{style:{fontSizePt:22}},{size:{width:35,unit:'mm'}},{style:{fontSizePt:18,lineHeight:1.8,letterSpacingMm:.2},size:{height:60,unit:'mm'}}]){
  const ai=applyCreationV2Batch(created,batch([{op:'layer.update',target:'text',...change}]),assets),manual=structuredClone(created.page);
  applySceneNodeChange(manual,'text',change,user);
  const a=structuredClone(findSceneNode(ai.page,'text')),b=structuredClone(findSceneNode(manual,'text'));delete a.aiManaged;delete b.aiManaged;
  assert.deepEqual(b,a);
 }
});
test('node property updates do not copy or replace unrelated heavy ink',()=>{
 const heavy={id:'ink',type:'ink',width:2,color:'#000000',points:Array.from({length:20000},(_,i)=>({x:i,y:1}))};
 const d=page([text(),heavy]),points=heavy.points,node=heavy;
 applySceneNodePatch(d,'text',{fontSize:32},user);assert.equal(d.layers[1],node);assert.equal(d.layers[1].points,points);
});
test('serialized or forged policies cannot acquire human permissions',()=>{
 const d=page([shape()]),before=JSON.stringify(d);
 for(const policy of [undefined,JSON.parse(JSON.stringify(USER_SCENE_POLICY)),{actor:'user',takeover:true}]){
  if(policy===undefined)continue;
  assert.throws(()=>applySceneNodePatch(d,'shape',{x:4},{policy}),{code:'EDIT_POLICY_INVALID'});assert.equal(JSON.stringify(d),before);
 }
});
test('manual takeover is explicit policy, AI cannot modify a manually changed managed node',()=>{
 const node=text();node.aiManaged={version:1,baseline:layerFingerprint(node)};const d=page([node]);
 applySceneNodePatch(d,'text',{fontSize:25},user);const before=JSON.stringify(d);
 assert.throws(()=>applySceneNodeChange(d,'text',{content:'overwrite'}),{code:'MANUAL_EDIT_PROTECTED'});
 assert.equal(JSON.stringify(d),before);applySceneNodeChange(d,'text',{content:'用户继续修改'},user);assert.equal(node.content,'用户继续修改');
});
test('physical visual resizing requires a real state-bound human grant and never changes source',()=>{
 const item=material(),d=page([item]),before=JSON.stringify(d);
 for(const options of [{},{...user},{...user,confirmation:{capability:'material.visualResize'}}]){
  assert.throws(()=>applySceneNodeChange(d,'paper',{size:{width:25,height:30,unit:'mm'}},options),{code:'EDIT_CONFIRMATION_REQUIRED'});assert.equal(JSON.stringify(d),before);
 }
 const confirmation=confirmSceneCapability([item],'material.visualResize');
 assert.throws(()=>applySceneNodeChange(d,'paper',{size:{width:25,unit:'mm'}},{policy:AI_SCENE_POLICY,confirmation}),{code:'EDIT_CONFIRMATION_REQUIRED'});
 applySceneNodeChange(d,'paper',{size:{width:25,height:30,unit:'mm'}},{...user,confirmation});
 assert.equal(item.width,100);assert.equal(item.height,120);assert.equal(item.manualVisualResize,true);assert.equal(item.sourceBlobId,'immutable-source');assert.equal(item.materialUnitIndex,0);
 assert.throws(()=>applySceneNodePatch(d,'paper',{width:110},{...user,confirmation}),{code:'EDIT_CONFIRMATION_REQUIRED'});
});
test('one material confirmation does not authorize a different target or source revision',()=>{
 const a=material('a'),b=material('b'),d=page([a,b]),confirmation=confirmSceneCapability([a],'material.visualResize');
 assert.throws(()=>applySceneNodePatch(d,'b',{width:100},{...user,confirmation}),{code:'EDIT_CONFIRMATION_REQUIRED'});
 a.sourceBlobId='new-revision';assert.throws(()=>applySceneNodePatch(d,'a',{width:100},{...user,confirmation}),{code:'EDIT_CONFIRMATION_REQUIRED'});
});
test('confirmation cancellation in Fabric keeps Scene and original bookkeeping unchanged',async()=>{
 const d=page([material()]),bridge=createFabricSceneBridge(fabric,{assetURL:()=>null});
 // Fabric object pose is independent from the source image loading.
 const object=new fabric.Rect({left:200,top:200,width:60,height:80,originX:'center',originY:'center'});
 Object.assign(object,{sceneID:'paper',sceneType:'material'});object.set({scaleX:1.5});
 const before=JSON.stringify(d);assert.throws(()=>bridge.applyObject(d,object,{...user,confirm:()=>false}),{code:'EDIT_CONFIRMATION_REQUIRED'});assert.equal(JSON.stringify(d),before);
});
test('Fabric content reflow matches the shared text update after serialization',async()=>{
 const source=text(),d=page([source]),bridge=createFabricSceneBridge(fabric),object=await bridge.fromNode(source);
 const newText='中文、English 与换行\n'.repeat(5),direct=structuredClone(d);
 applySceneNodePatch(direct,'text',{content:newText},user);
 object.set('text',newText);bridge.applyObject(d,object,user);
 for(const key of ['content','width','height','fontSize','textLayout','fixedLineHeight'])assert.deepEqual(source[key],direct.layers[0][key],key);
 const reopened=JSON.parse(JSON.stringify(d));applySceneNodePatch(reopened,'text',{fontSize:30},user);assert.equal(reopened.layers[0].fixedLineHeight,42);
});
test('mixed multi-node transaction rolls back earlier text reflow when a later material is denied',()=>{
 const d=page([text(),material()]),before=JSON.stringify(d),original=d.layers[0];
 assert.throws(()=>applyScenePatchBatch(d,[{id:'text',values:{fontSize:45}},{id:'paper',values:{width:200}}],user),{code:'EDIT_CONFIRMATION_REQUIRED'});
 assert.equal(JSON.stringify(d),before);assert.equal(d.layers[0],original);
});
test('node and ancestor locks apply equally to manual and AI; only user may unlock the node',()=>{
 const d=page([shape('locked',{isLocked:true})]);
 assert.throws(()=>applySceneNodePatch(d,'locked',{x:2},user),/锁定/);
 assert.throws(()=>applySceneNodePatch(d,'locked',{locked:false,isLocked:false}),/锁定/);
 applySceneNodePatch(d,'locked',{locked:false,isLocked:false},user);assert.equal(d.layers[0].isLocked,false);
 const g={id:'group',type:'group',isLocked:true,children:[shape('child',{isLocked:true})]};d.layers.push(g);
 assert.throws(()=>applySceneNodePatch(d,'child',{locked:false,isLocked:false},user),/父组合已锁定/);
});
test('world-coordinate manual controls write correct parent-local positions',()=>{
 const child=shape(),d=page([{id:'group',type:'group',localTransform:rigidMatrix(100,80,30),layoutBox:{width:300,height:200},children:[child]}]);
 applySceneWorldPatch(d,'shape',{x:250,y:150,rotation:40},user);
 const box=worldBox(d,'shape');near(box.cx,250);near(box.cy,150);near(box.rotation,40);near(child.rotation,10);
});
test('manual linked movement updates offset once and reflow repositions the follower in the same call',()=>{
 const d=page([text(),shape('follower')]);
 applyScenePlacement(d,'follower',{reference:'node:text',referenceAnchor:'bottom-center',anchor:'top-center',offset:{value:[0,4],unit:'mm'},behavior:'linked'});
 const before=worldBox(d,'follower');applySceneWorldPatch(d,'follower',{x:before.cx+20,y:before.cy+10}, {...user,linked:'offset'});
 const stable=JSON.stringify(d);for(let i=0;i<5;i++)solveSceneLayout(d);assert.equal(JSON.stringify(d),stable);
 const top=worldBox(d,'follower').cy;applySceneNodePatch(d,'text',{content:'新段落\n'.repeat(8)},user);assert.ok(worldBox(d,'follower').cy>top);
});
test('failed linked rebinding rolls back the edited node and every earlier-resolved follower',()=>{
 const d=page([shape('a'),shape('b'),shape('c')]);
 applyScenePlacement(d,'b',{reference:'node:a',unit:'mm',at:[20,0],behavior:'linked'});
 const before=JSON.stringify(d);
 assert.throws(()=>applySceneNodeChange(d,'a',{place:{reference:'node:b',unit:'mm',at:[20,0],behavior:'linked'}},user),/循环/);
 assert.equal(JSON.stringify(d),before);
});
test('new node insertion with invalid dependency is atomic',()=>{
 const d=page([shape()]),before=JSON.stringify(d);
 assert.throws(()=>insertSceneLayer(d,shape('invalid',{layoutConstraint:{place:{reference:'node:missing',unit:'mm',at:[0,0],behavior:'linked'}}}),user),/不存在/);
 assert.equal(JSON.stringify(d),before);
});
test('duplicate ID in consecutive stroke grouping fails before mutating the original stroke',()=>{
 const d=page([{id:'ink',type:'ink',width:2,color:'#334455',points:[{x:0,y:0,p:.8}],zIndex:2},shape('existing',{zIndex:1})]);
 const before=JSON.stringify(d);assert.throws(()=>appendInkStroke(d,{id:'new',type:'ink',width:2,color:'#334455',points:[{x:5,y:5}],zIndex:3},'existing',user),/编号重复/);assert.equal(JSON.stringify(d),before);
});
test('eraser computes in world coordinates and commits fragments back into a rotated group',()=>{
 const d=page([{id:'group',type:'group',localTransform:rigidMatrix(100,100,90),layoutBox:{width:200,height:200},children:[{id:'ink',type:'ink',width:2,color:'#334455',points:[{x:0,y:0,p:.2},{x:100,y:0,p:.8}]}]}]);
 const result=eraseSceneInk(d,[{x:100,y:145},{x:100,y:155}],5,user);assert.equal(result.changed,true);
 const strokes=sceneLayerEntries(d).filter(e=>e.kind==='ink');assert.equal(strokes.length,2);
 for(const {value} of strokes)for(const point of value.points)near(point.x,100);
 for(const stroke of d.layers[0].children)for(const point of stroke.points){near(point.y,0);assert.ok(point.p>=.2&&point.p<=.8);}
});
test('eraser leaves locked strokes alone and refuses to break a live follower',()=>{
 const stroke={id:'ink',type:'ink',width:2,color:'#000000',points:[{x:0,y:0},{x:100,y:0}],isLocked:true};
 const d=page([stroke,shape('follower')]);assert.equal(eraseSceneInk(d,[{x:50,y:0}],10,user).changed,false);
 stroke.isLocked=false;applyScenePlacement(d,'follower',{reference:'node:ink',unit:'mm',at:[0,0],behavior:'linked'});
 const before=JSON.stringify(d);assert.throws(()=>eraseSceneInk(d,[{x:50,y:0}],10,user),/linked/);assert.equal(JSON.stringify(d),before);
});
test('nested ink rotation and translation share the same world/local transform as shapes',()=>{
 const d=page([{id:'g',type:'group',localTransform:rigidMatrix(100,100,30),layoutBox:{width:200,height:200},children:[{id:'ink',type:'ink',width:2,color:'#000000',layoutRotation:10,points:[{x:0,y:0},{x:20,y:4}]}]}]);
 const before=worldBox(d,'ink');assert.equal(transformSceneLasso(d,['ink'],{x:before.cx,y:before.cy},1,20,{...user,to:{x:before.cx+10,y:before.cy+5}}),true);
 const after=worldBox(d,'ink');near(after.rotation,60);near(after.cx,before.cx+10);near(after.cy,before.cy+5);
});
test('structural deletion is atomic across locked nodes and linked dependencies',()=>{
 const a=shape('a'),b=shape('b',{isLocked:true}),d=page([a,b]),before=JSON.stringify(d);
 assert.throws(()=>editSceneStructure(d,{kind:'delete',targets:['a','b']},user),/锁定/);assert.equal(JSON.stringify(d),before);assert.equal(d.layers[0],a);
 b.isLocked=false;applyScenePlacement(d,'b',{reference:'node:a',unit:'mm',at:[0,0],behavior:'linked'});
 assert.throws(()=>removeEditableScene(d,'a',user),/linked/);assert.equal(d.layers.length,2);
 editSceneStructure(d,{kind:'delete',targets:['a','b']},user);assert.equal(d.layers.length,0);
});
test('visual copy grants preserve physical stock, independent IDs, nested transforms and source pins',()=>{
 const item=material(),d=page([item,shape()]);groupEditableScene(d,['paper','shape'],{id:'group',layoutBox:{width:300,height:200}},user);
 const before=JSON.stringify(d);let seq=0;
 assert.throws(()=>copyEditableScene(d,['group'],()=>`copy-${++seq}`,user),{code:'EDIT_CONFIRMATION_REQUIRED'});assert.equal(JSON.stringify(d),before);
 const confirmation=confirmSceneCapability([findSceneNode(d,'paper')],'material.visualCopy');
 const [id]=copyEditableScene(d,['group'],()=>`copy-${++seq}`,{...user,confirmation}),copy=findSceneNode(d,id).children.find(n=>n.type==='material');
 assert.equal(copy.manualVisualCopy,true);assert.equal(copy.sourceBlobId,item.sourceBlobId);assert.equal(copy.materialUnitIndex,0);
 near(worldBox(d,copy.id).cx,worldBox(d,'paper').cx+12);near(worldBox(d,copy.id).cy,worldBox(d,'paper').cy+12);
});
test('reparent and manual property updates preserve sibling order and world geometry',()=>{
 const d=page([shape('a'),shape('b'),{id:'group',type:'group',localTransform:rigidMatrix(40,80,40),layoutBox:{width:200,height:200},children:[]}]);
 const before=worldBox(d,'a');moveEditableScene(d,'a',{parentID:'group'},user);near(worldBox(d,'a').cx,before.cx);near(worldBox(d,'a').rotation,before.rotation);
 applySceneWorldPatch(d,'a',{x:140},user);assert.deepEqual(d.layers.map(n=>n.id),['b','group']);assert.equal(d.layers[1].children[0].id,'a');
});
test('staged inspector changes share the kernel without modifying the saved draft until explicit finish',()=>{
 const d=page([text()]),before=JSON.stringify(d),session=beginSceneEditSession(d,{projectID:'p',saveRevision:1});
 applySceneNodePatch(session.working,'text',{fontSize:40},user);acceptSceneEditStep(session,session.working,'text');
 assert.equal(sceneEditSessionChanged(session),true);assert.equal(JSON.stringify(d),before);
});
test('paper appearance shares a strict update gate without granting AI page geometry changes',()=>{
 const d=page(),before=JSON.stringify(d);assert.throws(()=>applyScenePagePatch(d,{canvas:{width:20,height:40}},user),/不在允许/);assert.equal(JSON.stringify(d),before);
 applyScenePagePatch(d,{paperColor:'#ff00ff',paperColumns:true},user);assert.equal(d.paperColor,'#ff00ff');
});

test('linked followers cannot bypass locks through a different target update',()=>{
 const d=page([shape('anchor'),shape('follower')]);
 applyScenePlacement(d,'follower',{reference:'node:anchor',referenceAnchor:'bottom-center',anchor:'top-center',behavior:'linked'});
 findSceneNode(d,'follower').isLocked=true;const before=JSON.stringify(d);
 assert.throws(()=>applySceneNodePatch(d,'anchor',{x:120},user),/锁定/);assert.equal(JSON.stringify(d),before);
});
test('structural failure restores ledger, scraps, receipts and original object identities',()=>{
 const d=page([shape()]);d.craftLedger={revision:1};const original=d.layers[0],before=JSON.stringify(d);
 assert.throws(()=>sceneStructureTransaction(d,()=>{d.craftLedger={revision:2};d.craftScraps=[{id:'new'}];d.craftReceipts=['new'];original.x=999;throw Error('fail');},user),/fail/);
 assert.equal(JSON.stringify(d),before);assert.equal(d.layers[0],original);
});
test('staged commit rejects forged, stale and AI sessions; successful commit is single-use',()=>{
 const d=project('staged').drafts[0];d.layers=[shape()];const session=beginSceneEditSession(d,{projectID:'p',saveRevision:1});
 applySceneNodePatch(session.working,'shape',{x:240},user);
 const before=JSON.stringify(d);
 assert.throws(()=>commitSceneEditSession(d,{...session},[],user),/无效/);
 assert.throws(()=>commitSceneEditSession(d,session,[]),{code:'EDIT_POLICY_DENIED'});assert.equal(JSON.stringify(d),before);
 applySceneNodePatch(d,'shape',{y:222},user);const changed=JSON.stringify(d);
 assert.throws(()=>commitSceneEditSession(d,session,[],user),/过期/);assert.equal(JSON.stringify(d),changed);
 const fresh=beginSceneEditSession(d,{projectID:'p',saveRevision:2});applySceneNodePatch(fresh.working,'shape',{x:250},user);
 commitSceneEditSession(d,fresh,[],user);assert.equal(d.layers[0].x,250);
 assert.throws(()=>commitSceneEditSession(d,fresh,[],user),/无效/);
});
test('manual material geometry uses a scoped confirmation and keeps calibrated source data',()=>{
 const asset={id:'a',title:'paper',kind:'paper',physicalWidthMM:50,physicalHeightMM:60,blobId:'source'};
 const d=project('geometry').drafts[0];const item={...itemFromAsset(asset,d,200,250),id:'paper',type:'material'};d.layers=[item];const before=JSON.stringify(d);
 assert.throws(()=>editMaterialGeometry(d,item.id,{cropRect:{x:0,y:0,width:.6,height:1}},[asset],user),{code:'EDIT_CONFIRMATION_REQUIRED'});
 const confirmation=confirmSceneCapability([item],'material.geometry');
 assert.throws(()=>editMaterialGeometry(d,item.id,{cropRect:{x:0,y:0,width:2,height:1}},[asset],{...user,confirmation}),/裁片/);assert.equal(JSON.stringify(d),before);
 assert.throws(()=>editMaterialGeometry(d,item.id,{cropRect:{x:0,y:0,width:.6,height:1}},[asset],{policy:AI_SCENE_POLICY,confirmation}),{code:'EDIT_CONFIRMATION_REQUIRED'});
 editMaterialGeometry(d,item.id,{cropRect:{x:0,y:0,width:.6,height:1}},[asset],{...user,confirmation});
 assert.equal(item.sourceBlobId,'source');assert.equal(asset.physicalWidthMM,50);assert.equal(item.materialUnitIndex,0);near(item.width,30*d.canvas.height/d.physicalPageHeightMM);assert.equal(item.manualGeometryOverride,true);
});
test('material replacement shares physical validation but cannot let AI overwrite manual work',()=>{
 const a={id:'a',title:'a',kind:'paper',physicalWidthMM:50,physicalHeightMM:60,blobId:'source-a'},b={id:'b',title:'b',kind:'paper',physicalWidthMM:20,physicalHeightMM:30,blobId:'source-b'};
 const d=project('replace').drafts[0],item={...itemFromAsset(a,d,200,250),id:'paper',type:'material'};d.layers=[item];item.aiManaged={version:1,baseline:layerFingerprint(item)};
 applySceneNodePatch(d,item.id,{x:250},user);const before=JSON.stringify(d);
 assert.throws(()=>replaceEditableMaterial(d,item.id,b.id,[a,b]),{code:'MANUAL_EDIT_PROTECTED'});assert.equal(JSON.stringify(d),before);
 replaceEditableMaterial(d,item.id,b.id,[a,b],user);assert.equal(item.assetID,'b');assert.equal(item.sourceBlobId,'source-b');near(item.width,20*d.canvas.height/d.physicalPageHeightMM);
});
