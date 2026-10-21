import test from 'node:test';
import assert from 'node:assert/strict';
import {arrangeSceneSelection} from '../src/scene-arrangement.js';
import {sceneLassoBounds} from '../src/scene-lasso.js';

const fixture=()=>({sceneVersion:2,canvas:{width:600,height:800},layers:[
  {id:'a',type:'material',x:100,y:100,width:40,height:50,rotation:0,userOverrideFlags:[]},
  {id:'g',type:'group',children:[
    {id:'b',type:'shape',x:240,y:160,width:20,height:30,rotation:0},
    {id:'ink',type:'ink',width:3,points:[{x:250,y:200},{x:270,y:210}]}
  ]},
  {id:'c',type:'text',content:'caption',fontSize:10,x:420,y:260,width:60,height:20,rotation:0}
]});

test('alignment moves a group as one unit and preserves every source size',()=>{
  const d=fixture(),before=structuredClone(d.layers),left=sceneLassoBounds(d,['a']).x;
  assert.equal(arrangeSceneSelection(d,['a','g','b','c'],'left'),true);
  assert.equal(sceneLassoBounds(d,['b','ink']).x,left);
  assert.equal(sceneLassoBounds(d,['c']).x,left);
  assert.equal(d.layers[0].width,before[0].width);
  assert.equal(d.layers[1].children[0].width,before[1].children[0].width);
  assert.equal(d.layers[1].children[1].points[1].x-d.layers[1].children[1].points[0].x,20);
  assert.equal(arrangeSceneSelection(d,['a','g','c'],'left'),false);
});

test('horizontal spacing leaves the outside edges fixed and keeps original dimensions',()=>{
  const d=fixture(),before=structuredClone(d.layers);
  const first=sceneLassoBounds(d,['a']),last=sceneLassoBounds(d,['c']);
  assert.equal(arrangeSceneSelection(d,['a','g','c'],'space-horizontal'),true);
  const a=sceneLassoBounds(d,['a']),b=sceneLassoBounds(d,['b','ink']),c=sceneLassoBounds(d,['c']);
  assert.equal(a.x,first.x);assert.equal(c.x+c.width,last.x+last.width);
  assert.ok(Math.abs((b.x-a.x-a.width)-(c.x-b.x-b.width))<1e-6);
  assert.deepEqual(d.layers.map(node=>node.width),before.map(node=>node.width));
});

test('locked descendants reject an entire arrangement without moving other objects',()=>{
  const d=fixture();d.layers[1].children[1].locked=true;
  const before=structuredClone(d.layers);
  assert.throws(()=>arrangeSceneSelection(d,['a','g','c'],'top'),/锁定/);
  assert.deepEqual(d.layers,before);
});
