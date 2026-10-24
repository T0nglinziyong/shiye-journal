import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPolygon,selectStrokes,moveSelection,materialCenterOutside} from '../src/canvas-selection.js';

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
test('mixed drag moves ink and objects together outside the page and preserves pressure',()=>{
  const d=draft(),objectStart=new Map([['photo',{x:40,y:40}]]),
    strokeStart=new Map([[0,d.strokes[0].points.map(p=>({...p}))]]);
  const delta=moveSelection(d,objectStart,80,80,strokeStart);
  assert.deepEqual(delta,{dx:80,dy:80});
  assert.equal(d.items[0].x,120);
  assert.deepEqual(d.strokes[0].points,[{x:110,y:110,p:.5},{x:120,y:120,p:.7}]);
  assert.equal(materialCenterOutside(d,[{kind:'material',value:d.items[0]}]),true);
  assert.equal(d.strokes[1].points[0].x,90);
  const back=moveSelection(d,objectStart,10,5,strokeStart);
  assert.deepEqual(back,{dx:10,dy:5});
  assert.equal(d.items[0].x,50);
  assert.equal(d.strokes[0].points[0].x,40);
});
test('an item may overhang the page until its center crosses the boundary',()=>{
  const d=draft();d.items[0]={id:'photo',x:40,y:40,width:40,height:20,rotation:45};
  const starts=new Map([['photo',{x:40,y:40}]]);
  moveSelection(d,starts,59,0);
  assert.equal(materialCenterOutside(d,[{kind:'material',value:d.items[0]}]),false);
  moveSelection(d,starts,61,0);
  assert.equal(materialCenterOutside(d,[{kind:'material',value:d.items[0]}]),true);
});
test('lasso excludes a stroke crossing a concave edge between points',()=>{
  const polygon=[{x:0,y:0},{x:90,y:0},{x:90,y:90},{x:50,y:90},{x:50,y:20},{x:40,y:20},{x:40,y:90},{x:0,y:90}];
  const d=draft();d.strokes=[{points:[{x:30,y:50},{x:60,y:50}]}];
  assert.deepEqual(selectStrokes(d,polygon),[]);
});

test('lasso intersection mode includes crossed objects and strokes while containment does not',()=>{
  const d=draft(),region=[{x:42,y:32},{x:52,y:32},{x:52,y:48},{x:42,y:48}];
  assert.deepEqual(selectPolygon(d,region,{material:true,text:true,shape:true}),[]);
  assert.deepEqual(selectPolygon(d,region,{material:true,text:true,shape:true},'intersect'),['photo']);
  assert.deepEqual(selectStrokes(d,region,true),[]);
  d.strokes[0].points=[{x:35,y:40},{x:60,y:40}];
  assert.deepEqual(selectStrokes(d,region,true,'intersect'),[0]);
});
