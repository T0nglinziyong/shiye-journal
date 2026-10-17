import test from 'node:test';
import assert from 'node:assert/strict';
import {selectableFabricObjectAt,installSelectionFramePriority} from '../src/fabric-hit-test.js';
const canvas={isTargetTransparent:()=>false};
const rect=(x,y,w,h)=>({containsPoint:p=>p.x>=x&&p.x<=x+w&&p.y>=y&&p.y<=y+h});
test('unselected nested group hits member frame union, not gaps or hidden members',()=>{
  const group={sceneType:'group',...rect(0,0,100,100),getObjects:()=>[
    rect(0,0,20,20),{sceneType:'group',getObjects:()=>[rect(80,80,20,20)]},
    {...rect(40,40,20,20),visible:false}]};
  assert.equal(selectableFabricObjectAt(canvas,group,{x:10,y:10},{x:10,y:10}),true);
  assert.equal(selectableFabricObjectAt(canvas,group,{x:90,y:90},{x:90,y:90}),true);
  assert.equal(selectableFabricObjectAt(canvas,group,{x:50,y:50}),false);
  assert.equal(selectableFabricObjectAt(canvas,group,{x:30,y:30}),false);
});

test('transparent pixels do not select any object kind',()=>{
  for(const sceneType of ['material','shape','text','group']){
    const object={sceneType,...rect(0,0,100,100)};
    assert.equal(selectableFabricObjectAt({isTargetTransparent:()=>true},object,{x:10,y:10},{x:10,y:10}),false);
    assert.equal(selectableFabricObjectAt(canvas,object,{x:10,y:10},{x:10,y:10}),true);
  }
});

test('scissors can target painted ink while a normal canvas tap still ignores it',()=>{
  const ink={sceneType:'ink',selectable:false,evented:false,...rect(10,10,2,40)};
  assert.equal(selectableFabricObjectAt(canvas,ink,{x:11,y:20},{x:11,y:20}),false);
  assert.equal(selectableFabricObjectAt(canvas,ink,{x:11,y:20},{x:11,y:20},{includeInk:true}),true);
});

test('thin shape hit tolerance stops before a distant transparent interior',()=>{
  const shape={sceneType:'shape',...rect(10,10,2,40)};
  const painted={isTargetTransparent:(_,x)=>x<10||x>12,
    upperCanvasEl:{getBoundingClientRect:()=>({width:400})},width:400};
  assert.equal(selectableFabricObjectAt(painted,shape,{x:5,y:20},{x:5,y:20}),true);
  assert.equal(selectableFabricObjectAt(painted,shape,{x:30,y:20},{x:30,y:20}),false);
});


test('active frame uses cached event targets without recalculating control corners',()=>{
  const cached={target:{id:'current'}};
  const canvas={_targetInfo:cached,findTarget:()=>{throw Error('must reuse event target');},
    getActiveObject:()=>{throw Error('must not recalculate controls');}};
  installSelectionFramePriority(canvas);
  assert.equal(canvas.findTarget({}),cached);
});
