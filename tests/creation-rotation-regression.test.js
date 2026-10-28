import test from 'node:test';
import assert from 'node:assert/strict';
import {applyScenePlacement,solveSceneLayout,reconcileManualSceneMove} from '../src/scene-layout.js';
import {worldBox,rigidMatrix,setWorldPosition} from '../src/scene-spatial.js';
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-7,`${x} != ${y}`);
const shape=(id,x=200,y=250,rotation=0)=>({id,type:'shape',x,y,width:100,height:60,rotation});
const make=()=>({canvas:{width:1000,height:1000},physicalPageHeightMM:200,layers:[shape('ref',500,500,30),shape('target')]});
for(const space of ['parent','reference','page'])for(const nested of [false,true]){
 test(`linked ${space} frame is stable on repeated solves (${nested?'nested':'root'})`,()=>{
  const page=make();
  if(nested)page.layers=[{id:'g',type:'group',localTransform:rigidMatrix(0,0,20),layoutBox:{width:800,height:800},children:page.layers}];
  const before=worldBox(page,'target').rotation;
  applyScenePlacement(page,'target',{reference:'node:ref',at:[.5,.5],unit:'ratio',rotationSpace:space,behavior:'linked'});
  for(let i=0;i<12;i++){solveSceneLayout(page);near(worldBox(page,'target').rotation,before);}
  const reopened=JSON.parse(JSON.stringify(page));solveSceneLayout(reopened);near(worldBox(reopened,'target').rotation,before);
 });
 test(`manual translation preserves angle in ${space} frame (${nested?'nested':'root'})`,()=>{
  const page=make();if(nested)page.layers=[{id:'g',type:'group',localTransform:rigidMatrix(0,0,20),layoutBox:{width:800,height:800},children:page.layers}];
  applyScenePlacement(page,'target',{reference:'node:ref',referenceAnchor:'bottom-center',anchor:'top-center',rotationDeg:0,rotationSpace:space,behavior:'linked'});
  const b=worldBox(page,'target');setWorldPosition(page,'target',{x:b.cx+25,y:b.cy+10,rotation:b.rotation});
  reconcileManualSceneMove(page,'target');solveSceneLayout(page);
  const a=worldBox(page,'target');near(a.cx,b.cx+25);near(a.cy,b.cy+10);near(a.rotation,b.rotation);
 });
}
test('linked reference rotation follows changes exactly once',()=>{
 const p=make();applyScenePlacement(p,'target',{reference:'node:ref',at:[.5,.5],unit:'ratio',rotationSpace:'reference',rotationDeg:5,behavior:'linked'});
 near(worldBox(p,'target').rotation,35);p.layers[0].rotation=70;
 for(let i=0;i<5;i++){solveSceneLayout(p);near(worldBox(p,'target').rotation,75);}
});
test('ink frame uses local dimensions and does not turn an already rotated path twice',()=>{
 const p=make(),a=Math.PI/6;
 p.layers.push({id:'ink',type:'ink',width:2,layoutRotation:30,points:[{x:400-50*Math.cos(a),y:400-50*Math.sin(a)},{x:400+50*Math.cos(a),y:400+50*Math.sin(a)}]});
 applyScenePlacement(p,'ink',{reference:'page',at:[.5,.5],unit:'ratio',rotationDeg:30});
 near(worldBox(p,'ink').rotation,30);near(worldBox(p,'ink').w,100);
 const pts=p.layers.at(-1).points;near(Math.atan2(pts[1].y-pts[0].y,pts[1].x-pts[0].x)*180/Math.PI,30);
});
