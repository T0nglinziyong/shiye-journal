import test from 'node:test';
import assert from 'node:assert/strict';
import * as fabric from 'fabric/node';
import {createFabricSceneBridge} from '../src/fabric-scene-bridge.js';
import {createFabricLayoutPreview} from '../src/fabric-layout-preview.js';
import {applyInspectorLayout} from '../src/editor-layout-model.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {sceneDisplaySiblings} from '../src/craft-display.js';
import {transformSceneLasso} from '../src/scene-lasso.js';

const shape=(id,x,y,fill)=>({id,type:'shape',kind:'rect',x,y,width:60,height:35,rotation:0,lineWidth:1,stroke:'#314836',fill});
function page(){
 const page={sceneVersion:2,canvas:{width:400,height:300},physicalPageHeightMM:150,layers:[shape('base',110,100,'#d9d2b0'),shape('follower',210,170,'#74a292')]};
 applyInspectorLayout(page,'follower',{action:'place',reference:'node:base',followRotation:true});
 return page;
}
const pixels=canvas=>{canvas.renderAll();return Buffer.from(canvas.getContext().getImageData(0,0,400,300).data);};
async function setup(scene,options={}){
 const canvas=new fabric.StaticCanvas(null,{width:400,height:300,backgroundColor:'#fff'});
 const bridge=createFabricSceneBridge(fabric);let builds=0;
 for(const node of sceneDisplaySiblings(scene.layers)){const object=await bridge.fromNode(node);if(object)canvas.add(object);}
 const frames=new Map();let id=0;
 const issues=[];
 const preview=createFabricLayoutPreview({canvas,bridge:{...bridge,async fromNode(node){builds++;return options.fromNode?options.fromNode(node,bridge):bridge.fromNode(node);}},
  requestFrame:fn=>{frames.set(++id,fn);return id;},cancelFrame:id=>frames.delete(id),onIssue:error=>issues.push(error)});
 async function flush(){
  for(let n=0;n<200&&preview.pending;n++){
   for(const [id,fn] of frames){frames.delete(id);fn();}
   await new Promise(resolve=>setTimeout(resolve,1));
  }
  assert.equal(preview.pending,false,'preview must finish');
 }
 return {canvas,bridge,preview,flush,issues,builds:()=>builds,async dispose(){preview.reset();await canvas.dispose();}};
}
async function expected(scene){const state=await setup(scene);try{return pixels(state.canvas);}finally{await state.dispose();}}

test('real Fabric preview follows a drag, reuses translation objects, and does not mutate saved Scene or gesture baseline',async()=>{
 const scene=page(),state=await setup(scene),saved=JSON.stringify(scene);
 try{
  const object=state.canvas.getObjects()[0],originalRender=object.render;
  state.preview.begin(scene);
  for(let i=1;i<=3;i++){
   object.set({left:110+i*15,top:100+i*10});object.setCoords();
   const apply=scratch=>state.bridge.applyObject(scratch,object,{policy:USER_SCENE_POLICY,updatePose:false});
   state.preview.update(apply);await state.flush();
   const final=structuredClone(scene);apply(final);
   assert.deepEqual(pixels(state.canvas),await expected(final));
   assert.equal(JSON.stringify(scene),saved);
   assert.equal(state.builds(),2,'pure moves reuse the two projected roots');
  }
  state.preview.reset();assert.equal(object.render,originalRender);
  state.bridge.applyObject(scene,object,{policy:USER_SCENE_POLICY});
  assert.notEqual(JSON.stringify(scene),saved);
  assert.deepEqual(state.issues,[]);
 }finally{await state.dispose();}
});

test('rotation and relative size use exact current Scene projection',async()=>{
 const scene=page();applyInspectorLayout(scene,'follower',{action:'size',reference:'node:base',width:.5,height:.4});
 const state=await setup(scene),saved=JSON.stringify(scene);
 try{
  state.preview.begin(scene);const object=state.canvas.getObjects()[0];
  for(const [angle,scale] of [[20,1],[38,1],[38,1.6]]){
   object.set({angle,scaleX:scale,scaleY:scale});object.setCoords();
   const apply=scratch=>state.bridge.applyObject(scratch,object,{policy:USER_SCENE_POLICY,updatePose:false});
   state.preview.update(apply);await state.flush();
   const final=structuredClone(scene);apply(final);
   assert.deepEqual(pixels(state.canvas),await expected(final));
  }
  assert.equal(JSON.stringify(scene),saved);assert.deepEqual(state.issues,[]);
 }finally{await state.dispose();}
});

