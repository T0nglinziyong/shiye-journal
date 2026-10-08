import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPolygon,selectStrokes,moveSelection} from '../src/canvas-selection.js';

const square=[{x:10,y:10},{x:90,y:10},{x:90,y:90},{x:10,y:90}];
const draft=()=>({
  canvas:{width:100,height:100},
  items:[{id:'photo',x:40,y:40,width:10,height:10}],
  textBlocks:[],primitives:[],
  strokes:[
    {points:[{x:30,y:30,p:.5},{x:40,y:40,p:.7}],width:4},
    {points:[{x:90,y:30},{x:95,y:40}],width:4}
  ]
});
test('lasso selects handwriting and objects independently',()=>{
  const d=draft();
  assert.deepEqual(selectPolygon(d,square,{material:true,text:true,shape:true}),['photo']);
  assert.deepEqual(selectStrokes(d,square,true),[0]);
  assert.deepEqual(selectStrokes(d,square,false),[]);
});
test('mixed drag moves ink and objects together, clamps and preserves pressure',()=>{
  const d=draft(),objectStart=new Map([['photo',{x:40,y:40}]]),
    strokeStart=new Map([[0,d.strokes[0].points.map(p=>({...p}))]]);
  const delta=moveSelection(d,objectStart,80,80,strokeStart);
  assert.deepEqual(delta,{dx:55,dy:55});
  assert.equal(d.items[0].x,95);
  assert.deepEqual(d.strokes[0].points,[{x:85,y:85,p:.5},{x:95,y:95,p:.7}]);
  assert.equal(d.strokes[1].points[0].x,90);
  const back=moveSelection(d,objectStart,10,5,strokeStart);
  assert.deepEqual(back,{dx:10,dy:5});
  assert.equal(d.items[0].x,50);
  assert.equal(d.strokes[0].points[0].x,40);
});
test('rotated objects remain fully on the canvas during a mixed drag',()=>{
  const d=draft();d.items[0]={id:'photo',x:40,y:40,width:40,height:20,rotation:45};
  const starts=new Map([['photo',{x:40,y:40}]]);
  const result=moveSelection(d,starts,100,100);
  const reach=30/Math.SQRT2;
  assert.ok(Math.abs(result.dx-(60-reach))<1e-8);
  assert.ok(Math.abs(result.dy-(60-reach))<1e-8);
  assert.ok(d.items[0].x+reach<=100+1e-8);
  assert.ok(d.items[0].y+reach<=100+1e-8);
});
test('lasso excludes a stroke crossing a concave edge between points',()=>{
  const polygon=[{x:0,y:0},{x:90,y:0},{x:90,y:90},{x:50,y:90},{x:50,y:20},{x:40,y:20},{x:40,y:90},{x:0,y:90}];
  const d=draft();d.strokes=[{points:[{x:30,y:50},{x:60,y:50}]}];
  assert.deepEqual(selectStrokes(d,polygon),[]);
});
