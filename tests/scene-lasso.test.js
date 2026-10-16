import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSceneLasso,sceneLassoBounds,moveSceneLasso,rotateSceneLasso,transformSceneLasso,copySceneLasso,deleteSceneLasso,mergeSceneLasso} from '../src/scene-lasso.js';
import {sceneLayerEntries} from '../src/scene-v2.js';

const fixture=()=>({sceneVersion:2,canvas:{width:500,height:500},layers:[
  {id:'left',type:'group',zIndex:1,children:[{id:'shape',type:'shape',x:80,y:80,width:20,height:20,zIndex:1}]},
  {id:'right',type:'group',zIndex:2,children:[{id:'text',type:'text',x:110,y:80,width:20,height:20,zIndex:1}]},
  {id:'ink-group',type:'group',zIndex:3,children:[{id:'ink',type:'ink',width:3,points:[{x:80,y:110},{x:110,y:110}],zIndex:1}]}
]});
const polygon=[{x:50,y:50},{x:140,y:50},{x:140,y:140},{x:50,y:140}];

test('Scene lasso selects leaves across subtrees and can lock handwriting',()=>{
  const draft=fixture();
  assert.deepEqual(selectSceneLasso(draft,polygon,{},'contain'),['shape','text','ink']);
  assert.deepEqual(selectSceneLasso(draft,polygon,{lockInk:true},'contain'),['shape','text']);
  assert.deepEqual(selectSceneLasso(draft,polygon,{material:false,shape:false,text:false},'contain'),['ink']);
});

test('lasso moves and copies selected leaves while preserving source',()=>{
  const draft=fixture();
  moveSceneLasso(draft,['shape','ink'],10,5);
  assert.equal(draft.layers[0].children[0].x,90);
  assert.deepEqual(draft.layers[2].children[0].points,[{x:90,y:115},{x:120,y:115}]);
  let next=0;const ids=copySceneLasso(draft,['shape','ink'],()=>`copy-${++next}`);
  assert.deepEqual(ids,['copy-1','copy-2']);
  assert.equal(draft.layers[0].children[1].x,102);
  assert.equal(draft.layers[2].children[1].points[0].x,102);
  deleteSceneLasso(draft,ids);
  assert.deepEqual(sceneLayerEntries(draft).map(entry=>entry.value.id),['shape','text','ink']);
});

test('lasso rejects the whole transform when one selected layer has a locked ancestor',()=>{
  const draft=fixture(),before=structuredClone(draft.layers);
  draft.layers[1].locked=true;
  const locked=structuredClone(draft.layers);
  assert.equal(moveSceneLasso(draft,['shape','text'],15,5),false);
  assert.equal(transformSceneLasso(draft,['shape','text'],{x:100,y:90},1.2,30),false);
  assert.deepEqual(draft.layers,locked);
  assert.notDeepEqual(draft.layers,before);
  assert.equal(moveSceneLasso(draft,['left'],10,0),false,
    'A group ID cannot be treated as a leaf with x/y coordinates');
});

test('lasso box rotates text, shape and ink together around one center',()=>{
  const draft=fixture(),bounds=sceneLassoBounds(draft,['shape','text','ink']);
  assert.deepEqual(bounds,{x:70,y:70,width:50,height:41.5});
  rotateSceneLasso(draft,['shape','text','ink'],{x:100,y:90},90);
  assert.equal(Math.round(draft.layers[0].children[0].x),110);
  assert.equal(Math.round(draft.layers[0].children[0].y),70);
  assert.equal(draft.layers[0].children[0].rotation,90);
  assert.deepEqual(draft.layers[2].children[0].points.map(p=>[Math.round(p.x),Math.round(p.y)]),
    [[80,70],[80,100]]);
});

test('a saved group keeps the bounds of its visible children, including text and ink',()=>{
  const draft=fixture();
  assert.deepEqual(sceneLassoBounds(draft,['left','right','ink-group']),
    sceneLassoBounds(draft,['shape','text','ink']));
  draft.layers[1].hidden=true;
  assert.deepEqual(sceneLassoBounds(draft,['right']),null);
  assert.deepEqual(sceneLassoBounds(draft,['left','right']),
    sceneLassoBounds(draft,['shape']));
});

test('one lasso transform scales and rotates every selected object around the same center',()=>{
  const draft=fixture();
  assert.equal(transformSceneLasso(draft,['shape','text','ink'],{x:100,y:90},2,90),true);
  const [shape,text,ink]=draft.layers.map(group=>group.children[0]);
  assert.equal(shape.width,40);assert.equal(shape.height,40);assert.equal(shape.rotation,90);
  assert.equal(text.width,40);assert.equal(text.rotation,90);
  assert.equal(ink.width,6);
  assert.deepEqual(ink.points.map(point=>[Math.round(point.x),Math.round(point.y)]),[[60,50],[60,110]]);
  const bounds=sceneLassoBounds(draft,['shape','text','ink']);
  assert.ok(bounds.width>0&&bounds.height>0);
});

test('manual lasso scaling marks a material as visually resized',()=>{
  const draft=fixture();
  draft.layers.push({id:'material',type:'material',assetID:'source',x:200,y:200,width:40,height:30});
  assert.equal(transformSceneLasso(draft,['material'],{x:200,y:200},1.5,0),true);
  const item=draft.layers.at(-1);
  assert.equal(item.width,60);
  assert.equal(item.manualVisualResize,true);
});

test('merge moves selected leaves from different parent subtrees into one group',()=>{
  const draft=fixture();
  const id=mergeSceneLasso(draft,['shape','ink'],{id:'merged'});
  assert.equal(id,'merged');
  assert.deepEqual(draft.layers.at(-1).children.map(node=>node.id),['shape','ink']);
  assert.deepEqual(draft.layers.at(-1).children[1].points,[{x:80,y:110},{x:110,y:110}]);
  assert.equal(draft.layers.some(node=>node.id==='left'),false);
  assert.deepEqual(sceneLayerEntries(draft).map(entry=>entry.value.id),['text','shape','ink']);
});