test('multiple pointer packets are coalesced and cancelling an asynchronous decode cannot repaint stale geometry',async()=>{
 const scene=page();let release;const gate=new Promise(resolve=>release=resolve);
 const state=await setup(scene,{fromNode:async(node,bridge)=>{await gate;return bridge.fromNode(node);}});
 try{
  const before=pixels(state.canvas);state.preview.begin(scene);
  const apply=scratch=>transformSceneLasso(scratch,['base'],{x:100,y:100},1,0,{to:{x:120,y:130},policy:USER_SCENE_POLICY});
  state.preview.update(apply);state.preview.update(apply);state.preview.update(apply);
  const waiting=state.flush();await new Promise(resolve=>setTimeout(resolve,5));
  state.preview.reset();release();await waiting;
  assert.deepEqual(pixels(state.canvas),before);assert.equal(state.builds(),2);
  assert.deepEqual(state.issues,[]);
 }finally{release();await state.dispose();}
});

test('nested masked groups retain local frames during whole-group preview and a second movement',async()=>{
 const {rigidMatrix}=await import('../src/scene-spatial.js');
 const scene=page();
 const mark=scene.layers.pop();mark.x=0;mark.y=0;delete mark.layoutConstraint;
 scene.layers.push({id:'outer',type:'group',localTransform:rigidMatrix(240,180,20),layoutBox:{width:120,height:100},children:[
  {id:'inner',type:'group',localTransform:rigidMatrix(10,0,-15),layoutBox:{width:90,height:65},vectorMask:{outer:[[0,0],[1,0],[.8,1],[0,1]]},children:[mark]}
 ]});
 applyInspectorLayout(scene,'base',{action:'place',reference:'node:outer',followRotation:true});
 const state=await setup(scene),saved=JSON.stringify(scene);
 try{
  const object=state.canvas.getObjects()[1],beforePose=structuredClone(object.sceneGroupPose);
  state.preview.begin(scene);
  for(const delta of [15,30]){
   object.set({left:object.left+delta,angle:object.angle+10});object.setCoords();
   const apply=scratch=>state.bridge.applyObject(scratch,object,{policy:USER_SCENE_POLICY,updatePose:false});
   state.preview.update(apply);await state.flush();
   const final=structuredClone(scene);apply(final);
   assert.deepEqual(pixels(state.canvas),await expected(final));
   assert.deepEqual(structuredClone(object.sceneGroupPose),beforePose,'preview must not advance the group gesture origin');
  }
  assert.equal(JSON.stringify(scene),saved);assert.deepEqual(state.issues,[]);
 }finally{await state.dispose();}
});

test('multi-selection uses one transaction, including nested follower and text reflow',async()=>{
 const {rigidMatrix}=await import('../src/scene-spatial.js');
 const scene=page();
 scene.layers.push({id:'group',type:'group',localTransform:rigidMatrix(240,210,15),layoutBox:{width:150,height:100},children:[
  {id:'note',type:'text',content:'Keep an unfinished thought beside this paper. Let it take the space it needs.',fontSize:12,style:'sans',color:'#24372c',x:0,y:0,width:110,height:45,rotation:0}
 ]});
 applyInspectorLayout(scene,'note',{action:'size',reference:'node:base',axes:'width',width:1.5});
 const state=await setup(scene),saved=JSON.stringify(scene);
 try{
  state.preview.begin(scene);
  for(const scale of [1,1.4,.8]){
   const apply=scratch=>{assert.equal(transformSceneLasso(scratch,['base','follower'],{x:160,y:130},scale,15,{to:{x:170,y:140},policy:USER_SCENE_POLICY}),true);};
   state.preview.update(apply);await state.flush();
   const final=structuredClone(scene);apply(final);
   assert.deepEqual(pixels(state.canvas),await expected(final));
  }
  assert.equal(JSON.stringify(scene),saved);assert.deepEqual(state.issues,[]);
  state.preview.reset();assert.deepEqual(pixels(state.canvas),await expected(scene));
 }finally{await state.dispose();}
});

test('a locked follower fails without modifying Scene and a new gesture recovers',async()=>{
 const scene=page();scene.layers[1].isLocked=true;
 const state=await setup(scene),saved=JSON.stringify(scene);
 try{
  state.preview.begin(scene);const object=state.canvas.getObjects()[0],render=object.render;
  object.set({left:150});
  state.preview.update(scratch=>state.bridge.applyObject(scratch,object,{policy:USER_SCENE_POLICY,updatePose:false}));await state.flush();
  assert.equal(state.issues.length,1);assert.equal(JSON.stringify(scene),saved);assert.equal(object.render,render);
  state.preview.reset();scene.layers[1].isLocked=false;state.preview.begin(scene);
  state.preview.update(scratch=>state.bridge.applyObject(scratch,object,{policy:USER_SCENE_POLICY,updatePose:false}));await state.flush();
  assert.notEqual(object.render,render);
 }finally{await state.dispose();}
});
