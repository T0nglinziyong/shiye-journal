import test from 'node:test';
import assert from 'node:assert/strict';
import {project,itemFromAsset,textBlock,primitive} from '../src/domain.js';
import {insertSceneLayer} from '../src/scene-edit-kernel.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {sceneStructureTransaction} from '../src/scene-structure-edit.js';
import {findSceneNode} from '../src/scene-v2.js';
import {applyScenePlacement} from '../src/scene-layout.js';
import {beginSceneEditSession,acceptSceneEditStep,stepSceneEditSession,sceneEditSessionChanged} from '../src/scene-edit-session.js';
const shape=(id='shape',extra={})=>({id,type:'shape',kind:'rectangle',x:100,y:100,width:40,height:20,rotation:0,fill:'#334455',...extra});
const page=(layers=[])=>({id:'shared',sceneVersion:2,canvas:{width:600,height:800},physicalPageHeightMM:200,layers});
const user={policy:USER_SCENE_POLICY};
test('structural or material changes cannot move locked linked followers indirectly',()=>{
 const d=page([shape('anchor'),shape('follower')]);
 applyScenePlacement(d,'follower',{reference:'node:anchor',referenceAnchor:'bottom-center',anchor:'top-center',behavior:'linked'});
 findSceneNode(d,'follower').isLocked=true;const before=JSON.stringify(d);
 assert.throws(()=>sceneStructureTransaction(d,()=>{findSceneNode(d,'anchor').height=100;d.craftReceipts=['temporary'];},user),/锁定/);
 assert.equal(JSON.stringify(d),before);
});
test('staged undo/redo restores source ledger, scraps and receipts together with geometry',()=>{
 const d=page([shape()]);d.craftLedger={revision:1};
 const session=beginSceneEditSession(d,{projectID:'p',saveRevision:1});
 session.working.layers[0].x=240;session.working.craftLedger={revision:2};session.working.craftScraps=[{id:'offcut'}];session.working.craftReceipts=['receipt'];
 acceptSceneEditStep(session,session.working,'shape');assert.equal(sceneEditSessionChanged(session),true);
 stepSceneEditSession(session,'undo');assert.equal(sceneEditSessionChanged(session),false);assert.deepEqual(session.working.craftLedger,{revision:1});assert.equal(session.working.craftScraps,undefined);assert.equal(session.working.craftReceipts,undefined);
 stepSceneEditSession(session,'redo');assert.deepEqual(session.working.craftLedger,{revision:2});assert.deepEqual(session.working.craftScraps,[{id:'offcut'}]);assert.deepEqual(session.working.craftReceipts,['receipt']);assert.equal(session.working.layers[0].x,240);
 assert.deepEqual(d.craftLedger,{revision:1});assert.equal(d.layers[0].x,100);
});

test('domain factories yield typed nodes for direct insertion without implicit collection aliases',()=>{
 const d=project('factory').drafts[0],asset={id:'paper',kind:'paper',physicalWidthMM:30,physicalHeightMM:40,blobId:'immutable'};
 for(const node of [itemFromAsset(asset,d,100,100),textBlock('typed text',d),primitive('rectangle',d)])insertSceneLayer(d,node,user);
 assert.deepEqual(d.layers.map(node=>node.type),['material','text','shape']);
 const before=JSON.stringify(d);assert.throws(()=>insertSceneLayer(d,{id:'untyped',x:10,y:10,width:20,height:20},user),/type/);assert.equal(JSON.stringify(d),before);
});
