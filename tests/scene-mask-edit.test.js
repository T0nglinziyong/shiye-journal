import test from 'node:test';
import assert from 'node:assert/strict';
import {applyInspectorMask,sceneMaskPatch,fullDisplayMask,maskRequest,maskRingPreset} from '../src/scene-mask-edit.js';
import {beginSceneEditSession,acceptSceneEditStep,stepSceneEditSession} from '../src/scene-edit-session.js';
const shape=(id='s')=>({id,type:'shape',kind:'rectangle',x:100,y:100,width:80,height:40,rotation:0,fill:'#aabbcc'});
const page=(layers=[shape()])=>({id:'mask',sceneVersion:2,canvas:{width:600,height:800},physicalPageHeightMM:200,layers});
const hole=()=>({...fullDisplayMask(),holes:[maskRingPreset('rect',true)]});
test('manual mask edits are staged with undo and redo; saved scene stays intact',()=>{
 const saved=page(),session=beginSceneEditSession(saved,{projectID:'work',saveRevision:1});
 applyInspectorMask(session.working,'s',maskRequest(hole()));acceptSceneEditStep(session,session.working,'s');
 assert.equal(session.working.layers[0].vectorMask.holes.length,1);assert.equal(saved.layers[0].vectorMask,undefined);
 stepSceneEditSession(session,'undo');assert.equal(session.working.layers[0].vectorMask,undefined);
 stepSceneEditSession(session,'redo');assert.equal(session.working.layers[0].vectorMask.holes.length,1);
 applyInspectorMask(session.working,'s',{mode:'clear'});assert.equal(session.working.layers[0].vectorMask,undefined);
});
test('invalid or disconnected masks fail without changing the scene; locked layers stay locked',()=>{
 const d=page(),before=JSON.stringify(d);
 assert.throws(()=>applyInspectorMask(d,'s',maskRequest({outer:[[0,0],[1,1],[1,0],[0,1]]})),/遮罩|轮廓/);assert.equal(JSON.stringify(d),before);
 assert.throws(()=>applyInspectorMask(d,'s',{mode:'subtract',region:{shape:'rect',space:'local',unit:'ratio',box:[.4,0,.2,1]}}));assert.equal(JSON.stringify(d),before);
 d.layers[0].locked=true;const locked=JSON.stringify(d);assert.throws(()=>applyInspectorMask(d,'s',maskRequest(hole())),/锁定/);assert.equal(JSON.stringify(d),locked);
});
test('flat group and local group mask presets use their real display frame',()=>{
 for(const local of [false,true]){
  const g={id:'g',type:'group',children:[shape()],...(local?{localTransform:[1,0,0,1,100,50],layoutBox:{x:0,y:0,width:80,height:40}}:{})},d=page([g]);
  applyInspectorMask(d,'g',maskRequest({outer:maskRingPreset('ellipse')}));assert.equal(g.vectorMask.outer.length,48);
  assert.deepEqual(g.children,[shape()]);
 }
});
test('mask requests accept omitted holes and reject unknown modes',()=>{
 const d=page();assert.ok(sceneMaskPatch(d,'s',maskRequest({outer:maskRingPreset('rect')})).vectorMask);
 assert.throws(()=>sceneMaskPatch(d,'s',{mode:'unknown'}),/不支持/);
});
