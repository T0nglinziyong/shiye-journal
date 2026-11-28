import assert from 'node:assert/strict';
import test from 'node:test';
import {fabricPointer,installFabricPointer} from '../src/fabric-pointer.js';

test('Fabric hit testing follows the visible canvas after page scrolling',()=>{
  const canvas={width:600,height:800,viewportTransform:[1,0,0,1,0,0],
    upperCanvasEl:{getBoundingClientRect:()=>({left:14,top:220,width:366,height:518})}};
  const point=fabricPointer(canvas,{clientX:197,clientY:479});
  assert.ok(Math.abs(point.scene.x-300)<.01);
  assert.ok(Math.abs(point.scene.y-400)<.01);
  assert.deepEqual(point.viewport,point.scene);
});

test('Fabric hit testing applies its internal viewport transform once',()=>{
  const canvas={width:600,height:800,viewportTransform:[2,0,0,2,-100,-50],
    upperCanvasEl:{getBoundingClientRect:()=>({left:0,top:0,width:300,height:400})}};
  assert.deepEqual(fabricPointer(canvas,{clientX:100,clientY:100}),{
    viewport:{x:200,y:200},scene:{x:150,y:125}});
});

test('Fabric native dragging uses the visible rectangle for touch after scrolling',()=>{
  const canvas={width:600,height:800,viewportTransform:[1,0,0,1,0,0],
    upperCanvasEl:{getBoundingClientRect:()=>({left:14,top:220,width:366,height:518})}};
  class Point{constructor(x,y){this.x=x;this.y=y;}}
  installFabricPointer(canvas,Point);
  const event={changedTouches:[{clientX:197,clientY:479}]};
  const scene=canvas._getPointerImpl(event),viewport=canvas._getPointerImpl(event,true);
  assert.ok(Math.abs(scene.x-300)<.01&&Math.abs(scene.y-400)<.01);
  assert.deepEqual(scene,viewport);
});
